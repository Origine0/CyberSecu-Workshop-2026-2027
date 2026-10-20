"use client";

import React, { useState } from "react";
import { CreditCard, Lock, RotateCcw } from "lucide-react";
import { sendPayment, useApiUrl, type PaymentResult } from "./_lib/api";
import { Background, ConfettiLayer, useConfetti } from "./_lib/confetti";

// Page client (route « / » de l'architecture) : passer un paiement fictif.
// Le dashboard de supervision est sur /dashboard, accessible en local uniquement.

const PRODUCTS = [
  { emoji: "☕", name: "Un café", price: 2.5 },
  { emoji: "🍕", name: "Une pizza", price: 12 },
  { emoji: "🎧", name: "Un casque", price: 79 },
  { emoji: "🚲", name: "Un vélo", price: 349 },
];

export default function CheckoutPage() {
  const apiUrl = useApiUrl();
  const [selected, setSelected] = useState(1);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PaymentResult | null>(null);
  const { particles, burst } = useConfetti();
  const product = PRODUCTS[selected];

  const pay = async () => {
    setLoading(true);
    const r = await sendPayment(apiUrl, product.price);
    setResult(r);
    if (r.ok) burst(["💸", "🎉", "✨", product.emoji]);
    setLoading(false);
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0b0920] px-4 py-10 text-slate-100">
      <Background />
      <ConfettiLayer particles={particles} />

      <main className="relative z-10 w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-fuchsia-500 via-violet-500 to-cyan-400 text-3xl shadow-lg shadow-fuchsia-500/30">
            🛍️
          </div>
          <h1 className="mt-3 text-3xl font-black tracking-tight">
            Resilience<span className="bg-gradient-to-r from-fuchsia-400 to-cyan-300 bg-clip-text text-transparent"> Pay</span>
          </h1>
          <p className="text-sm text-slate-400">La boutique Alpha • paiement 100 % fictif</p>
        </div>

        <section className="rounded-[2rem] border border-white/10 bg-white/[0.05] p-6 shadow-2xl shadow-black/40 backdrop-blur-xl">
          {result?.ok ? (
            <div className="py-6 text-center animate-pop">
              <div className="text-7xl">
                <span className="inline-block animate-float">✅</span>
              </div>
              <h2 className="mt-3 text-2xl font-black">Paiement accepté !</h2>
              <p className="mt-1 text-slate-300">
                {product.emoji} {product.name} payé {product.price.toFixed(2)} €
              </p>
              <p className="mt-3 font-mono text-xs text-slate-500">
                réf. {result.reference} • {result.latencyMs} ms
              </p>
              <button
                onClick={() => setResult(null)}
                className="mx-auto mt-6 flex items-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-5 py-2.5 font-bold transition hover:bg-white/20 active:scale-95"
              >
                <RotateCcw className="h-4 w-4" /> Acheter autre chose
              </button>
            </div>
          ) : (
            <>
              <h2 className="text-lg font-bold">Qu&apos;est-ce qui te ferait plaisir ?</h2>
              <div className="mt-4 grid grid-cols-2 gap-3">
                {PRODUCTS.map((p, i) => (
                  <button
                    key={p.name}
                    onClick={() => {
                      setSelected(i);
                      setResult(null);
                    }}
                    className={`rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 active:scale-95 ${
                      selected === i ? "border-fuchsia-400/70 bg-fuchsia-500/15 shadow-lg shadow-fuchsia-500/20" : "border-white/10 bg-black/20 hover:bg-black/30"
                    }`}
                  >
                    <div className="text-3xl">{p.emoji}</div>
                    <div className="mt-2 text-sm font-semibold">{p.name}</div>
                    <div className="text-lg font-black">{p.price.toFixed(2)} €</div>
                  </button>
                ))}
              </div>

              <button
                onClick={pay}
                disabled={loading}
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-400 py-3.5 text-lg font-black text-emerald-950 shadow-lg shadow-emerald-500/25 transition hover:scale-[1.02] active:scale-95 disabled:opacity-50"
              >
                <CreditCard className="h-5 w-5" />
                {loading ? "Paiement en cours…" : `Payer ${product.price.toFixed(2)} €`}
              </button>

              {result && !result.ok && (
                <div key={result.message} className="mt-3 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200 animate-shake">
                  🙈 {result.offline ? "Le service de paiement ne répond pas. Réessaie dans quelques secondes : il se répare tout seul !" : result.message}
                </div>
              )}
            </>
          )}
        </section>

        <p className="mt-5 flex items-center justify-center gap-1.5 text-xs text-slate-500">
          <Lock className="h-3.5 w-3.5" /> Démonstrateur EPSI • aucune vraie donnée bancaire
        </p>
      </main>
    </div>
  );
}
