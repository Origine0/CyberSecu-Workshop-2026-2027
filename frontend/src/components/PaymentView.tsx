import React, { useState } from 'react';
import confetti from 'canvas-confetti';
import { 
  CreditCard, 
  CheckCircle2, 
  AlertCircle, 
  ArrowRight, 
  Lock, 
  Copy, 
  Check 
} from 'lucide-react';
import { PaymentRequest, Transaction } from '../types/index.ts';
import { INITIAL_MERCHANTS, validatePaymentRequest } from '../utils/paymentEngine.ts';
import { AnimatedPaymentCard } from './AnimatedPaymentCard.tsx';

interface PaymentViewProps {
  onProcessPayment: (req: PaymentRequest) => { transaction: Transaction; isIdempotent: boolean };
  onViewDashboard: () => void;
  onViewSql: () => void;
  isDegraded: boolean;
}

export const PaymentView: React.FC<PaymentViewProps> = ({
  onProcessPayment,
  onViewDashboard,
  onViewSql,
  isDegraded,
}) => {
  const [amount, setAmount] = useState('49.90');
  const [merchantId, setMerchantId] = useState(INITIAL_MERCHANTS[0].id);
  const [customerName, setCustomerName] = useState('Antoine Martin');
  const [cardNumber, setCardNumber] = useState('4242 •••• •••• 4242');
  const [rawCardNumber, setRawCardNumber] = useState('4242424242424242');
  const [expDate, setExpDate] = useState('12/28');
  const [cvv, setCvv] = useState('883');
  const [simulateFailure, setSimulateFailure] = useState(false);

  const [loading, setLoading] = useState(false);
  const [lastTransaction, setLastTransaction] = useState<Transaction | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState(false);
  const [focusedField, setFocusedField] = useState<'number' | 'name' | 'exp' | 'cvv' | null>(null);

  const PRESETS = [
    { label: '49,90 €', amount: '49.90' },
    { label: '120,00 €', amount: '120.00' },
    { label: '15,00 €', amount: '15.00' },
    { label: '450,00 €', amount: '450.00' },
  ];

  const handleCardInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 16);
    setRawCardNumber(raw);
    const formatted = raw.replace(/(\d{4})/g, '$1 ').trim();
    setCardNumber(formatted);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const payload: PaymentRequest = {
      amount: parseFloat(amount),
      currency: 'EUR',
      merchant_id: merchantId,
      customer_name: customerName,
      card_number: rawCardNumber || cardNumber.replace(/\s+/g, ''),
      exp_date: expDate,
      cvv,
      reference: `CMD-${Math.floor(1000 + Math.random() * 9000)}`,
      simulate_failure: simulateFailure || isDegraded,
    };

    const validation = validatePaymentRequest(payload);
    if (!validation.valid) {
      setFormError(validation.error || 'Erreur de saisie');
      return;
    }

    setLoading(true);
    setLastTransaction(null);

    await new Promise((r) => setTimeout(r, 450));

    const result = onProcessPayment(payload);
    setLastTransaction(result.transaction);
    setLoading(false);

    if (result.transaction.status === 'CONFIRMED') {
      try {
        confetti({
          particleCount: 40,
          spread: 50,
          origin: { y: 0.7 },
          colors: ['#18181b', '#059669', '#3b82f6'],
        });
      } catch (err) {}
    }
  };

  const copyTxId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      
      {/* Title & Amount Heading */}
      <div className="text-center mb-8">
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-zinc-950">
          Paiement
        </h1>
        <p className="text-xs text-zinc-400 mt-1 font-normal">
          Simulation de paiement direct · Route FastAPI POST /pay
        </p>

        {/* Minimal Amount Presets */}
        <div className="flex items-center justify-center gap-2 mt-5">
          {PRESETS.map((p) => (
            <button
              key={p.amount}
              type="button"
              onClick={() => setAmount(p.amount)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all ${
                amount === p.amount
                  ? 'bg-zinc-950 text-white shadow-xs'
                  : 'bg-white border border-zinc-200 text-zinc-600 hover:border-zinc-400'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
        
        {/* Left: Minimal Physical Card */}
        <div className="md:col-span-5 space-y-4">
          <AnimatedPaymentCard
            cardNumber={cardNumber}
            customerName={customerName}
            expDate={expDate}
            cvv={cvv}
            focusedField={focusedField}
            isLoading={loading}
            status={
              lastTransaction
                ? lastTransaction.status === 'CONFIRMED'
                  ? 'CONFIRMED'
                  : 'FAILED'
                : 'IDLE'
            }
          />

          <div className="text-center pt-2">
            <button
              type="button"
              onClick={() => {
                setRawCardNumber('4242424242424242');
                setCardNumber('4242 •••• •••• 4242');
                setExpDate('12/28');
                setCvv('789');
                setCustomerName('Antoine Martin');
              }}
              className="text-xs text-zinc-400 hover:text-zinc-900 transition-colors underline underline-offset-4 cursor-pointer"
            >
              Remplir avec carte de test
            </button>
          </div>
        </div>

        {/* Right: Clean Minimalist Form */}
        <div className="md:col-span-7 bg-white p-6 sm:p-7 rounded-2xl border border-zinc-200/80 shadow-xs">
          {formError && (
            <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{formError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            
            {/* Amount & Merchant */}
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-1">
                <label className="block text-xs font-medium text-zinc-500 mb-1">
                  Montant (€)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.10"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-zinc-50/80 border border-zinc-200 rounded-xl text-sm text-zinc-950 font-semibold focus:outline-none focus:bg-white focus:border-zinc-950 transition-all"
                />
              </div>

              <div className="col-span-2">
                <label className="block text-xs font-medium text-zinc-500 mb-1">
                  Destinataire
                </label>
                <select
                  value={merchantId}
                  onChange={(e) => setMerchantId(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-50/80 border border-zinc-200 rounded-xl text-xs text-zinc-950 focus:outline-none focus:bg-white focus:border-zinc-950 transition-all"
                >
                  {INITIAL_MERCHANTS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Customer Name */}
            <div>
              <label className="block text-xs font-medium text-zinc-500 mb-1">
                Titulaire de la carte
              </label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                onFocus={() => setFocusedField('name')}
                onBlur={() => setFocusedField(null)}
                required
                className="w-full px-3 py-2 bg-zinc-50/80 border border-zinc-200 rounded-xl text-xs text-zinc-950 focus:outline-none focus:bg-white focus:border-zinc-950 transition-all"
              />
            </div>

            {/* Card Number */}
            <div>
              <label className="block text-xs font-medium text-zinc-500 mb-1">
                Numéro de carte
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={cardNumber}
                  onChange={handleCardInput}
                  onFocus={() => setFocusedField('number')}
                  onBlur={() => setFocusedField(null)}
                  required
                  placeholder="4242 •••• •••• 4242"
                  className="w-full pl-9 pr-3 py-2 bg-zinc-50/80 border border-zinc-200 rounded-xl text-xs text-zinc-950 focus:outline-none focus:bg-white focus:border-zinc-950 transition-all"
                />
                <CreditCard className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5" />
              </div>
            </div>

            {/* Exp & CVV */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">
                  Expiration
                </label>
                <input
                  type="text"
                  maxLength={5}
                  value={expDate}
                  onChange={(e) => setExpDate(e.target.value)}
                  onFocus={() => setFocusedField('exp')}
                  onBlur={() => setFocusedField(null)}
                  required
                  placeholder="MM/AA"
                  className="w-full px-3 py-2 bg-zinc-50/80 border border-zinc-200 rounded-xl text-xs text-zinc-950 text-center focus:outline-none focus:bg-white focus:border-zinc-950 transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">
                  CVC
                </label>
                <input
                  type="password"
                  maxLength={4}
                  value={cvv}
                  onChange={(e) => setCvv(e.target.value)}
                  onFocus={() => setFocusedField('cvv')}
                  onBlur={() => setFocusedField(null)}
                  required
                  placeholder="•••"
                  className="w-full px-3 py-2 bg-zinc-50/80 border border-zinc-200 rounded-xl text-xs text-zinc-950 text-center focus:outline-none focus:bg-white focus:border-zinc-950 transition-all"
                />
              </div>
            </div>

            {/* Chaos checkbox */}
            <div className="pt-1">
              <label className="flex items-center gap-2 cursor-pointer text-xs text-zinc-500 hover:text-zinc-800">
                <input
                  type="checkbox"
                  checked={simulateFailure || isDegraded}
                  onChange={(e) => setSimulateFailure(e.target.checked)}
                  className="rounded border-zinc-300 text-zinc-900 focus:ring-0"
                />
                <span>Simuler un incident (Test de reprise)</span>
              </label>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-5 rounded-xl bg-zinc-950 hover:bg-zinc-800 text-white font-medium text-xs tracking-wide transition-all flex items-center justify-center gap-2 disabled:opacity-50 shadow-xs"
            >
              {loading ? (
                <span>Validation en cours...</span>
              ) : (
                <>
                  <span>Payer {amount} €</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </form>

          {/* Minimal Receipt */}
          {lastTransaction && (
            <div
              className={`mt-5 p-4 rounded-xl border text-xs transition-all ${
                lastTransaction.status === 'CONFIRMED'
                  ? 'bg-emerald-50/60 border-emerald-200 text-emerald-950'
                  : 'bg-rose-50/60 border-rose-200 text-rose-950'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {lastTransaction.status === 'CONFIRMED' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  )}
                  <span className="font-medium">
                    {lastTransaction.status === 'CONFIRMED'
                      ? 'Paiement confirmé'
                      : 'Échec de transaction'}
                  </span>
                </div>
                <span className="text-xs text-zinc-500">
                  {lastTransaction.latency_ms} ms
                </span>
              </div>

              <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-zinc-200/60 text-xs">
                <div className="flex items-center gap-1 text-zinc-500 truncate max-w-[200px]">
                  <span className="truncate">{lastTransaction.id}</span>
                  <button
                    onClick={() => copyTxId(lastTransaction.id)}
                    className="text-zinc-400 hover:text-zinc-700"
                  >
                    {copiedId ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                  </button>
                </div>
                <button
                  onClick={onViewDashboard}
                  className="text-zinc-900 font-medium hover:underline flex items-center gap-1 text-xs"
                >
                  Voir au dashboard <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          )}

        </div>

      </div>

    </div>
  );
};
