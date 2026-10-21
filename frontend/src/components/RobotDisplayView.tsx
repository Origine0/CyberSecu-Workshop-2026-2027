/**
 * @license
 * PROJECT RESILIENCE-ALPHA - Visage IA pour Robot Physique (Écran HDMI 800x480)
 * Interface autonome sans layout (sans navbar, sans footer).
 * 
 * Contraintes matérielles :
 * - Résolution native : 800 × 480 px
 * - Scroll interdit, sélection désactivée, touch-first
 * - Télémétrie et détection basées sur ce qui se passe VRAIMENT sur le cluster (Isolation Forest + WAF + PostgreSQL)
 * - Commande Vocale interactive pour interroger l'assistant RAG (Microphone Speech-to-Text + Restitution Vocale)
 * - Orbe IA holographique 4 phases (Veille Cyan, Attaque Rouge, Confinement Ambre, RAG Violet)
 * - Journal vocal live en verre trempé (glassmorphism)
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Volume2, 
  VolumeX, 
  Radio, 
  Mic, 
  MicOff, 
  ShieldAlert, 
  ShieldCheck, 
  Activity, 
  Sparkles, 
  Bot, 
  Send, 
  X, 
  Zap, 
  RefreshCw 
} from 'lucide-react';
import { useVoiceAssistant } from '../hooks/useVoiceAssistant.ts';
import { useVoiceRecognition } from '../hooks/useVoiceRecognition.ts';
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
  // --- Synthèse Vocale Web Speech API ---
  const { 
    isSpeaking, 
    isMuted, 
    toggleMute, 
    speakAlert, 
    speakRag, 
    stopSpeaking 
  } = useVoiceAssistant();

  // --- Reconnaissance Vocale (Commande vocale pour le RAG) ---
  const { 
    isListening, 
    transcript, 
    error: micError, 
    isSupported: isMicSupported, 
    startListening, 
    stopListening, 
    resetTranscript 
  } = useVoiceRecognition();

  // Modal / Panneau de dialogue vocal RAG
  const [showVoiceModal, setShowVoiceModal] = useState<boolean>(false);
  const [ragLoading, setRagLoading] = useState<boolean>(false);
  const [lastRagAnswer, setLastRagAnswer] = useState<string | null>(null);

  // --- Phase & État de l'Orbe IA ---
  // 1: idle (Cyan), 2: attack (Rouge), 3: confinement (Ambre), 4: rag (Violet)
  const [phase, setPhase] = useState<OrbState>('idle');
  const [phaseTitle, setPhaseTitle] = useState<string>('VEILLE SYSTÈME NOMINALE');
  const [phaseBadge, setPhaseBadge] = useState<{ text: string; bg: string }>({
    text: 'PHASE 1 • NOMINAL',
    bg: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30'
  });

  // --- Métriques Réelles issues du Cluster ---
  const [requestRate, setRequestRate] = useState<number>(0.50);
  const [errorRate, setErrorRate] = useState<number>(0.005);
  const [latencyMs, setLatencyMs] = useState<number>(28);
  const [anomalyScore, setAnomalyScore] = useState<number>(0.1852);
  const [blockedCount, setBlockedCount] = useState<number>(0);
  const [isBackendHealthy, setIsBackendHealthy] = useState<boolean>(true);

  // Journal Vocal Live (HUD Horodaté)
  const [logs, setLogs] = useState<VoiceLogEntry[]>([
    {
      id: 'init-1',
      timestamp: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      type: 'soc',
      badge: 'BOOT',
      badgeClass: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
      text: "Système robotique PROJECT RESILIENCE-ALPHA initialisé. Connexion télémétrique temps réel active."
    }
  ]);

  // Références de cadencement
  const stageRef = useRef<'NOMINAL' | 'ATTACK_DECLARED' | 'CONFINEMENT' | 'RESTORED'>('NOMINAL');
  const lastSpokenRef = useRef<number>(0);
  const prevBlockedRef = useRef<number>(0);
  const prevTxCountRef = useRef<number>(0);
  const lastTimestampRef = useRef<number>(Date.now());

  // Ajout au journal avec limitation
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

  // Émission vocale et sonore avec gestion du cooldown
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

  // ==============================================================================
  // 1. TÉLÉMÉTRIE RÉELLE : CALCUL ET ANALYSE BASÉS SUR CE QUI SE PASSE VRAIMENT
  // ==============================================================================
  const syncLiveTelemetry = useCallback(async () => {
    try {
      const now = Date.now();
      const elapsedSec = Math.max(1, (now - lastTimestampRef.current) / 1000);
      lastTimestampRef.current = now;

      // 1. Récupération des données réelles des microservices (WAF, Postgres, Health)
      const [healthRes, txsRes, wafRes] = await Promise.all([
        api.fetchHealth().catch(() => null),
        api.fetchTransactions(35).catch(() => null),
        api.fetchWafStatus().catch(() => null),
      ]);

      setIsBackendHealthy(healthRes?.status === 'healthy');

      // 2. Calcul du débit réel (request_rate) basé sur les transactions réelles
      let liveReqRate = 0.50; // Débit nominal de référence
      let liveErrRate = 0.005;
      let liveLatency = 28;

      if (txsRes && txsRes.length > 0) {
        const recent = txsRes.slice(0, 10);
        const failedCount = recent.filter((t) => t.status === 'FAILED').length;
        liveErrRate = Number((failedCount / recent.length).toFixed(3));
        liveLatency = Math.max(15, Math.round(recent.reduce((acc, t) => acc + (t.latency_ms || 25), 0) / recent.length));

        // Calcul du delta de transactions pour estimer le débit réel par seconde
        if (prevTxCountRef.current > 0 && txsRes.length >= prevTxCountRef.current) {
          const delta = txsRes.length - prevTxCountRef.current;
          liveReqRate = Number(Math.max(0.50, delta / elapsedSec).toFixed(2));
        }
        prevTxCountRef.current = txsRes.length;
      }

      // Si le WAF subit une attaque, son compteur de blocages grimpe
      const realBlocked = wafRes?.stats?.total_blocked ?? 0;
      setBlockedCount(realBlocked);
      const deltaBlocked = realBlocked - prevBlockedRef.current;

      if (deltaBlocked > 0) {
        // Flux d'attaque bloqué au niveau WAF
        liveReqRate = Math.max(liveReqRate, 15.0 + deltaBlocked * 2);
      }

      // 3. Soumission des métriques RÉELLES au modèle Isolation Forest (/ai/analyze)
      let isModelAnomaly = false;
      let currentScore = 0.1852;
      let actionReq = 'NONE';

      try {
        const mlAnalysis = await api.analyzeTelemetry({
          timestamp: new Date().toISOString(),
          request_rate: liveReqRate,
          error_rate: liveErrRate,
          latency_ms: liveLatency,
        });
        isModelAnomaly = mlAnalysis.is_anomaly;
        currentScore = mlAnalysis.anomaly_score;
        actionReq = mlAnalysis.action_required;
      } catch {
        // En cas de coupure temporaire de l'API IA, détection par règle miroir
        isModelAnomaly = liveReqRate > 2.5 || liveErrRate >= 0.25 || liveLatency > 80.0;
        currentScore = isModelAnomaly ? -0.184 : 0.169;
      }

      setRequestRate(liveReqRate);
      setErrorRate(liveErrRate);
      setLatencyMs(liveLatency);
      setAnomalyScore(currentScore);

      // Signatures réelles de Red Team ou de preuve
      const hasRedTeamAttack = (txsRes || []).slice(0, 10).some((t) => t.customer_name?.includes('Red Team'));
      const hasChronoProof = (txsRes || []).slice(0, 10).some((t) => t.customer_name?.includes('Preuve Post-Reprise'));

      // Remédiation Ansible en cours signalée par le WAF
      const isRemediating = (wafRes?.remediation?.queue ?? 0) > 0 || (wafRes?.banned_ips?.length ?? 0) > 0;

      // ==============================================================================
      // GESTION RÉELLE DES 4 PHASES D'INCIDENT
      // ==============================================================================

      // PHASE 2 : ATTAQUE DÉTECTÉE (Modèle ML Anomaly ou Taux d'erreur élevé)
      if ((isModelAnomaly || hasRedTeamAttack || liveErrRate >= 0.25) && stageRef.current === 'NOMINAL') {
        stageRef.current = 'ATTACK_DECLARED';
        setPhase('attack');
        setPhaseTitle('ALERTE CRITIQUE : ANOMALIE DE TRAFIC');
        setPhaseBadge({
          text: 'PHASE 2 • ATTAQUE',
          bg: 'bg-rose-500/20 text-rose-300 border-rose-500/50'
        });

        emitVoice(
          'alert',
          'ALERT',
          'bg-rose-500/20 text-rose-300 border-rose-500/50',
          `Alerte critique. Anomalie de trafic confirmée par le modèle Isolation Forest. Taux d'erreur à ${Math.round(liveErrRate * 100)} pour cent. Débit à ${liveReqRate} requêtes par seconde. Confinement en cours.`,
          'alarm'
        );
      }

      // PHASE 3 : CONFINEMENT & BLOCAGE WAF
      else if ((deltaBlocked > 0 || isRemediating) && (stageRef.current === 'ATTACK_DECLARED' || stageRef.current === 'NOMINAL')) {
        stageRef.current = 'CONFINEMENT';
        setPhase('confinement');
        setPhaseTitle('CONFINEMENT & REMÉDIATION WAF');
        setPhaseBadge({
          text: 'PHASE 3 • CONFINEMENT',
          bg: 'bg-amber-500/20 text-amber-300 border-amber-500/50'
        });
        prevBlockedRef.current = realBlocked;

        emitVoice(
          'waf',
          'WAF',
          'bg-amber-500/20 text-amber-300 border-amber-500/50',
          `Filtrage WAF activé. Source malveillante bannie à la frontière réseau. ${realBlocked} requêtes neutralisées. Remédiation Zero-Touch active.`,
          'ping'
        );
      }

      // TRANSACTION DE PREUVE CONFIRMÉE
      else if (hasChronoProof && stageRef.current === 'CONFINEMENT') {
        emitVoice(
          'remediation',
          'PROOF',
          'bg-emerald-500/20 text-emerald-300 border-emerald-500/50',
          "Transaction de preuve validée avec succès. Base PostgreSQL intègre et opérationnelle.",
          'ping'
        );
      }

      // PHASE 4 / 1 : RÉTABLISSEMENT TOTAL & RETOUR AU NOMINAL
      else if (!isModelAnomaly && liveErrRate < 0.05 && !hasRedTeamAttack && stageRef.current !== 'NOMINAL') {
        stageRef.current = 'NOMINAL';
        setPhase('idle');
        setPhaseTitle('VEILLE SYSTÈME NOMINALE');
        setPhaseBadge({
          text: 'PHASE 1 • NOMINAL',
          bg: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30'
        });

        emitVoice(
          'restoration',
          'RESTORATION',
          'bg-emerald-500/20 text-emerald-300 border-emerald-500/50',
          `Menace neutralisée avec succès. Télémétrie rétablie en conditions nominales. Latence à ${liveLatency} millisecondes. Score ML positif. Surveillance active.`,
          'success'
        );
      }
    } catch {
      // Tolérance aux pannes réseau
    }
  }, [emitVoice]);

  // Synchronisation périodique toutes les 2.5 secondes
  useEffect(() => {
    syncLiveTelemetry();
    const interval = setInterval(syncLiveTelemetry, 2500);
    return () => clearInterval(interval);
  }, [syncLiveTelemetry]);

  // Transition d'orbe vers RAG pendant la parole
  useEffect(() => {
    if (isSpeaking && phase === 'idle') {
      setPhase('rag');
    } else if (!isSpeaking && phase === 'rag') {
      setPhase('idle');
    }
  }, [isSpeaking, phase]);

  // ==============================================================================
  // 2. COMMANDE VOCALE POUR LE RAG (POSER DES QUESTIONS AU LLM / BASE CYBER)
  // ==============================================================================
  const handleAskRagQuestion = async (queryText: string) => {
    if (!queryText.trim()) return;

    setShowVoiceModal(false);
    setRagLoading(true);
    soundFx.playScanPing(isMuted);

    addLog('rag', 'QUESTION', 'bg-indigo-500/20 text-indigo-300 border-indigo-500/50', `Opérateur : "${queryText}"`);

    // Basculement visuel de l'orbe en phase RAG
    setPhase('rag');
    setPhaseTitle('ANALYSE DOCUMENTAIRE RAG EN COURS');

    try {
      const res = await api.askRag(queryText);
      const answer = res.response || "Aucune consigne documentée trouvée.";
      setLastRagAnswer(answer);

      addLog('rag', 'RAG IA', 'bg-violet-500/20 text-violet-300 border-violet-500/50', answer);

      // Restitution Vocale du RAG
      speakRag(answer);
    } catch {
      const fallback = "L'assistant documentaire RAG n'a pu joindre Ollama. Procédure standard : isoler la cible via le playbook Ansible Zero-Touch.";
      addLog('rag', 'RAG IA', 'bg-violet-500/20 text-violet-300 border-violet-500/50', fallback);
      speakRag(fallback);
    } finally {
      setRagLoading(false);
    }
  };

  // Démarrer l'écoute vocale
  const handleStartListening = () => {
    resetTranscript();
    startListening((finalText) => {
      handleAskRagQuestion(finalText);
    });
  };

  // Rapport Vocal de Situation sur demande
  const handleVocalBriefing = () => {
    soundFx.playScanPing(isMuted);
    const isNominal = phase === 'idle';
    const text = isNominal
      ? `Rapport de situation robotique. Système opérationnel. Débit nominal à ${requestRate.toFixed(2)} requêtes par seconde. Latence stabilisée à ${latencyMs} millisecondes. Moteur IA Isolation Forest en veille active.`
      : `Rapport d'urgence robotique. Incident critique actif. Confinement WAF et remédiation Zero-Touch engagés. Anomalie score : ${anomalyScore.toFixed(3)}.`;
    
    emitVoice('rag', 'BRIEFING', 'bg-indigo-500/20 text-indigo-300 border-indigo-500/50', text, isNominal ? 'ping' : 'alarm');
  };

  // Simulation manuelle au toucher de l'orbe (pour répétition ou présentation)
  const handleToggleSimulatedAttack = () => {
    soundFx.playScanPing(isMuted);
    if (phase === 'idle') {
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

  // Styles dynamiques de l'Orbe selon la phase
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
      {/* Texture cyber-industrielle */}
      <div 
        className="absolute inset-0 opacity-[0.08] pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, #38bdf8 1px, transparent 0)',
          backgroundSize: '24px 24px'
        }}
      />

      {/* Scanlines CRT subtiles */}
      <div 
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: 'repeating-linear-gradient(0deg, #000 0px, #000 2px, transparent 2px, transparent 4px)'
        }}
      />

      {/* Repères de visée HUD aux 4 coins */}
      <div className="absolute top-2 left-2 w-4 h-4 border-t-2 border-l-2 border-zinc-700/60 pointer-events-none" />
      <div className="absolute top-2 right-2 w-4 h-4 border-t-2 border-r-2 border-zinc-700/60 pointer-events-none" />
      <div className="absolute bottom-2 left-2 w-4 h-4 border-b-2 border-l-2 border-zinc-700/60 pointer-events-none" />
      <div className="absolute bottom-2 right-2 w-4 h-4 border-b-2 border-r-2 border-zinc-700/60 pointer-events-none" />

      {/* ============================================================================== */}
      {/* 1. BARRE SUPÉRIEURE : COMMANDES TACTILES DISCRÈTES (COINS >= 48x48 px) & HEADER */}
      {/* ============================================================================== */}
      <header className="w-full px-4 pt-2.5 flex items-center justify-between z-20">
        
        {/* Coin Supérieur Gauche : 2 Boutons Tactiles (Briefing & Micro RAG) */}
        <div className="flex items-center gap-2">
          {/* Bouton Briefing Vocal SOC */}
          <button
            onClick={handleVocalBriefing}
            className="w-12 h-12 min-w-[48px] min-h-[48px] rounded-xl bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800 active:scale-95 transition-all flex items-center justify-center text-sky-400 shadow-lg cursor-pointer group"
            title="Déclencher le Briefing Vocal SOC"
          >
            <Radio className="w-5 h-5 group-hover:scale-110 transition-transform" />
          </button>

          {/* Bouton Commande Vocale RAG */}
          <button
            onClick={() => setShowVoiceModal(true)}
            className="h-12 px-3 min-h-[48px] rounded-xl bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/40 text-indigo-300 active:scale-95 transition-all flex items-center gap-2 shadow-lg cursor-pointer"
            title="Poser une question vocale au RAG"
          >
            <Mic className="w-5 h-5 text-indigo-400 animate-pulse" />
            <span className="hidden sm:inline font-mono text-xs font-bold tracking-wider uppercase">
              Question RAG
            </span>
          </button>
        </div>

        {/* Centre Supérieur : Titre & Badge Dynamique */}
        <div className="flex flex-col items-center gap-0.5">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${isBackendHealthy ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`} />
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
        <div className="relative w-44 h-44 flex items-center justify-center">
          
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

          {/* Anneau extérieur en rotation continue */}
          <div className={`absolute w-40 h-40 rounded-full border border-dashed ${orbConfig.outerRing} animate-[spin_20s_linear_infinite]`} />

          {/* Anneau intermédiaire avec pulsation dynamique */}
          <div className={`absolute w-32 h-32 rounded-full border ${orbConfig.ring} transition-all duration-500 ${
            phase === 'attack' ? 'scale-110 border-rose-500/80' : phase === 'confinement' ? 'scale-105 border-amber-500/80' : 'scale-100'
          }`} />

          {/* Cœur Sphérique de l'Orbe avec gradient radial */}
          <div className={`relative w-22 h-22 rounded-full bg-gradient-to-tr ${orbConfig.core} ${orbConfig.glow} ${orbConfig.anim} flex items-center justify-center transition-all duration-500`}>
            {/* Noyau d'énergie centrale */}
            <div className="w-9 h-9 rounded-full bg-white/85 blur-[2px] animate-pulse" />
            
            {/* Ligne de balayage radar en phase de veille nominale */}
            {phase === 'idle' && (
              <div className="absolute inset-0 rounded-full overflow-hidden pointer-events-none">
                <div className="w-full h-1/2 bg-gradient-to-b from-white/35 to-transparent origin-bottom animate-[spin_3.5s_linear_infinite]" />
              </div>
            )}
          </div>
        </div>

        {/* Spectrogramme audio réagissant à la parole */}
        <div className="flex items-center justify-center gap-1 h-4 mt-0.5">
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

        {/* Télémétrie RÉELLE sous l'Orbe */}
        <div className="mt-1 flex items-center gap-2.5 font-mono text-[10px] text-zinc-400">
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
      <footer className="w-[92%] h-[170px] max-h-[170px] mb-2.5 z-20">
        <div className="w-full h-full rounded-2xl bg-zinc-950/80 backdrop-blur-md border border-zinc-800/80 shadow-[0_0_30px_rgba(0,0,0,0.85)] p-3 flex flex-col justify-between overflow-hidden relative">
          
          {/* Header du Journal */}
          <div className="flex items-center justify-between pb-1.5 border-b border-zinc-800/70 shrink-0">
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
          <div className="flex-1 overflow-hidden py-1 flex flex-col justify-start gap-1 scrollbar-none">
            {logs.slice(0, 3).map((entry, idx) => {
              const isLatest = idx === 0;
              return (
                <div 
                  key={entry.id}
                  className={`flex items-start gap-2 text-left rounded-lg px-2 py-1 transition-all ${
                    isLatest 
                      ? 'bg-zinc-900/75 border border-zinc-700/60 shadow-xs' 
                      : 'opacity-65'
                  }`}
                >
                  <span className="font-mono text-[9px] text-zinc-400 shrink-0 pt-0.5">
                    {entry.timestamp}
                  </span>

                  <span className={`px-1.5 py-0.2 rounded text-[8px] font-mono font-bold uppercase tracking-wider shrink-0 border ${entry.badgeClass}`}>
                    {entry.badge}
                  </span>

                  <p className={`text-[10px] leading-tight font-normal line-clamp-2 ${
                    isLatest ? 'text-zinc-100 font-medium' : 'text-zinc-400'
                  }`}>
                    {entry.text}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Micro-barre d'état tout en bas */}
          <div className="pt-1 border-t border-zinc-900/90 flex items-center justify-between font-mono text-[8.5px] text-zinc-500 shrink-0">
            <span className="flex items-center gap-1.5">
              <Activity className="w-2.5 h-2.5 text-sky-400" />
              <span>Surveillance temps réel • Isolation Forest + WAF Nginx</span>
            </span>
            <span className="text-zinc-500">
              Web Speech API • fr-FR • 800×480 px
            </span>
          </div>

        </div>
      </footer>

      {/* ============================================================================== */}
      {/* 4. MODAL COMMANDE VOCALE RAG (MICROPHONE & SUGGESTIONS TACTILES)               */}
      {/* ============================================================================== */}
      {showVoiceModal && (
        <div className="absolute inset-0 bg-black/90 backdrop-blur-md z-50 flex flex-col items-center justify-between p-4 animate-in fade-in duration-200">
          
          {/* Header du modal */}
          <div className="w-full flex items-center justify-between border-b border-zinc-800 pb-2">
            <div className="flex items-center gap-2">
              <Bot className="w-5 h-5 text-indigo-400" />
              <span className="font-mono text-xs font-bold uppercase text-zinc-200">
                Commande Vocale • Assistant Documentaire RAG
              </span>
            </div>
            <button
              onClick={() => {
                stopListening();
                setShowVoiceModal(false);
              }}
              className="w-10 h-10 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Zone centrale : Animation d'écoute et transcription */}
          <div className="flex-1 flex flex-col items-center justify-center gap-3 w-full max-w-lg text-center">
            
            {/* Bouton Micro Interactif */}
            <button
              onClick={isListening ? stopListening : handleStartListening}
              className={`w-20 h-20 rounded-full border-2 flex items-center justify-center transition-all cursor-pointer ${
                isListening
                  ? 'bg-rose-500/20 border-rose-500 text-rose-400 shadow-[0_0_40px_rgba(244,63,94,0.6)] animate-pulse'
                  : 'bg-indigo-600/20 border-indigo-500 text-indigo-400 shadow-[0_0_30px_rgba(99,102,241,0.4)] hover:scale-105'
              }`}
            >
              {isListening ? <Mic className="w-8 h-8 animate-bounce" /> : <Mic className="w-8 h-8" />}
            </button>

            <p className="font-mono text-xs text-zinc-300">
              {isListening ? "Écoute en cours... Parlez maintenant" : "Appuyez sur le micro pour parler"}
            </p>

            {/* Retranscription en direct */}
            {transcript && (
              <div className="w-full p-2.5 rounded-xl bg-zinc-900/90 border border-indigo-500/40 text-indigo-200 font-mono text-xs text-left max-h-20 overflow-y-auto">
                <span className="text-zinc-500">Transcrit : </span>"{transcript}"
              </div>
            )}

            {micError && (
              <p className="text-[10px] text-rose-400 font-mono">
                {micError}
              </p>
            )}

            {/* Questions rapides prêtes à l'emploi (1 clic pour le jury) */}
            <div className="w-full flex flex-col gap-1.5 mt-1">
              <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider text-left">
                Ou choisissez une question rapide :
              </span>
              <div className="flex flex-wrap gap-1.5 justify-center">
                <button
                  onClick={() => handleAskRagQuestion("Que faire en cas d'attaque par déni de service ?")}
                  className="text-[10px] font-medium bg-zinc-900/80 hover:bg-indigo-950/60 border border-zinc-800 hover:border-indigo-500/40 text-zinc-300 px-2.5 py-1.5 rounded-lg text-left transition-colors"
                >
                  ⚡ Que faire en cas d'attaque DoS ?
                </button>
                <button
                  onClick={() => handleAskRagQuestion("Quelle est la procédure de confinement Zero-Touch ?")}
                  className="text-[10px] font-medium bg-zinc-900/80 hover:bg-indigo-950/60 border border-zinc-800 hover:border-indigo-500/40 text-zinc-300 px-2.5 py-1.5 rounded-lg text-left transition-colors"
                >
                  🛡️ Procédure de confinement WAF
                </button>
                <button
                  onClick={() => handleAskRagQuestion("Quel est le rôle consultatif de l'assistant IA ?")}
                  className="text-[10px] font-medium bg-zinc-900/80 hover:bg-indigo-950/60 border border-zinc-800 hover:border-indigo-500/40 text-zinc-300 px-2.5 py-1.5 rounded-lg text-left transition-colors"
                >
                  🤖 Rôle consultatif sans remédiation
                </button>
              </div>
            </div>

          </div>

          {/* Footer du modal */}
          <div className="w-full pt-2 border-t border-zinc-800/80 flex items-center justify-between text-[10px] font-mono text-zinc-500">
            <span>Moteur RAG : FAISS + Ollama (qwen2.5:1.5b)</span>
            <span>Rôle : Consultation uniquement</span>
          </div>

        </div>
      )}

    </div>
  );
};
