/**
 * @license
 * PROJECT RESILIENCE-ALPHA - Hook de Synthèse Vocale SOC (Web Speech API)
 * Voix de contrôle industriel pour annonces d'urgence et restitution RAG.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { soundFx } from '../utils/audioAlerts.ts';

export interface UseVoiceAssistantReturn {
  isSpeaking: boolean;
  isMuted: boolean;
  toggleMute: () => void;
  speakAlert: (customText?: string) => void;
  speakRag: (text: string) => void;
  stopSpeaking: () => void;
}

export function useVoiceAssistant(): UseVoiceAssistantReturn {
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('resilience_soc_voice_muted');
      return saved ? JSON.parse(saved) : false;
    } catch {
      return false;
    }
  });

  const frenchVoiceRef = useRef<SpeechSynthesisVoice | null>(null);

  // Recherche d'une voix française naturelle (ex: Hortense, Julie, Thomas, Google français)
  const resolveFrenchVoice = useCallback(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const voices = window.speechSynthesis.getVoices();
    const frVoice = voices.find(
      (v) => (v.lang.startsWith('fr') || v.lang.startsWith('FR')) && (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Premium'))
    ) || voices.find((v) => v.lang.startsWith('fr') || v.lang.startsWith('FR'));

    frenchVoiceRef.current = frVoice || null;
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    resolveFrenchVoice();
    window.speechSynthesis.onvoiceschanged = () => {
      resolveFrenchVoice();
    };

    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, [resolveFrenchVoice]);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('resilience_soc_voice_muted', JSON.stringify(next));
      } catch {}
      if (next && typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        setIsSpeaking(false);
      }
      return next;
    });
  }, []);

  const stopSpeaking = useCallback(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  }, []);

  /**
   * Annonce d'alarme critique SOC
   */
  const speakAlert = useCallback((customText?: string) => {
    if (isMuted || typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return;
    }

    // 1. Déclenchement de l'alarme sonore bitonale synthétisée
    soundFx.playEmergencyAlarm(isMuted);

    // 2. Annonce vocale
    window.speechSynthesis.cancel();
    const message = customText || "Alerte critique. Anomalie de trafic détectée. Confinement en cours.";
    const utterance = new SpeechSynthesisUtterance(message);

    if (frenchVoiceRef.current) {
      utterance.voice = frenchVoiceRef.current;
    }
    utterance.lang = 'fr-FR';
    utterance.rate = 1.05; // Ton légèrement alerte
    utterance.pitch = 0.95;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    // Décalage de 200ms pour laisser retentir le premier bip d'alarme
    setTimeout(() => {
      window.speechSynthesis.speak(utterance);
    }, 200);
  }, [isMuted]);

  /**
   * Restitution vocale fluide des réponses documentaires de l'assistant RAG
   */
  const speakRag = useCallback((text: string) => {
    if (isMuted || typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return;
    }

    window.speechSynthesis.cancel();

    // Nettoyage des balises Markdown (*, #, `, >, URLs) pour une diction naturelle
    const cleanText = text
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/#{1,6}\s+/g, '')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/>\s*/g, '')
      .replace(/•/g, ', ')
      .trim();

    if (!cleanText) return;

    soundFx.playScanPing(isMuted);

    const utterance = new SpeechSynthesisUtterance(cleanText);
    if (frenchVoiceRef.current) {
      utterance.voice = frenchVoiceRef.current;
    }
    utterance.lang = 'fr-FR';
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    window.speechSynthesis.speak(utterance);
  }, [isMuted]);

  return {
    isSpeaking,
    isMuted,
    toggleMute,
    speakAlert,
    speakRag,
    stopSpeaking,
  };
}
