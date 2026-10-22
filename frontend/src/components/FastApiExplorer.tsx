import React, { useState } from 'react';
import { 
  Send, 
  Copy, 
  Check, 
  Activity,
  Cpu,
  Bot
} from 'lucide-react';
import { PaymentRequest, Transaction, HealthCheckResponse } from '../types/index.ts';
import { INITIAL_MERCHANTS } from '../utils/paymentEngine.ts';

interface FastApiExplorerProps {
  health: HealthCheckResponse;
  onRefreshHealth: () => void;
  onProcessPayment: (req: PaymentRequest) => { transaction: Transaction; isIdempotent: boolean };
  onRemotePayment?: (req: PaymentRequest) => Promise<Transaction>;
  isDegraded: boolean;
}

export const FastApiExplorer: React.FC<FastApiExplorerProps> = ({
  health,
  onRefreshHealth,
  onProcessPayment,
  onRemotePayment,
  isDegraded,
}) => {
  const [activeRoute, setActiveRoute] = useState<'health' | 'pay' | 'analyze' | 'ask'>('health');
  const [copiedCurl, setCopiedCurl] = useState(false);

  // States pour /pay
  const [payAmount, setPayAmount] = useState('79.50');
  const [payMerchant, setPayMerchant] = useState(INITIAL_MERCHANTS[0].id);
  const [payCustomer, setPayCustomer] = useState('Jean Valjean');
  const [payCard, setPayCard] = useState('4242424242424242');
  const [payExp, setPayExp] = useState('11/27');
  const [payCvv, setPayCvv] = useState('456');
  const [lastPayResponse, setLastPayResponse] = useState<any>(null);

  // States pour /analyze (IA ML)
  const [aiReqRate, setAiReqRate] = useState('50.0');
  const [aiErrRate, setAiErrRate] = useState('0.015');
  const [aiLatency, setAiLatency] = useState('120.0');
  const [lastAiResponse, setLastAiResponse] = useState<any>(null);

  // States pour /ask (IA RAG)
  const [ragQuery, setRagQuery] = useState("Quelle est la procédure en cas d'attaque par déni de service ?");
  const [lastRagResponse, setLastRagResponse] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const handleTestPay = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const payload: PaymentRequest = {
      amount: parseFloat(payAmount),
      currency: 'EUR',
      merchant_id: payMerchant,
      customer_name: payCustomer,
      card_number: payCard,
      exp_date: payExp,
      cvv: payCvv,
      reference: `REQ-${Math.floor(1000 + Math.random() * 9000)}`,
      simulate_failure: isDegraded,
    };

    try {
      if (onRemotePayment) {
        const tx = await onRemotePayment(payload);
        setLastPayResponse({
          status: tx.status === 'CONFIRMED' ? 201 : 400,
          endpoint: 'POST /api/pay',
          transaction: tx,
        });
      } else {
        const result = onProcessPayment(payload);
        setLastPayResponse({
          status: result.transaction.status === 'CONFIRMED' ? 201 : 400,
          transaction: result.transaction,
        });
      }
    } catch (err) {
      setLastPayResponse({
        status: 500,
        error: err instanceof Error ? err.message : 'Erreur lors de la requête /api/pay',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleTestAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const payload = {
      timestamp: new Date().toISOString(),
      request_rate: parseFloat(aiReqRate) || 50.0,
      error_rate: parseFloat(aiErrRate) || 0.01,
      latency_ms: parseFloat(aiLatency) || 120.0,
    };

    try {
      const res = await fetch('/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      setLastAiResponse({ status: res.status, ...data });
    } catch {
      // Simulation locale si non connecté
      const isOutlier = payload.request_rate > 200 || payload.error_rate > 0.05 || payload.latency_ms > 400;
      setLastAiResponse({
        status: 200,
        timestamp: payload.timestamp,
        is_anomaly: isOutlier,
        action_required: isOutlier ? 'TRIGGER_REMEDIATION' : 'NONE',
        anomaly_score: isOutlier ? -0.197 : 0.168,
        metrics_received: payload,
        note: 'Réponse simulée en local (démarrez docker compose pour le serveur Python)'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleTestAsk = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/ai/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: ragQuery }),
      });
      const data = await res.json();
      setLastRagResponse({ status: res.status, ...data });
    } catch {
      setLastRagResponse({
        status: 200,
        query: ragQuery,
        response: "[Procédure locale FAISS] Conformément aux directives de sécurité : en cas d'attaque par déni de service, isoler immédiatement le conteneur cible en appliquant le playbook Ansible Zero-Touch. Rappel : Ce modèle est strictement consultatif et ne possède aucun privilège de remédiation.",
        status_text: "FALLBACK_OFFLINE",
        advisory_role: "READ_ONLY_NO_REMEDIATION"
      });
    } finally {
      setLoading(false);
    }
  };

  const getCurlCommand = () => {
    if (activeRoute === 'health') {
      return `curl -s ${window.location.origin}/api/health`;
    }
    if (activeRoute === 'pay') {
      return `curl -X POST ${window.location.origin}/api/pay \\
  -H "Content-Type: application/json" \\
  -d '{"merchant_code": "MERCH_ALPHA", "amount": ${payAmount}, "currency": "EUR"}'`;
    }
    if (activeRoute === 'analyze') {
      return `curl -X POST ${window.location.origin}/ai/analyze \\
  -H "Content-Type: application/json" \\
  -d '{"timestamp": "${new Date().toISOString()}", "request_rate": ${aiReqRate}, "error_rate": ${aiErrRate}, "latency_ms": ${aiLatency}}'`;
    }
    return `curl -X POST ${window.location.origin}/ai/ask \\
  -H "Content-Type: application/json" \\
  -d '{"query": "${ragQuery}"}'`;
  };

  const copyCurl = () => {
    navigator.clipboard.writeText(getCurlCommand());
    setCopiedCurl(true);
    setTimeout(() => setCopiedCurl(false), 2000);
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-zinc-200/80 gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-950">
            Console FastAPI
          </h1>
          <p className="text-xs text-zinc-400 mt-1 font-normal">
            Exécution et test interactif des microservices Métier (/api) et IA (/ai)
          </p>
        </div>

        {/* Minimal Route Switcher */}
        <div className="p-1 bg-zinc-100 rounded-xl flex items-center text-xs self-start sm:self-auto overflow-x-auto">
          <button
            onClick={() => setActiveRoute('health')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
              activeRoute === 'health'
                ? 'bg-white text-zinc-950 shadow-2xs font-semibold'
                : 'text-zinc-500 hover:text-zinc-950'
            }`}
          >
            GET /health
          </button>
          <button
            onClick={() => setActiveRoute('pay')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
              activeRoute === 'pay'
                ? 'bg-white text-zinc-950 shadow-2xs font-semibold'
                : 'text-zinc-500 hover:text-zinc-950'
            }`}
          >
            POST /pay
          </button>
          <button
            onClick={() => setActiveRoute('analyze')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer flex items-center gap-1 ${
              activeRoute === 'analyze'
                ? 'bg-white text-cyan-900 shadow-2xs font-semibold'
                : 'text-zinc-500 hover:text-zinc-950'
            }`}
          >
            <Cpu className="w-3 h-3 text-cyan-600" />
            <span>POST /analyze</span>
          </button>
          <button
            onClick={() => setActiveRoute('ask')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer flex items-center gap-1 ${
              activeRoute === 'ask'
                ? 'bg-white text-purple-900 shadow-2xs font-semibold'
                : 'text-zinc-500 hover:text-zinc-950'
            }`}
          >
            <Bot className="w-3 h-3 text-purple-600" />
            <span>POST /ask</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
        
        {/* Left: Input */}
        <div className="md:col-span-5 bg-white p-5 rounded-2xl border border-zinc-200/80 shadow-xs space-y-4">
          {activeRoute === 'health' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-zinc-50/80 border border-zinc-100 text-xs space-y-2">
                <div className="flex justify-between">
                  <span className="text-zinc-400">Statut</span>
                  <span className="font-semibold text-emerald-600">{health.status.toUpperCase()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Latence</span>
                  <span className="text-zinc-700 font-medium">{health.database.latency_ms} ms</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Pool PostgreSQL</span>
                  <span className="text-zinc-700 font-medium">{health.database.active_connections} / {health.database.max_connections}</span>
                </div>
              </div>

              <button
                onClick={onRefreshHealth}
                className="w-full py-2.5 rounded-xl bg-zinc-950 hover:bg-zinc-800 text-white font-medium text-xs flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer"
              >
                <Activity className="w-3.5 h-3.5" />
                <span>Tester la sonde /api/health</span>
              </button>
            </div>
          )}

          {activeRoute === 'pay' && (
            <form onSubmit={handleTestPay} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">
                  Montant (€)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  required
                  className="w-full px-3 py-1.5 bg-zinc-50/80 border border-zinc-200 rounded-xl text-xs text-zinc-900 focus:outline-none focus:bg-white focus:border-zinc-950"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">
                  Marchand
                </label>
                <select
                  value={payMerchant}
                  onChange={(e) => setPayMerchant(e.target.value)}
                  className="w-full px-3 py-1.5 bg-zinc-50/80 border border-zinc-200 rounded-xl text-xs text-zinc-900 focus:outline-none focus:bg-white focus:border-zinc-950"
                >
                  {INITIAL_MERCHANTS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">
                  Titulaire
                </label>
                <input
                  type="text"
                  value={payCustomer}
                  onChange={(e) => setPayCustomer(e.target.value)}
                  required
                  className="w-full px-3 py-1.5 bg-zinc-50/80 border border-zinc-200 rounded-xl text-xs text-zinc-900 focus:outline-none focus:bg-white focus:border-zinc-950"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-xl bg-zinc-950 hover:bg-zinc-800 text-white font-medium text-xs flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{loading ? 'Envoi...' : 'Envoyer transaction (/api/pay)'}</span>
              </button>
            </form>
          )}

          {activeRoute === 'analyze' && (
            <form onSubmit={handleTestAnalyze} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">
                  Taux de requêtes (req/s)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={aiReqRate}
                  onChange={(e) => setAiReqRate(e.target.value)}
                  required
                  className="w-full px-3 py-1.5 bg-zinc-50/80 border border-zinc-200 rounded-xl text-xs text-zinc-900 focus:outline-none focus:bg-white focus:border-cyan-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">
                  Taux d'erreur (0.0 à 1.0)
                </label>
                <input
                  type="number"
                  step="0.005"
                  value={aiErrRate}
                  onChange={(e) => setAiErrRate(e.target.value)}
                  required
                  className="w-full px-3 py-1.5 bg-zinc-50/80 border border-zinc-200 rounded-xl text-xs text-zinc-900 focus:outline-none focus:bg-white focus:border-cyan-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">
                  Latence moyenne (ms)
                </label>
                <input
                  type="number"
                  step="1"
                  value={aiLatency}
                  onChange={(e) => setAiLatency(e.target.value)}
                  required
                  className="w-full px-3 py-1.5 bg-zinc-50/80 border border-zinc-200 rounded-xl text-xs text-zinc-900 focus:outline-none focus:bg-white focus:border-cyan-600"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-xl bg-cyan-700 hover:bg-cyan-800 text-white font-medium text-xs flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer disabled:opacity-50"
              >
                <Cpu className="w-3.5 h-3.5" />
                <span>{loading ? 'Calcul Isolation Forest...' : 'Inférence ML /analyze'}</span>
              </button>
            </form>
          )}

          {activeRoute === 'ask' && (
            <form onSubmit={handleTestAsk} className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-zinc-500">
                    Question pour l'assistant RAG
                  </label>
                  <span className="text-[10px] text-purple-600 font-mono font-medium">FAISS + Télémétrie Live</span>
                </div>
                <textarea
                  rows={3}
                  value={ragQuery}
                  onChange={(e) => setRagQuery(e.target.value)}
                  required
                  className="w-full px-3 py-1.5 bg-zinc-50/80 border border-zinc-200 rounded-xl text-xs text-zinc-900 focus:outline-none focus:bg-white focus:border-purple-600"
                />
              </div>

              {/* Suggestions rapides */}
              <div className="flex flex-wrap gap-1">
                <button
                  type="button"
                  onClick={() => setRagQuery("Quels sont les scénarios d'attaque testés sur la plateforme ?")}
                  className="text-[10px] px-2 py-1 rounded-lg bg-zinc-100 hover:bg-purple-100 hover:text-purple-800 text-zinc-600 transition-colors cursor-pointer"
                >
                  🎯 Scénarios SC-01 à SC-04
                </button>
                <button
                  type="button"
                  onClick={() => setRagQuery("Combien de requêtes ou attaques ont été bloquées par le WAF ?")}
                  className="text-[10px] px-2 py-1 rounded-lg bg-zinc-100 hover:bg-purple-100 hover:text-purple-800 text-zinc-600 transition-colors cursor-pointer"
                >
                  🛡️ Attaques bloquées au WAF
                </button>
                <button
                  type="button"
                  onClick={() => setRagQuery("Quels conteneurs composent l'architecture du système ?")}
                  className="text-[10px] px-2 py-1 rounded-lg bg-zinc-100 hover:bg-purple-100 hover:text-purple-800 text-zinc-600 transition-colors cursor-pointer"
                >
                  🏗️ Microservices
                </button>
                <button
                  type="button"
                  onClick={() => setRagQuery("Quel est le plan d'adressage IP du labo ?")}
                  className="text-[10px] px-2 py-1 rounded-lg bg-zinc-100 hover:bg-purple-100 hover:text-purple-800 text-zinc-600 transition-colors cursor-pointer"
                >
                  🌐 Plan d'adressage Wi-Fi
                </button>
              </div>

              <div className="p-2.5 rounded-xl bg-purple-50/60 border border-purple-100 text-[11px] text-purple-800">
                L'assistant analyse la base de connaissances (Architecture, Attaques SC-01 à SC-04, EBIOS RM, DORA, Plan d'adressage) combinée à la <strong>télémétrie en temps réel du WAF</strong> via FAISS + Ollama (qwen2.5:1.5b). Rôle strictement consultatif.
              </div>

              <button
                type="submit"
                disabled={loading || !ragQuery.trim()}
                className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-medium text-xs flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer disabled:opacity-50"
              >
                <Bot className="w-3.5 h-3.5" />
                <span>{loading ? 'Génération en cours...' : 'Interroger le RAG /ask'}</span>
              </button>
            </form>
          )}

          {/* Minimal cURL snippet */}
          <div className="pt-2 border-t border-zinc-100">
            <div className="flex items-center justify-between text-xs text-zinc-400 mb-1">
              <span>cURL</span>
              <button
                onClick={copyCurl}
                className="text-zinc-600 hover:text-zinc-900 flex items-center gap-1 cursor-pointer"
              >
                {copiedCurl ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                <span>{copiedCurl ? 'Copié' : 'Copier'}</span>
              </button>
            </div>
            <pre className="p-2.5 bg-zinc-950 text-zinc-200 rounded-xl text-xs overflow-x-auto leading-relaxed">
              <code>{getCurlCommand()}</code>
            </pre>
          </div>
        </div>

        {/* Right: Response Output */}
        <div className="md:col-span-7 bg-white p-5 rounded-2xl border border-zinc-200/80 shadow-xs space-y-2">
          <div className="flex items-center justify-between pb-2 border-b border-zinc-100 text-xs">
            <span className="text-zinc-400 font-medium">Réponse HTTP</span>
            <span className="text-emerald-600 font-medium">
              {activeRoute === 'health' 
                ? '200 OK' 
                : activeRoute === 'pay' 
                ? (lastPayResponse ? `${lastPayResponse.status}` : 'Prêt')
                : activeRoute === 'analyze'
                ? (lastAiResponse ? `${lastAiResponse.status}` : 'Prêt')
                : (lastRagResponse ? `${lastRagResponse.status}` : 'Prêt')}
            </span>
          </div>

          <pre className="p-4 rounded-xl bg-zinc-950 text-zinc-200 text-xs overflow-x-auto max-h-[420px] leading-relaxed">
            <code>
              {activeRoute === 'health'
                ? JSON.stringify(health, null, 2)
                : activeRoute === 'pay'
                ? (lastPayResponse ? JSON.stringify(lastPayResponse, null, 2) : `// Prêt. Cliquez sur "Envoyer transaction" pour tester.`)
                : activeRoute === 'analyze'
                ? (lastAiResponse ? JSON.stringify(lastAiResponse, null, 2) : `// Prêt. Cliquez sur "Inférence ML /analyze" pour tester.`)
                : (lastRagResponse ? JSON.stringify(lastRagResponse, null, 2) : `// Prêt. Cliquez sur "Interroger le RAG /ask" pour tester.`)}
            </code>
          </pre>
        </div>

      </div>
    </div>
  );
};
