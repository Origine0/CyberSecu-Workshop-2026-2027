import React from 'react';
import { 
  CreditCard, 
  LayoutDashboard, 
  UserRound
} from 'lucide-react';
import { HealthCheckResponse } from '../types/index.ts';
import { Account } from '../utils/api.ts';

interface HeaderProps {
  mode?: 'paiement' | 'dashboard';
  activeTab: 'pay' | 'dashboard' | 'fastapi' | 'sql' | 'account';
  setActiveTab: (tab: 'pay' | 'dashboard' | 'fastapi' | 'sql' | 'account') => void;
  health: HealthCheckResponse;
  isDegraded: boolean;
  onToggleDegraded?: () => void;
  transactionCount: number;
  account: Account | null;
}

export const Header: React.FC<HeaderProps> = ({
  mode = 'paiement',
  activeTab,
  setActiveTab,
  health,
  isDegraded,
  transactionCount,
  account,
}) => {
  return (
    <header className="border-b border-zinc-200/70 bg-white/80 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16 gap-4">
          
          {/* Apple-style Brand Wordmark */}
          <div className="flex-1 basis-0 flex items-center justify-start min-w-0">
            <div className="flex items-center gap-2.5 shrink-0">
              <span className="w-2 h-2 rounded-full bg-emerald-500 ring-4 ring-emerald-500/10" />
              <span className="font-semibold text-base tracking-tight text-zinc-950">
                Resilience
              </span>
              <span className="text-xs text-zinc-400 border-l border-zinc-200 pl-2 font-normal">
                Alpha
              </span>
            </div>
          </div>

          {/* Minimalist Tabs filtered by URL mode (/paiement vs /dashboard) */}
          <nav className="shrink-0 flex items-center p-1 bg-zinc-100/80 rounded-xl overflow-x-auto scrollbar-none max-w-full">
            {mode === 'paiement' && (
              <button
                onClick={() => setActiveTab('pay')}
                className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                  activeTab === 'pay'
                    ? 'bg-white text-zinc-950 shadow-xs'
                    : 'text-zinc-600 hover:text-zinc-950'
                }`}
              >
                <CreditCard className="w-3.5 h-3.5" />
                <span>Paiement</span>
              </button>
            )}

            {mode === 'dashboard' && (
              <button
                onClick={() => setActiveTab('dashboard')}
                className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                  activeTab === 'dashboard'
                    ? 'bg-white text-zinc-950 shadow-xs'
                    : 'text-zinc-600 hover:text-zinc-950'
                }`}
              >
                <LayoutDashboard className="w-3.5 h-3.5" />
                <span>Dashboard</span>
                {transactionCount > 0 && (
                  <span className="ml-0.5 text-[11px] font-medium px-1.5 py-0.2 rounded-full bg-zinc-200/70 text-zinc-700">
                    {transactionCount}
                  </span>
                )}
              </button>
            )}

            <button
              onClick={() => setActiveTab('account')}
              className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                activeTab === 'account'
                  ? 'bg-white text-zinc-950 shadow-xs'
                  : 'text-zinc-600 hover:text-zinc-950'
              }`}
            >
              <UserRound className="w-3.5 h-3.5" />
              <span>{account ? `${account.balance.toFixed(2)} €` : 'Connexion'}</span>
              {account?.role === 'ADMIN' && (
                <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-purple-100 text-purple-700">
                  ADMIN
                </span>
              )}
            </button>
          </nav>

          {/* Minimal Controls */}
          <div className="flex-1 basis-0 flex items-center justify-end min-w-0">
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-zinc-500 font-normal shrink-0">
              <span className={`w-1.5 h-1.5 rounded-full ${isDegraded ? 'bg-amber-500' : 'bg-emerald-500'}`} />
              <span>{health.database.latency_ms} ms</span>
            </div>
          </div>

        </div>
      </div>
    </header>
  );
};
