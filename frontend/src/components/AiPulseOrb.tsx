/**
 * @license
 * PROJECT RESILIENCE-ALPHA - Orbe de Traitement IA & Spectrogramme SOC
 * Visualisation temps réel des états de sécurité (Veille, Attaque, Synthèse RAG).
 */

import React from 'react';
import { Volume2, VolumeX, ShieldAlert, Sparkles, Activity } from 'lucide-react';

export type OrbState = 'idle' | 'attack' | 'rag';

interface AiPulseOrbProps {
  state: OrbState;
  isSpeaking: boolean;
  isMuted: boolean;
  onToggleMute: () => void;
  onTestVoice?: () => void;
  anomalyScore?: number;
}

export const AiPulseOrb: React.FC<AiPulseOrbProps> = ({
  state,
  isSpeaking,
  isMuted,
  onToggleMute,
  onTestVoice,
  anomalyScore,
}) => {
  // Détermination des styles et métadonnées selon l'état
  const config = {
    idle: {
      title: 'VEILLE SYSTÈME NOMINALE',
      subtitle: 'Surveillance télémétrique ML active • Zéro anomalie',
      badgeBg: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30',
      coreGradient: 'from-cyan-400 via-sky-500 to-blue-600',
      glowShadow: 'shadow-[0_0_40px_rgba(56,189,248,0.35)]',
      ringBorder: 'border-cyan-500/30',
      outerRingBorder: 'border-cyan-400/20',
      animationClass: 'animate-orb-idle',
      textColor: 'text-sky-400',
    },
    attack: {
      title: 'ALERTE CRITIQUE : ANOMALIE DE TRAFIC',
      subtitle: 'Attaque détectée • Confinement et remédiation Zero-Touch',
      badgeBg: 'bg-rose-500/20 text-rose-300 border-rose-500/40 animate-pulse',
      coreGradient: 'from-rose-500 via-red-600 to-red-700',
      glowShadow: 'shadow-[0_0_55px_rgba(244,63,94,0.7)]',
      ringBorder: 'border-rose-500/60',
      outerRingBorder: 'border-rose-400/30',
      animationClass: 'animate-orb-attack',
      textColor: 'text-rose-400',
    },
    rag: {
      title: 'RESTITUTION VOCALE RAG (CONSEIL)',
      subtitle: 'Analyse documentaire FAISS en cours de diffusion',
      badgeBg: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40',
      coreGradient: 'from-indigo-400 via-purple-500 to-violet-600',
      glowShadow: 'shadow-[0_0_45px_rgba(129,140,248,0.5)]',
      ringBorder: 'border-indigo-500/40',
      outerRingBorder: 'border-purple-400/20',
      animationClass: 'animate-orb-rag',
      textColor: 'text-indigo-400',
    },
  }[state];

  return (
    <div className={`relative overflow-hidden rounded-2xl bg-zinc-950 text-white p-5 border transition-all duration-500 ${
      state === 'attack' 
        ? 'border-rose-500/50 shadow-[0_0_30px_rgba(225,29,72,0.2)]' 
        : state === 'rag' 
        ? 'border-indigo-500/40 shadow-[0_0_25px_rgba(99,102,241,0.15)]' 
        : 'border-zinc-800/80 shadow-inner'
    }`}>
      {/* Grille d'arrière-plan style Control Room */}
      <div 
        className="absolute inset-0 opacity-[0.07] pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, #ffffff 1px, transparent 0)',
          backgroundSize: '20px 20px'
        }}
      />

      {/* Barre supérieure : Statut & Commandes Audio */}
      <div className="relative z-10 flex items-center justify-between gap-3 pb-3 border-b border-zinc-800/70">
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold tracking-wider uppercase border ${config.badgeBg}`}>
            {state === 'attack' ? (
              <ShieldAlert className="w-3 h-3 text-rose-400 animate-bounce" />
            ) : state === 'rag' ? (
              <Sparkles className="w-3 h-3 text-indigo-400 animate-spin" />
            ) : (
              <Activity className="w-3 h-3 text-cyan-400 animate-pulse" />
            )}
            <span>{config.title}</span>
          </span>
          {anomalyScore !== undefined && (
            <span className="hidden sm:inline-block font-mono text-[10px] text-zinc-400 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
              Score ML : <strong className={state === 'attack' ? 'text-rose-400' : 'text-emerald-400'}>{anomalyScore.toFixed(4)}</strong>
            </span>
          )}
        </div>

        {/* Boutons d'interaction audio */}
        <div className="flex items-center gap-2">
          {onTestVoice && (
            <button
              onClick={onTestVoice}
              className="text-[11px] font-medium text-zinc-400 hover:text-white px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 transition-colors cursor-pointer flex items-center gap-1.5"
              title="Tester l'alerte vocale immédiate"
            >
              <span>Test Voix</span>
            </button>
          )}

          <button
            onClick={onToggleMute}
            className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
              isMuted 
                ? 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300' 
                : 'bg-sky-500/10 border-sky-500/30 text-sky-400 hover:bg-sky-500/20'
            }`}
            title={isMuted ? 'Activer la voix de synthèse' : 'Désactiver la voix de synthèse'}
          >
            {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5 animate-pulse" />}
          </button>
        </div>
      </div>

      {/* Cœur immersif : Orbe holographique & Visualiseur de flux */}
      <div className="relative z-10 py-6 flex flex-col items-center justify-center">
        <div className="relative w-40 h-40 flex items-center justify-center">
          
          {/* Onde de choc d'attaque expansive */}
          {state === 'attack' && (
            <div className="absolute inset-0 rounded-full border-2 border-rose-500/70 animate-orb-shockwave pointer-events-none" />
          )}

          {/* Anneau extérieur tournant */}
          <div className={`absolute w-36 h-36 rounded-full border border-dashed ${config.outerRingBorder} animate-[spin_24s_linear_infinite]`} />
          
          {/* Anneau intermédiaire avec pulsation */}
          <div className={`absolute w-28 h-28 rounded-full border ${config.ringBorder} transition-all duration-700 ${
            state === 'attack' ? 'scale-110 border-rose-500/60' : 'scale-100'
          }`} />

          {/* Orbe Central avec dégradé sphérique */}
          <div className={`relative w-20 h-20 rounded-full bg-gradient-to-tr ${config.coreGradient} ${config.glowShadow} ${config.animationClass} flex items-center justify-center transition-all duration-500`}>
            {/* Noyau lumineux interne */}
            <div className="w-8 h-8 rounded-full bg-white/70 blur-[1px] animate-pulse" />
            
            {/* Ligne de balayage radar en veille */}
            {state === 'idle' && (
              <div className="absolute inset-0 rounded-full overflow-hidden pointer-events-none">
                <div className="w-full h-1/2 bg-gradient-to-b from-white/30 to-transparent origin-bottom animate-[spin_4s_linear_infinite]" />
              </div>
            )}
          </div>
        </div>

        {/* Spectrogramme audio simulé (actif pendant la synthèse RAG ou l'alerte) */}
        <div className="mt-4 flex items-center justify-center gap-1 h-7">
          {Array.from({ length: 18 }).map((_, i) => {
            const isActive = isSpeaking || state === 'attack';
            const animDuration = `${0.35 + (i % 5) * 0.12}s`;
            const animDelay = `${(i * 0.05).toFixed(2)}s`;
            const barBg = state === 'attack' 
              ? 'bg-rose-500' 
              : state === 'rag' 
              ? 'bg-indigo-400' 
              : 'bg-sky-500/40';

            return (
              <div
                key={i}
                className={`w-1 rounded-full transition-all duration-200 ${barBg}`}
                style={{
                  height: isActive ? undefined : '4px',
                  animation: isActive ? `sound-wave-bar ${animDuration} ease-in-out infinite alternate` : 'none',
                  animationDelay: animDelay,
                }}
              />
            );
          })}
        </div>

        {/* Légende didactique pour le jury */}
        <p className="mt-3 text-xs text-zinc-400 text-center max-w-sm font-normal">
          {config.subtitle}
        </p>
      </div>

      {/* Footer de télémétrie */}
      <div className="relative z-10 pt-3 border-t border-zinc-900 flex items-center justify-between text-[11px] font-mono text-zinc-500">
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span>Web Speech API : {isMuted ? 'Silencieux' : 'Actif'}</span>
        </span>
        <span>Moteur IA : Isolation Forest + Ollama RAG</span>
      </div>
    </div>
  );
};
