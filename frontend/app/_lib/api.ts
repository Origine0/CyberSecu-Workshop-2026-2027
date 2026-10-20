"use client";

import { useSyncExternalStore } from "react";

// ---------------------------------------------------------------------------
// Types renvoyés par l'API de paiement (FastAPI)
// ---------------------------------------------------------------------------

export interface ServiceHealth {
  status: string;
  service: string;
  database: string;
  uptime_seconds: number;
  version: string;
  timestamp: string;
}

export interface TransactionItem {
  id: string;
  reference: string;
  amount: number;
  currency: string;
  status: string;
  latency_ms: number;
  error_code?: string | null;
  time: string;
}

export interface PaymentResult {
  ok: boolean;
  offline: boolean;
  reference?: string;
  latencyMs?: number;
  message: string;
}

// ---------------------------------------------------------------------------
// Adresse de l'API, mémorisée dans le navigateur
// ---------------------------------------------------------------------------

export const DEFAULT_API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const STORAGE_KEY = "resilience-api-url";
const URL_EVENT = "resilience-api-url-change";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(URL_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(URL_EVENT, onChange);
  };
}

function read(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function useApiUrl(): string {
  return useSyncExternalStore(subscribe, read, () => null) ?? DEFAULT_API;
}

export function saveApiUrl(url: string) {
  try {
    localStorage.setItem(STORAGE_KEY, url.trim().replace(/\/+$/, ""));
    window.dispatchEvent(new Event(URL_EVENT));
  } catch {
    // stockage indisponible : l'adresse reste celle par défaut
  }
}

// ---------------------------------------------------------------------------
// Appels
// ---------------------------------------------------------------------------

export async function sendPayment(apiUrl: string, amount: number, simulateFailure = false): Promise<PaymentResult> {
  try {
    const res = await fetch(`${apiUrl}/pay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        merchant_code: "MERCH_ALPHA",
        amount,
        currency: "EUR",
        simulate_failure: simulateFailure,
        idempotency_key: `IDEMP-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      }),
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json();
    const ok = res.ok && data.status === "SUCCESS";
    return {
      ok,
      offline: false,
      reference: data.reference,
      latencyMs: data.latency_ms,
      message: ok ? "Paiement accepté" : data.message || data.detail || "Paiement refusé",
    };
  } catch {
    return { ok: false, offline: true, message: "L'API ne répond pas : le paiement n'a pas été envoyé." };
  }
}

export async function fetchHealth(apiUrl: string): Promise<ServiceHealth | null> {
  try {
    const res = await fetch(`${apiUrl}/health`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok && res.status !== 503) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchTransactions(apiUrl: string, limit = 8): Promise<TransactionItem[] | null> {
  try {
    const res = await fetch(`${apiUrl}/transactions?limit=${limit}`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    const rows: Array<Omit<TransactionItem, "time"> & { created_at: string | null }> = await res.json();
    return rows.map((r) => ({
      ...r,
      time: r.created_at ? new Date(r.created_at).toLocaleTimeString("fr-FR") : "",
    }));
  } catch {
    return null;
  }
}
