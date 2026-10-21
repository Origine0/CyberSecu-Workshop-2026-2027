/**
 * @license
 * PROJECT RESILIENCE-ALPHA - Visage IA pour Robot Physique (Écran HDMI 800x480)
 * Interface autonome sans layout (sans navbar, sans footer).
 * 
 * Contraintes matérielles :
 * - Résolution native : 800 × 480 px
 * - Scroll interdit, sélection désactivée, touch-first
 * - Orbe IA holographique 4 phases (Veille Cyan, Attaque Rouge, Confinement Ambre, RAG Violet)
 * - Journal vocal live en verre trempé (glassmorphism)
 * - Boutons tactiles discrets dans les coins (>= 48x48 px)
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Volume2, 
  VolumeX, 
  Radio, 
  ShieldAlert, 
  ShieldCheck, 
  Activity, 
  Sparkles, 
  Cpu, 
  Zap,
  CheckCircle2,
  RefreshCw
} from 'lucide-react';
import { useVoiceAssistant } from '../hooks/useVoiceAssistant.ts';
import { soundFx } from '../utils/audioAlerts.ts';
import { OrbState } from './AiPulseOrb.tsx';
import { Transaction, WafStatusResponse, AiAnalyzeResponse } from '../types/index.ts';
import * as api from '../utils/api.ts';

interface VoiceLogEntry {
  id: string;
  timestamp: string;
  type: 'alert' | 'waf' | 'remediation' | 'restoration' | 'rag' | 'soc';
  badge: string;
  badgeClass: string;
  text: string;
}

export const RobotDisplayView: React.FC = () => {
  // --- Synthèse Vocale & Audio Web Speech ---
  const { 
    isSpeaking, 
    isMuted, 
    toggleMute, 
    speakAlert, 
    speakRag, 
    stopSpeaking 
  } = useVoiceAssistant();

  // --- Phase & État du Robot ---
  // 1: idle (Cyan), 2: attack (Rouge), 3: confinement (Ambre), 4: rag (Violet)
  const [phase, setPhase] = useState<OrbState>('idle');
  const [phaseTitle, setPhaseTitle] = useState<string>('VEILLE SYSTÈME NOMINALE');
  const [phaseBadge, setPhaseBadge] = useState<{ text: string; bg: string }>({
    text: 'PHASE 1 • NOMINAL',
    bg: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30'
  });

  // Métriques télémétriques
  const [requestRate, setRequestRate] = useState<number>(0.50);
  const [errorRate, setErrorRate] = useState<number>(0.005);
  const [latencyMs, setLatencyMs] = useState<number>(28);
  const [anomalyScore, setAnomalyScore] = useState<number>(0.1852);
  const [blockedCount, setBlockedCount] = useState<number>(0);

  // Journal Vocal Live (HUD Horodaté)
  const [logs, setLogs] = useState<VoiceLogEntry[]>([
    {
      id: 'init-1',
      timestamp: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      type: 'soc',
      badge: 'BOOT',
      badgeClass: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
      text: "Système robotique PROJECT RESILIENCE-ALPHA initialisé. Résolution 800x480 HDMI active. Surveillance en veille."
    }
  ]);

  // Références de cadencement
  const stageRef = useRef<'NOMINAL' | 'ATTACK_DECLARED' | 'CONFINEMENT' | 'RESTORED'>('NOMINAL');
  const lastSpokenRef = useRef<number>(0);
  const prevBlockedRef = useRef<number>(0);
  const logContainerRef = useRef<HTMLDivElement>(null);

  // Ajout au journal avec limitation aux 6 derniers
  const addLog = useCallback((type: VoiceLogEntry['type'], badge: string, badgeClass: string, text: string) => {
    const entry: VoiceLogEntry = {
      id: `rl-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      type,
      badge,
      badgeClass,
      text,
    };
    setLogs((prev) => [entry, ...prev.slice(0, 5)]);
  }, []);

  // Émission vocale et sonore avec anti-rebond
  const emitVoice = useCallback((
    type: VoiceLogEntry['type'], 
    badge: string, 
    badgeClass: string, 
    message: string, 
    sound?: 'alarm' | 'ping' | 'success'
  ) => {
    const now = Date.now();
    lastSpokenRef.current = now;

    if (sound === 'alarm') {
      soundFx.playEmergencyAlarm(isMuted);
    } else if (sound === 'success') {
      soundFx.playRemediationSuccess(isMuted);
    } else if (sound === 'ping') {
      soundFx.playScanPing(isMuted);
    }

    addLog(type, badge, badgeClass, message);
    speakAlert(message);
  }, [isMuted, speakAlert, addLog]);

  // Synchronisation télémétrique temps réel
  const syncTelemetry = useCallback(async () => {
    try {
      const [txs, waf] = await Promise.all([
        api.fetchTransactions(15).catch(() => null),
        api.fetchWafStatus().catch(() => null)
      ]);

      const recent = txs ? txs.slice(0, 10) : [];
      const failed = recent.filter((t) => t.status === 'FAILED').length;
      const liveErrRate = recent.length > 0 ? failed / recent.length : 0.005;
      const liveLat = recent.length > 0 ? Math.round(recent.reduce((a, b) => a + b.latency_ms, 0) / recent.length) : 28;
      const blocked = waf?.stats.total_blocked ?? 0;
      setBlockedCount(blocked);

      const hasRedTeam = recent.some((t) => t.customer_name?.includes('Red Team'));
      const hasProof = recent.some((t) => t.customer_name?.includes('Preuve Post-Reprise'));
      const isThreat = liveErrRate >= 0.25 || hasRedTeam;

      // Machine à états des 4 phases
      if (isThreat && stageRef.current === 'NOMINAL') {
        // --- PHASE 2 : ATTAQUE DÉTECTÉE (ROUGE) ---
        stageRef.current = 'ATTACK_DECLARED';
        setPhase('attack');
        setPhaseTitle('ALERTE CRITIQUE : ANOMALIE DE TRAFIC');
        setPhaseBadge({
          text: 'PHASE 2 • ATTAQUE',
          bg: 'bg-rose-500/20 text-rose-300 border-rose-500/50'
        });
        setRequestRate(38.0);
        setErrorRate(liveErrRate || 0.45);
        setLatencyMs(liveLat > 100 ? liveLat : 680);
        setAnomalyScore(-0.1844);

        emitVoice(
          'alert',
          'ALERT',
          'bg-rose-500/20 text-rose-300 border-rose-500/50',
          `Alerte critique. Anomalie de trafic détectée. Taux d'erreur à ${Math.round((liveErrRate || 0.45) * 100)} pour cent. Déclenchement du confinement.`,
          'alarm'
        );
      } else if (blocked > prevBlockedRef.current && blocked > 0 && stageRef.current === 'ATTACK_DECLARED') {
        // --- PHASE 3 : CONFINEMENT & WAF (AMBRE) ---
        stageRef.current = 'CONFINEMENT';
        setPhase('confinement');
        setPhaseTitle('CONFINEMENT & REMÉDIATION WAF');
        setPhaseBadge({
          text: 'PHASE 3 • CONFINEMENT',
          bg: 'bg-amber-500/20 text-amber-300 border-amber-500/50'
        });
        prevBlockedRef.current = blocked;

        emitVoice(
          'waf',
          'WAF',
          'bg-amber-500/20 text-amber-300 border-amber-500/50',
          `Filtrage WAF activé. Source bannie à la frontière réseau. ${blocked} requêtes illégitimes interceptées.`,
          'ping'
        );
      } else if (hasProof && stageRef.current === 'CONFINEMENT') {
        // Validation transaction de preuve
        emitVoice(
          'remediation',
          'PROOF',
          'bg-emerald-500/20 text-emerald-300 border-emerald-500/50',
          "Transaction de preuve confirmée. Intégrité des données validée dans PostgreSQL.",
          'ping'
        );
      } else if (!isThreat && liveErrRate < 0.05 && stageRef.current !== 'NOMINAL') {
        // --- PHASE 4 -> RETOUR AU NOMINAL (CYAN) ---
        stageRef.current = 'NOMINAL';
        setPhase('idle');
        setPhaseTitle('VEILLE SYSTÈME NOMINALE');
        setPhaseBadge({
          text: 'PHASE 1 • NOMINAL',
          bg: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30'
        });
        setRequestRate(0.50);
        setErrorRate(0.005);
        setLatencyMs(28);
        setAnomalyScore(0.1852);

        emitVoice(
          'restoration',
          'RESTORATION',
          'bg-emerald-500/20 text-emerald-300 border-emerald-500/50',
          "Menace neutralisée. Système de paiement rétabli en conditions nominales. Surveillance active.",
          'success'
        );
      }
    } catch {
      // Mode autonome déconnecté
    }
  }, [emitVoice]);

  // Polling automatique de télémétrie toutes les 2.5 secondes
  useEffect(() => {
    syncTelemetry();
    const interval = setInterval(syncTelemetry, 2500);
    return () => clearInterval(interval);
  }, [syncTelemetry]);

  // Restitution RAG / Prise de parole vocale
  useEffect(() => {
    if (isSpeaking && phase === 'idle') {
      setPhase('rag');
      setPhaseTitle('RESTITUTION VOCALE EN COURS');
    } else if (!isSpeaking && phase === 'rag') {
      setPhase('idle');
      setPhaseTitle('VEILLE SYSTÈME NOMINALE');
    }
  }, [isSpeaking, phase]);

  // Bouton "Briefing Vocal SOC" (Coin Supérieur Gauche)
  const handleVocalBriefing = () => {
    soundFx.playScanPing(isMuted);
    const isNominal = phase === 'idle';
    const text = isNominal
      ? `Rapport de situation robotique. Système opérationnel. Débit nominal à ${requestRate.toFixed(2)} requêtes par seconde. Latence stabilisée à ${latencyMs} millisecondes. Moteur IA Isolation Forest en veille active.`
      : `Rapport d'urgence robotique. Incident actif de niveau critique. Remédiation WAF et playbook Zero-Touch engagés. Confinement de l'attaque en cours.`;
    
    emitVoice('rag', 'BRIEFING', 'bg-indigo-500/20 text-indigo-300 border-indigo-500/50', text, isNominal ? 'ping' : 'alarm');
  };

  // Simulation manuelle rapide au toucher pour la soutenance (sur l'écran tactile)
  const handleToggleSimulatedAttack = () => {
    soundFx.playScanPing(isMuted);
    if (phase === 'idle') {
      // Déclencher phase attaque
      stageRef.current = 'ATTACK_DECLARED';
      setPhase('attack');
      setPhaseTitle('ALERTE CRITIQUE : ANOMALIE DE TRAFIC');
      setPhaseBadge({
        text: 'PHASE 2 • ATTAQUE',
        bg: 'bg-rose-500/20 text-rose-300 border-rose-500/50 animate-pulse'
      });
      setRequestRate(42.0);
      setErrorRate(0.55);
      setLatencyMs(720);
      setAnomalyScore(-0.1912);

      emitVoice(
        'alert',
        'ALERT',
        'bg-rose-500/20 text-rose-300 border-rose-500/50',
        "Alerte critique. Anomalie de trafic détectée. Confinement en cours.",
        'alarm'
      );
    } else if (phase === 'attack') {
      // Passer en phase confinement WAF
      stageRef.current = 'CONFINEMENT';
      setPhase('confinement');
      setPhaseTitle('CONFINEMENT & REMÉDIATION WAF');
      setPhaseBadge({
        text: 'PHASE 3 • CONFINEMENT',
        bg: 'bg-amber-500/20 text-amber-300 border-amber-500/50 animate-pulse'
      });
      setBlockedCount((c) => c + 14);

      emitVoice(
        'waf',
        'WAF',
        'bg-amber-500/20 text-amber-300 border-amber-500/50',
        "Règle de filtrage WAF appliquée. Flux malveillant bloqué. Remédiation Zero-Touch active.",
        'ping'
      );
    } else {
      // Retour au nominal
      stageRef.current = 'NOMINAL';
      setPhase('idle');
      setPhaseTitle('VEILLE SYSTÈME NOMINALE');
      setPhaseBadge({
        text: 'PHASE 1 • NOMINAL',
        bg: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30'
      });
      setRequestRate(0.50);
      setErrorRate(0.005);
      setLatencyMs(28);
      setAnomalyScore(0.1852);

      emitVoice(
        'restoration',
        'RESTORATION',
        'bg-emerald-500/20 text-emerald-300 border-emerald-500/50',
        "Système rétabli en conditions nominales. Surveillance active.",
        'success'
      );
    }
  };

  // Configuration dynamique des styles de l'Orbe selon la phase
  const orbConfig = {
    idle: {
      core: 'from-cyan-400 via-sky-500 to-blue-600',
      glow: 'shadow-[0_0_50px_rgba(56,189,248,0.45)]',
      ring: 'border-cyan-500/30',
      outerRing: 'border-cyan-400/20',
      anim: 'animate-orb-idle',
      textColor: 'text-sky-400',
    },
    attack: {
      core: 'from-rose-500 via-red-600 to-red-700',
      glow: 'shadow-[0_0_65px_rgba(244,63,94,0.85)]',
      ring: 'border-rose-500/70',
      outerRing: 'border-rose-400/40',
      anim: 'animate-orb-attack',
      textColor: 'text-rose-400',
    },
    confinement: {
      core: 'from-amber-400 via-orange-500 to-amber-600',
      glow: 'shadow-[0_0_60px_rgba(245,158,11,0.8)]',
      ring: 'border-amber-500/70',
      outerRing: 'border-amber-400/40',
      anim: 'animate-orb-confinement',
      textColor: 'text-amber-400',
    },
    rag: {
      core: 'from-indigo-400 via-purple-500 to-violet-600',
      glow: 'shadow-[0_0_55px_rgba(129,140,248,0.7)]',
      ring: 'border-indigo-500/50',
      outerRing: 'border-purple-400/30',
      anim: 'animate-orb-rag',
      textColor: 'text-indigo-400',
    },
  }[phase];

  return (
    <div 
      className="w-screen h-screen max-w-[800px] max-h-[480px] bg-black overflow-hidden flex flex-col justify-between items-center relative select-none touch-none"
      style={{
        width: '100vw',
        height: '100vh',
        maxWidth: '800px',
        maxHeight: '480px',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        overflow: 'hidden',
        position: 'relative'
      }}
    >
      {/* Texture cyber-industrielle d'arrière-plan */}
      <div 
        className="absolute inset-0 opacity-[0.08] pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, #38bdf8 1px, transparent 0)',
          backgroundSize: '24px 24px'
        }}
      />

      {/* Lignes de scanlines subtiles CRT pour style écran Control Room */}
      <div 
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: 'repeating-linear-gradient(0deg, #000 0px, #000 2px, transparent 2px, transparent 4px)'
        }}
      />

      {/* Coins d'angles de visée style HUD */}
      <div className="absolute top-2 left-2 w-4 h-4 border-t-2 border-l-2 border-zinc-700/60 pointer-events-none" />
      <div className="absolute top-2 right-2 w-4 h-4 border-t-2 border-r-2 border-zinc-700/60 pointer-events-none" />
      <div className="absolute bottom-2 left-2 w-4 h-4 border-b-2 border-l-2 border-zinc-700/60 pointer-events-none" />
      <div className="absolute bottom-2 right-2 w-4 h-4 border-b-2 border-r-2 border-zinc-700/60 pointer-events-none" />

      {/* ============================================================================== */}
      {/* 1. BARRE SUPÉRIEURE : COMMANDES TACTILES DISCRÈTES (COINS >= 48x48 px) & HEADER */}
      {/* ============================================================================== */}
      <header className="w-full px-4 pt-3 flex items-center justify-between z-20">
        
        {/* Coin Supérieur Gauche : Bouton Tactile "Briefing Vocal SOC" (>= 48x48) */}
        <button
          onClick={handleVocalBriefing}
          className="w-12 h-12 min-w-[48px] min-h-[48px] rounded-xl bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800 active:scale-95 transition-all flex items-center justify-center text-sky-400 shadow-lg cursor-pointer group"
          title="Déclencher le Briefing Vocal SOC"
        >
          <Radio className="w-5 h-5 group-hover:scale-110 group-active:animate-ping transition-transform" />
        </button>

        {/* Centre Supérieur : Titre & Badge Dynamique */}
        <div className="flex flex-col items-center gap-1">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-mono text-[11px] font-bold tracking-widest text-zinc-300 uppercase">
              RESILIENCE-ALPHA // SOC HUD [800×480]
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold tracking-wider uppercase border transition-colors ${phaseBadge.bg}`}>
              {phaseBadge.text}
            </span>
            <span className="font-mono text-[10px] text-zinc-400 bg-zinc-900/90 px-2 py-0.5 rounded border border-zinc-800/80">
              Score ML : <strong className={phase === 'attack' ? 'text-rose-400' : phase === 'confinement' ? 'text-amber-400' : 'text-emerald-400'}>
                {anomalyScore.toFixed(4)}
              </strong>
            </span>
          </div>
        </div>

        {/* Coin Supérieur Droit : Bouton Tactile "Mute / Unmute" (>= 48x48) */}
        <button
          onClick={toggleMute}
          className={`w-12 h-12 min-w-[48px] min-h-[48px] rounded-xl border active:scale-95 transition-all flex items-center justify-center shadow-lg cursor-pointer ${
            isMuted 
              ? 'bg-zinc-900/80 border-zinc-800 text-zinc-500 hover:text-zinc-300' 
              : 'bg-sky-500/15 border-sky-500/30 text-sky-400 hover:bg-sky-500/25'
          }`}
          title={isMuted ? 'Activer la voix' : 'Couper la voix'}
        >
          {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5 animate-pulse" />}
        </button>
      </header>

      {/* ============================================================================== */}
      {/* 2. CENTRE-HAUT : L'ORBE HOLOGRAPHIQUE (TAILLE ~ w-48 h-48 / 192x192 px)         */}
      {/* ============================================================================== */}
      <section 
        onClick={handleToggleSimulatedAttack}
        className="flex-1 flex flex-col items-center justify-center relative z-10 cursor-pointer group"
        title="Appuyez sur l'Orbe pour simuler/faire progresser l'incident"
      >
        <div className="relative w-48 h-48 flex items-center justify-center">
          
          {/* Ondes de choc d'attaque (Phase 2 - Rouge) */}
          {phase === 'attack' && (
            <>
              <div className="absolute inset-0 rounded-full border-2 border-rose-500/80 animate-orb-shockwave pointer-events-none" />
              <div className="absolute inset-0 rounded-full border border-red-600/50 animate-orb-shockwave pointer-events-none" style={{ animationDelay: '0.4s' }} />
            </>
          )}

          {/* Onde de confinement WAF (Phase 3 - Ambre) */}
          {phase === 'confinement' && (
            <div className="absolute inset-0 rounded-full border-2 border-amber-500/70 animate-orb-shockwave pointer-events-none" />
          )}

          {/* Anneau extérieur en rotation continue (24s) */}
          <div className={`absolute w-44 h-44 rounded-full border border-dashed ${orbConfig.outerRing} animate-[spin_20s_linear_infinite]`} />

          {/* Anneau intermédiaire avec pulsation dynamique */}
          <div className={`absolute w-36 h-36 rounded-full border ${orbConfig.ring} transition-all duration-500 ${
            phase === 'attack' ? 'scale-110 border-rose-500/80' : phase === 'confinement' ? 'scale-105 border-amber-500/80' : 'scale-100'
          }`} />

          {/* Cœur Sphérique de l'Orbe avec gradient radial */}
          <div className={`relative w-24 h-24 rounded-full bg-gradient-to-tr ${orbConfig.core} ${orbConfig.glow} ${orbConfig.anim} flex items-center justify-center transition-all duration-500`}>
            {/* Noyau d'énergie centrale */}
            <div className="w-10 h-10 rounded-full bg-white/80 blur-[2px] animate-pulse" />
            
            {/* Ligne de balayage radar en phase de veille nominale */}
            {phase === 'idle' && (
              <div className="absolute inset-0 rounded-full overflow-hidden pointer-events-none">
                <div className="w-full h-1/2 bg-gradient-to-b from-white/35 to-transparent origin-bottom animate-[spin_3.5s_linear_infinite]" />
              </div>
            )}
          </div>
        </div>

        {/* Spectrogramme audio réagissant à la parole */}
        <div className="flex items-center justify-center gap-1 h-5 mt-1">
          {Array.from({ length: 22 }).map((_, i) => {
            const isActive = isSpeaking || phase === 'attack' || phase === 'confinement';
            const animDuration = `${0.32 + (i % 6) * 0.1}s`;
            const animDelay = `${(i * 0.04).toFixed(2)}s`;
            const barBg = phase === 'attack' 
              ? 'bg-rose-500' 
              : phase === 'confinement'
              ? 'bg-amber-400'
              : phase === 'rag' 
              ? 'bg-indigo-400' 
              : 'bg-sky-500/35';

            return (
              <div
                key={i}
                className={`w-1 rounded-full transition-all duration-200 ${barBg}`}
                style={{
                  height: isActive ? undefined : '3px',
                  animation: isActive ? `sound-wave-bar ${animDuration} ease-in-out infinite alternate` : 'none',
                  animationDelay: animDelay,
                }}
              />
            );
          })}
        </div>

        {/* Bandeau télémétrique sous l'Orbe */}
        <div className="mt-1 flex items-center gap-3 font-mono text-[10px] text-zinc-400">
          <span>DÉBIT: <strong className="text-zinc-200">{requestRate.toFixed(2)} req/s</strong></span>
          <span>•</span>
          <span>LATENCE: <strong className="text-zinc-200">{latencyMs} ms</strong></span>
          <span>•</span>
          <span>ERR: <strong className={errorRate > 0.05 ? 'text-rose-400' : 'text-zinc-200'}>{(errorRate * 100).toFixed(1)}%</strong></span>
          {blockedCount > 0 && (
            <>
              <span>•</span>
              <span>BLOCAGES WAF: <strong className="text-amber-400">{blockedCount}</strong></span>
            </>
          )}
        </div>
      </section>

      {/* ============================================================================== */}
      {/* 3. BAS DE L'ÉCRAN : JOURNAL VOCAL LIVE (VERRE TREMPÉ / GLASSMORPHISM)            */}
      {/* ============================================================================== */}
      <footer className="w-[92%] h-[175px] max-h-[175px] mb-3 z-20">
        <div className="w-full h-full rounded-2xl bg-zinc-950/80 backdrop-blur-md border border-zinc-800/80 shadow-[0_0_30px_rgba(0,0,0,0.85)] p-3 flex flex-col justify-between overflow-hidden relative">
          
          {/* Header du Journal */}
          <div className="flex items-center justify-between pb-2 border-b border-zinc-800/70 shrink-0">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-ping" />
              <span className="font-mono text-[10px] font-bold tracking-wider uppercase text-zinc-300">
                JOURNAL VOCAL LIVE • TERMINAL SOC HUD
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[9px] text-zinc-500">
                VOIX : {isMuted ? 'MUTED' : isSpeaking ? 'ÉMISSION EN COURS' : 'PRÊTE'}
              </span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            </div>
          </div>

          {/* Flux d'annonces vocales horodatées */}
          <div 
            ref={logContainerRef}
            className="flex-1 overflow-hidden py-1 flex flex-col justify-start gap-1.5 scrollbar-none"
          >
            {logs.slice(0, 3).map((entry, idx) => {
              const isLatest = idx === 0;
              return (
                <div 
                  key={entry.id}
                  className={`flex items-start gap-2 text-left rounded-lg px-2.5 py-1 transition-all ${
                    isLatest 
                      ? 'bg-zinc-900/70 border border-zinc-700/60 shadow-sm' 
                      : 'opacity-65'
                  }`}
                >
                  {/* Timestamp Monospace */}
                  <span className="font-mono text-[10px] text-zinc-400 shrink-0 pt-0.5">
                    {entry.timestamp}
                  </span>

                  {/* Badge de Type d'Événement */}
                  <span className={`px-1.5 py-0.2 rounded text-[9px] font-mono font-bold uppercase tracking-wider shrink-0 border ${entry.badgeClass}`}>
                    {entry.badge}
                  </span>

                  {/* Message Retranscrit */}
                  <p className={`text-[11px] leading-tight font-normal line-clamp-2 ${
                    isLatest ? 'text-zinc-100 font-medium' : 'text-zinc-400'
                  }`}>
                    {entry.text}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Micro-barre d'état tout en bas */}
          <div className="pt-1.5 border-t border-zinc-900/90 flex items-center justify-between font-mono text-[9px] text-zinc-500 shrink-0">
            <span className="flex items-center gap-1.5">
              <Activity className="w-2.5 h-2.5 text-sky-400" />
              <span>Surveillance temps réel 4 phases • Toucher l'orbe pour simuler</span>
            </span>
            <span className="text-zinc-500">
              Web Speech API • fr-FR • 800×480 px
            </span>
          </div>

        </div>
      </footer>
    </div>
  );
};
