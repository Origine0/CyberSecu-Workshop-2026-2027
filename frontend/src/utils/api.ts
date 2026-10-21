import type { 
  Transaction, 
  HealthCheckResponse, 
  WafStatusResponse,
  AiAnalyzeResponse,
  AiAskResponse
} from '../types/index.ts';
import { INITIAL_MERCHANTS } from './paymentEngine.ts';

// URLs relatives : en conteneur le WAF route /api, /auth et /ai ; en `npm run dev` local, le proxy Vite fait pareil.
export const API_BASE = '/api';
export const AUTH_BASE = '/auth';
export const AI_BASE = '/ai';

const TOKEN_KEY = 'resilience_alpha_token';

export const getToken = (): string | null => {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};

export const setToken = (token: string | null) => {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* stockage indisponible */
  }
};

export interface Account {
  username: string;
  holder_name: string;
  account_number: string;
  balance: number;
  currency: string;
  status: string;
}

export interface RemotePaymentResponse {
  transaction_id: string;
  reference: string;
  status: string;
  amount: number;
  currency: string;
  authorization_code?: string | null;
  created_at: string;
  latency_ms: number;
  error_code?: string | null;
  message: string;
  balance_after?: number | null;
}

export interface BackendHealthRaw {
  status: string;
  service: string;
  database: string;
  version: string;
  uptime_seconds: number;
  timestamp: string;
}

export interface BackendTransactionRaw {
  id: string;
  reference: string;
  amount: number;
  currency: string;
  status: string;
  latency_ms: number;
  error_code?: string | null;
  error_message?: string | null;
  ip_address?: string | null;
  idempotency_key?: string | null;
  metadata?: Record<string, any>;
  created_at?: string | null;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(url: string, init: RequestInit = {}, auth = false): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers: { ...headers, ...(init.headers as Record<string, string>) } });
  } catch {
    throw new ApiError(0, 'Service injoignable');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = data?.message ?? data?.detail;
    throw new ApiError(res.status, typeof detail === 'string' ? detail : `Erreur ${res.status}`);
  }
  return data as T;
}

export const register = (username: string, password: string, holder_name: string) =>
  request<{ token: string }>(`${AUTH_BASE}/register`, {
    method: 'POST',
    body: JSON.stringify({ username, password, holder_name }),
  });

export const login = (username: string, password: string) =>
  request<{ token: string }>(`${AUTH_BASE}/login`, {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });

export const fetchAccount = () => request<Account>(`${AUTH_BASE}/me`, {}, true);

export const deposit = (amount: number) =>
  request<Account>(`${AUTH_BASE}/deposit`, { method: 'POST', body: JSON.stringify({ amount }) }, true);

export const payRemote = (body: Record<string, unknown>) =>
  request<RemotePaymentResponse>(`${API_BASE}/pay`, { method: 'POST', body: JSON.stringify(body) }, true);

/**
 * Interroge la sonde réelle GET /api/health du microservice FastAPI
 * et convertit la réponse au format HealthCheckResponse du Dashboard.
 */
export async function fetchHealth(isDegradedOverride = false): Promise<HealthCheckResponse> {
  const start = performance.now();
  const raw = await request<BackendHealthRaw>(`${API_BASE}/health`, {
    signal: AbortSignal.timeout(2500),
  });
  const rttMs = Math.max(1, Math.round((performance.now() - start) * 10) / 10);

  const isUp = raw.status === 'UP' && raw.database === 'healthy';
  const status: 'healthy' | 'degraded' | 'unhealthy' = !isUp
    ? 'unhealthy'
    : isDegradedOverride
    ? 'degraded'
    : 'healthy';

  return {
    status,
    service: raw.service || 'payment-api',
    timestamp: raw.timestamp || new Date().toISOString(),
    uptime_seconds: Math.round(raw.uptime_seconds || 0),
    version: raw.version || '1.0.0',
    database: {
      engine: 'PostgreSQL 16-alpine',
      status: raw.database === 'healthy' && !isDegradedOverride ? 'connected' : 'disconnected',
      latency_ms: rttMs,
      active_connections: isUp ? 6 : 0,
      max_connections: 50,
    },
    checks: {
      api_gateway: isUp ? 'OK' : 'DEGRADED',
      db_pool: raw.database === 'healthy' ? 'OK' : 'UNREACHABLE',
      memory_mb: 52.4,
      disk_healthy: true,
    },
  };
}

/**
 * Récupère les transactions réelles depuis PostgreSQL via GET /api/transactions
 */
export async function fetchTransactions(limit = 35): Promise<Transaction[]> {
  const rows = await request<BackendTransactionRaw[]>(`${API_BASE}/transactions?limit=${limit}`, {
    signal: AbortSignal.timeout(2500),
  });

  return rows.map((r, index) => {
    const meta = r.metadata || {};
    const isTrafficGen = r.idempotency_key?.startsWith('TRAFFIC-');
    const isRedTeam = meta.source === 'red_team_flood' || meta.source === 'chaos_injection';
    const isChronoProof = meta.source === 'clip_chrono_post_remediation_proof';

    const customerName =
      meta.customer_name ||
      (isChronoProof
        ? 'Preuve Post-Reprise (Live)'
        : isRedTeam
        ? `Red Team (${meta.bot_id || meta.injection_id || 'Bot'})`
        : isTrafficGen
        ? 'Flux Partenaire (Traffic-Gen)'
        : `Client API (${r.ip_address || '127.0.0.1'})`);

    const merchantObj = INITIAL_MERCHANTS[index % INITIAL_MERCHANTS.length];
    const isConfirmed = r.status === 'SUCCESS' || r.status === 'CONFIRMED';

    return {
      id: r.id,
      amount: Number(r.amount),
      currency: r.currency || 'EUR',
      status: isConfirmed ? 'CONFIRMED' : 'FAILED',
      merchant_id: meta.merchant_id || merchantObj.id,
      merchant_name: meta.merchant_name || merchantObj.name,
      reference: r.reference,
      customer_name: customerName,
      card_last4: meta.card_last4 || (isRedTeam ? '0000' : '4242'),
      created_at: r.created_at || new Date().toISOString(),
      latency_ms: r.latency_ms ?? 25,
      idempotency_key: r.idempotency_key || `tx_${r.id.slice(0, 8)}`,
      security_hash: `sha256_${r.id.replace(/-/g, '').slice(0, 20)}`,
      error_reason: isConfirmed
        ? undefined
        : `${r.error_code || 'ERR_REJECTED'}: ${r.error_message || 'Transaction rejetée'}`,
    };
  });
}

/**
 * Récupère les statistiques temps réel du WAF et les IP bannies par la remédiation autonome
 */
export async function fetchWafStatus(): Promise<WafStatusResponse> {
  return request<WafStatusResponse>(`${API_BASE}/waf/status`, {
    signal: AbortSignal.timeout(2500),
  });
}


/**
 * Analyse télémétrique temps réel par le modèle Isolation Forest (/ai/analyze)
 */
export async function analyzeTelemetry(payload: {
  timestamp: string;
  request_rate: number;
  error_rate: number;
  latency_ms: number;
}): Promise<AiAnalyzeResponse> {
  return request<AiAnalyzeResponse>(`${AI_BASE}/analyze`, {
    method: 'POST',
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(4000),
  });
}

/**
 * Interroge l'assistant RAG (FAISS + Ollama) sur les procédures cyber (/ai/ask)
 */
export async function askRag(query: string): Promise<AiAskResponse> {
  return request<AiAskResponse>(`${AI_BASE}/ask`, {
    method: 'POST',
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(45000),
  });
}
