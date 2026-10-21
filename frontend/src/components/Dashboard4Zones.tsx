import React, { useState } from 'react';
import { 
  Activity, 
  Shield, 
  Cpu, 
  ArrowUpRight, 
  RefreshCw 
} from 'lucide-react';
import { Transaction, HealthCheckResponse, WafStatusResponse } from '../types/index.ts';
import { LiveResiliencePipeline } from './LiveResiliencePipeline.tsx';
import { AiCyberSocPanel } from './AiCyberSocPanel.tsx';

interface Dashboard4ZonesProps {
  transactions: Transaction[];
  health: HealthCheckResponse;
  wafStatus?: WafStatusResponse;
  isBackendOnline?: boolean;
  onRefreshHealth: () => void;
  isDegraded: boolean;
  onGoToPay: () => void;
}

export const Dashboard4Zones: React.FC<Dashboard4ZonesProps> = ({
  transactions,
  health,
  wafStatus,
  isBackendOnline = false,
  onRefreshHealth,
  isDegraded,
  onGoToPay,
}) => {
  const [viewMode, setViewMode] = useState<'pipeline' | 'zones' | 'mockup'>('pipeline');

  const confirmedCount = transactions.filter((t) => t.status === 'CONFIRMED').length;
  const totalVolume = transactions
    .filter((t) => t.status === 'CONFIRMED')
    .reduce((sum, t) => sum + t.amount, 0);
  const successRate =
    transactions.length > 0 ? Math.round((confirmedCount / transactions.length) * 100) : 100;
  const avgLatency =
    transactions.length > 0
      ? Math.round(transactions.reduce((sum, t) => sum + t.latency_ms, 0) / transactions.length)
      : 35;

  const totalBlocked = wafStatus?.stats.total_blocked ?? 0;
  const rateLimitDrops = wafStatus?.stats.rate_limit_drops ?? 0;
  const bannedIps = wafStatus?.banned_ips ?? [];
  const remediationStatus = wafStatus?.remediation?.status ?? 'UP';
  const remediationQueue = wafStatus?.remediation?.queue ?? 0;
  const recentActions = wafStatus?.remediation?.recent_actions ?? [];

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-zinc-200/80 gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-950">
              Supervision
            </h1>
            <span
              className={`text-[11px] px-2.5 py-0.5 rounded-full font-medium border ${
                isDegraded
                  ? 'bg-amber-50 text-amber-800 border-amber-300 animate-pulse'
                  : isBackendOnline
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-zinc-100 text-zinc-600 border-zinc-200'
              }`}
            >
              {isDegraded
                ? 'Incident détecté · Remédiation en cours'
                : isBackendOnline
                ? 'Live · Microservices connectés'
                : 'Mode local'}
            </span>
          </div>
          <p className="text-xs text-zinc-500 mt-1 font-normal">
            Architecture de résilience et reprise autonome sur 4 zones (Polling temps réel 2.5s)
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="p-1 bg-zinc-100 rounded-xl flex items-center text-xs">
            <button
              onClick={() => setViewMode('pipeline')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                viewMode === 'pipeline'
                  ? 'bg-white text-zinc-950 shadow-2xs font-medium'
                  : 'text-zinc-500 hover:text-zinc-950'
              }`}
            >
              Pipeline
            </button>
            <button
              onClick={() => setViewMode('zones')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                viewMode === 'zones'
                  ? 'bg-white text-zinc-950 shadow-2xs font-medium'
                  : 'text-zinc-500 hover:text-zinc-950'
              }`}
            >
              4 Zones
            </button>
            <button
              onClick={() => setViewMode('mockup')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                viewMode === 'mockup'
                  ? 'bg-white text-zinc-950 shadow-2xs font-medium'
                  : 'text-zinc-500 hover:text-zinc-950'
              }`}
            >
              Maquette
            </button>
          </div>

          <button
            onClick={onGoToPay}
            className="px-3.5 py-1.5 bg-zinc-950 hover:bg-zinc-800 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
          >
            <span>Payer</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Featured Pipeline Graphic View */}
      {viewMode === 'pipeline' && (
        <div className="mt-6 space-y-6">
          <LiveResiliencePipeline
            transactions={transactions}
            health={health}
            wafStatus={wafStatus}
            isDegraded={isDegraded}
          />
        </div>
      )}

      {/* 4 ZONES GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-6">
        
        {/* ZONE 1 : FLUX MÉTIER */}
        <div className="bg-white border border-zinc-200/80 rounded-2xl p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-medium text-zinc-400">
                Zone 1 · Flux métier
              </span>
              <Activity className="w-4 h-4 text-zinc-400" />
            </div>

            {viewMode === 'mockup' ? (
              <div className="py-9 text-center border border-dashed border-zinc-200 rounded-xl bg-zinc-50/60">
                <span className="text-xs text-zinc-400 font-normal">
                  Métriques transactionnelles et débit de paiement
                </span>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-2 py-1">
                  <div>
                    <span className="text-xs text-zinc-400 font-normal block">Volume</span>
                    <span className="text-xl font-semibold text-zinc-950 tracking-tight">
                      {totalVolume.toFixed(2)} €
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-zinc-400 font-normal block">Succès</span>
                    <span className={`text-xl font-semibold tracking-tight ${
                      successRate < 80 ? 'text-rose-600' : 'text-emerald-600'
                    }`}>
                      {successRate}%
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-zinc-400 font-normal block">Latence</span>
                    <span className="text-xl font-semibold text-zinc-700 tracking-tight">
                      {avgLatency} ms
                    </span>
                  </div>
                </div>

                <div className="space-y-2 pt-2 border-t border-zinc-100">
                  {transactions.slice(0, 4).map((tx) => (
                    <div
                      key={tx.id}
                      className="flex items-center justify-between text-xs py-2 px-3 rounded-xl bg-zinc-50/80 border border-zinc-100"
                    >
                      <div className="truncate max-w-[200px]">
                        <span className="font-medium text-zinc-900 block truncate">
                          {tx.customer_name}
                        </span>
                        <span className="text-[11px] text-zinc-400 truncate block">
                          {tx.reference} • {new Date(tx.created_at).toLocaleTimeString('fr-FR')}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className={`font-semibold block ${tx.status === 'CONFIRMED' ? 'text-zinc-900' : 'text-rose-600'}`}>
                          {tx.amount.toFixed(2)} €
                        </span>
                        <span className={`text-[10px] font-medium ${tx.status === 'CONFIRMED' ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {tx.status === 'CONFIRMED' ? 'VALIDÉ' : 'ÉCHEC'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="pt-3 mt-4 border-t border-zinc-100 flex justify-between text-xs text-zinc-400">
            <span>GET /api/transactions · POST /api/pay</span>
            <span>{transactions.length} transactions suivies</span>
          </div>
        </div>

        {/* ZONE 2 : INFRASTRUCTURE & SANTÉ */}
        <div className="bg-white border border-zinc-200/80 rounded-2xl p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-medium text-zinc-400">
                Zone 2 · Infrastructure
              </span>
              <button
                onClick={onRefreshHealth}
                className="text-zinc-400 hover:text-zinc-700 transition-colors cursor-pointer"
                title="Actualiser la télémétrie"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>

            {viewMode === 'mockup' ? (
              <div className="py-9 text-center border border-dashed border-zinc-200 rounded-xl bg-zinc-50/60">
                <span className="text-xs text-zinc-400 font-normal">
                  Sonde de santé /health et pool de connexions
                </span>
              </div>
            ) : (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-50/80 border border-zinc-100 text-xs">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${
                      health.status === 'unhealthy'
                        ? 'bg-rose-500 animate-ping'
                        : isDegraded
                        ? 'bg-amber-500 animate-pulse'
                        : 'bg-emerald-500'
                    }`} />
                    <span className="font-medium text-zinc-900">API FastAPI ({health.service})</span>
                  </div>
                  <span className="text-zinc-500 font-mono">
                    {health.status.toUpperCase()} ({health.database.latency_ms} ms)
                  </span>
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-50/80 border border-zinc-100 text-xs">
                  <span className="font-medium text-zinc-900">PostgreSQL 16</span>
                  <span className={health.database.status === 'connected' ? 'text-emerald-600 font-medium' : 'text-rose-600 font-semibold'}>
                    {health.database.status.toUpperCase()} • {health.database.active_connections}/{health.database.max_connections} conn.
                  </span>
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-50/80 border border-zinc-100 text-xs">
                  <span className="font-medium text-zinc-900">WAF Nginx & Rate Limiter</span>
                  <span className={totalBlocked > 0 ? 'text-amber-700 font-semibold' : 'text-emerald-600 font-medium'}>
                    {totalBlocked > 0 ? `${totalBlocked} requêtes bloquées` : 'Nominal (0 blocage)'}
                  </span>
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-50/80 border border-zinc-100 text-xs">
                  <span className="font-medium text-zinc-900">Observabilité Prometheus / Loki</span>
                  <span className="text-emerald-600 font-medium">Actif (/metrics)</span>
                </div>
              </div>
            )}
          </div>
          <div className="pt-3 mt-4 border-t border-zinc-100 flex justify-between text-xs text-zinc-400">
            <span>GET /api/health</span>
            <span>Uptime : {health.uptime_seconds}s</span>
          </div>
        </div>

        {/* ZONE 3 : CYBERSÉCURITÉ */}
        <div className="bg-white border border-zinc-200/80 rounded-2xl p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-medium text-zinc-400">
                Zone 3 · Sécurité & IA
              </span>
              <Shield className="w-4 h-4 text-zinc-400" />
            </div>

            {viewMode === 'mockup' ? (
              <div className="py-9 text-center border border-dashed border-zinc-200 rounded-xl bg-zinc-50/60">
                <span className="text-xs text-zinc-400 font-normal">
                  Détection d'anomalies WAF et modèle AIOps
                </span>
              </div>
            ) : (
              <AiCyberSocPanel
                isDegraded={isDegraded}
                transactions={transactions}
                wafStatus={wafStatus}
              />
            )}
          </div>
          <div className="pt-3 mt-4 border-t border-zinc-100 flex justify-between text-xs text-zinc-400">
            <span>WAF Actif • Isolation Forest</span>
            <span>Conformité NIS2 & DORA</span>
          </div>
        </div>

        {/* ZONE 4 : REMÉDIATION AUTONOME */}
        <div className="bg-white border border-zinc-200/80 rounded-2xl p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-medium text-zinc-400">
                Zone 4 · Remédiation autonome
              </span>
              <Cpu className="w-4 h-4 text-zinc-400" />
            </div>

            {viewMode === 'mockup' ? (
              <div className="py-9 text-center border border-dashed border-zinc-200 rounded-xl bg-zinc-50/60">
                <span className="text-xs text-zinc-400 font-normal">
                  Moteur Zero-Touch Recovery et playbooks Ansible
                </span>
              </div>
            ) : (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-50/80 border border-zinc-100 text-xs">
                  <span className="font-medium text-zinc-900">Moteur Zero-Touch (engine.py)</span>
                  <span className={`font-semibold ${
                    isDegraded || remediationQueue > 0
                      ? 'text-amber-600 animate-pulse'
                      : remediationStatus === 'UP'
                      ? 'text-emerald-600'
                      : 'text-zinc-500'
                  }`}>
                    {remediationQueue > 0
                      ? `Playbook en cours (file: ${remediationQueue})`
                      : isDegraded
                      ? 'Reprise autonome engagée'
                      : `Veille active (${remediationStatus})`}
                  </span>
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-50/80 border border-zinc-100 text-xs">
                  <span className="font-medium text-zinc-900">Mitigation WAF / DDoS L7</span>
                  <span className="text-zinc-700 font-medium">
                    {rateLimitDrops} flood drops • {bannedIps.length} IP bannie(s)
                  </span>
                </div>

                {/* Historique temps réel des playbooks Ansible exécutés par remediation:8020 */}
                <div className="p-3 rounded-xl bg-zinc-50/80 border border-zinc-100 text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-zinc-900">Playbooks Ansible exécutés</span>
                    <span className="text-[10px] font-mono text-zinc-500">
                      {recentActions.length} exécution(s)
                    </span>
                  </div>

                  {recentActions.length === 0 ? (
                    <div className="text-[11px] text-zinc-400 pt-0.5">
                      Aucun playbook déclenché • Prêts : <span className="font-mono">block_source</span>, <span className="font-mono">restart_service</span>, <span className="font-mono">restore_database</span>
                    </div>
                  ) : (
                    <div className="space-y-1.5 pt-1">
                      {recentActions.slice(0, 3).map((act, idx) => (
                        <div
                          key={`${act.alert_id}-${act.action}-${idx}`}
                          className="flex items-center justify-between bg-white px-2.5 py-1.5 rounded-lg border border-zinc-200/70 text-[11px]"
                        >
                          <div className="truncate max-w-[210px]">
                            <span className="font-mono font-semibold text-zinc-900">
                              {act.action}.yml
                            </span>
                            <span className="text-zinc-400 ml-1.5">
                              ({act.type} → {act.service})
                            </span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-zinc-500 font-mono">{act.duration_s}s</span>
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                                act.result === 'success'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-rose-100 text-rose-800'
                              }`}
                            >
                              {act.result === 'success' ? 'OK' : 'ERR'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          <div className="pt-3 mt-4 border-t border-zinc-100 flex justify-between text-xs text-zinc-400">
            <span>Zéro intervention humaine (ml-detector → Ansible)</span>
            <span>RPO : 0 perte (ACID)</span>
          </div>
        </div>

      </div>
    </div>
  );
};
