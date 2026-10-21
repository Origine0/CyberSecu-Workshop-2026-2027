import React, { useState, useEffect, useMemo } from 'react';
import {
  ExternalLink,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';
import {
  Transaction,
  HealthCheckResponse,
  WafStatusResponse
} from '../types/index.ts';

interface LiveResiliencePipelineProps {
  transactions: Transaction[];
  health: HealthCheckResponse;
  wafStatus?: WafStatusResponse;
  isDegraded: boolean;
  onSimulateTransit?: () => void;
}

interface RollingSnapshot {
  ts: number;
  label: string;
  anomalyScore: number;
  requestRate: number;
  errorRatePct: number;
  latencyMs: number;
  http2xx: number;
  http4xx: number;
  httpBlocked: number;
  isAnomaly: boolean;
}

const DEFAULT_SERVICES = [
  { id: 'payment-api', label: 'API Paiement', defaultMem: 64, defaultCpu: 1.8 },
  { id: 'waf', label: 'Passerelle WAF', defaultMem: 19, defaultCpu: 0.9 },
  { id: 'auth', label: 'Authentification', defaultMem: 48, defaultCpu: 0.7 },
  { id: 'ml-detector', label: 'Détecteur IA', defaultMem: 112, defaultCpu: 2.4 },
  { id: 'remediation', label: 'Moteur Ansible', defaultMem: 54, defaultCpu: 0.6 },
  { id: 'frontend', label: 'Portail Web', defaultMem: 72, defaultCpu: 0.5 },
];

/**
 * Construit un chemin SVG lisse (courbe de Bézier cubique douce) et son aire
 */
function buildSmoothSvgPath(
  values: number[],
  width: number,
  height: number,
  minVal: number,
  maxVal: number
): { linePath: string; areaPath: string } {
  if (values.length === 0) {
    return { linePath: '', areaPath: '' };
  }
  const safeSpan = Math.max(maxVal - minVal, 0.0001);
  const padY = 10;
  const usableH = height - padY * 2;

  const pts = values.map((val, idx) => {
    const x = values.length === 1 ? width / 2 : (idx / (values.length - 1)) * width;
    const clamped = Math.min(Math.max(val, minVal), maxVal);
    const ratio = (clamped - minVal) / safeSpan;
    const y = padY + usableH * (1 - ratio);
    return { x: Number(x.toFixed(1)), y: Number(y.toFixed(1)) };
  });

  if (pts.length === 1) {
    return { linePath: `M 0 ${pts[0].y} L ${width} ${pts[0].y}`, areaPath: '' };
  }

  let linePath = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i];
    const p1 = pts[i + 1];
    const midX = Number(((p0.x + p1.x) / 2).toFixed(1));
    linePath += ` C ${midX} ${p0.y}, ${midX} ${p1.y}, ${p1.x} ${p1.y}`;
  }

  const firstX = pts[0].x;
  const lastX = pts[pts.length - 1].x;
  const areaPath = `${linePath} L ${lastX} ${height} L ${firstX} ${height} Z`;

  return { linePath, areaPath };
}

