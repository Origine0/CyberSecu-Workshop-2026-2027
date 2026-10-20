/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Header } from './components/Header.tsx';
import { PaymentView } from './components/PaymentView.tsx';
import { Dashboard4Zones } from './components/Dashboard4Zones.tsx';
import { FastApiExplorer } from './components/FastApiExplorer.tsx';
import { SqlStudio } from './components/SqlStudio.tsx';
import { ProjectCodeHub } from './components/ProjectCodeHub.tsx';
import { 
  INITIAL_TRANSACTIONS, 
  processPayment, 
  getHealthStatus 
} from './utils/paymentEngine.ts';
import { Transaction, PaymentRequest } from './types/index.ts';

export default function App() {
  const [activeTab, setActiveTab] = useState<'pay' | 'dashboard' | 'fastapi' | 'sql' | 'files'>('pay');
  const [isDegraded, setIsDegraded] = useState(false);

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

  useEffect(() => {
    try {
      localStorage.setItem('resilience_alpha_transactions', JSON.stringify(transactions));
    } catch (e) {}
  }, [transactions]);

  const health = getHealthStatus(transactions, isDegraded);

  const handleRefreshHealth = () => {
    setTransactions((prev) => [...prev]);
  };

  const handleProcessPayment = (req: PaymentRequest) => {
    const result = processPayment(req, transactions);
    if (!result.isIdempotent) {
      setTransactions((prev) => [result.transaction, ...prev]);
    }
    return result;
  };

  return (
    <div className="min-h-screen bg-zinc-50/60 text-zinc-900 flex flex-col selection:bg-zinc-900 selection:text-white">
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        health={health}
        isDegraded={isDegraded}
        onToggleDegraded={() => setIsDegraded(!isDegraded)}
        transactionCount={transactions.length}
      />

      <main className="flex-1 pb-16">
        {activeTab === 'pay' && (
          <PaymentView
            onProcessPayment={handleProcessPayment}
            onViewDashboard={() => setActiveTab('dashboard')}
            onViewSql={() => setActiveTab('sql')}
            isDegraded={isDegraded}
          />
        )}

        {activeTab === 'dashboard' && (
          <Dashboard4Zones
            transactions={transactions}
            health={health}
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
            isDegraded={isDegraded}
          />
        )}

        {activeTab === 'sql' && (
          <SqlStudio
            transactions={transactions}
            onGoToPay={() => setActiveTab('pay')}
          />
        )}

        {activeTab === 'files' && <ProjectCodeHub />}
      </main>

      {/* Clean Apple-style Footer */}
      <footer className="border-t border-zinc-200/70 bg-white py-6 text-center">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs font-normal text-zinc-400">
          <span>Resilience Alpha • EPSI Bac+5 (2026)</span>
          <span className="text-zinc-400">FastAPI • PostgreSQL 16 • Next.js</span>
        </div>
      </footer>
    </div>
  );
}
