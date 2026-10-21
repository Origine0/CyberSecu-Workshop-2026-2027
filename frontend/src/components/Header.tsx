import React from 'react';
import { 
  CreditCard, 
  LayoutDashboard, 
  Terminal, 
  Database, 
  UserRound,
  Bot
} from 'lucide-react';
import { HealthCheckResponse } from '../types/index.ts';
import { Account } from '../utils/api.ts';

interface HeaderProps {
  activeTab: 'pay' | 'dashboard' | 'fastapi' | 'sql' | 'account';
  setActiveTab: (tab: 'pay' | 'dashboard' | 'fastapi' | 'sql' | 'account') => void;
  health: HealthCheckResponse;
  isDegraded: boolean;
  onToggleDegraded: () => void;
  transactionCount: number;
  account: Account | null;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  health,
  isDegraded,
  onToggleDegraded,
  transactionCount,
  account,
}) => {
  return (
    <header className="border-b border-zinc-200/70 bg-white/80 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16 gap-4">
          
          {/* Apple-style Brand Wordmark */}
          <div className="flex items-center gap-2.5 shrink-0">
            <span className="w-2 h-2 rounded-full bg-emerald-500 ring-4 ring-emerald-500/10" />
            <span className="font-semibold text-base tracking-tight text-zinc-950">
              Resilience
            </span>
            <span className="text-xs text-zinc-400 border-l border-zinc-200 pl-2 font-normal">
              Alpha
            </span>
          </div>

          {/* Minimalist Tabs */}
          <nav className="flex items-center p-1 bg-zinc-100/80 rounded-xl overflow-x-auto scrollbar-none max-w-full">
            <button
              onClick={() => setActiveTab('pay')}
              className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'pay'
                  ? 'bg-white text-zinc-950 shadow-xs'
                  : 'text-zinc-600 hover:text-zinc-950'
              }`}
            >
              <CreditCard className="w-3.5 h-3.5" />
              <span>Paiement</span>
            </button>

            <button
              onClick={() => setActiveTab('dashboard')}
              className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
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

            <button
              onClick={() => setActiveTab('fastapi')}
              className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'fastapi'
                  ? 'bg-white text-zinc-950 shadow-xs'
                  : 'text-zinc-600 hover:text-zinc-950'
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>FastAPI</span>
            </button>

            <button
              onClick={() => setActiveTab('sql')}
              className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'sql'
                  ? 'bg-white text-zinc-950 shadow-xs'
                  : 'text-zinc-600 hover:text-zinc-950'
              }`}
            >
              <Database className="w-3.5 h-3.5" />
              <span>PostgreSQL</span>
            </button>

            <button
              onClick={() => setActiveTab('account')}
              className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'account'
                  ? 'bg-white text-zinc-950 shadow-xs'
                  : 'text-zinc-600 hover:text-zinc-950'
              }`}
            >
              <UserRound className="w-3.5 h-3.5" />
              <span>{account ? `${account.balance.toFixed(2)} €` : 'Compte'}</span>
            </button>
          </nav>

          {/* Minimal Controls */}
          <div className="flex items-center gap-2.5 shrink-0">
            <a
              href="/robot"
              className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-zinc-900 hover:bg-zinc-800 text-sky-400 border border-zinc-800 transition-colors shadow-xs"
              title="Ouvrir l'interface robot 800x480"
            >
              <Bot className="w-3.5 h-3.5" />
              <span>Écran Robot</span>
            </a>

            <div className="hidden sm:flex items-center gap-1.5 text-xs text-zinc-500 font-normal">
              <span className={`w-1.5 h-1.5 rounded-full ${isDegraded ? 'bg-amber-500' : 'bg-emerald-500'}`} />
              <span>{health.database.latency_ms} ms</span>
            </div>

            <button
              onClick={onToggleDegraded}
              className={`text-xs px-2.5 py-1 rounded-lg font-medium border transition-colors ${
                isDegraded
                  ? 'bg-amber-50 border-amber-300 text-amber-900'
                  : 'bg-white border-zinc-200 text-zinc-600 hover:text-zinc-900 hover:border-zinc-300'
              }`}
            >
              {isDegraded ? 'Incident actif' : 'Simuler panne'}
            </button>
          </div>

        </div>
      </div>
    </header>
  );
};
