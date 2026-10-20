import type {
  Transaction,
  PaymentRequest,
  HealthCheckResponse,
  HourlyVolumeCTE,
  FraudVelocityCTE,
  MerchantSettlementCTE,
} from '../types/index.ts';

export const INITIAL_MERCHANTS = [
  { id: 'mch_cyber_01', name: 'CyberShield Sentinel SAS', category: 'Sécurité Réseau' },
  { id: 'mch_saas_02', name: 'CloudOps Platform Inc.', category: 'Infrastructure Cloud' },
  { id: 'mch_auth_03', name: 'VaultLock ZeroTrust', category: 'IAM & Secrets' },
  { id: 'mch_telecom_04', name: 'Resilience Fiber Backbone', category: 'Télécommunications' },
];

export const INITIAL_TRANSACTIONS: Transaction[] = [
  {
    id: 'a810f2c4-3b1a-4d3e-9f0a-112233445501',
    amount: 149.99,
    currency: 'EUR',
    status: 'CONFIRMED',
    merchant_id: 'mch_cyber_01',
    merchant_name: 'CyberShield Sentinel SAS',
    reference: 'REF-SENTINEL-9901',
    customer_name: 'Marc Lefebvre',
    card_last4: '4242',
    created_at: new Date(Date.now() - 42 * 60 * 1000).toISOString(),
    latency_ms: 38,
    idempotency_key: 'idemp_seed_001',
    security_hash: 'sha256_9f83a48e89e02384a8bc31',
  },
  {
    id: 'b921e3d5-4c2b-5e4f-0a1b-223344556602',
    amount: 89.00,
    currency: 'EUR',
    status: 'CONFIRMED',
    merchant_id: 'mch_saas_02',
    merchant_name: 'CloudOps Platform Inc.',
    reference: 'REF-CLOUDOPS-8821',
    customer_name: 'Sophie Bernard',
    card_last4: '5512',
    created_at: new Date(Date.now() - 31 * 60 * 1000).toISOString(),
    latency_ms: 45,
    idempotency_key: 'idemp_seed_002',
    security_hash: 'sha256_31a89b7c25e4088a2c1f9d',
  },
  {
    id: 'c032f4e6-5d3c-6f5a-1b2c-334455667703',
    amount: 450.50,
    currency: 'EUR',
    status: 'CONFIRMED',
    merchant_id: 'mch_auth_03',
    merchant_name: 'VaultLock ZeroTrust',
    reference: 'REF-VAULT-7734',
    customer_name: 'Alexandre Roy',
    card_last4: '9081',
    created_at: new Date(Date.now() - 19 * 60 * 1000).toISOString(),
    latency_ms: 41,
    idempotency_key: 'idemp_seed_003',
    security_hash: 'sha256_44b9cd81023aaeef91024e',
  },
  {
    id: 'd143a5f7-6e4d-7a6b-2c3d-445566778804',
    amount: 1200.00,
    currency: 'EUR',
    status: 'CONFIRMED',
    merchant_id: 'mch_telecom_04',
    merchant_name: 'Resilience Fiber Backbone',
    reference: 'REF-FIBER-6623',
    customer_name: 'Directeur SI EPSI',
    card_last4: '1099',
    created_at: new Date(Date.now() - 9 * 60 * 1000).toISOString(),
    latency_ms: 52,
    idempotency_key: 'idemp_seed_004',
    security_hash: 'sha256_82f10da9c2188fa01b4391',
  },
  {
    id: 'e254b6a8-7f5e-8b7c-3d4e-556677889905',
    amount: 75.00,
    currency: 'EUR',
    status: 'FAILED',
    merchant_id: 'mch_cyber_01',
    merchant_name: 'CyberShield Sentinel SAS',
    reference: 'REF-SENTINEL-9905',
    customer_name: 'Test Intrusion Probe',
    card_last4: '0000',
    created_at: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
    latency_ms: 110,
    idempotency_key: 'idemp_seed_005',
    security_hash: 'sha256_failed_probe_checksum',
    error_reason: 'WAF_RATE_LIMIT_EXCEEDED: Tentative suspecte bloquée',
  },
];

/**
 * Validates the payment input fields
 */
