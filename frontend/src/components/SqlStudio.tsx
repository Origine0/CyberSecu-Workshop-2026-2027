import React, { useState } from 'react';
import { 
  Play, 
  Search 
} from 'lucide-react';
import { Transaction } from '../types/index.ts';
import { 
  computeHourlyVolumeCTE, 
  computeFraudVelocityCTE, 
  computeMerchantSettlementCTE 
} from '../utils/paymentEngine.ts';

interface SqlStudioProps {
  transactions: Transaction[];
  onGoToPay: () => void;
}

export const SqlStudio: React.FC<SqlStudioProps> = ({ transactions }) => {
  const [selectedTab, setSelectedTab] = useState<'hourly' | 'fraud' | 'settlement' | 'table'>('hourly');
  const [searchTerm, setSearchTerm] = useState('');

  const hourlyData = computeHourlyVolumeCTE(transactions);
  const fraudData = computeFraudVelocityCTE(transactions);
  const settlementData = computeMerchantSettlementCTE(transactions);

  const filteredTransactions = transactions.filter((t) => {
    return (
      t.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.merchant_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.id.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-zinc-200/80 gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-950">
            PostgreSQL & CTEs
          </h1>
          <p className="text-xs text-zinc-400 mt-1 font-normal">
            Analyses transactionnelles à la volée sans vue matérialisée lourde
          </p>
        </div>

        {/* Minimal Tabs */}
        <div className="p-1 bg-zinc-100 rounded-xl flex items-center text-xs overflow-x-auto scrollbar-none">
          <button
            onClick={() => setSelectedTab('hourly')}
            className={`shrink-0 px-3 py-1.5 rounded-lg transition-all ${
              selectedTab === 'hourly'
                ? 'bg-white text-zinc-950 shadow-2xs font-medium'
                : 'text-zinc-500 hover:text-zinc-950'
            }`}
          >
            Volumes horaires
          </button>
          <button
            onClick={() => setSelectedTab('fraud')}
            className={`shrink-0 px-3 py-1.5 rounded-lg transition-all ${
              selectedTab === 'fraud'
                ? 'bg-white text-zinc-950 shadow-2xs font-medium'
                : 'text-zinc-500 hover:text-zinc-950'
            }`}
          >
            Vélocité & Risque
          </button>
          <button
            onClick={() => setSelectedTab('settlement')}
            className={`shrink-0 px-3 py-1.5 rounded-lg transition-all ${
              selectedTab === 'settlement'
                ? 'bg-white text-zinc-950 shadow-2xs font-medium'
                : 'text-zinc-500 hover:text-zinc-950'
            }`}
          >
            Règlements
          </button>
          <button
            onClick={() => setSelectedTab('table')}
            className={`shrink-0 px-3 py-1.5 rounded-lg transition-all ${
              selectedTab === 'table'
                ? 'bg-white text-zinc-950 shadow-2xs font-medium'
                : 'text-zinc-500 hover:text-zinc-950'
            }`}
          >
            Transactions ({transactions.length})
          </button>
        </div>
      </div>

      {selectedTab !== 'table' && (
        <div className="space-y-5">
          {/* SQL Query Snippet */}
          <div className="bg-white p-4 rounded-2xl border border-zinc-200/80 shadow-xs">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-zinc-100 text-xs text-zinc-400">
              <span className="flex items-center gap-1.5 font-medium text-zinc-700">
                <Play className="w-3 h-3 text-zinc-900" />
                <span>Requête SQL (Common Table Expression)</span>
              </span>
              <span className="text-emerald-600 font-medium">Exécution : 1.2 ms</span>
            </div>

            <pre className="p-3 bg-zinc-950 text-zinc-200 rounded-xl text-xs overflow-x-auto leading-relaxed">
              <code>
                {selectedTab === 'hourly' &&
`WITH HourlyStats AS (
    SELECT 
        date_trunc('hour', created_at) AS hour_window,
        COUNT(*) AS total_tx,
        COUNT(*) FILTER (WHERE status = 'CONFIRMED') AS confirmed_tx,
        COALESCE(SUM(amount) FILTER (WHERE status = 'CONFIRMED'), 0) AS total_amount
    FROM transactions
    GROUP BY date_trunc('hour', created_at)
)
SELECT hour_window, total_tx, confirmed_tx, total_amount FROM HourlyStats;`}

                {selectedTab === 'fraud' &&
`WITH VelocityAnalysis AS (
    SELECT 
        customer_name, card_last4,
        COUNT(*) AS count_15min,
        SUM(amount) AS volume_15min
    FROM transactions
    WHERE created_at >= NOW() - INTERVAL '15 minutes'
    GROUP BY customer_name, card_last4
)
SELECT customer_name, card_last4, count_15min, volume_15min FROM VelocityAnalysis;`}

                {selectedTab === 'settlement' &&
`WITH MerchantTransactions AS (
    SELECT 
        m.id, m.name,
        COUNT(t.id) AS total_tx,
        COALESCE(SUM(t.amount) FILTER (WHERE t.status = 'CONFIRMED'), 0) AS gross_amount
    FROM merchants m LEFT JOIN transactions t ON m.id = t.merchant_id
    GROUP BY m.id, m.name
)
SELECT name, total_tx, gross_amount, ROUND(gross_amount * 0.012, 2) AS fee FROM MerchantTransactions;`}
              </code>
            </pre>
          </div>

          {/* Results Table */}
          <div className="bg-white p-5 rounded-2xl border border-zinc-200/80 shadow-xs overflow-x-auto">
            {selectedTab === 'hourly' && (
              <table className="w-full text-left text-xs">
                <thead className="text-zinc-400 text-xs font-medium border-b border-zinc-100">
                  <tr>
                    <th className="py-2.5 px-3">Créneau horaire</th>
                    <th className="py-2.5 px-3 text-center">Transactions</th>
                    <th className="py-2.5 px-3 text-center">Succès</th>
                    <th className="py-2.5 px-3 text-right">Volume</th>
                    <th className="py-2.5 px-3 text-right">Taux</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {hourlyData.map((row, i) => (
                    <tr key={i} className="hover:bg-zinc-50/70">
                      <td className="py-2.5 px-3 font-semibold text-zinc-950">{row.hour_bucket}</td>
                      <td className="py-2.5 px-3 text-center text-zinc-600">{row.tx_count}</td>
                      <td className="py-2.5 px-3 text-center text-emerald-600 font-medium">{row.success_count}</td>
                      <td className="py-2.5 px-3 text-right text-zinc-950 font-semibold">{row.total_volume_eur.toFixed(2)} €</td>
                      <td className="py-2.5 px-3 text-right text-zinc-600">{row.success_rate_pct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {selectedTab === 'fraud' && (
              <table className="w-full text-left text-xs">
                <thead className="text-zinc-400 text-xs font-medium border-b border-zinc-100">
                  <tr>
                    <th className="py-2.5 px-3">Client</th>
                    <th className="py-2.5 px-3">Carte</th>
                    <th className="py-2.5 px-3 text-center">Fréquence (15 min)</th>
                    <th className="py-2.5 px-3 text-right">Volume</th>
                    <th className="py-2.5 px-3 text-center">Niveau de risque</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {fraudData.map((row, i) => (
                    <tr key={i} className="hover:bg-zinc-50/70">
                      <td className="py-2.5 px-3 font-semibold text-zinc-950">{row.customer_name}</td>
                      <td className="py-2.5 px-3 text-zinc-500">•••• {row.card_last4}</td>
                      <td className="py-2.5 px-3 text-center text-zinc-700">{row.velocity_10m_count}</td>
                      <td className="py-2.5 px-3 text-right text-zinc-950 font-semibold">{row.volume_10m_eur.toFixed(2)} €</td>
                      <td className="py-2.5 px-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          row.alert_level === 'HIGH_RISK'
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-zinc-100 text-zinc-700'
                        }`}>
                          {row.alert_level}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {selectedTab === 'settlement' && (
              <table className="w-full text-left text-xs">
                <thead className="text-zinc-400 text-xs font-medium border-b border-zinc-100">
                  <tr>
                    <th className="py-2.5 px-3">Marchand</th>
                    <th className="py-2.5 px-3 text-center">Transactions</th>
                    <th className="py-2.5 px-3 text-right">Montant brut</th>
                    <th className="py-2.5 px-3 text-right">Commission (1.2%)</th>
                    <th className="py-2.5 px-3 text-right">Versement net</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {settlementData.map((row, i) => (
                    <tr key={i} className="hover:bg-zinc-50/70">
                      <td className="py-2.5 px-3 font-semibold text-zinc-950">{row.merchant_name}</td>
                      <td className="py-2.5 px-3 text-center text-zinc-600">{row.total_tx}</td>
                      <td className="py-2.5 px-3 text-right text-zinc-950 font-semibold">{row.gross_amount_eur.toFixed(2)} €</td>
                      <td className="py-2.5 px-3 text-right text-zinc-400">-{row.fee_interchange_eur.toFixed(2)} €</td>
                      <td className="py-2.5 px-3 text-right text-emerald-600 font-semibold">{row.net_settlement_eur.toFixed(2)} €</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Raw Table View */}
      {selectedTab === 'table' && (
        <div className="bg-white p-5 rounded-2xl border border-zinc-200/80 shadow-xs space-y-3">
          <div className="relative max-w-sm">
            <input
              type="text"
              placeholder="Rechercher..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-zinc-50/80 border border-zinc-200 rounded-xl text-xs text-zinc-900 focus:outline-none focus:bg-white focus:border-zinc-950"
            />
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-2" />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-zinc-400 text-xs font-medium border-b border-zinc-100">
                <tr>
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3">Identifiant</th>
                  <th className="py-2.5 px-3">Titulaire</th>
                  <th className="py-2.5 px-3 text-center">Statut</th>
                  <th className="py-2.5 px-3 text-right">Montant</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {filteredTransactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-zinc-50/70">
                    <td className="py-2.5 px-3 text-zinc-400">{new Date(tx.created_at).toLocaleTimeString('fr-FR')}</td>
                    <td className="py-2.5 px-3 text-zinc-600 truncate max-w-[120px]">{tx.id}</td>
                    <td className="py-2.5 px-3 font-medium text-zinc-950">{tx.customer_name}</td>
                    <td className="py-2.5 px-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        tx.status === 'CONFIRMED' ? 'text-emerald-700 bg-emerald-50' : 'text-rose-700 bg-rose-50'
                      }`}>
                        {tx.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right text-zinc-950 font-semibold">{tx.amount.toFixed(2)} €</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
};
