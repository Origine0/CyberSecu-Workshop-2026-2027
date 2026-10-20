import React, { useState, useEffect } from 'react';
import { 
  CreditCard, 
  Terminal, 
  ShieldCheck, 
  Database, 
  Cpu, 
  Activity, 
  Play, 
  Check, 
  AlertTriangle,
  ArrowRight,
  Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Transaction, HealthCheckResponse } from '../types/index.ts';

interface LiveResiliencePipelineProps {
  transactions: Transaction[];
  health: HealthCheckResponse;
  isDegraded: boolean;
  onSimulateTransit?: () => void;
}

interface PipelineNode {
  id: string;
  zone: string;
  label: string;
  sublabel: string;
  icon: React.ComponentType<{ className?: string }>;
  status: 'nominal' | 'warning' | 'active';
  metric: string;
  detail: string;
  tech: string;
}

export const LiveResiliencePipeline: React.FC<LiveResiliencePipelineProps> = ({
  transactions,
  health,
  isDegraded,
}) => {
  const [activeStep, setActiveStep] = useState<number | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [pulseCount, setPulseCount] = useState(0);

  // Trigger automated visual transit every few seconds or on manual click
  const triggerTransit = () => {
    setPulseCount((prev) => prev + 1);
    setActiveStep(0);
    setTimeout(() => setActiveStep(1), 350);
    setTimeout(() => setActiveStep(2), 700);
    setTimeout(() => setActiveStep(3), 1050);
    setTimeout(() => setActiveStep(4), 1400);
    setTimeout(() => setActiveStep(null), 2000);
  };

  const latestTx = transactions[0];

  const nodes: PipelineNode[] = [
    {
      id: 'node-client',
      zone: 'Zone 1 · Métier',
      label: 'Client Web',
      sublabel: 'Paiement / Next.js',
      icon: CreditCard,
      status: 'nominal',
      metric: `${transactions.length} tx`,
      detail: latestTx ? `${latestTx.amount.toFixed(2)} € (${latestTx.customer_name})` : 'Prêt',
      tech: 'React 19 • Next.js 15',
    },
    {
      id: 'node-fastapi',
      zone: 'Zone 2 · Infra',
      label: 'Passerelle FastAPI',
      sublabel: 'Route POST /pay',
      icon: Terminal,
      status: isDegraded ? 'warning' : 'nominal',
      metric: `${health.database.latency_ms} ms`,
      detail: isDegraded ? 'Latence accrue • Fallback actif' : 'Validation Pydantic • Idempotence',
      tech: 'Python 3.11 • Uvicorn',
    },
    {
      id: 'node-aiops',
      zone: 'Zone 3 · Sécurité',
      label: 'WAF & AIOps',
      sublabel: 'Isolation Forest',
      icon: ShieldCheck,
      status: isDegraded ? 'warning' : 'nominal',
      metric: isDegraded ? 'Score 0.84' : 'Score 0.02',
      detail: isDegraded ? 'Anomalie détectée sur le débit' : 'Signature SHA-256 certifiée',
      tech: 'Scikit-learn • Modèle ML',
    },
    {
      id: 'node-db',
      zone: 'Zone 2 · Infra',
      label: 'PostgreSQL 16',
      sublabel: 'Persistance ACID',
      icon: Database,
      status: 'nominal',
      metric: `${health.database.active_connections} connexions`,
      detail: 'Table transactions & CTEs analytiques',
      tech: 'Postgres 16-alpine • Docker',
    },
    {
      id: 'node-remediation',
      zone: 'Zone 4 · Reprise',
      label: 'Moteur Autonome',
      sublabel: 'Zero-Touch Recovery',
      icon: Cpu,
      status: isDegraded ? 'active' : 'nominal',
      metric: isDegraded ? 'Reprise...' : 'Veille',
      detail: isDegraded ? 'Playbook Ansible engagé (RTO < 15s)' : 'Surveillance continue 24/7',
      tech: 'Ansible • Circuit Breaker',
    },
  ];

  const activeNodeData = nodes.find((n) => n.id === selectedNode) || nodes[0];

  return (
    <div className="bg-white border border-zinc-200/80 rounded-2xl p-5 sm:p-6 shadow-[0_2px_12px_rgba(0,0,0,0.03)]">
      {/* Top Bar with title and action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-5 border-b border-zinc-100 gap-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-zinc-100 flex items-center justify-center text-zinc-900">
            <Activity className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold tracking-tight text-zinc-950">
                Pipeline Graphique de Résilience
              </h2>
              <span className="text-[11px] font-normal px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                {isDegraded ? 'Incident sous contrôle' : 'Flux nominal'}
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5 font-normal">
              Visualisation en temps réel du transit et de la boucle d'auto-remédiation
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={triggerTransit}
            disabled={activeStep !== null}
            className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
          >
            <Play className="w-3 h-3 fill-white" />
            <span>Simuler un transit</span>
          </button>
        </div>
      </div>

      {/* Visual Topology Pipeline (Apple-style clean vector pipeline) */}
      <div className="py-8 relative overflow-x-auto scrollbar-none">
        <div className="min-w-[680px] max-w-4xl mx-auto px-2 relative">
          
          {/* Background Connecting Wave Vector Line */}
          <div className="absolute top-1/2 left-8 right-8 -translate-y-1/2 h-0.5 bg-zinc-100 -z-0">
            {/* Animated Packet Pulse */}
            <AnimatePresence>
              {activeStep !== null && (
                <motion.div
                  initial={{ left: '0%' }}
                  animate={{ left: `${(activeStep / 4) * 100}%` }}
                  transition={{ duration: 0.35, ease: 'easeInOut' }}
                  className="absolute top-1/2 -translate-y-1/2 w-4 h-4 -ml-2 rounded-full bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.7)] flex items-center justify-center z-10"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* 5 Distinct Nodes */}
          <div className="grid grid-cols-5 gap-3 relative z-10 mb-2">
            {nodes.map((node, index) => {
              const isCurrentStep = activeStep === index;
              const isSelected = selectedNode === node.id;
              const Icon = node.icon;

              return (
                <button
                  key={node.id}
                  onClick={() => setSelectedNode(node.id)}
                  className={`text-left rounded-xl p-3.5 transition-all cursor-pointer flex flex-col justify-between h-36 ${
                    isSelected
                      ? 'bg-zinc-900 text-white ring-2 ring-zinc-900 shadow-md scale-[1.02]'
                      : isCurrentStep
                      ? 'bg-emerald-50/80 border-2 border-emerald-500 text-zinc-950 shadow-sm scale-[1.02]'
                      : 'bg-white border border-zinc-200/80 hover:border-zinc-300 text-zinc-900 shadow-2xs'
                  }`}
                >
                  {/* Top node info */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span
                        className={`text-[10px] font-medium tracking-tight ${
                          isSelected ? 'text-zinc-400' : 'text-zinc-400'
                        }`}
                      >
                        {node.zone}
                      </span>
                      <span
                        className={`w-2 h-2 rounded-full ${
                          node.status === 'warning'
                            ? 'bg-amber-500 ring-2 ring-amber-500/20'
                            : node.status === 'active'
                            ? 'bg-blue-500 ring-2 ring-blue-500/20 animate-pulse'
                            : 'bg-emerald-500 ring-2 ring-emerald-500/20'
                        }`}
                      />
                    </div>

                    <div className="flex items-center gap-1.5">
                      <div
                        className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                          isSelected ? 'bg-zinc-800 text-white' : 'bg-zinc-100 text-zinc-700'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      <span
                        className={`text-xs font-semibold tracking-tight truncate ${
                          isSelected ? 'text-white' : 'text-zinc-950'
                        }`}
                      >
                        {node.label}
                      </span>
                    </div>

                    <p
                      className={`text-[11px] truncate mt-1 ${
                        isSelected ? 'text-zinc-400' : 'text-zinc-500'
                      }`}
                    >
                      {node.sublabel}
                    </p>
                  </div>

                  {/* Bottom Metric */}
                  <div className="pt-2 border-t border-zinc-100/30 flex items-center justify-between mt-auto">
                    <span
                      className={`text-[11px] font-medium ${
                        isSelected
                          ? 'text-zinc-300'
                          : node.status === 'warning'
                          ? 'text-amber-600'
                          : 'text-zinc-700'
                      }`}
                    >
                      {node.metric}
                    </span>
                    <span
                      className={`text-[10px] ${
                        isSelected ? 'text-zinc-400' : 'text-zinc-400'
                      }`}
                    >
                      {isSelected ? 'Inspecté' : 'Détails'}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Remediation Autonomous Circuit Indicator */}
          {isDegraded && (
            <div className="mt-3 py-2.5 px-4 rounded-xl bg-amber-50/90 border border-amber-200 flex items-center justify-between text-xs text-amber-950 shadow-2xs">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                <span className="font-medium flex items-center gap-1.5">
                  Boucle de reprise Zero-Touch active (Zone 4 <ArrowRight className="w-3 h-3 text-amber-700 inline" /> Zone 2)
                </span>
              </div>
              <span className="text-[11px] text-amber-700 font-normal">Playbook Ansible auto-déclenché • RTO &lt; 15s</span>
            </div>
          )}
        </div>
      </div>

      {/* Live Waveform & Node Inspector (Minimalist Apple Health style) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-zinc-100">
        
        {/* Real-time Heartbeat / Waveform */}
        <div className="md:col-span-2 p-3.5 rounded-xl bg-zinc-50/70 border border-zinc-100 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-medium text-zinc-700">
                Onde de stabilité du système (Heartbeat)
              </span>
            </div>
            <span className="text-xs text-zinc-400 font-normal">
              {isDegraded ? 'Fluctuation contrôlée' : '99.98% stabilité continue'}
            </span>
          </div>

          {/* Smooth SVG Waveform */}
          <div className="h-14 w-full relative flex items-center">
            <svg
              className="w-full h-full overflow-visible"
              viewBox="0 0 500 60"
              preserveAspectRatio="none"
            >
              <defs>
                <linearGradient id="waveGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity="0.2" />
                  <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              <path
                d={
                  isDegraded
                    ? 'M 0 30 Q 50 10, 100 45 T 200 15 T 300 50 T 400 20 T 500 30'
                    : 'M 0 30 Q 60 26, 120 30 T 240 28 T 300 12 T 320 48 T 340 30 T 420 30 T 500 30'
                }
                fill="none"
                stroke={isDegraded ? '#f59e0b' : '#10b981'}
                strokeWidth="2"
                strokeLinecap="round"
              />
              <path
                d={
                  isDegraded
                    ? 'M 0 30 Q 50 10, 100 45 T 200 15 T 300 50 T 400 20 T 500 30 L 500 60 L 0 60 Z'
                    : 'M 0 30 Q 60 26, 120 30 T 240 28 T 300 12 T 320 48 T 340 30 T 420 30 T 500 30 L 500 60 L 0 60 Z'
                }
                fill="url(#waveGradient)"
              />
            </svg>
          </div>

          <div className="flex items-center justify-between text-[11px] text-zinc-400 pt-1">
            <span>T-60s</span>
            <span>Inspection continue EBIOS RM & DORA</span>
            <span>Temps réel</span>
          </div>
        </div>

        {/* Selected Node Inspector */}
        <div className="p-3.5 rounded-xl bg-zinc-50/70 border border-zinc-100 flex flex-col justify-between text-xs">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] text-zinc-400 font-medium">Nœud inspecté</span>
              <span className="text-[10px] text-zinc-500 font-normal px-2 py-0.5 bg-white rounded-md border border-zinc-200/60">
                {activeNodeData.tech}
              </span>
            </div>
            <h3 className="font-semibold text-zinc-950 text-xs">
              {activeNodeData.label} ({activeNodeData.zone})
            </h3>
            <p className="text-zinc-500 mt-1 text-[11px] leading-relaxed">
              {activeNodeData.detail}
            </p>
          </div>

          <div className="pt-2.5 mt-2 border-t border-zinc-200/60 flex items-center justify-between text-[11px]">
            <span className="text-zinc-400">Statut local :</span>
            <span className="font-medium text-emerald-600 flex items-center gap-1">
              <Check className="w-3 h-3" />
              Vérifié
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
