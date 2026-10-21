/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
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

/**
 * Détection de la route /robot (indépendante du layout standard)
 */
function isRobotRoute(): boolean {
  if (typeof window === 'undefined') return false;
  const path = window.location.pathname.toLowerCase();
  const hash = window.location.hash.toLowerCase();
  const search = new URLSearchParams(window.location.search);
  return (
    path === '/robot' ||
    path.startsWith('/robot/') ||
    hash === '#/robot' ||
    hash.startsWith('#/robot') ||
    search.get('view') === 'robot' ||
    search.has('robot')
  );
}

export default function App() {
  // Détection de la route autonome /robot pour écran HDMI Raspberry Pi
  const [isRobot, setIsRobot] = useState<boolean>(isRobotRoute());

  useEffect(() => {
    const handleLocationChange = () => setIsRobot(isRobotRoute());
    window.addEventListener('popstate', handleLocationChange);
    window.addEventListener('hashchange', handleLocationChange);
    return () => {
      window.removeEventListener('popstate', handleLocationChange);
      window.removeEventListener('hashchange', handleLocationChange);
    };
  }, []);

  const [activeTab, setActiveTab] = useState<'pay' | 'dashboard' | 'fastapi' | 'sql' | 'account'>('pay');
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
  // 🤖 ÉTAPE 2 & 3 : ROUTE AUTONOME /robot SANS LAYOUT (800x480 HDMI)
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
  // DASHBOARD PRINCIPAL AVEC HEADER & LAYOUT STANDARD
  // ==============================================================================
  return (
    <div className="min-h-screen bg-zinc-50/60 text-zinc-900 flex flex-col selection:bg-zinc-900 selection:text-white">
      <Header
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
            onViewDashboard={() => setActiveTab('dashboard')}
            onViewSql={() => setActiveTab('sql')}
            isDegraded={isDegraded}
            account={account}
            onRemotePayment={handleRemotePayment}
            onGoToAccount={() => setActiveTab('account')}
          />
        )}

        {activeTab === 'dashboard' && (
          <Dashboard4Zones
            transactions={transactions}
            health={health}
            wafStatus={wafStatus}
            isBackendOnline={isBackendOnline}
            onRefreshHealth={handleRefreshHealth}
            isDegraded={isDegraded}
            onGoToPay={() => setActiveTab('pay')}
          />
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
            onGoToPay={() => setActiveTab('pay')}
          />
        )}
      </main>

      {/* Clean Apple-style Footer */}
      <footer className="border-t border-zinc-200/70 bg-white py-6 text-center">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs font-normal text-zinc-400">
          <span>Resilience Alpha • EPSI Bac+5 (2026)</span>
          <span className="text-zinc-400">
            FastAPI • PostgreSQL 16 • React/Tailwind • {isBackendOnline ? 'Télémétrie Live Connectée' : 'Mode Déconnecté'}
          </span>
        </div>
      </footer>
    </div>
  );
}
