/**
 * @license
 * PROJECT RESILIENCE-ALPHA - Hook de Reconnaissance Vocale (Speech-to-Text)
 * Permet à l'opérateur de poser des questions à voix haute à l'assistant RAG.
 */

import { useState, useEffect, useRef, useCallback } from 'react';

interface UseVoiceRecognitionReturn {
  isListening: boolean;
  transcript: string;
  error: string | null;
  isSupported: boolean;
  startListening: (onFinal?: (text: string) => void) => void;
  stopListening: () => void;
  resetTranscript: () => void;
}

export function useVoiceRecognition(): UseVoiceRecognitionReturn {
  const [isListening, setIsListening] = useState<boolean>(false);
  const [transcript, setTranscript] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState<boolean>(false);

  const recognitionRef = useRef<any>(null);
  const onFinalCallbackRef = useRef<((text: string) => void) | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (SpeechRecognition) {
      setIsSupported(true);
      const rec = new SpeechRecognition();
      rec.lang = 'fr-FR';
      rec.continuous = false;
      rec.interimResults = true;
      rec.maxAlternatives = 1;

      rec.onstart = () => {
        setIsListening(true);
        setError(null);
      };

      rec.onresult = (event: any) => {
        let interim = '';
        let final = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const item = event.results[i];
          if (item.isFinal) {
            final += item[0].transcript;
          } else {
            interim += item[0].transcript;
          }
        }

        const currentText = final || interim;
        setTranscript(currentText);

        if (final && onFinalCallbackRef.current) {
          onFinalCallbackRef.current(final.trim());
        }
      };

      rec.onerror = (event: any) => {
        setIsListening(false);
        if (event.error === 'not-allowed') {
          setError("Microphone non autorisé par le navigateur.");
        } else if (event.error === 'no-speech') {
          setError("Aucune parole détectée.");
        } else {
          setError(`Erreur audio: ${event.error}`);
        }
      };

      rec.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = rec;
    } else {
      setIsSupported(false);
    }

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
      }
    };
  }, []);

  const startListening = useCallback((onFinal?: (text: string) => void) => {
    if (!recognitionRef.current) {
      setError("Reconnaissance vocale non supportée sur ce navigateur.");
      return;
    }

    if (onFinal) {
      onFinalCallbackRef.current = onFinal;
    }

    setTranscript('');
    setError(null);

    try {
      recognitionRef.current.start();
    } catch (e: any) {
      // Déjà démarré
      try {
        recognitionRef.current.abort();
        setTimeout(() => recognitionRef.current?.start(), 150);
      } catch {}
    }
  }, []);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      setIsListening(false);
    }
  }, []);

  const resetTranscript = useCallback(() => {
    setTranscript('');
    setError(null);
  }, []);

  return {
    isListening,
    transcript,
    error,
    isSupported,
    startListening,
    stopListening,
    resetTranscript,
  };
}
