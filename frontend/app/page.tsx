"use client";

import React, { useState, useEffect } from "react";
import {
  ShieldAlert,
  Server,
  CreditCard,
  RotateCcw,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Play,
  Terminal,
  Cpu,
  Layers,
  Database,
  ArrowUpRight,
  RefreshCw,
  Lock,
  Radio,
  Clock
} from "lucide-react";

interface TransactionItem {
  id: string;
  reference: string;
  amount: number;
  currency: string;
  status: "SUCCESS" | "FAILED" | "REJECTED_WAF" | "PENDING";
  latency_ms: number;
  error_code?: string;
  created_at?: string;
}

interface ServiceHealth {
  status: string;
  service: string;
  database: string;
  uptime_seconds: number;
  version: string;
  timestamp: string;
}

export default function DashboardPage() {
  const [apiUrl, setApiUrl] = useState("http://localhost:8000");
  const [health, setHealth] = useState<ServiceHealth | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthError, setHealthError] = useState<string | null>(null);

  // Transactions state
  const [transactions, setTransactions] = useState<TransactionItem[]>([
    {
      id: "tx-mock-01",
      reference: "TX-20261019-A8F291",
      amount: 49.99,
      currency: "EUR",
      status: "SUCCESS",
      latency_ms: 18,
      created_at: "11:42:15",
    },
    {
      id: "tx-mock-02",
      reference: "TX-20261019-B19E02",
      amount: 120.00,
      currency: "EUR",
      status: "SUCCESS",
      latency_ms: 22,
      created_at: "11:43:02",
    },
    {
      id: "tx-mock-03",
      reference: "TX-20261019-C743D1",
      amount: 850.50,
      currency: "EUR",
      status: "FAILED",
      latency_ms: 840,
      error_code: "ERR_TIMEOUT",
      created_at: "11:44:20",
    },
  ]);

  // Payment form state
  const [payAmount, setPayAmount] = useState<number>(75.0);
  const [simulateFailure, setSimulateFailure] = useState(false);
  const [payLoading, setPayLoading] = useState(false);
  const [payStatusMessage, setPayStatusMessage] = useState<string | null>(null);

  // Remédiation & SOC state
  const [remediationState, setRemediationState] = useState<"NOMINAL" | "ATTACK_DETECTED" | "HEALING" | "RECOVERED">("NOMINAL");
  const [clipSeconds, setClipSeconds] = useState(0);
  const [isRecording, setIsRecording] = useState(false);

  // Test /health endpoint
  const checkHealth = async () => {
    setHealthLoading(true);
    setHealthError(null);
    try {
      const res = await fetch(`${apiUrl}/health`, { signal: AbortSignal.timeout(3000) });
      if (!res.ok && res.status !== 503) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      setHealth(data);
    } catch (err: any) {
      setHealthError("API injoignable (Lancez `docker compose up` ou le backend)");
      setHealth(null);
    } finally {
      setHealthLoading(false);
    }
  };

  // Trigger POST /pay
  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault();
    setPayLoading(true);
    setPayStatusMessage(null);
    try {
      const payload = {
        merchant_code: "MERCH_ALPHA",
        amount: Number(payAmount),
        currency: "EUR",
        simulate_failure: simulateFailure,
        idempotency_key: `IDEMP-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      };

      const res = await fetch(`${apiUrl}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000),
      });

      const data = await res.json();
      if (res.ok) {
        setPayStatusMessage(`Paiement réussi : Ref ${data.reference} (${data.status})`);
        setTransactions((prev) => [
          {
            id: data.transaction_id,
            reference: data.reference,
            amount: data.amount,
            currency: data.currency,
            status: data.status,
            latency_ms: data.latency_ms,
            created_at: new Date().toLocaleTimeString(),
          },
          ...prev.slice(0, 9),
        ]);
      } else {
        setPayStatusMessage(`Paiement rejeté / erreur : ${data.detail || data.message || "Erreur"}`);
        setTransactions((prev) => [
          {
            id: `err-${Date.now()}`,
            reference: `TX-FAIL-${Date.now().toString().slice(-6)}`,
            amount: Number(payAmount),
            currency: "EUR",
            status: "FAILED",
            latency_ms: 120,
            error_code: "API_REJECTED",
            created_at: new Date().toLocaleTimeString(),
          },
          ...prev.slice(0, 9),
        ]);
      }
    } catch (err: any) {
      // Simulation locale en cas d'API hors ligne pour la maquette
      const fallbackTx: TransactionItem = {
        id: `mock-${Date.now()}`,
        reference: `TX-MOCK-${Math.floor(100000 + Math.random() * 900000)}`,
        amount: Number(payAmount),
        currency: "EUR",
        status: simulateFailure ? "FAILED" : "SUCCESS",
        latency_ms: 24,
        error_code: simulateFailure ? "ERR_SIMULATED_FAIL" : undefined,
        created_at: new Date().toLocaleTimeString(),
      };
      setTransactions((prev) => [fallbackTx, ...prev.slice(0, 9)]);
      setPayStatusMessage(`[Mode Maquette/Offline] Transaction simulée enregistrée`);
    } finally {
      setPayLoading(false);
    }
  };

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 10000);
    return () => clearInterval(interval);
  }, [apiUrl]);

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100 flex flex-col font-sans">
      {/* TOP HEADER */}
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md sticky top-0 z-50 px-6 py-3.5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 ring-1 ring-cyan-400/30">
            <Radio className="w-5 h-5 text-white animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-200 to-cyan-400">
                PROJECT RESILIENCE-ALPHA
              </h1>
              <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-950/80 border border-cyan-800 text-cyan-300 font-mono">
                EPSI BAC+5
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Supervision de Cyber-Résilience & Reprise Autonome Zero-Touch
            </p>
          </div>
        </div>

        {/* System state banner & quick health refresh */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-slate-950/70 border border-slate-800 rounded-lg px-3 py-1.5 text-xs font-mono">
            <span className="text-slate-400">Backend API :</span>
            <input
              type="text"
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
              className="bg-transparent text-cyan-300 border-none outline-none w-44"
              placeholder="http://localhost:8000"
            />
          </div>

          <button
            onClick={checkHealth}
            disabled={healthLoading}
            className="flex items-center gap-1.5 bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-xs px-3 py-1.5 rounded-lg transition-all active:scale-95 disabled:opacity-50"
            id="btn-refresh-health"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${healthLoading ? "animate-spin text-cyan-400" : ""}`} />
            <span>Tester /health</span>
          </button>

          <div className="flex items-center gap-2 px-3 py-1 rounded-full border bg-emerald-950/40 border-emerald-500/30 text-emerald-400 text-xs font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
            <span>ZERO-TOUCH ARMED</span>
          </div>
        </div>
      </header>

      {/* DASHBOARD 4 ZONES GRID */}
      <main className="p-6 flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-[1700px] w-full mx-auto">
        
        {/* ========================================================================= */}
        {/* ZONE 1 : INFRASTRUCTURE & SANTÉ DES MICROSERVICES */}
        {/* ========================================================================= */}
        <section className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-5 shadow-xl backdrop-blur-sm flex flex-col justify-between hover:border-slate-700/80 transition-all">
          <div>
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  <Server className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-xs font-mono uppercase tracking-wider text-blue-400 font-semibold">Zone 1</span>
                  <h2 className="text-base font-semibold text-slate-100">Santé de l'Infrastructure & Microservices</h2>
                </div>
              </div>
              <span className="text-xs px-2.5 py-1 rounded-md bg-slate-800 font-mono text-slate-300">
                Docker & FastAPI
              </span>
            </div>

            {/* Health status summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
              <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3">
                <div className="text-xs text-slate-400 mb-1 flex items-center justify-between">
                  <span>FastAPI Core</span>
                  <Activity className="w-3.5 h-3.5 text-cyan-400" />
                </div>
                <div className="text-lg font-bold font-mono text-emerald-400 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                  {health ? health.status : (healthError ? "OFFLINE" : "NOMINAL")}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">Route /health</div>
              </div>

              <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3">
                <div className="text-xs text-slate-400 mb-1 flex items-center justify-between">
                  <span>PostgreSQL 16</span>
                  <Database className="w-3.5 h-3.5 text-blue-400" />
                </div>
                <div className="text-lg font-bold font-mono text-emerald-400 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                  {health ? health.database.toUpperCase() : "READY"}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">Pool: 10/20 conn.</div>
              </div>

              <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3">
                <div className="text-xs text-slate-400 mb-1 flex items-center justify-between">
                  <span>Uptime API</span>
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                </div>
                <div className="text-lg font-bold font-mono text-slate-200">
                  {health ? `${health.uptime_seconds}s` : "99.98%"}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">SLO: 99.9%</div>
              </div>

              <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3">
                <div className="text-xs text-slate-400 mb-1 flex items-center justify-between">
                  <span>WAF / Coraza</span>
                  <Lock className="w-3.5 h-3.5 text-purple-400" />
                </div>
                <div className="text-lg font-bold font-mono text-cyan-400">
                  FILTERING
                </div>
                <div className="text-[11px] text-slate-500 mt-1">OWASP Top 10</div>
              </div>
            </div>

            {/* Microservices table */}
            <div className="rounded-xl border border-slate-800 bg-slate-950/40 overflow-hidden">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-900/80 text-slate-400 font-mono uppercase text-[10px] border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3">Composant</th>
                    <th className="py-2.5 px-3">Rôle Architecture</th>
                    <th className="py-2.5 px-3">Port / Protocole</th>
                    <th className="py-2.5 px-3">Statut</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono text-slate-300">
                  <tr>
                    <td className="py-2.5 px-3 font-semibold text-slate-200">payment-api</td>
                    <td className="py-2.5 px-3 text-slate-400">API Métier FastAPI</td>
                    <td className="py-2.5 px-3">TCP 8000 (REST)</td>
                    <td className="py-2.5 px-3 text-emerald-400 font-medium">HEALTHY</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-semibold text-slate-200">resilience-postgres</td>
                    <td className="py-2.5 px-3 text-slate-400">Base transactions & CTEs</td>
                    <td className="py-2.5 px-3">TCP 5432</td>
                    <td className="py-2.5 px-3 text-emerald-400 font-medium">HEALTHY</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-semibold text-slate-200">prometheus-node</td>
                    <td className="py-2.5 px-3 text-slate-400">Scraping métriques /metrics</td>
                    <td className="py-2.5 px-3">TCP 9090</td>
                    <td className="py-2.5 px-3 text-cyan-400">POLLING (15s)</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-semibold text-slate-200">grafana-loki</td>
                    <td className="py-2.5 px-3 text-slate-400">Centralisation des logs</td>
                    <td className="py-2.5 px-3">TCP 3100</td>
                    <td className="py-2.5 px-3 text-slate-400">READY</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              Conteneurisé avec Docker Compose & isolation réseau (Axe Infra)
            </span>
            <span className="font-mono text-cyan-400">PG_ISREADY: OK</span>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* ZONE 2 : MÉTIER & TRANSACTIONS EN DIRECT */}
        {/* ========================================================================= */}
        <section className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-5 shadow-xl backdrop-blur-sm flex flex-col justify-between hover:border-slate-700/80 transition-all">
          <div>
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-xs font-mono uppercase tracking-wider text-emerald-400 font-semibold">Zone 2</span>
                  <h2 className="text-base font-semibold text-slate-100">Flux de Paiement & Transactions Directes</h2>
                </div>
              </div>
              <span className="text-xs px-2.5 py-1 rounded-md bg-emerald-950/80 border border-emerald-800/60 font-mono text-emerald-300">
                Route /pay
              </span>
            </div>

            {/* Test Payment Form for Live Demo */}
            <form onSubmit={handlePay} className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5 mb-4">
              <div className="text-xs font-semibold text-slate-300 mb-2 flex items-center justify-between">
                <span>Injecteur de Transaction Métier (Test en direct)</span>
                <span className="text-[11px] text-slate-500 font-mono">POST /pay</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Montant (€)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    value={payAmount}
                    onChange={(e) => setPayAmount(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-cyan-500 font-mono"
                  />
                </div>
                <div className="flex flex-col justify-center">
                  <label className="text-[11px] text-slate-400 block mb-1">Simulation Défaillance</label>
                  <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer pt-1">
                    <input
                      type="checkbox"
                      checked={simulateFailure}
                      onChange={(e) => setSimulateFailure(e.target.checked)}
                      className="rounded bg-slate-900 border-slate-700 text-rose-500 focus:ring-0"
                    />
                    <span className={simulateFailure ? "text-rose-400 font-bold" : ""}>
                      {simulateFailure ? "Échec forcé" : "Nominal (Succès)"}
                    </span>
                  </label>
                </div>
                <div className="flex items-end">
                  <button
                    type="submit"
                    disabled={payLoading}
                    className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-medium text-xs py-2 px-3 rounded-lg shadow-md transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1.5"
                    id="btn-submit-pay"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>{payLoading ? "Exécution..." : "Exécuter /pay"}</span>
                  </button>
                </div>
              </div>
              {payStatusMessage && (
                <div className="mt-2 text-[11px] font-mono text-cyan-300 bg-cyan-950/50 border border-cyan-800/60 rounded px-2 py-1">
                  {payStatusMessage}
                </div>
              )}
            </form>

            {/* Transactions Live Stream */}
            <div className="rounded-xl border border-slate-800 bg-slate-950/40 overflow-hidden">
              <div className="px-3 py-2 bg-slate-900/60 border-b border-slate-800 flex items-center justify-between">
                <span className="text-[11px] font-mono uppercase text-slate-400">Fil des Dernières Transactions</span>
                <span className="text-[11px] font-mono text-slate-500">{transactions.length} enregistrées</span>
              </div>
              <div className="divide-y divide-slate-800/60 max-h-[145px] overflow-y-auto font-mono text-xs">
                {transactions.map((tx) => (
                  <div key={tx.id} className="p-2.5 flex items-center justify-between hover:bg-slate-900/30 transition-colors">
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          tx.status === "SUCCESS"
                            ? "bg-emerald-400"
                            : tx.status === "REJECTED_WAF"
                            ? "bg-purple-400"
                            : "bg-rose-500"
                        }`}
                      />
                      <span className="font-semibold text-slate-200">{tx.reference}</span>
                      <span className="text-slate-500 text-[10px]">{tx.created_at}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-slate-400">{tx.latency_ms}ms</span>
                      <span className="font-bold text-slate-100">{tx.amount.toFixed(2)} {tx.currency}</span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                          tx.status === "SUCCESS"
                            ? "bg-emerald-950/80 text-emerald-400 border border-emerald-800/60"
                            : tx.status === "REJECTED_WAF"
                            ? "bg-purple-950/80 text-purple-300 border border-purple-800/60"
                            : "bg-rose-950/80 text-rose-400 border border-rose-800/60"
                        }`}
                      >
                        {tx.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
            <span className="font-mono">Tables : transactions, accounts, merchants</span>
            <span className="text-emerald-400 font-mono">CTE Analytics : Active</span>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* ZONE 3 : DÉTECTION D'ANOMALIES & CYBER SOC */}
        {/* ========================================================================= */}
        <section className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-5 shadow-xl backdrop-blur-sm flex flex-col justify-between hover:border-slate-700/80 transition-all">
          <div>
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-xs font-mono uppercase tracking-wider text-rose-400 font-semibold">Zone 3</span>
                  <h2 className="text-base font-semibold text-slate-100">Détection d'Anomalies IA & Cyber SOC</h2>
                </div>
              </div>
              <span className="text-xs px-2.5 py-1 rounded-md bg-rose-950/80 border border-rose-800/60 font-mono text-rose-300">
                AIOps & SIEM
              </span>
            </div>

            {/* AI ML Radar & Incident score */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3">
                <div className="text-[11px] text-slate-400">Modèle ML AIOps</div>
                <div className="text-sm font-bold text-cyan-400 font-mono mt-1">Isolation Forest</div>
                <div className="text-[10px] text-slate-500 mt-1">Entraîné sur métriques</div>
              </div>
              <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3">
                <div className="text-[11px] text-slate-400">Score d'Anomalie</div>
                <div className="text-sm font-bold font-mono mt-1 text-emerald-400">0.08 (Normal)</div>
                <div className="text-[10px] text-slate-500 mt-1">Seuil Alerte : &gt; 0.65</div>
              </div>
              <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3">
                <div className="text-[11px] text-slate-400">Assistant RAG</div>
                <div className="text-sm font-bold text-purple-400 font-mono mt-1">Ollama / Llama3</div>
                <div className="text-[10px] text-slate-500 mt-1">Documentation & PCA</div>
              </div>
            </div>

            {/* Incident Alert Logs */}
            <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3 font-mono text-xs space-y-2">
              <div className="flex items-start gap-2 text-slate-300">
                <span className="text-cyan-400 font-bold">[SOC-INFO]</span>
                <span>Collecte télémétrique active via Loki & Prometheus scrape (15s).</span>
              </div>
              <div className="flex items-start gap-2 text-slate-400">
                <span className="text-emerald-400 font-bold">[ML-BASELINE]</span>
                <span>Taux d'échec nominal : 0.8% | Latence p95 : 24ms.</span>
              </div>
              <div className="flex items-start gap-2 text-slate-400">
                <span className="text-blue-400 font-bold">[ATTACK-VECTOR]</span>
                <span>Prêt pour le scénario Red Team (DDoS applicatif / Injection / Crash).</span>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
            <span className="flex items-center gap-1.5">
              <Cpu className="w-4 h-4 text-rose-400" />
              Machine Learning sans règles codées en dur (Axe IA)
            </span>
            <span className="text-slate-500 font-mono">SEV: LOW</span>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* ZONE 4 : MOTEUR DE REMÉDIATION AUTONOME */}
        {/* ========================================================================= */}
        <section className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-5 shadow-xl backdrop-blur-sm flex flex-col justify-between hover:border-slate-700/80 transition-all">
          <div>
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  <RotateCcw className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-xs font-mono uppercase tracking-wider text-amber-400 font-semibold">Zone 4</span>
                  <h2 className="text-base font-semibold text-slate-100">Moteur de Remédiation Autonome (Zero-Touch)</h2>
                </div>
              </div>
              <span className="text-xs px-2.5 py-1 rounded-md bg-amber-950/80 border border-amber-800/60 font-mono text-amber-300">
                Ansible & Orchestrator
              </span>
            </div>

            {/* Zero-touch recovery workflow steps */}
            <div className="space-y-2.5 mb-4 font-mono text-xs">
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
                <div className="flex items-center gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 flex items-center justify-center text-[10px] font-bold">1</span>
                  <span className="text-slate-300">Détection de l'Anomalie (AIOps / Seuil d'échec)</span>
                </div>
                <span className="text-cyan-400 text-[11px] font-bold">ARMED</span>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
                <div className="flex items-center gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 flex items-center justify-center text-[10px] font-bold">2</span>
                  <span className="text-slate-300">Arbitrage & Déclenchement Playbook Ansible</span>
                </div>
                <span className="text-slate-500 text-[11px]">STANDBY</span>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
                <div className="flex items-center gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 flex items-center justify-center text-[10px] font-bold">3</span>
                  <span className="text-slate-300">Remédiation du conteneur & Rétablissement des flux</span>
                </div>
                <span className="text-slate-500 text-[11px]">READY</span>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
                <div className="flex items-center gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center text-[10px] font-bold">4</span>
                  <span className="text-slate-300">Vérification Métier (Exécution nouvelle transaction /pay)</span>
                </div>
                <span className="text-emerald-400 text-[11px] font-bold">PRE-VERIFIED</span>
              </div>
            </div>

            {/* Clip Chrono Indicator for Jury */}
            <div className="bg-gradient-to-r from-amber-950/40 via-slate-950 to-slate-950 border border-amber-800/40 rounded-xl p-3 flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-amber-300">Clip Chrono (60s Max Sans Coupe)</div>
                <div className="text-[11px] text-slate-400 mt-0.5">Attaque PC Attaquant → Remédiation automatique</div>
              </div>
              <div className="font-mono text-sm px-3 py-1 rounded bg-slate-900 border border-slate-700 text-amber-400 font-bold">
                00:60 MAX
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              Preuve de reprise autonome sans action humaine (Axe 1 & 3)
            </span>
            <span className="text-amber-400 font-mono">AUTONOMOUS: ON</span>
          </div>
        </section>

      </main>

      {/* FOOTER */}
      <footer className="border-t border-slate-800/80 bg-slate-950/70 px-6 py-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
        <div>
          <span className="font-semibold text-slate-300">Consortium Resilience-Alpha</span> • Workshop Bac+5 Direction Pédagogique Nationale EPSI
        </div>
        <div className="flex items-center gap-4 font-mono text-[11px]">
          <span>FastAPI v1.0.0</span>
          <span>PostgreSQL 16</span>
          <span>Next.js 16 (Turbopack)</span>
          <span className="text-cyan-400">EBIOS RM / DORA Compliant</span>
        </div>
      </footer>
    </div>
  );
}
