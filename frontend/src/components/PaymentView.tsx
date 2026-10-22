import React, { useState, useEffect } from 'react';
import confetti from 'canvas-confetti';
import { 
  CreditCard, 
  CheckCircle2, 
  AlertCircle, 
  ArrowRight, 
  Lock, 
  Copy, 
  Check,
  UserRound
} from 'lucide-react';
import { PaymentRequest, Transaction } from '../types/index.ts';
import { INITIAL_MERCHANTS, validatePaymentRequest } from '../utils/paymentEngine.ts';
import { AnimatedPaymentCard } from './AnimatedPaymentCard.tsx';
import { Account } from '../utils/api.ts';

interface PaymentViewProps {
  onProcessPayment: (req: PaymentRequest) => { transaction: Transaction; isIdempotent: boolean };
  onViewDashboard: () => void;
  onViewSql: () => void;
  isDegraded: boolean;
  account: Account | null;
  onRemotePayment: (req: PaymentRequest) => Promise<Transaction>;
  onGoToAccount: () => void;
}

export const PaymentView: React.FC<PaymentViewProps> = ({
  onProcessPayment,
  onViewDashboard,
  onViewSql,
  isDegraded,
  account,
  onRemotePayment,
  onGoToAccount,
}) => {
  const [amount, setAmount] = useState('25.00');
  const [merchantId, setMerchantId] = useState(INITIAL_MERCHANTS[0].id);
  const [customerName, setCustomerName] = useState(() => account?.holder_name || 'Titulaire');
  const [cardNumber, setCardNumber] = useState('4242 •••• •••• 4242');
  const [rawCardNumber, setRawCardNumber] = useState('4242424242424242');
  const [expDate, setExpDate] = useState('12/28');
  const [cvv, setCvv] = useState('883');

  useEffect(() => {
    if (account?.holder_name) {
      setCustomerName(account.holder_name);
    }
  }, [account?.holder_name]);

  const [loading, setLoading] = useState(false);
  const [lastTransaction, setLastTransaction] = useState<Transaction | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState(false);
  const [focusedField, setFocusedField] = useState<'number' | 'name' | 'exp' | 'cvv' | null>(null);

  const PRESETS = [
    { label: '15 €', amount: '15.00' },
    { label: '25 €', amount: '25.00' },
    { label: '50 €', amount: '50.00' },
    { label: '100 €', amount: '100.00' },
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

    if (!account) {
      setFormError('Connexion requise pour effectuer un paiement.');
      onGoToAccount();
      return;
    }

    const payload: PaymentRequest = {
      amount: parseFloat(amount),
      currency: 'EUR',
      merchant_id: merchantId,
      customer_name: customerName,
      card_number: rawCardNumber || cardNumber.replace(/\s+/g, ''),
      exp_date: expDate,
      cvv,
      reference: `CMD-${Math.floor(1000 + Math.random() * 9000)}`,
      simulate_failure: isDegraded,
    };

    const validation = validatePaymentRequest(payload);
    if (!validation.valid) {
      setFormError(validation.error || 'Erreur de saisie');
      return;
    }

    setLoading(true);
    setLastTransaction(null);

    let transaction: Transaction;
    try {
      transaction = await onRemotePayment(payload);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Paiement impossible');
      setLoading(false);
      return;
    }
    setLastTransaction(transaction);
    setLoading(false);

    if (transaction.status === 'CONFIRMED') {
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

  if (!account) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16">
        <div className="bg-white p-8 sm:p-10 rounded-2xl border border-zinc-200/80 shadow-xs text-center space-y-6">
          <div className="w-14 h-14 rounded-2xl bg-zinc-100 flex items-center justify-center mx-auto text-zinc-900 ring-8 ring-zinc-50">
            <Lock className="w-7 h-7" />
          </div>

          <div className="space-y-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
              Connexion requise
            </span>
            <h2 className="text-2xl font-semibold tracking-tight text-zinc-950">
              Authentification obligatoire
            </h2>
            <p className="text-sm text-zinc-500 max-w-md mx-auto">
              Pour initier un paiement et débiter votre compte, vous devez obligatoirement vous connecter ou créer un compte client.
            </p>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={onGoToAccount}
              className="px-6 py-3 rounded-xl bg-zinc-950 hover:bg-zinc-800 text-white font-medium text-xs shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-2"
            >
              <UserRound className="w-4 h-4" />
              <span>Se connecter ou créer un compte</span>
            </button>
          </div>

          <div className="pt-4 border-t border-zinc-100 text-[11px] text-zinc-400">
            Environnement de démonstration • EPSI Bac+5 Cyber-Résilience
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      
      {/* Title & Amount Heading */}
      <div className="text-center mb-8">
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-zinc-950">
          Paiement
        </h1>
        {account && (
          <div className="inline-flex items-center gap-2 mt-3 px-3.5 py-1.5 rounded-full bg-emerald-50 border border-emerald-200/80 text-xs text-emerald-900 shadow-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-zinc-600">Solde disponible sur votre compte :</span>
            <span className="font-semibold text-emerald-950 font-mono">
              {account.balance.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
            </span>
          </div>
        )}

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
                if (account?.holder_name) {
                  setCustomerName(account.holder_name);
                }
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
