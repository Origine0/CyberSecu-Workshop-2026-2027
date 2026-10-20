import React, { useState, useEffect, useCallback } from 'react';
import { 
  Cpu, 
  Send, 
  RefreshCw, 
  Bot, 
  Sparkles
} from 'lucide-react';
import { AiAnalyzeResponse, AiAskResponse, Transaction, WafStatusResponse } from '../types/index.ts';

interface AiCyberSocPanelProps {
  isDegraded?: boolean;
  transactions?: Transaction[];
  wafStatus?: WafStatusResponse;
}

export const AiCyberSocPanel: React.FC<AiCyberSocPanelProps> = ({
  isDegraded = false,
  transactions = [],
  wafStatus,
}) => {
  const [aiEndpoint] = useState<string>('/ai');
  const [isAiOnline, setIsAiOnline] = useState<boolean | null>(null);
  
  // États Détection ML (/analyze)
  const [requestRate, setRequestRate] = useState<number>(50.0);
  const [errorRate, setErrorRate] = useState<number>(0.012);
  const [latencyMs, setLatencyMs] = useState<number>(118.0);
  const [analyzing, setAnalyzing] = useState<boolean>(false);
  const [mlResult, setMlResult] = useState<AiAnalyzeResponse | null>({
    timestamp: new Date().toISOString(),
    is_anomaly: false,
    action_required: 'NONE',
    anomaly_score: 0.1678,
    metrics_received: {
      request_rate: 50.0,
      error_rate: 0.012,
      latency_ms: 118.0
    }
  });

  // États Assistant RAG (/ask)
  const [ragQuery, setRagQuery] = useState<string>('');
  const [ragLoading, setRagLoading] = useState<boolean>(false);
  const [ragResponse, setRagResponse] = useState<AiAskResponse | null>({
    query: "Que faire en cas d'attaque par déni de service ?",
    response: "Selon les procédures de sécurité de PROJECT RESILIENCE-ALPHA, isoler immédiatement le conteneur cible en appliquant le playbook Ansible Zero-Touch. Rétablir les routes réseau et notifier le SOC. L'assistant n'exécute aucune remédiation autonome.",
    status: "SUCCESS",
    advisory_role: "READ_ONLY_NO_REMEDIATION"
  });

  const runAnalyzeRequest = useCallback(async (reqRate: number, errRate: number, latMs: number) => {
    setAnalyzing(true);
    const payload = {
      timestamp: new Date().toISOString(),
      request_rate: Number(reqRate),
      error_rate: Number(errRate),
      latency_ms: Number(latMs)
    };

    try {
      const res = await fetch(`${aiEndpoint}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(3000)
      });
      if (res.ok) {
        const data: AiAnalyzeResponse = await res.json();
        setMlResult(data);
        setIsAiOnline(true);
      } else {
        throw new Error('Erreur API');
      }
    } catch {
      const isOutlier = reqRate > 150 || errRate > 0.05 || latMs > 300;
      setMlResult({
        timestamp: new Date().toISOString(),
        is_anomaly: isOutlier,
        action_required: isOutlier ? 'TRIGGER_REMEDIATION' : 'NONE',
        anomaly_score: isOutlier ? -0.197 : 0.168,
        metrics_received: payload
      });
    } finally {
      setAnalyzing(false);
    }
  }, [aiEndpoint]);

  // Test de connectivité à l'API IA
  const checkAiHealth = useCallback(async () => {
    try {
      const res = await fetch(`${aiEndpoint}/`, { signal: AbortSignal.timeout(2000) });
      setIsAiOnline(res.ok);
    } catch {
      setIsAiOnline(false);
    }
  }, [aiEndpoint]);

  useEffect(() => {
    checkAiHealth();
  }, [checkAiHealth]);

  // Synchronisation automatique avec les métriques temps réel et l'état d'incident
  useEffect(() => {
    const recent = transactions.slice(0, 10);
    const failedCount = recent.filter((t) => t.status === 'FAILED').length;
    const liveErrorRate = recent.length > 0 ? Number((failedCount / recent.length).toFixed(3)) : 0.012;
    const liveAvgLatency =
      recent.length > 0
        ? Math.max(50, Math.round(recent.reduce((acc, t) => acc + t.latency_ms, 0) / recent.length))
        : 118;
    const blockedCount = wafStatus?.stats.total_blocked ?? 0;

    if (isDegraded || liveErrorRate >= 0.2) {
      const rRate = blockedCount > 0 ? Math.min(950, 250 + blockedCount * 5) : 650.0;
      const eRate = Math.max(0.35, liveErrorRate);
      const lMs = Math.max(450, liveAvgLatency);
      setRequestRate(rRate);
      setErrorRate(eRate);
      setLatencyMs(lMs);
      runAnalyzeRequest(rRate, eRate, lMs);
    } else {
      setRequestRate(50.0);
      setErrorRate(0.012);
      setLatencyMs(118.0);
      runAnalyzeRequest(50.0, 0.012, 118.0);
    }
  }, [isDegraded, transactions.length, wafStatus?.stats.total_blocked, runAnalyzeRequest]);

  const applyPreset = (type: 'nominal' | 'attack' | 'failure') => {
    if (type === 'nominal') {
      setRequestRate(50.0);
      setErrorRate(0.012);
      setLatencyMs(118.0);
      runAnalyzeRequest(50.0, 0.012, 118.0);
    } else if (type === 'attack') {
      setRequestRate(850.0);
      setErrorRate(0.48);
      setLatencyMs(2450.0);
      runAnalyzeRequest(850.0, 0.48, 2450.0);
    } else if (type === 'failure') {
      setRequestRate(65.0);
      setErrorRate(0.85);
      setLatencyMs(650.0);
      runAnalyzeRequest(65.0, 0.85, 650.0);
    }
  };

  // Appel POST /analyze manuel
  const handleAnalyze = () => {
    runAnalyzeRequest(requestRate, errorRate, latencyMs);
  };

  // Appel POST /ask (RAG)
  const handleAsk = async (queryToAsk?: string) => {
    const q = (queryToAsk || ragQuery).trim();
    if (!q) return;
    setRagLoading(true);

    try {
      const res = await fetch(`${aiEndpoint}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q }),
        signal: AbortSignal.timeout(15000)
      });
      if (res.ok) {
        const data: AiAskResponse = await res.json();
        setRagResponse(data);
        setIsAiOnline(true);
      } else {
        throw new Error('Erreur RAG');
      }
    } catch {
      // Fallback didactique
      setRagResponse({
        query: q,
        response: `[Procédure locale FAISS] Conformément aux directives de sécurité : en présence d'une attaque avérée, appliquer les procédures d'isolement prévues au paragraphe 4.2. Note : Ce modèle est strictement informatif et ne possède aucun droit de remédiation technique.`,
        status: "FALLBACK_OFFLINE",
        advisory_role: "READ_ONLY_NO_REMEDIATION"
      });
    } finally {
      setRagLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header statut connectivité */}
      <div className="flex items-center justify-between pb-2 border-b border-zinc-100 text-xs">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${isAiOnline ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
          <span className="font-medium text-zinc-900">
            {isAiOnline ? 'Moteur IA connecté (/ai)' : 'Simulation IA (Local)'}
          </span>
        </div>
        <div className="flex items-center gap-1.5 font-mono text-[10px] text-zinc-500 bg-zinc-100/80 px-2 py-0.5 rounded-md">
          <span>Ollama qwen2.5:1.5b</span>
          <span>•</span>
          <span>FAISS CPU</span>
        </div>
      </div>

      {/* BLOC 1 : DÉTECTION ANOMALIES ISOLATION FOREST */}
      <div className="bg-zinc-50/80 border border-zinc-100 rounded-xl p-3.5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-900">
            <Cpu className="w-3.5 h-3.5 text-zinc-700" />
            <span>Détection ML (Isolation Forest)</span>
          </div>
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
            mlResult?.is_anomaly 
              ? 'bg-rose-100 text-rose-700 border border-rose-300' 
              : 'bg-emerald-100 text-emerald-700 border border-emerald-300'
          }`}>
            {mlResult?.is_anomaly ? 'ANOMALIE DÉTECTÉE' : 'TRAFIC NOMINAL'}
          </span>
        </div>

        {/* Presets rapides de démonstration */}
        <div className="flex items-center gap-1.5 text-[11px]">
          <span className="text-zinc-500">Profils :</span>
          <button
            type="button"
            onClick={() => applyPreset('nominal')}
            className={`px-2 py-0.5 rounded border transition-colors cursor-pointer ${
              !mlResult?.is_anomaly ? 'bg-white border-zinc-300 font-medium text-zinc-900' : 'bg-transparent border-zinc-200 text-zinc-600'
            }`}
          >
            Nominal
          </button>
          <button
            type="button"
            onClick={() => applyPreset('attack')}
            className={`px-2 py-0.5 rounded border transition-colors cursor-pointer ${
              mlResult?.is_anomaly ? 'bg-rose-50 border-rose-300 font-bold text-rose-700' : 'bg-transparent border-zinc-200 text-zinc-600'
            }`}
          >
            Attaque Red Team
          </button>
          <button
            type="button"
            onClick={() => applyPreset('failure')}
            className="px-2 py-0.5 rounded border border-zinc-200 text-zinc-600 hover:border-zinc-300 transition-colors cursor-pointer"
          >
            Défaillance
          </button>
        </div>

        {/* Sliders métriques */}
        <div className="grid grid-cols-3 gap-2 text-xs pt-1">
          <div>
            <label className="text-[10px] text-zinc-500 block truncate">Débit ({requestRate} req/s)</label>
            <input 
              type="range" 
              min="10" 
              max="1000" 
              step="10"
              value={requestRate} 
              onChange={(e) => setRequestRate(parseFloat(e.target.value))}
              className="w-full accent-zinc-900 cursor-pointer h-1"
            />
          </div>
          <div>
            <label className="text-[10px] text-zinc-500 block truncate">Erreurs ({(errorRate * 100).toFixed(1)}%)</label>
            <input 
              type="range" 
              min="0.0" 
              max="1.0" 
              step="0.01"
              value={errorRate} 
              onChange={(e) => setErrorRate(parseFloat(e.target.value))}
              className="w-full accent-zinc-900 cursor-pointer h-1"
            />
          </div>
          <div>
            <label className="text-[10px] text-zinc-500 block truncate">Latence ({Math.round(latencyMs)} ms)</label>
            <input 
              type="range" 
              min="50" 
              max="3000" 
              step="50"
              value={latencyMs} 
              onChange={(e) => setLatencyMs(parseFloat(e.target.value))}
              className="w-full accent-zinc-900 cursor-pointer h-1"
            />
          </div>
        </div>

        {/* Bouton Inférence & Résultat */}
        <div className="pt-2 border-t border-zinc-200/60 flex items-center justify-between">
          <div className="text-xs">
            <span className="text-zinc-500 text-[11px]">Score IA : </span>
            <span className={`font-mono font-bold ${mlResult?.is_anomaly ? 'text-rose-600' : 'text-emerald-600'}`}>
              {mlResult ? (mlResult.anomaly_score > 0 ? `+${mlResult.anomaly_score.toFixed(3)}` : mlResult.anomaly_score.toFixed(3)) : '--'}
            </span>
            <span className="text-[10px] text-zinc-400 ml-2">Action : {mlResult?.action_required}</span>
          </div>

          <button
            type="button"
            onClick={handleAnalyze}
            disabled={analyzing}
            className="px-2.5 py-1 bg-zinc-950 hover:bg-zinc-800 text-white rounded-lg text-[11px] font-medium flex items-center gap-1 transition-all shadow-xs cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${analyzing ? 'animate-spin' : ''}`} />
            <span>Tester /analyze</span>
          </button>
        </div>
      </div>

      {/* BLOC 2 : ASSISTANT DOCUMENTAIRE RAG */}
      <div className="bg-zinc-50/80 border border-zinc-100 rounded-xl p-3.5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-900">
            <Bot className="w-3.5 h-3.5 text-purple-600" />
            <span>Assistant RAG Documentaire</span>
          </div>
          <span className="text-[9px] px-2 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200 font-mono">
            CONSULTATIF · SANS REMÉDIATION
          </span>
        </div>

        {/* Suggestions rapides cliquables */}
        <div className="flex flex-wrap gap-1.5 text-[10px]">
          <button
            type="button"
            onClick={() => {
              setRagQuery("Procédure d'attaque par déni de service ?");
              handleAsk("Procédure d'attaque par déni de service ?");
            }}
            className="px-2 py-0.5 rounded bg-white border border-zinc-200 text-zinc-600 hover:text-zinc-900 hover:border-zinc-300 transition-colors cursor-pointer"
          >
            🛡️ Attaque DDoS
          </button>
          <button
            type="button"
            onClick={() => {
              setRagQuery("Procédure de défaillance base de données ?");
              handleAsk("Procédure de défaillance base de données ?");
            }}
            className="px-2 py-0.5 rounded bg-white border border-zinc-200 text-zinc-600 hover:text-zinc-900 hover:border-zinc-300 transition-colors cursor-pointer"
          >
            🗄️ Panne Base
          </button>
          <button
            type="button"
            onClick={() => {
              setRagQuery("Quelle est la procédure d'audit post-incident ?");
              handleAsk("Quelle est la procédure d'audit post-incident ?");
            }}
            className="px-2 py-0.5 rounded bg-white border border-zinc-200 text-zinc-600 hover:text-zinc-900 hover:border-zinc-300 transition-colors cursor-pointer"
          >
            📋 Audit Post-Incident
          </button>
        </div>

        {/* Formulaire d'envoi RAG */}
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            value={ragQuery}
            onChange={(e) => setRagQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAsk()}
            placeholder="Poser une question sur procedures.pdf..."
            className="flex-1 bg-white border border-zinc-200 rounded-lg px-2.5 py-1.5 text-xs text-zinc-900 outline-none focus:border-zinc-400 font-normal placeholder:text-zinc-400"
          />
          <button
            type="button"
            onClick={() => handleAsk()}
            disabled={ragLoading || !ragQuery.trim()}
            className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-medium flex items-center gap-1 transition-all shadow-xs cursor-pointer disabled:opacity-50"
          >
            {ragLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Réponse générée */}
        {ragResponse && (
          <div className="p-2.5 rounded-lg bg-white border border-purple-100 text-xs text-zinc-700 space-y-1">
            <div className="text-[10px] font-mono text-purple-600 font-semibold flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              <span>Réponse Qwen2.5 / procedures.pdf :</span>
            </div>
            <p className="text-[11px] leading-relaxed text-zinc-800">
              {ragResponse.response}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
