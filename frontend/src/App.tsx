/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ShieldAlert, UserRound } from 'lucide-react';
import { Header } from './components/Header.tsx';
import { PaymentView } from './components/PaymentView.tsx';
import { Dashboard4Zones } from './components/Dashboard4Zones.tsx';
import { FastApiExplorer } from './components/FastApiExplorer.tsx';
import { SqlStudio } from './components/SqlStudio.tsx';
import { AccountView } from './components/AccountView.tsx';
import { RobotDisplayView } from './components/RobotDisplayView.tsx';
import { 
  INITIAL_TRANSACTIONS, 
  processPayment, 
  getHealthStatus,
  INITIAL_MERCHANTS
} from './utils/paymentEngine.ts';
import { Transaction, PaymentRequest, HealthCheckResponse, WafStatusResponse } from './types/index.ts';
import * as api from './utils/api.ts';

type AppRouteMode = 'paiement' | 'dashboard' | 'robot';

/**
 * Détection de la route URL :
 * - /robot     -> écran robot 800x480
 * - /dashboard -> interface Supervision (onglets Dashboard + Compte)
 * - / ou /paiement -> interface Client (onglets Paiement + Compte)
 */
function getAppRouteMode(): AppRouteMode {
  if (typeof window === 'undefined') return 'paiement';
  const path = window.location.pathname.toLowerCase();
  const hash = window.location.hash.toLowerCase();
  const search = new URLSearchParams(window.location.search);

  if (
    path === '/robot' ||
    path.startsWith('/robot/') ||
    hash === '#/robot' ||
    hash.startsWith('#/robot') ||
    search.get('view') === 'robot' ||
    search.has('robot')
  ) {
    return 'robot';
  }

  if (
    path === '/dashboard' ||
    path.startsWith('/dashboard/') ||
    hash === '#/dashboard' ||
    hash.startsWith('#/dashboard') ||
    search.get('view') === 'dashboard'
  ) {
    return 'dashboard';
  }

  return 'paiement';
}

