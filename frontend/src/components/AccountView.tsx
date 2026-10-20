import React, { useState } from 'react';
import { LogOut, Wallet, PlusCircle, AlertCircle, UserRound } from 'lucide-react';
import { Account, ApiError } from '../utils/api.ts';
import * as api from '../utils/api.ts';

interface AccountViewProps {
  account: Account | null;
  onAuthenticated: (token: string) => Promise<void>;
  onAccountChange: (account: Account) => void;
  onLogout: () => void;
  onGoToPay: () => void;
}

const inputCls =
  'w-full px-3 py-2 bg-zinc-50/80 border border-zinc-200 rounded-xl text-xs text-zinc-950 focus:outline-none focus:bg-white focus:border-zinc-950 transition-all';

export const AccountView: React.FC<AccountViewProps> = ({
  account,
  onAuthenticated,
  onAccountChange,
  onLogout,
  onGoToPay,
}) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [holderName, setHolderName] = useState('');
  const [depositAmount, setDepositAmount] = useState('100');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setError(null);
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erreur inattendue');
    } finally {
      setBusy(false);
    }
  };

  const submitAuth = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      const { token } =
        mode === 'login'
          ? await api.login(username, password)
          : await api.register(username, password, holderName);
      setPassword('');
      await onAuthenticated(token);
    });
  };

  const submitDeposit = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      onAccountChange(await api.deposit(parseFloat(depositAmount)));
    });
  };

  const errorBox = error && (
    <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
      <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
      <span>{error}</span>
    </div>
  );

  if (!account) {
    return (
      <div className="max-w-md mx-auto px-4 py-10">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-950">Mon compte</h1>
          <p className="text-xs text-zinc-400 mt-1">
            Compte bancaire fictif · authentification JWT · aucune donnée réelle
          </p>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-zinc-200/80 shadow-xs">
          <div className="flex p-1 bg-zinc-100/80 rounded-xl mb-5 text-xs font-medium">
            {(['login', 'register'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m);
                  setError(null);
                }}
                className={`flex-1 py-1.5 rounded-lg transition-all ${
                  mode === m ? 'bg-white text-zinc-950 shadow-xs' : 'text-zinc-600'
                }`}
              >
                {m === 'login' ? 'Connexion' : 'Créer un compte'}
              </button>
            ))}
          </div>

          {errorBox}

          <form onSubmit={submitAuth} className="space-y-3">
            {mode === 'register' && (
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">Nom complet</label>
                <input
                  className={inputCls}
                  value={holderName}
                  onChange={(e) => setHolderName(e.target.value)}
                  required
                  minLength={2}
                  maxLength={120}
                  autoComplete="name"
                />
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-zinc-500 mb-1">Identifiant</label>
              <input
                className={inputCls}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                minLength={3}
                maxLength={40}
                pattern="[a-zA-Z0-9_.\-]+"
                autoComplete="username"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500 mb-1">
                Mot de passe {mode === 'register' && '(8 caractères minimum)'}
              </label>
              <input
                type="password"
                className={inputCls}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                maxLength={128}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
            </div>
            <button
              type="submit"
              disabled={busy}
              className="w-full py-3 rounded-xl bg-zinc-950 hover:bg-zinc-800 text-white font-medium text-xs disabled:opacity-50"
            >
              {busy ? 'Patientez...' : mode === 'login' ? 'Se connecter' : 'Créer mon compte'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-4 py-10">
      <div className="text-center mb-6">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-950">Mon compte</h1>
        <p className="text-xs text-zinc-400 mt-1 flex items-center justify-center gap-1">
          <UserRound className="w-3 h-3" /> {account.holder_name} · @{account.username}
        </p>
      </div>

      <div className="bg-zinc-950 text-white p-6 rounded-2xl shadow-xs mb-4">
        <div className="flex items-center gap-2 text-xs text-zinc-400">
          <Wallet className="w-3.5 h-3.5" /> Solde disponible
        </div>
        <div className="text-4xl font-semibold tracking-tight mt-2">
          {account.balance.toLocaleString('fr-FR', { style: 'currency', currency: account.currency })}
        </div>
        <div className="text-[11px] text-zinc-500 mt-3 font-mono break-all">{account.account_number}</div>
      </div>

      <div className="bg-white p-6 rounded-2xl border border-zinc-200/80 shadow-xs">
        {errorBox}
        <form onSubmit={submitDeposit} className="space-y-3">
          <label className="block text-xs font-medium text-zinc-500">Alimenter le compte (dépôt fictif)</label>
          <div className="flex gap-2">
            <input
              type="number"
              min="0.01"
              max="10000"
              step="0.01"
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              required
              className={inputCls}
            />
            <button
              type="submit"
              disabled={busy}
              className="shrink-0 px-4 rounded-xl bg-zinc-950 hover:bg-zinc-800 text-white text-xs font-medium flex items-center gap-1.5 disabled:opacity-50"
            >
              <PlusCircle className="w-3.5 h-3.5" /> Ajouter
            </button>
          </div>
          <div className="flex gap-2">
            {[50, 100, 500, 1000].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setDepositAmount(String(v))}
                className="px-3 py-1 rounded-full text-xs bg-white border border-zinc-200 text-zinc-600 hover:border-zinc-400"
              >
                {v} €
              </button>
            ))}
          </div>
        </form>

        <div className="flex items-center justify-between mt-6 pt-4 border-t border-zinc-100 text-xs">
          <button onClick={onGoToPay} className="font-medium text-zinc-900 hover:underline">
            Payer avec ce compte →
          </button>
          <button onClick={onLogout} className="flex items-center gap-1 text-zinc-500 hover:text-zinc-900">
            <LogOut className="w-3 h-3" /> Déconnexion
          </button>
        </div>
      </div>
    </div>
  );
};