export function validatePaymentRequest(req: Partial<PaymentRequest>): { valid: boolean; error?: string } {
  if (!req.amount || req.amount <= 0) {
    return { valid: false, error: 'Le montant de la transaction doit être supérieur à 0.' };
  }
  if (!req.merchant_id || !req.merchant_id.trim()) {
    return { valid: false, error: 'Le commerçant destinataire est requis.' };
  }
  if (!req.customer_name || req.customer_name.trim().length < 2) {
    return { valid: false, error: 'Le nom du porteur est requis (au moins 2 caractères).' };
  }
  if (!req.card_number || req.card_number.replace(/\s+/g, '').length < 13) {
    return { valid: false, error: 'Le numéro de carte bancaire est invalide (au moins 13 chiffres).' };
  }
  if (!req.exp_date || !/^\d{2}\/\d{2}$/.test(req.exp_date.trim())) {
    return { valid: false, error: "La date d'expiration doit être au format MM/AA." };
  }
  if (!req.cvv || !/^\d{3,4}$/.test(req.cvv.trim())) {
    return { valid: false, error: 'Le cryptogramme visuel (CVV) doit comporter 3 ou 4 chiffres.' };
  }
  return { valid: true };
}

/**
 * Pseudo-random UUID generator for resilient IDs
 */
export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Deterministic hash simulation for integrity verification (mirrors SHA-256)
 */