export default function App() {
  const [routeMode, setRouteMode] = useState<AppRouteMode>(getAppRouteMode());

  const [activeTab, setActiveTab] = useState<'pay' | 'dashboard' | 'fastapi' | 'sql' | 'account'>(() =>
    getAppRouteMode() === 'dashboard' ? 'dashboard' : 'pay'
  );

  useEffect(() => {
    const handleLocationChange = () => {
      const nextMode = getAppRouteMode();
      setRouteMode(nextMode);
      if (nextMode === 'dashboard') {
        setActiveTab((prev) => (prev === 'account' ? 'account' : 'dashboard'));
      } else if (nextMode === 'paiement') {
        setActiveTab((prev) => (prev === 'account' ? 'account' : 'pay'));
      }
    };
    window.addEventListener('popstate', handleLocationChange);
    window.addEventListener('hashchange', handleLocationChange);
    return () => {
      window.removeEventListener('popstate', handleLocationChange);
      window.removeEventListener('hashchange', handleLocationChange);
    };
  }, []);

  const [manualDegraded, setManualDegraded] = useState(false);
  const [autoDegraded, setAutoDegraded] = useState(false);
  const [isBackendOnline, setIsBackendOnline] = useState(false);

  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    try {
      const saved = localStorage.getItem('resilience_alpha_transactions');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {}
    return INITIAL_TRANSACTIONS;
  });

  const [liveHealth, setLiveHealth] = useState<HealthCheckResponse | null>(null);
  const [wafStatus, setWafStatus] = useState<WafStatusResponse>({
    banned_ips: [],
    stats: {
      rate_limit_drops: 0,
      banned_ip_drops: 0,
      fuzzing_drops: 0,
      total_blocked: 0,
    },
  });
  const prevBlockedRef = useRef<number>(0);

  useEffect(() => {
    try {
      localStorage.setItem('resilience_alpha_transactions', JSON.stringify(transactions));
    } catch (e) {}
  }, [transactions]);

  // --- compte authentifié (service auth, JWT) ---
  const [account, setAccount] = useState<api.Account | null>(null);

  const handleLogout = () => {
    api.setToken(null);
    setAccount(null);
  };

  useEffect(() => {
    if (!api.getToken()) return;
    api.fetchAccount().then(setAccount).catch(() => api.setToken(null));
  }, []);

  const handleAuthenticated = async (token: string) => {
    api.setToken(token);
    setAccount(await api.fetchAccount());
  };

  // --- Polling temps réel des microservices (/api/health, /api/transactions, /api/waf/status) ---
  const syncLiveTelemetry = useCallback(async () => {
    try {
      const [healthRes, txsRes, wafRes] = await Promise.all([
        api.fetchHealth(manualDegraded),
        api.fetchTransactions(35).catch(() => null),
        api.fetchWafStatus().catch(() => null),
      ]);

      setIsBackendOnline(true);
      setLiveHealth(healthRes);

      let recentFailSpike = false;
      if (txsRes && txsRes.length > 0) {
        setTransactions(txsRes);
        const recentWindow = txsRes.slice(0, 5);
        const failedInWindow = recentWindow.filter((t) => t.status === 'FAILED').length;
        recentFailSpike = failedInWindow >= 2;
      }

      let wafActiveAttack = false;
      if (wafRes) {
        setWafStatus(wafRes);
        const deltaBlocked = wafRes.stats.total_blocked - prevBlockedRef.current;
        prevBlockedRef.current = wafRes.stats.total_blocked;
        wafActiveAttack = deltaBlocked > 0 || (wafRes.remediation?.queue ?? 0) > 0;
      }

      const healthDown = healthRes.status !== 'healthy' || healthRes.database.status !== 'connected';
      setAutoDegraded(healthDown || recentFailSpike || wafActiveAttack);
    } catch {
      // Backend hors ligne (mode dev local sans Docker) : conserver le moteur local
      setIsBackendOnline(false);
    }
  }, [manualDegraded]);

  useEffect(() => {
    syncLiveTelemetry();
    const timer = setInterval(syncLiveTelemetry, 2500);
    return () => clearInterval(timer);
  }, [syncLiveTelemetry]);

  const isDegraded = manualDegraded || autoDegraded;

  // Paiement réel via l'API POST /api/pay (avec ou sans compte connecté)
  const handleRemotePayment = async (req: PaymentRequest): Promise<Transaction> => {
    const merchantCode = req.merchant_id === 'mch_saas_02' ? 'MERCH_FINTECH' : 'MERCH_ALPHA';
    const merchant = INITIAL_MERCHANTS.find((m) => m.id === req.merchant_id);
    const idempotencyKey = req.idempotency_key || crypto.randomUUID();
    const cardLast4 = req.card_number.replace(/\s+/g, '').slice(-4) || '4242';

    let res: api.RemotePaymentResponse;
    try {
      res = await api.payRemote({
        merchant_code: merchantCode,
        amount: req.amount,
        currency: req.currency,
        idempotency_key: idempotencyKey,
        card_mock_number: req.card_number.replace(/\s+/g, ''),
        simulate_failure: req.simulate_failure,
        metadata: {
          reference: req.reference,
          customer_name: account?.holder_name ?? req.customer_name,
          card_last4: cardLast4,
          merchant_id: req.merchant_id,
          merchant_name: merchant?.name ?? merchantCode,
        },
      });
    } catch (e) {
      if (e instanceof api.ApiError && e.status === 401) {
        handleLogout();
        throw e;
      }
      // Si le conteneur backend n'est pas lancé en local, repli sur le moteur local
      if (e instanceof api.ApiError && e.status === 0 && !account) {
        return handleProcessPayment(req).transaction;
      }
      throw e;
    }

    if (res.balance_after != null) {
      setAccount((a) => (a ? { ...a, balance: res.balance_after as number } : a));
    }

    const tx: Transaction = {
      id: res.transaction_id,
      amount: res.amount,
      currency: res.currency,
      status: res.status === 'SUCCESS' ? 'CONFIRMED' : 'FAILED',
      merchant_id: req.merchant_id,
      merchant_name: merchant?.name ?? merchantCode,
      reference: res.reference,
      customer_name: account?.holder_name ?? req.customer_name,
      card_last4: cardLast4,
      created_at: res.created_at,
      latency_ms: res.latency_ms,
      idempotency_key: idempotencyKey,
      security_hash: res.authorization_code ?? `sha256_${res.transaction_id.slice(0, 16)}`,
      error_reason: res.status === 'SUCCESS' ? undefined : `${res.error_code ?? 'ERROR'}: ${res.message}`,
    };
    setTransactions((prev) => [tx, ...prev.filter((item) => item.id !== tx.id)]);
    syncLiveTelemetry();
    return tx;
  };

  const health = liveHealth ?? getHealthStatus(transactions, isDegraded);

  const handleRefreshHealth = () => {
    syncLiveTelemetry();
  };

  const handleProcessPayment = (req: PaymentRequest) => {
    const result = processPayment(req, transactions);
    if (!result.isIdempotent) {
      setTransactions((prev) => [result.transaction, ...prev]);
    }
    return result;
  };

  // ==============================================================================
  // 🤖 ROUTE AUTONOME /robot SANS LAYOUT (800x480 HDMI)
  // ==============================================================================
  if (isRobot) {
    return (
      <RobotDisplayView
        isDegraded={isDegraded}
        transactions={transactions}
        wafStatus={wafStatus}
        health={health}
        onToggleDegraded={() => setManualDegraded(!manualDegraded)}
      />
    );
  }

  // ==============================================================================
  // INTERFACE PRINCIPALE SELON L'URL (/paiement vs /dashboard)
  // ==============================================================================
  return (
    <div className="min-h-screen bg-zinc-50/60 text-zinc-900 flex flex-col selection:bg-zinc-900 selection:text-white">
      <Header
        mode={routeMode}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        health={health}
        isDegraded={isDegraded}
        onToggleDegraded={() => setManualDegraded(!manualDegraded)}
        transactionCount={transactions.length}
        account={account}
      />

      <main className="flex-1 pb-16">
        {activeTab === 'pay' && (
          <PaymentView
            onProcessPayment={handleProcessPayment}
            onViewDashboard={() => {
              window.history.pushState({}, '', '/dashboard');
              setRouteMode('dashboard');
              setActiveTab('dashboard');
            }}
            onViewSql={() => setActiveTab('sql')}
            isDegraded={isDegraded}
            account={account}
            onRemotePayment={handleRemotePayment}
            onGoToAccount={() => setActiveTab('account')}
          />
        )}

        {activeTab === 'dashboard' && (
          !account ? (
            <div className="max-w-xl mx-auto px-4 py-16">
              <div className="bg-white p-8 sm:p-10 rounded-2xl border border-zinc-200/80 shadow-xs text-center space-y-6">
                <div className="w-14 h-14 rounded-2xl bg-zinc-100 flex items-center justify-center mx-auto text-zinc-900 ring-8 ring-zinc-50">
                  <ShieldAlert className="w-7 h-7 text-zinc-700" />
                </div>

                <div className="space-y-2">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                    Accès Restreint
                  </span>
                  <h2 className="text-2xl font-semibold tracking-tight text-zinc-950">
                    Connexion Administrateur Requise
                  </h2>
                  <p className="text-sm text-zinc-500 max-w-md mx-auto">
                    Le tableau de bord de supervision et de cyber-résilience est strictement réservé au compte administrateur.
                  </p>
                </div>

                <div className="pt-2 flex flex-col sm:flex-row gap-3 justify-center">
                  <button
                    onClick={() => setActiveTab('account')}
                    className="px-6 py-3 rounded-xl bg-zinc-950 hover:bg-zinc-800 text-white font-medium text-xs shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-2"
                  >
                    <UserRound className="w-4 h-4" />
                    <span>Se connecter avec le compte admin</span>
                  </button>
                  <button
                    onClick={() => {
                      window.history.pushState({}, '', '/paiement');
                      setRouteMode('paiement');
                      setActiveTab('pay');
                    }}
                    className="px-4 py-3 rounded-xl border border-zinc-200 hover:border-zinc-300 text-zinc-700 text-xs font-medium transition-colors cursor-pointer"
                  >
                    Aller au paiement
                  </button>
                </div>

                <div className="pt-4 border-t border-zinc-100 text-[11px] text-zinc-400">
                  Compte administrateur configuré dans l'environnement Docker (.env)
                </div>
              </div>
            </div>
          ) : account.role !== 'ADMIN' ? (
            <div className="max-w-xl mx-auto px-4 py-16">
              <div className="bg-white p-8 sm:p-10 rounded-2xl border border-amber-200/80 shadow-xs text-center space-y-6">
                <div className="w-14 h-14 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto text-amber-600 ring-8 ring-amber-50/50">
                  <ShieldAlert className="w-7 h-7" />
                </div>

                <div className="space-y-2">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                    Privilèges Insuffisants
                  </span>
                  <h2 className="text-2xl font-semibold tracking-tight text-zinc-950">
                    Accès Réservé à l'Administrateur
                  </h2>
                  <p className="text-sm text-zinc-500 max-w-md mx-auto">
                    Vous êtes connecté en tant que <strong>@{account.username}</strong> ({account.holder_name}), avec le profil <strong>{account.role || 'Client'}</strong>.
                    <br />
                    Seul le compte administrateur est autorisé à consulter le Dashboard de supervision.
                  </p>
                </div>

                <div className="pt-2 flex flex-col sm:flex-row gap-3 justify-center">
                  <button
                    onClick={() => {
                      handleLogout();
                      setActiveTab('account');
                    }}
                    className="px-6 py-3 rounded-xl bg-zinc-950 hover:bg-zinc-800 text-white font-medium text-xs shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-2"
                  >
                    <span>Changer de compte (Connexion Admin)</span>
                  </button>
                  <button
                    onClick={() => {
                      window.history.pushState({}, '', '/paiement');
                      setRouteMode('paiement');
                      setActiveTab('pay');
                    }}
                    className="px-4 py-3 rounded-xl border border-zinc-200 hover:border-zinc-300 text-zinc-700 text-xs font-medium transition-colors cursor-pointer"
                  >
                    Retourner au paiement
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <Dashboard4Zones
              transactions={transactions}
              health={health}
              wafStatus={wafStatus}
              isBackendOnline={isBackendOnline}
              onRefreshHealth={handleRefreshHealth}
              isDegraded={isDegraded}
              onGoToPay={() => {
                window.history.pushState({}, '', '/paiement');
                setRouteMode('paiement');
                setActiveTab('pay');
              }}
            />
          )
        )}

        {activeTab === 'fastapi' && (
          <FastApiExplorer
            health={health}
            onRefreshHealth={handleRefreshHealth}
            onProcessPayment={handleProcessPayment}
            onRemotePayment={handleRemotePayment}
            isDegraded={isDegraded}
          />
        )}

        {activeTab === 'sql' && (
          <SqlStudio
            transactions={transactions}
            onGoToPay={() => setActiveTab('pay')}
          />
        )}

        {activeTab === 'account' && (
          <AccountView
            account={account}
            onAuthenticated={handleAuthenticated}
            onAccountChange={setAccount}
            onLogout={handleLogout}
            onGoToPay={() => setActiveTab(routeMode === 'dashboard' ? 'dashboard' : 'pay')}
          />
        )}
      </main>

      {/* Clean Apple-style Footer */}
      <footer className="border-t border-zinc-200/70 bg-white py-6 text-center">
        <div className="max-w-6xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-3 text-xs font-normal text-zinc-400">
          <div className="flex flex-col md:items-start text-center md:text-left gap-0.5">
            <span>
              Resilience Alpha • Workshop EPSI Bac+5 (2026)
            </span>
            <span className="text-[11px] text-zinc-500">
              Membres du groupe : Agathe POTEAUX, Timeo DUCHET, Clara HONORE, Mélanie BOUDRY, Antoine BRUYE
            </span>
          </div>
          <span className="text-zinc-400 text-center md:text-right">
            FastAPI • PostgreSQL 16 • React/Tailwind • {isBackendOnline ? 'Télémétrie Live Connectée' : 'Mode Déconnecté'}
          </span>
        </div>
      </footer>
    </div>
  );
}