export const LiveResiliencePipeline: React.FC<LiveResiliencePipelineProps> = ({
  transactions,
  health,
  wafStatus,
  isDegraded,
}) => {
  const [rollingHistory, setRollingHistory] = useState<RollingSnapshot[]>(() => {
    const now = Date.now();
    return Array.from({ length: 20 }).map((_, idx) => {
      const ts = now - (19 - idx) * 5000;
      const d = new Date(ts);
      return {
        ts,
        label: d.toLocaleTimeString('fr-FR', { minute: '2-digit', second: '2-digit' }),
        anomalyScore: 0.16 + Math.sin(idx * 0.5) * 0.02,
        requestRate: 0.5,
        errorRatePct: 0.5,
        latencyMs: 26 + (idx % 4) * 2,
        http2xx: 0.5,
        http4xx: 0.0,
        httpBlocked: 0.0,
        isAnomaly: false,
      };
    });
  });

  const grafana = wafStatus?.grafana;

  useEffect(() => {
    const now = Date.now();
    const recentTxs = transactions.slice(0, 10);
    const failedCount = recentTxs.filter((t) => t.status === 'FAILED').length;
    const calcErrorPct =
      recentTxs.length > 0 ? Number(((failedCount / recentTxs.length) * 100).toFixed(1)) : 0.5;
    const calcLatency =
      recentTxs.length > 0
        ? Math.round(recentTxs.reduce((s, t) => s + (t.latency_ms || 25), 0) / recentTxs.length)
        : health.database.latency_ms || 28;

    const totalBlocked = wafStatus?.stats.total_blocked ?? 0;

    const promScoreSeries = grafana?.anomaly_score_series ?? [];
    const latestPromScore =
      promScoreSeries.length > 0 ? promScoreSeries[promScoreSeries.length - 1].value : null;

    const promReqSeries = grafana?.features_series?.request_rate ?? [];
    const latestPromReq =
      promReqSeries.length > 0 ? promReqSeries[promReqSeries.length - 1].value : null;

    const promErrSeries = grafana?.features_series?.error_rate ?? [];
    const latestPromErr =
      promErrSeries.length > 0 ? promErrSeries[promErrSeries.length - 1].value * 100 : null;

    const promLatSeries = grafana?.features_series?.latency_ms ?? [];
    const latestPromLat =
      promLatSeries.length > 0 ? promLatSeries[promLatSeries.length - 1].value : null;

    const anomalyActive = Boolean(grafana?.ml_anomaly) || isDegraded || calcErrorPct >= 25;

    const scoreVal =
      latestPromScore !== null
        ? latestPromScore
        : anomalyActive
        ? -0.185
        : 0.168;

    const reqRateVal =
      latestPromReq !== null
        ? latestPromReq
        : anomalyActive
        ? 18.5
        : 0.5;

    const errPctVal =
      latestPromErr !== null
        ? Number(latestPromErr.toFixed(1))
        : anomalyActive
        ? Math.max(42.0, calcErrorPct)
        : calcErrorPct;

    const latVal =
      latestPromLat !== null
        ? Math.round(latestPromLat)
        : anomalyActive
        ? Math.max(420, calcLatency)
        : calcLatency;

    const snap: RollingSnapshot = {
      ts: now,
      label: new Date(now).toLocaleTimeString('fr-FR', { minute: '2-digit', second: '2-digit' }),
      anomalyScore: scoreVal,
      requestRate: reqRateVal,
      errorRatePct: errPctVal,
      latencyMs: latVal,
      http2xx: anomalyActive ? Math.max(0.2, reqRateVal * 0.35) : reqRateVal,
      http4xx: anomalyActive ? Number((reqRateVal * 0.45).toFixed(2)) : 0,
      httpBlocked: totalBlocked > 0 ? Number(Math.min(25, totalBlocked * 0.5).toFixed(2)) : 0,
      isAnomaly: anomalyActive,
    };

    setRollingHistory((prev) => [...prev.slice(-23), snap]);
  }, [transactions, health, wafStatus, isDegraded, grafana]);

  const scoreValues = useMemo(() => {
    if (grafana?.anomaly_score_series && grafana.anomaly_score_series.length >= 4) {
      return grafana.anomaly_score_series.map((p) => p.value);
    }
    return rollingHistory.map((h) => h.anomalyScore);
  }, [grafana, rollingHistory]);

  const currentScore = scoreValues[scoreValues.length - 1] ?? 0.168;
  const isScoreAnomaly = currentScore < 0 || Boolean(grafana?.ml_anomaly) || isDegraded;

  const reqRateValues = useMemo(() => {
    const s = grafana?.features_series?.request_rate;
    if (s && s.length >= 4) return s.map((p) => p.value);
    return rollingHistory.map((h) => h.requestRate);
  }, [grafana, rollingHistory]);

  const errRatePctValues = useMemo(() => {
    const s = grafana?.features_series?.error_rate;
    if (s && s.length >= 4) return s.map((p) => Number((p.value * 100).toFixed(1)));
    return rollingHistory.map((h) => h.errorRatePct);
  }, [grafana, rollingHistory]);

  const latencyValues = useMemo(() => {
    const s = grafana?.features_series?.latency_ms;
    if (s && s.length >= 4) return s.map((p) => p.value);
    return rollingHistory.map((h) => h.latencyMs);
  }, [grafana, rollingHistory]);

  const http200Values = useMemo(() => {
    const s = grafana?.http_status_series?.['200'] || grafana?.http_status_series?.['2xx'];
    if (s && s.length >= 4) return s.map((p) => p.value);
    return rollingHistory.map((h) => h.http2xx);
  }, [grafana, rollingHistory]);

  const http4xxValues = useMemo(() => {
    const s =
      grafana?.http_status_series?.['422'] ||
      grafana?.http_status_series?.['429'] ||
      grafana?.http_status_series?.['403'] ||
      grafana?.http_status_series?.['4xx'];
    if (s && s.length >= 4) return s.map((p) => p.value);
    return rollingHistory.map((h) => h.http4xx + h.httpBlocked);
  }, [grafana, rollingHistory]);

  const recentActions = wafStatus?.remediation?.recent_actions ?? [];
  const mlAlerts1h = grafana?.ml_alerts_1h ?? recentActions.length;
  const remedSuccess1h =
    grafana?.remediation_ok_1h ??
    recentActions.filter((a) => a.result === 'success').length;
  const targetsUpRatio = grafana?.targets_up_ratio ?? (health.status === 'healthy' ? 100 : 88.9);

  const svgW = 460;
  const svgH = 120;

  const scoreChart = buildSmoothSvgPath(scoreValues, svgW, svgH, -0.3, 0.3);
  const zeroThresholdY = svgH / 2;

  const maxLat = Math.max(150, ...latencyValues);
  const maxReq = Math.max(10, ...reqRateValues);
  const latChart = buildSmoothSvgPath(latencyValues, svgW, svgH, 0, maxLat);
  const reqChart = buildSmoothSvgPath(reqRateValues, svgW, svgH, 0, maxReq);
  const errChart = buildSmoothSvgPath(errRatePctValues, svgW, svgH, 0, 100);

  const maxHttp = Math.max(5, ...http200Values, ...http4xxValues);
  const http200Chart = buildSmoothSvgPath(http200Values, svgW, svgH, 0, maxHttp);
  const http4xxChart = buildSmoothSvgPath(http4xxValues, svgW, svgH, 0, maxHttp);

  const grafanaExternalUrl =
    typeof window !== 'undefined'
      ? `http://${window.location.hostname}:3000/d/resilience-infra`
      : 'http://localhost:3000/d/resilience-infra';

  return (
    <div className="bg-white border border-zinc-200/80 rounded-2xl p-6 shadow-xs space-y-6">
      {/* Header minimaliste Apple-style */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span
            className={`w-2 h-2 rounded-full ${
              isScoreAnomaly ? 'bg-rose-500 animate-pulse' : 'bg-emerald-500'
            }`}
          />
          <h2 className="text-base font-semibold tracking-tight text-zinc-950">
            Télémétrie Grafana
          </h2>
          <span className="text-xs text-zinc-400 font-normal">
            Temps réel
          </span>
        </div>

        <a
          href={grafanaExternalUrl}
          target="_blank"
          rel="noreferrer"
          className="px-3 py-1.5 bg-zinc-50 hover:bg-zinc-100 border border-zinc-200/70 text-zinc-600 hover:text-zinc-950 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-all"
        >
          <span>Grafana</span>
          <ExternalLink className="w-3 h-3 text-zinc-400" />
        </a>
      </div>

      {/* 4 KPIs épurés */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-zinc-50/70 border border-zinc-100">
          <span className="text-xs text-zinc-400 font-normal block">Détection IA</span>
          <div className="flex items-baseline justify-between mt-1.5">
            <span
              className={`text-xl font-semibold tracking-tight ${
                isScoreAnomaly ? 'text-rose-600' : 'text-emerald-600'
              }`}
            >
              {isScoreAnomaly ? 'Anomalie' : 'Nominal'}
            </span>
            <span className="text-xs text-zinc-400">
              {currentScore > 0 ? `+${currentScore.toFixed(2)}` : currentScore.toFixed(2)}
            </span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-zinc-50/70 border border-zinc-100">
          <span className="text-xs text-zinc-400 font-normal block">Alertes (1 h)</span>
          <div className="flex items-baseline justify-between mt-1.5">
            <span className="text-xl font-semibold tracking-tight text-zinc-950">
              {mlAlerts1h}
            </span>
            <span className="text-xs text-zinc-400">
              {mlAlerts1h > 0 ? 'Actives' : 'Aucune'}
            </span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-zinc-50/70 border border-zinc-100">
          <span className="text-xs text-zinc-400 font-normal block">Remédiations</span>
          <div className="flex items-baseline justify-between mt-1.5">
            <span className="text-xl font-semibold tracking-tight text-zinc-950">
              {remedSuccess1h}
            </span>
            <span className="text-xs text-emerald-600 font-medium">
              100% auto
            </span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-zinc-50/70 border border-zinc-100">
          <span className="text-xs text-zinc-400 font-normal block">Disponibilité</span>
          <div className="flex items-baseline justify-between mt-1.5">
            <span className="text-xl font-semibold tracking-tight text-zinc-950">
              {targetsUpRatio}%
            </span>
            <span className="text-xs text-zinc-400">Services</span>
          </div>
        </div>
      </div>

      {/* Courbes Modèle IA & Trafic */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Score d'anomalie */}
        <div className="p-5 rounded-2xl bg-zinc-50/50 border border-zinc-100 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-medium text-zinc-500">
              Score d&apos;anomalie
            </span>
            <span
              className={`text-sm font-semibold tracking-tight ${
                isScoreAnomaly ? 'text-rose-600' : 'text-zinc-950'
              }`}
            >
              {currentScore > 0 ? `+${currentScore.toFixed(3)}` : currentScore.toFixed(3)}
            </span>
          </div>

          <div className="h-32 w-full relative">
            <svg
              className="w-full h-full overflow-visible"
              viewBox={`0 0 ${svgW} ${svgH}`}
              preserveAspectRatio="none"
            >
              <defs>
                <linearGradient id="cleanScoreGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor={isScoreAnomaly ? '#f43f5e' : '#10b981'}
                    stopOpacity="0.16"
                  />
                  <stop
                    offset="100%"
                    stopColor={isScoreAnomaly ? '#f43f5e' : '#10b981'}
                    stopOpacity="0.0"
                  />
                </linearGradient>
              </defs>

              <line
                x1="0"
                y1={zeroThresholdY}
                x2={svgW}
                y2={zeroThresholdY}
                stroke="#e4e4e7"
                strokeWidth="1"
                strokeDasharray="4 4"
              />

              {scoreChart.areaPath && (
                <path d={scoreChart.areaPath} fill="url(#cleanScoreGrad)" />
              )}
              {scoreChart.linePath && (
                <path
                  d={scoreChart.linePath}
                  fill="none"
                  stroke={isScoreAnomaly ? '#e11d48' : '#10b981'}
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              )}
            </svg>
          </div>

          <div className="flex items-center justify-between text-[11px] text-zinc-400 pt-3 border-t border-zinc-100">
            <span>Isolation Forest</span>
            <span>Seuil critique : 0.00</span>
          </div>
        </div>

        {/* Débit, Latence & Erreurs */}
        <div className="p-5 rounded-2xl bg-zinc-50/50 border border-zinc-100 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-medium text-zinc-500">
              Charge &amp; Latence
            </span>
            <div className="flex items-center gap-3 text-xs">
              <span className="font-semibold text-zinc-950">
                {(reqRateValues[reqRateValues.length - 1] ?? 0.5).toFixed(1)} req/s
              </span>
              <span className="text-zinc-400">
                {Math.round(latencyValues[latencyValues.length - 1] ?? 28)} ms
              </span>
            </div>
          </div>

          <div className="h-32 w-full relative">
            <svg
              className="w-full h-full overflow-visible"
              viewBox={`0 0 ${svgW} ${svgH}`}
              preserveAspectRatio="none"
            >
              <line
                x1="0"
                y1={svgH * 0.5}
                x2={svgW}
                y2={svgH * 0.5}
                stroke="#f4f4f5"
                strokeWidth="1"
              />

              {latChart.linePath && (
                <path
                  d={latChart.linePath}
                  fill="none"
                  stroke="#a1a1aa"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              )}

              {reqChart.linePath && (
                <path
                  d={reqChart.linePath}
                  fill="none"
                  stroke="#18181b"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              )}

              {errChart.linePath && (
                <path
                  d={errChart.linePath}
                  fill="none"
                  stroke="#f43f5e"
                  strokeWidth="1.5"
                  strokeDasharray="3 3"
                  strokeLinecap="round"
                />
              )}
            </svg>
          </div>

          <div className="flex items-center justify-between text-[11px] text-zinc-400 pt-3 border-t border-zinc-100">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-900" />
                <span>Débit</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
                <span>Latence</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                <span>Erreurs</span>
              </span>
            </div>
            <span>
              {(errRatePctValues[errRatePctValues.length - 1] ?? 0.5).toFixed(1)}% rejet
            </span>
          </div>
        </div>
      </div>

      {/* Courbes Flux HTTP & Conteneurs */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Trafic HTTP & WAF */}
        <div className="p-5 rounded-2xl bg-zinc-50/50 border border-zinc-100 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-medium text-zinc-500">
              Flux HTTP &amp; Filtrage WAF
            </span>
            <span className="text-xs font-medium text-zinc-950">
              {wafStatus?.stats.total_blocked ?? 0} bloqués
            </span>
          </div>

          <div className="h-32 w-full relative">
            <svg
              className="w-full h-full overflow-visible"
              viewBox={`0 0 ${svgW} ${svgH}`}
              preserveAspectRatio="none"
            >
              <defs>
                <linearGradient id="cleanHttpOk" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity="0.14" />
                  <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                </linearGradient>
                <linearGradient id="cleanHttpErr" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.18" />
                  <stop offset="100%" stopColor="#f43f5e" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              <line
                x1="0"
                y1={svgH * 0.5}
                x2={svgW}
                y2={svgH * 0.5}
                stroke="#f4f4f5"
                strokeWidth="1"
              />

              {http200Chart.areaPath && (
                <path d={http200Chart.areaPath} fill="url(#cleanHttpOk)" />
              )}
              {http200Chart.linePath && (
                <path
                  d={http200Chart.linePath}
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              )}

              {http4xxChart.areaPath && (
                <path d={http4xxChart.areaPath} fill="url(#cleanHttpErr)" />
              )}
              {http4xxChart.linePath && (
                <path
                  d={http4xxChart.linePath}
                  fill="none"
                  stroke="#f43f5e"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              )}
            </svg>
          </div>

          <div className="flex items-center justify-between text-[11px] text-zinc-400 pt-3 border-t border-zinc-100">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span>Trafic légitime</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                <span>Requêtes bloquées</span>
              </span>
            </div>
            <span>
              p95 : {Math.round((latencyValues[latencyValues.length - 1] ?? 28) * 1.25)} ms
            </span>
          </div>
        </div>

        {/* Santé des services */}
        <div className="p-5 rounded-2xl bg-zinc-50/50 border border-zinc-100 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-medium text-zinc-500">
              État des conteneurs
            </span>
            <span className="text-xs text-emerald-600 font-medium">
              Actifs
            </span>
          </div>

          <div className="space-y-2">
            {DEFAULT_SERVICES.map((svc) => {
              const liveContainer = grafana?.containers?.[svc.id];
              const isHealthy =
                liveContainer?.healthy !== undefined
                  ? liveContainer.healthy
                  : svc.id === 'payment-api'
                  ? health.status !== 'unhealthy'
                  : true;
              const cpuPct =
                liveContainer?.cpu_pct ??
                (isDegraded && svc.id === 'payment-api' ? 18.4 : svc.defaultCpu);
              const memMb = liveContainer?.mem_mb ?? svc.defaultMem;

              return (
                <div
                  key={svc.id}
                  className="flex items-center justify-between text-xs py-1"
                >
                  <div className="flex items-center gap-2 min-w-[130px]">
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        isHealthy ? 'bg-emerald-500' : 'bg-rose-500 animate-ping'
                      }`}
                    />
                    <span className="font-medium text-zinc-800 truncate">
                      {svc.label}
                    </span>
                  </div>

                  <div className="hidden sm:flex items-center gap-1 flex-1 max-w-[110px] mx-3">
                    {Array.from({ length: 10 }).map((_, segIdx) => {
                      const segDegraded =
                        !isHealthy && segIdx >= 7
                          ? true
                          : isScoreAnomaly && svc.id === 'payment-api' && segIdx >= 8;
                      return (
                        <span
                          key={segIdx}
                          className={`h-1.5 flex-1 rounded-full ${
                            segDegraded ? 'bg-rose-400' : 'bg-emerald-400/75'
                          }`}
                        />
                      );
                    })}
                  </div>

                  <div className="flex items-center gap-3 text-[11px] text-zinc-400 shrink-0">
                    <span>{cpuPct.toFixed(1)}%</span>
                    <span className="w-12 text-right text-zinc-600 font-medium">
                      {memMb.toFixed(0)} Mo
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between text-[11px] text-zinc-400 pt-3 mt-2 border-t border-zinc-100">
            <span className="flex items-center gap-1.5">
              {isScoreAnomaly ? (
                <>
                  <AlertTriangle className="w-3 h-3 text-amber-500" />
                  <span className="text-amber-700 font-medium">Reprise autonome active</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                  <span>Tous les services sont opérationnels</span>
                </>
              )}
            </span>
            <span>Docker</span>
          </div>
        </div>
      </div>
    </div>
  );
};
