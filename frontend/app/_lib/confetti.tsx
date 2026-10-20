"use client";

import React, { useCallback, useState } from "react";

interface Particle {
  id: number;
  emoji: string;
  dx: number;
  dy: number;
  rot: number;
}

export function useConfetti() {
  const [particles, setParticles] = useState<Particle[]>([]);

  const burst = useCallback((emojis: string[]) => {
    const now = Date.now();
    setParticles(
      Array.from({ length: 28 }, (_, i) => ({
        id: now + i,
        emoji: emojis[i % emojis.length],
        dx: (Math.random() - 0.5) * 520,
        dy: 120 + Math.random() * 260,
        rot: (Math.random() - 0.5) * 720,
      })),
    );
    setTimeout(() => setParticles([]), 1500);
  }, []);

  return { particles, burst };
}

export function ConfettiLayer({ particles }: { particles: Particle[] }) {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-40 z-50 flex justify-center">
      {particles.map((p) => (
        <span
          key={p.id}
          className="absolute text-2xl animate-confetti"
          style={{ "--dx": `${p.dx}px`, "--dy": `${p.dy}px`, "--rot": `${p.rot}deg` } as React.CSSProperties}
        >
          {p.emoji}
        </span>
      ))}
    </div>
  );
}

export function Background() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0">
      <div className="absolute -left-32 -top-32 h-[28rem] w-[28rem] rounded-full bg-fuchsia-600/25 blur-3xl animate-blob" />
      <div className="absolute -right-24 top-1/3 h-[26rem] w-[26rem] rounded-full bg-cyan-500/20 blur-3xl animate-blob [animation-delay:-6s]" />
      <div className="absolute bottom-[-10rem] left-1/3 h-[24rem] w-[24rem] rounded-full bg-violet-600/25 blur-3xl animate-blob [animation-delay:-12s]" />
    </div>
  );
}
