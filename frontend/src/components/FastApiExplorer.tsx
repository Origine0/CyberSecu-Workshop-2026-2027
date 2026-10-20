import React, { useState } from 'react';
import { 
  Send, 
  Copy, 
  Check, 
  Activity 
} from 'lucide-react';
import { PaymentRequest, Transaction, HealthCheckResponse } from '../types/index.ts';
import { INITIAL_MERCHANTS } from '../utils/paymentEngine.ts';

interface FastApiExplorerProps {
  health: HealthCheckResponse;
  onRefreshHealth: () => void;
  onProcessPayment: (req: PaymentRequest) => { transaction: Transaction; isIdempotent: boolean };
  isDegraded: boolean;
}

export const FastApiExplorer: React.FC<FastApiExplorerProps> = ({
  health,
  onRefreshHealth,
  onProcessPayment,
  isDegraded,
}) => {
  const [activeRoute, setActiveRoute] = useState<'health' | 'pay'>('health');
  const [copiedCurl, setCopiedCurl] = useState(false);

  const [payAmount, setPayAmount] = useState('79.50');
  const [payMerchant, setPayMerchant] = useState(INITIAL_MERCHANTS[0].id);
  const [payCustomer, setPayCustomer] = useState('Jean Valjean');
  const [payCard, setPayCard] = useState('4242424242424242');
  const [payExp, setPayExp] = useState('11/27');
  const [payCvv, setPayCvv] = useState('456');

  const [lastPayResponse, setLastPayResponse] = useState<any>(null);

  const handleTestPay = (e: React.FormEvent) => {
    e.preventDefault();
    const result = onProcessPayment({
      amount: parseFloat(payAmount),
      currency: 'EUR',
      merchant_id: payMerchant,
      customer_name: payCustomer,
      card_number: payCard,
      exp_date: payExp,
      cvv: payCvv,
      reference: `REQ-${Math.floor(1000 + Math.random() * 9000)}`,
      simulate_failure: isDegraded,
    });
    setLastPayResponse({
      status: result.transaction.status === 'CONFIRMED' ? 201 : 400,
      transaction: result.transaction,
    });
  };

  const getCurlCommand = () => {
    if (activeRoute === 'health') {
      return `curl -s http://localhost:8000/health`;
    }
    return `curl -X POST http://localhost:8000/pay \\
  -H "Content-Type: application/json" \\
  -d '{"amount": ${payAmount}, "merchant_id": "${payMerchant}", "customer_name": "${payCustomer}", "card_number": "${payCard}", "exp_date": "${payExp}", "cvv": "${payCvv}"}'`;
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
            Exécution et test des routes /health et /pay
          </p>
        </div>

        {/* Minimal Route Switcher */}
        <div className="p-1 bg-zinc-100 rounded-xl flex items-center text-xs self-start sm:self-auto">
          <button
            onClick={() => setActiveRoute('health')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
              activeRoute === 'health'
                ? 'bg-white text-zinc-950 shadow-2xs font-semibold'
                : 'text-zinc-500 hover:text-zinc-950'
            }`}
          >
            GET /health
          </button>
          <button
            onClick={() => setActiveRoute('pay')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
              activeRoute === 'pay'
                ? 'bg-white text-zinc-950 shadow-2xs font-semibold'
                : 'text-zinc-500 hover:text-zinc-950'
            }`}
          >
            POST /pay
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
        
        {/* Left: Input */}
        <div className="md:col-span-5 bg-white p-5 rounded-2xl border border-zinc-200/80 shadow-xs space-y-4">
          {activeRoute === 'health' ? (
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
                className="w-full py-2.5 rounded-xl bg-zinc-950 hover:bg-zinc-800 text-white font-medium text-xs flex items-center justify-center gap-1.5 transition-all shadow-xs"
              >
                <Activity className="w-3.5 h-3.5" />
                <span>Tester la sonde</span>
              </button>
            </div>
          ) : (
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
                  onChange={(e) => setMerchantId(e.target.value)}
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
                className="w-full py-2.5 rounded-xl bg-zinc-950 hover:bg-zinc-800 text-white font-medium text-xs flex items-center justify-center gap-1.5 transition-all shadow-xs"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Envoyer</span>
              </button>
            </form>
          )}

          {/* Minimal cURL snippet */}
          <div className="pt-2 border-t border-zinc-100">
            <div className="flex items-center justify-between text-xs text-zinc-400 mb-1">
              <span>cURL</span>
              <button
                onClick={copyCurl}
                className="text-zinc-600 hover:text-zinc-900 flex items-center gap-1"
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
              {activeRoute === 'health' ? '200 OK' : lastPayResponse ? `${lastPayResponse.status}` : 'Prêt'}
            </span>
          </div>

          <pre className="p-4 rounded-xl bg-zinc-950 text-zinc-200 text-xs overflow-x-auto max-h-[420px] leading-relaxed">
            <code>
              {activeRoute === 'health'
                ? JSON.stringify(health, null, 2)
                : lastPayResponse
                ? JSON.stringify(lastPayResponse, null, 2)
                : `// Prêt. Cliquez sur "Envoyer" pour tester.`}
            </code>
          </pre>
        </div>

      </div>
    </div>
  );
};