export function generateSecurityHash(payload: string): string {
  let hash = 0;
  for (let i = 0; i < payload.length; i++) {
    const char = payload.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  const hex = Math.abs(hash).toString(16).padStart(8, '0');
  return `sha256_${hex}${payload.length.toString(16)}${Date.now().toString(16).slice(-6)}`;
}

/**
 * Processes a payment transaction (mirrors FastAPI POST /pay logic)
 */
export function processPayment(
  req: PaymentRequest,
  existingTransactions: Transaction[]
): { transaction: Transaction; isIdempotent: boolean } {
  // Check idempotency if key provided
  const idempotencyKey = req.idempotency_key || `idemp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const existing = existingTransactions.find((t) => t.idempotency_key === idempotencyKey);
  if (existing) {
    return { transaction: existing, isIdempotent: true };
  }

  const merchant = INITIAL_MERCHANTS.find((m) => m.id === req.merchant_id) || {
    id: req.merchant_id,
    name: 'Commerçant Partenaire',
  };

  const cleanCard = req.card_number.replace(/\s+/g, '');
  const cardLast4 = cleanCard.slice(-4) || '4242';
  const startTime = Date.now();
  const txId = generateUUID();

  const isSimulatedFailure = Boolean(req.simulate_failure);
  const status = isSimulatedFailure ? 'FAILED' : 'CONFIRMED';
  const errorReason = isSimulatedFailure
    ? 'SIMULATED_CHAOS_FAILURE: Défaillance réseau injectée pour test de résilience'
    : undefined;

  const payloadString = `${txId}:${req.amount}:${req.currency}:${merchant.id}:${cardLast4}`;
  const securityHash = generateSecurityHash(payloadString);

  const transaction: Transaction = {
    id: txId,
    amount: Number(req.amount),
    currency: req.currency || 'EUR',
    status,
    merchant_id: merchant.id,
    merchant_name: merchant.name,
    reference: req.reference || `REF-TX-${Math.floor(1000 + Math.random() * 9000)}`,
    customer_name: req.customer_name,
    card_last4: cardLast4,
    created_at: new Date().toISOString(),
    latency_ms: Math.floor(25 + Math.random() * 35),
    idempotency_key: idempotencyKey,
    security_hash: securityHash,
    error_reason: errorReason,
  };

  return { transaction, isIdempotent: false };
}

/**
 * Calculates Common Table Expressions (CTEs) Analytics
 * Mirrors the PostgreSQL analytical CTE queries defined in init.sql:
 * WITH HourlyVolumeCTE AS (...), FraudVelocityCTE AS (...)
 */
export function computeHourlyVolumeCTE(transactions: Transaction[]): HourlyVolumeCTE[] {
  const groups: Record<string, Transaction[]> = {};

  // Group by hour
  transactions.forEach((tx) => {
    const d = new Date(tx.created_at);
    const hourLabel = `${d.getHours().toString().padStart(2, '0')}:00`;
    if (!groups[hourLabel]) {
      groups[hourLabel] = [];
    }
    groups[hourLabel].push(tx);
  });

  return Object.entries(groups).map(([hour_bucket, txs]) => {
    const tx_count = txs.length;
    const success_count = txs.filter((t) => t.status === 'CONFIRMED').length;
    const failed_count = txs.filter((t) => t.status === 'FAILED').length;
    const total_volume_eur = txs
      .filter((t) => t.status === 'CONFIRMED')
      .reduce((sum, t) => sum + t.amount, 0);
    const success_rate_pct = tx_count > 0 ? Math.round((success_count / tx_count) * 100) : 100;
    const avg_ticket_eur = success_count > 0 ? Math.round((total_volume_eur / success_count) * 100) / 100 : 0;

    return {
      hour_bucket,
      tx_count,
      success_count,
      failed_count,
      success_rate_pct,
      total_volume_eur: Math.round(total_volume_eur * 100) / 100,
      avg_ticket_eur,
    };
  });
}

export function computeFraudVelocityCTE(transactions: Transaction[]): FraudVelocityCTE[] {
  // Analyzes transaction velocity per customer
  const customerMap: Record<string, Transaction[]> = {};
  transactions.forEach((tx) => {
    if (!customerMap[tx.customer_name]) {
      customerMap[tx.customer_name] = [];
    }
    customerMap[tx.customer_name].push(tx);
  });

  return Object.entries(customerMap).map(([customer_name, txs]) => {
    const count = txs.length;
    const volume = txs.reduce((sum, t) => sum + t.amount, 0);
    const hasFailed = txs.some((t) => t.status === 'FAILED');
    const cardLast4 = txs[0]?.card_last4 || '4242';

    let risk_score = Math.min(100, count * 15 + (hasFailed ? 40 : 0));
    let alert_level: 'NORMAL' | 'ELEVATED' | 'HIGH_RISK' = 'NORMAL';
    if (risk_score >= 60) alert_level = 'HIGH_RISK';
    else if (risk_score >= 35) alert_level = 'ELEVATED';

    return {
      customer_name,
      card_last4: cardLast4,
      velocity_10m_count: count,
      volume_10m_eur: Math.round(volume * 100) / 100,
      risk_score,
      alert_level,
    };
  });
}

export function computeMerchantSettlementCTE(transactions: Transaction[]): MerchantSettlementCTE[] {
  const merchantMap: Record<string, Transaction[]> = {};
  transactions.forEach((tx) => {
    if (!merchantMap[tx.merchant_id]) {
      merchantMap[tx.merchant_id] = [];
    }
    merchantMap[tx.merchant_id].push(tx);
  });

  return Object.entries(merchantMap).map(([merchant_id, txs]) => {
    const merchantName = txs[0]?.merchant_name || merchant_id;
    const confirmedTxs = txs.filter((t) => t.status === 'CONFIRMED');
    const gross = confirmedTxs.reduce((sum, t) => sum + t.amount, 0);
    // 1.2% interchange commission
    const fee = gross * 0.012;
    const net = gross - fee;

    return {
      merchant_name: merchantName,
      merchant_id,
      total_tx: confirmedTxs.length,
      gross_amount_eur: Math.round(gross * 100) / 100,
      fee_interchange_eur: Math.round(fee * 100) / 100,
      net_settlement_eur: Math.round(net * 100) / 100,
    };
  });
}

/**
 * Generates FastAPI /health response
 */
export function getHealthStatus(
  transactions: Transaction[],
  isServiceDegraded = false
): HealthCheckResponse {
  const confirmedCount = transactions.filter((t) => t.status === 'CONFIRMED').length;
  const failedCount = transactions.filter((t) => t.status === 'FAILED').length;
  const failureRatio = transactions.length > 0 ? failedCount / transactions.length : 0;

  const status: 'healthy' | 'degraded' | 'unhealthy' =
    isServiceDegraded || failureRatio > 0.4 ? 'degraded' : 'healthy';

  return {
    status,
    service: 'fastapi-resilience-alpha',
    timestamp: new Date().toISOString(),
    uptime_seconds: 4328,
    version: '1.0.0-sprint1',
    database: {
      engine: 'PostgreSQL 16.3-alpine',
      status: isServiceDegraded ? 'disconnected' : 'connected',
      latency_ms: isServiceDegraded ? 180 : 1.4,
      active_connections: 4,
      max_connections: 50,
    },
    checks: {
      api_gateway: 'OK',
      db_pool: isServiceDegraded ? 'WARN_EXHAUSTED' : 'OK',
      memory_mb: 48.6,
      disk_healthy: true,
    },
  };
}
