"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Brain,
  CircleCheck,
  Clock,
  Compass,
  CreditCard,
  Database,
  Play,
  RefreshCw,
  Search,
  Server,
  Settings,
  Sparkles,
  Timer,
  Wrench,
  X,
} from "lucide-react";
import {
  fetchHealth,
  fetchTransactions,
  saveApiUrl,
  sendPayment,
  useApiUrl,
  type ServiceHealth,
  type TransactionItem,
} from "../_lib/api";
import { BLOCS, RISKS, RTO_SECONDS, SCENARIOS, SERVICES, type Scenario, type ServiceInfo } from "../_lib/architecture";
import { Background, ConfettiLayer, useConfetti } from "../_lib/confetti";

// ---------------------------------------------------------------------------
// Types et constantes
// ---------------------------------------------------------------------------

type DemoPhase = "IDLE" | "ATTACK" | "DETECT" | "DECIDE" | "HEAL" | "VERIFY" | "RECOVERED" | "VERIFY_FAILED";
type Tone = "green" | "amber" | "red" | "violet" | "slate";

interface Toast {
  kind: "ok" | "ko";
  text: string;
  key: number;
}

const POLL_MS = 5000;

const TONES: Record<Tone, string> = {
  green: "from-emerald-500/25 via-teal-500/10 to-transparent border-emerald-400/40",
  amber: "from-amber-500/25 via-orange-500/10 to-transparent border-amber-400/40",
  red: "from-rose-500/30 via-red-500/10 to-transparent border-rose-400/50",
  violet: "from-violet-500/25 via-fuchsia-500/10 to-transparent border-violet-400/40",
  slate: "from-slate-500/20 via-slate-500/5 to-transparent border-slate-500/30",
};

const TONE_TEXT: Record<Tone, string> = {
  green: "text-emerald-300",
  amber: "text-amber-300",
  red: "text-rose-300",
  violet: "text-violet-300",
  slate: "text-slate-300",
};

// Score d'anomalie affiché pendant la simulation (le vrai viendra du resilience-engine)
const DEMO_SCORE: Partial<Record<DemoPhase, number>> = {
  ATTACK: 0.48,
  DETECT: 0.93,
  DECIDE: 0.9,
  HEAL: 0.55,
  VERIFY: 0.22,
  RECOVERED: 0.07,
};

const STEPS = [
  {
    phase: "DETECT",
    icon: Search,
    emoji: "🕵️",
    title: "Détecter",
    text: "L'IA remarque que le trafic ne ressemble pas à d'habitude.",
    ref: "resilience-engine lit Prometheus (flux 8)",
  },
  {
    phase: "DECIDE",
    icon: Compass,
    emoji: "🧭",
    title: "Décider",
    text: "Le moteur choisit le plan de réparation adapté à l'attaque.",
    ref: "playbook Ansible remediate.yml",
  },
  {
    phase: "HEAL",
    icon: Wrench,
    emoji: "🛠️",
    title: "Réparer",
    text: "L'attaquant est bloqué et le service abîmé est relancé.",
    ref: "docker-proxy (flux 9) + liste noire du WAF (flux 10)",
  },
  {
    phase: "VERIFY",
    icon: CircleCheck,
    emoji: "🔎",
    title: "Vérifier",
    text: "Un vrai paiement test prouve que tout remarche.",
    ref: "transaction test via le WAF (flux 10)",
  },
] as const;

const PHASE_ORDER: DemoPhase[] = ["ATTACK", "DETECT", "DECIDE", "HEAL", "VERIFY", "RECOVERED"];

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  SUCCESS: { label: "✅ Accepté", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-400/30" },
  FAILED: { label: "❌ Refusé", cls: "bg-rose-500/15 text-rose-300 border-rose-400/30" },
  REJECTED_WAF: { label: "🛡️ Bloqué", cls: "bg-violet-500/15 text-violet-300 border-violet-400/30" },
  PENDING: { label: "⏳ En cours", cls: "bg-amber-500/15 text-amber-300 border-amber-400/30" },
};

const EXPOSURE_LABEL: Record<ServiceInfo["exposure"], string> = {
  réseau: "ouvert au réseau",
  local: "visible en local seulement",
  interne: "interne (invisible du réseau)",
};

// ---------------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------------

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function formatUptime(seconds: number): string {
  const s = Math.floor(seconds);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ${s % 60} s`;
  const h = Math.floor(m / 60);
  return `${h} h ${m % 60} min`;
}

function formatChrono(ms: number): string {
  const total = Math.floor(ms / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function getMood(
  phase: DemoPhase,
  scenario: Scenario,
  apiOnline: boolean | null,
  health: ServiceHealth | null,
  recoverySeconds: number | null,
): { emoji: string; title: string; text: string; tone: Tone } {
  const sc = SCENARIOS[scenario];
  switch (phase) {
    case "ATTACK":
      return { emoji: "🚨", title: `Alerte : ${sc.label.toLowerCase()} en cours ! (${sc.risk})`, text: sc.attack, tone: "red" };
    case "DETECT":
      return { emoji: "🧠", title: "L'IA a repéré l'anomalie", text: "Le modèle Isolation Forest compare le trafic à la normale : ça ne ressemble à rien de connu.", tone: "amber" };
    case "DECIDE":
      return { emoji: "🧭", title: "Choix de la riposte", text: "Le resilience-engine choisit le playbook Ansible adapté à ce type d'attaque.", tone: "amber" };
    case "HEAL":
      return { emoji: "🛠️", title: "Réparation automatique en cours", text: sc.heal, tone: "violet" };
    case "VERIFY":
      return { emoji: "🔎", title: "Vérification…", text: "Un vrai paiement passe par le WAF pour prouver que tout remarche.", tone: "violet" };
    case "RECOVERED":
      return {
        emoji: "🎉",
        title: "Réparé tout seul !",
        text: `Service rétabli en ${recoverySeconds ?? "?"} s (objectif ${RTO_SECONDS / 60} min), preuve à l'appui : un nouveau paiement vient de passer.`,
        tone: "green",
      };
    case "VERIFY_FAILED":
      return { emoji: "😬", title: "La vérification a échoué", text: "Le paiement test n'est pas passé : l'API ne répond pas. Vérifie que les conteneurs tournent.", tone: "red" };
  }
  if (apiOnline === null) return { emoji: "🤔", title: "Je vérifie…", text: "Connexion à l'API de paiement en cours.", tone: "slate" };
  if (!apiOnline)
    return { emoji: "😵", title: "L'API ne répond pas", text: "Lance les conteneurs (docker compose up), puis vérifie l'adresse dans les réglages ⚙️.", tone: "red" };
  if (health && (health.status !== "UP" || health.database !== "healthy"))
    return { emoji: "🤒", title: "Quelque chose cloche", text: "L'API répond, mais la base de données a un souci.", tone: "amber" };
  return { emoji: "😎", title: "Tout roule !", text: "Les paiements passent, la base répond, rien à signaler.", tone: "green" };
}

// ---------------------------------------------------------------------------
// Petits composants
// ---------------------------------------------------------------------------

function Card({
  zone,
  color,
  title,
  subtitle,
  className = "",
  children,
}: {
  zone: string;
  color: string;
  title: string;
  subtitle: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`relative rounded-3xl border border-white/10 bg-white/[0.04] p-5 sm:p-6 shadow-2xl shadow-black/30 backdrop-blur-xl transition hover:border-white/20 ${className}`}>
      <div className="mb-4">
        <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold ${color}`}>{zone}</span>
        <h2 className="mt-2 text-xl font-bold tracking-tight text-white">{title}</h2>
        <p className="mt-1 text-sm text-slate-400">{subtitle}</p>
      </div>
      {children}
    </section>
  );
}

function StatusTile({
  icon: Icon,
  label,
  value,
  hint,
  state,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint: string;
  state: "ok" | "ko" | "soon" | "neutral";
}) {
  const dot = { ok: "bg-emerald-400", ko: "bg-rose-500", soon: "bg-slate-500", neutral: "bg-sky-400" }[state];
  const text = { ok: "text-emerald-300", ko: "text-rose-300", soon: "text-slate-400", neutral: "text-sky-200" }[state];
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-3.5 transition hover:-translate-y-0.5 hover:bg-black/30">
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>{label}</span>
        <Icon className="h-4 w-4" />
      </div>
      <div className={`mt-1.5 flex items-center gap-2 text-base font-bold ${text}`}>
        <span className={`h-2.5 w-2.5 rounded-full ${dot} ${state === "ok" ? "animate-pulse" : ""}`} />
        {value}
      </div>
      <div className="mt-1 text-[11px] text-slate-500">{hint}</div>
    </div>
  );
}

function AnomalyGauge({ score, simulated }: { score: number | null; simulated: boolean }) {
  const pct = score === null ? 0 : Math.round(score * 100);
  const label = score === null ? "—" : score < 0.4 ? "😌 Calme" : score < 0.7 ? "🤨 Suspect" : "😱 Attaque !";
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold text-slate-200">Score d&apos;anomalie</span>
        <span className="font-mono text-slate-300">{score === null ? "en attente" : score.toFixed(2)}</span>
      </div>
      <div className="relative mt-3 h-4 overflow-hidden rounded-full bg-gradient-to-r from-emerald-500/30 via-amber-500/30 to-rose-500/40">
        <div
          className={`h-full rounded-full bg-gradient-to-r from-emerald-400 via-amber-400 to-rose-500 transition-all duration-700 ${score === null ? "opacity-0" : ""}`}
          style={{ width: `${pct}%` }}
        />
        <div className="absolute inset-y-0 left-[70%] w-0.5 bg-white/60" title="Seuil d'alerte" />
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
        <span>calme</span>
        <span className="text-base font-bold text-white">{label}</span>
        <span>attaque</span>
      </div>
      <p className="mt-3 text-[11px] text-slate-500">
        {simulated
          ? "🎬 Valeur simulée pour la démo."
          : "Pas encore branché : le vrai score viendra du resilience-engine (flux 8 → 11 du schéma)."}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const apiUrl = useApiUrl();
  const [draftUrl, setDraftUrl] = useState("");
  const [showSettings, setShowSettings] = useState(false);

  const [health, setHealth] = useState<ServiceHealth | null>(null);
  const [apiOnline, setApiOnline] = useState<boolean | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);

  const [payAmount, setPayAmount] = useState<number>(42);
  const [simulateFailure, setSimulateFailure] = useState(false);
  const [payLoading, setPayLoading] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const { particles, burst } = useConfetti();

  const [scenario, setScenario] = useState<Scenario>("flood");
  const [phase, setPhase] = useState<DemoPhase>("IDLE");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [recoverySeconds, setRecoverySeconds] = useState<number | null>(null);
  const [attackRate, setAttackRate] = useState(0);
  const demoRun = useRef(0);
  const demoStart = useRef(0);

  // --- Réglages
  const toggleSettings = () => {
    if (!showSettings) setDraftUrl(apiUrl);
    setShowSettings((v) => !v);
  };

  // --- Données réelles de l'API
  const checkHealth = useCallback(async () => {
    setHealthLoading(true);
    const h = await fetchHealth(apiUrl);
    setHealth(h);
    setApiOnline(h !== null);
    setHealthLoading(false);
  }, [apiUrl]);

  const loadTransactions = useCallback(async () => {
    const rows = await fetchTransactions(apiUrl);
    if (rows) setTransactions(rows);
  }, [apiUrl]);

  useEffect(() => {
    const tick = () => {
      checkHealth();
      loadTransactions();
    };
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, POLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [checkHealth, loadTransactions]);

  // --- Paiement (réutilisé par la démo pour la vérification)
  const pay = async (amount: number, failure: boolean): Promise<boolean> => {
    const r = await sendPayment(apiUrl, amount, failure);
    setToast({
      kind: r.ok ? "ok" : "ko",
      text: r.ok ? `Paiement de ${amount.toFixed(2)} € accepté en ${r.latencyMs} ms (réf. ${r.reference})` : r.offline ? r.message : `Paiement refusé : ${r.message}`,
      key: Date.now(),
    });
    if (r.ok) burst(["💸", "🎉", "✨", "💳"]);
    loadTransactions();
    return r.ok;
  };

  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault();
    setPayLoading(true);
    await pay(Number(payAmount), simulateFailure);
    setPayLoading(false);
  };

  // --- Démo racontée : attaque -> détection -> décision -> réparation -> vérification
  const isDemoRunning = phase !== "IDLE" && phase !== "RECOVERED" && phase !== "VERIFY_FAILED";

  useEffect(() => {
    if (!isDemoRunning) return;
    const id = setInterval(() => setElapsedMs(Date.now() - demoStart.current), 100);
    return () => clearInterval(id);
  }, [isDemoRunning]);

  useEffect(() => {
    if (phase !== "ATTACK" && phase !== "DETECT") return;
    const step = scenario === "flood" ? 180 : 40;
    const max = scenario === "flood" ? 2400 : 600;
    const id = setInterval(() => setAttackRate((v) => Math.min(v + step + Math.floor(Math.random() * step), max)), 200);
    return () => clearInterval(id);
  }, [phase, scenario]);

  const runDemo = async () => {
    const run = ++demoRun.current;
    const still = () => demoRun.current === run;
    demoStart.current = Date.now();
    setElapsedMs(0);
    setRecoverySeconds(null);
    setAttackRate(0);

    const sequence: [DemoPhase, number][] = [
      ["ATTACK", 2800],
      ["DETECT", 2400],
      ["DECIDE", 1800],
      ["HEAL", 2600],
    ];
    for (const [p, ms] of sequence) {
      setPhase(p);
      await wait(ms);
      if (!still()) return;
    }
    setPhase("VERIFY");
    const ok = await pay(1, false);
    if (!still()) return;
    const total = Date.now() - demoStart.current;
    setElapsedMs(total);
    if (ok) {
      setRecoverySeconds(Math.round(total / 100) / 10);
      setPhase("RECOVERED");
      burst(["🎉", "🛡️", "✨", "🥳"]);
    } else {
      setPhase("VERIFY_FAILED");
    }
  };

  const resetDemo = () => {
    demoRun.current++;
    setPhase("IDLE");
    setElapsedMs(0);
    setRecoverySeconds(null);
  };

  // --- Valeurs dérivées
  const mood = getMood(phase, scenario, apiOnline, health, recoverySeconds);
  const demoScore = DEMO_SCORE[phase] ?? null;
  const currentStep = PHASE_ORDER.indexOf(phase);
  const activeRisk = SCENARIOS[scenario].risk;
  const successCount = transactions.filter((t) => t.status === "SUCCESS").length;
  const successRate = transactions.length ? Math.round((successCount / transactions.length) * 100) : null;
  const avgLatency = transactions.length ? Math.round(transactions.reduce((sum, t) => sum + t.latency_ms, 0) / transactions.length) : null;
  const dbOk = health?.database === "healthy";

  const liveState = (s: ServiceInfo): "ok" | "ko" | "soon" => {
    if (s.live === "web") return "ok";
    if (s.live === "api") return apiOnline ? "ok" : apiOnline === false ? "ko" : "soon";
    if (s.live === "db") return health ? (dbOk ? "ok" : "ko") : "soon";
    return "soon";
  };
  const connected = SERVICES.filter((s) => liveState(s) === "ok").length;

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0b0920] text-slate-100">
      <Background />
      <ConfettiLayer particles={particles} />

      <div className="relative z-10 mx-auto flex min-h-screen max-w-7xl flex-col gap-6 px-4 py-5 sm:px-6">
        {/* ================= EN-TÊTE ================= */}
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-fuchsia-500 via-violet-500 to-cyan-400 text-2xl shadow-lg shadow-fuchsia-500/30">
              🛡️
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight">
                Resilience<span className="bg-gradient-to-r from-fuchsia-400 to-cyan-300 bg-clip-text text-transparent">-Alpha</span>
                <span className="ml-2 align-middle text-xs font-semibold text-slate-400">supervision</span>
              </h1>
              <p className="text-sm text-slate-400">La plateforme de paiement qui se répare toute seule</p>
            </div>
          </div>

          <div className="relative flex items-center gap-2">
            <Link
              href="/"
              className="hidden items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold transition hover:bg-white/10 sm:flex"
            >
              <CreditCard className="h-3.5 w-3.5" /> Page client
            </Link>
            <span
              className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${
                apiOnline ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-300" : apiOnline === false ? "border-rose-400/40 bg-rose-500/10 text-rose-300" : "border-white/10 text-slate-400"
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${apiOnline ? "bg-emerald-400 animate-pulse" : apiOnline === false ? "bg-rose-500" : "bg-slate-500"}`} />
              {apiOnline ? "API connectée" : apiOnline === false ? "API injoignable" : "Connexion…"}
            </span>
            <button
              onClick={checkHealth}
              className="rounded-full border border-white/10 bg-white/5 p-2 transition hover:bg-white/10 active:scale-90"
              aria-label="Revérifier l'API"
              title="Revérifier l'API"
            >
              <RefreshCw className={`h-4 w-4 ${healthLoading ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={toggleSettings}
              className="rounded-full border border-white/10 bg-white/5 p-2 transition hover:rotate-45 hover:bg-white/10 active:scale-90"
              aria-label="Réglages"
              title="Réglages"
            >
              <Settings className="h-4 w-4" />
            </button>

            {showSettings && (
              <div className="absolute right-0 top-12 z-40 w-80 rounded-2xl border border-white/10 bg-[#15123a]/95 p-4 shadow-2xl backdrop-blur-xl animate-pop">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-bold">⚙️ Adresse de l&apos;API</span>
                  <button onClick={() => setShowSettings(false)} aria-label="Fermer">
                    <X className="h-4 w-4 text-slate-400 hover:text-white" />
                  </button>
                </div>
                <input
                  value={draftUrl}
                  onChange={(e) => setDraftUrl(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 font-mono text-sm outline-none focus:border-fuchsia-400"
                  placeholder="http://localhost:8000"
                />
                <button
                  onClick={() => {
                    saveApiUrl(draftUrl);
                    setShowSettings(false);
                  }}
                  className="mt-3 w-full rounded-xl bg-gradient-to-r from-fuchsia-500 to-violet-500 py-2 text-sm font-bold transition hover:brightness-110 active:scale-95"
                >
                  Enregistrer
                </button>
              </div>
            )}
          </div>
        </header>

        {/* ================= ÉTAT GÉNÉRAL ================= */}
        <section
          aria-live="polite"
          className={`relative overflow-hidden rounded-[2rem] border bg-gradient-to-br ${TONES[mood.tone]} p-6 sm:p-8 shadow-2xl backdrop-blur-xl transition-colors duration-500 ${
            phase === "ATTACK" ? "animate-siren" : ""
          }`}
        >
          <div className="flex flex-col items-center gap-6 md:flex-row">
            <div key={mood.emoji} className="text-7xl sm:text-8xl animate-pop">
              <span className="inline-block animate-float">{mood.emoji}</span>
            </div>
            <div className="flex-1 text-center md:text-left">
              <p className={`text-xs font-bold uppercase tracking-[0.2em] ${TONE_TEXT[mood.tone]}`}>État de la plateforme</p>
              <h2 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">{mood.title}</h2>
              <p className="mt-2 max-w-2xl text-slate-300">{mood.text}</p>
              {(phase === "ATTACK" || phase === "DETECT") && (
                <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-rose-500/20 px-3 py-1 font-mono text-sm text-rose-200">
                  ⚡ {attackRate.toLocaleString("fr-FR")} {SCENARIOS[scenario].unit}
                </p>
              )}
            </div>
            <div className="flex w-full flex-col items-center gap-3 md:w-auto">
              <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/30 px-4 py-2 font-mono text-2xl font-bold">
                <Timer className="h-5 w-5 text-fuchsia-300" />
                {formatChrono(elapsedMs)}
              </div>
              {phase === "IDLE" ? (
                <>
                  <div className="flex gap-1 rounded-2xl border border-white/10 bg-black/30 p-1" role="radiogroup" aria-label="Scénario d'attaque">
                    {(Object.keys(SCENARIOS) as Scenario[]).map((key) => (
                      <button
                        key={key}
                        role="radio"
                        aria-checked={scenario === key}
                        onClick={() => setScenario(key)}
                        className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                          scenario === key ? "bg-white/15 text-white" : "text-slate-400 hover:text-white"
                        }`}
                      >
                        {SCENARIOS[key].emoji} {SCENARIOS[key].label} ({SCENARIOS[key].risk})
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={runDemo}
                    className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-rose-500 via-fuchsia-500 to-violet-500 px-6 py-3 text-base font-black shadow-lg shadow-fuchsia-500/30 transition hover:scale-105 active:scale-95"
                  >
                    <Play className="h-5 w-5 fill-current" /> Lancer la démo
                  </button>
                </>
              ) : (
                <button
                  onClick={resetDemo}
                  disabled={phase === "VERIFY"}
                  className="flex items-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-6 py-3 text-base font-bold transition hover:bg-white/20 active:scale-95 disabled:opacity-50"
                >
                  <RefreshCw className="h-5 w-5" /> {isDemoRunning ? "Arrêter" : "Recommencer"}
                </button>
              )}
              <p className="max-w-[16rem] text-center text-[11px] text-slate-400">
                🎬 Simulation pour expliquer le principe. Seule la vérification finale fait un vrai paiement.
              </p>
            </div>
          </div>
        </section>

        {/* ================= LES ZONES ================= */}
        <main className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
          {/* ZONE 1 — Santé */}
          <Card
            zone="1 · Santé"
            color="bg-sky-500/15 text-sky-300"
            title="Est-ce que tout est en ligne ?"
            subtitle="Les 13 conteneurs du schéma d'architecture. Vert = ça marche, rouge = en panne, gris = pas encore branché."
          >
            <div className="grid grid-cols-3 gap-3">
              <StatusTile
                icon={Server}
                label="Paiements"
                value={apiOnline ? "En ligne" : apiOnline === false ? "Hors ligne" : "…"}
                hint="API payment"
                state={apiOnline ? "ok" : apiOnline === false ? "ko" : "neutral"}
              />
              <StatusTile
                icon={Database}
                label="Base de données"
                value={health ? (dbOk ? "En forme" : "En panne") : "Inconnue"}
                hint="PostgreSQL"
                state={health ? (dbOk ? "ok" : "ko") : "soon"}
              />
              <StatusTile icon={Clock} label="Allumé depuis" value={health ? formatUptime(health.uptime_seconds) : "—"} hint="Dernier démarrage" state="neutral" />
            </div>

            <div className="mt-4 space-y-3">
              {BLOCS.map((bloc) => (
                <div key={bloc.name}>
                  <div className={`mb-1.5 text-xs font-bold ${bloc.color}`}>
                    {bloc.emoji} {bloc.name}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {SERVICES.filter((s) => s.bloc === bloc.name).map((s) => {
                      const st = liveState(s);
                      return (
                        <span
                          key={s.name}
                          title={`${s.role} • port ${s.port} • ${EXPOSURE_LABEL[s.exposure]} • ${s.owner}`}
                          className={`flex cursor-help items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-xs transition hover:scale-105 ${
                            st === "ok"
                              ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
                              : st === "ko"
                                ? "border-rose-400/40 bg-rose-500/10 text-rose-200"
                                : "border-white/10 bg-white/[0.03] text-slate-400"
                          }`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${st === "ok" ? "bg-emerald-400" : st === "ko" ? "bg-rose-500" : "bg-slate-500"}`} />
                          {s.name}
                          {s.exposure === "réseau" && <span title="Seul port ouvert au réseau">🌐</span>}
                        </span>
                      );
                    })}
                  </div>
                </div>
              ))}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-bold text-emerald-200">🔐 Secrets</span>
                <span
                  title="Mots de passe PostgreSQL et clés JWT chiffrés avec SOPS, distribués dans /run/secrets (flux 13)"
                  className="flex cursor-help items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 font-mono text-xs text-slate-400"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-slate-500" /> SOPS + age
                </span>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-xs">
              <span className="text-slate-300">
                <b className="text-white">{connected} / {SERVICES.length}</b> conteneurs branchés au dashboard
              </span>
              <span className="text-slate-400">🌐 seul le port 80 du WAF est ouvert au réseau</span>
            </div>
          </Card>

          {/* ZONE 2 — Paiements */}
          <Card
            zone="2 · Paiements"
            color="bg-emerald-500/15 text-emerald-300"
            title="Faire un paiement test"
            subtitle="Teste la plateforme comme un vrai client. Les paiements arrivent en dessous, en direct depuis la base."
          >
            <form onSubmit={handlePay} className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="flex flex-wrap items-center gap-2">
                {[10, 42, 99, 250].map((v) => (
                  <button
                    type="button"
                    key={v}
                    onClick={() => setPayAmount(v)}
                    className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition active:scale-95 ${
                      payAmount === v ? "border-emerald-400 bg-emerald-500/20 text-emerald-200" : "border-white/10 bg-white/5 hover:bg-white/10"
                    }`}
                  >
                    {v} €
                  </button>
                ))}
                <div className="flex items-center rounded-full border border-white/10 bg-white/5 pl-3">
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    value={payAmount}
                    onChange={(e) => setPayAmount(parseFloat(e.target.value) || 0)}
                    className="w-20 bg-transparent py-1.5 text-sm font-semibold outline-none"
                    aria-label="Montant en euros"
                  />
                  <span className="pr-3 text-sm text-slate-400">€</span>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <label className="flex cursor-pointer items-center gap-3 text-sm">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={simulateFailure}
                    onClick={() => setSimulateFailure((v) => !v)}
                    className={`relative h-6 w-11 rounded-full transition ${simulateFailure ? "bg-rose-500" : "bg-white/15"}`}
                  >
                    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${simulateFailure ? "left-[22px]" : "left-0.5"}`} />
                  </button>
                  <span className={simulateFailure ? "font-semibold text-rose-300" : "text-slate-300"}>
                    {simulateFailure ? "💥 Simuler une panne" : "Paiement normal"}
                  </span>
                </label>
                <button
                  type="submit"
                  disabled={payLoading}
                  className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-400 px-5 py-2.5 font-black text-emerald-950 shadow-lg shadow-emerald-500/20 transition hover:scale-105 active:scale-95 disabled:opacity-50"
                >
                  <CreditCard className="h-5 w-5" />
                  {payLoading ? "Paiement…" : `Payer ${Number(payAmount).toFixed(2)} €`}
                </button>
              </div>

              {toast && (
                <div
                  key={toast.key}
                  className={`mt-3 rounded-xl border px-3 py-2 text-sm ${
                    toast.kind === "ok" ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200 animate-pop" : "border-rose-400/30 bg-rose-500/10 text-rose-200 animate-shake"
                  }`}
                >
                  {toast.kind === "ok" ? "🎉 " : "🙈 "}
                  {toast.text}
                </div>
              )}
            </form>

            <div className="mt-4 grid grid-cols-2 gap-3 text-center">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                <div className="text-2xl font-black text-emerald-300">{successRate === null ? "—" : `${successRate} %`}</div>
                <div className="text-xs text-slate-400">de paiements acceptés</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                <div className="text-2xl font-black text-sky-300">{avgLatency === null ? "—" : `${avgLatency} ms`}</div>
                <div className="text-xs text-slate-400">temps de réponse moyen</div>
              </div>
            </div>

            <ul className="mt-4 max-h-56 space-y-2 overflow-y-auto pr-1">
              {transactions.length === 0 && (
                <li className="rounded-2xl border border-dashed border-white/10 p-4 text-center text-sm text-slate-400">
                  Aucun paiement pour l&apos;instant. Fais le premier ! 👆
                </li>
              )}
              {transactions.map((tx) => {
                const st = STATUS_LABEL[tx.status] ?? { label: tx.status, cls: "bg-white/5 text-slate-300 border-white/10" };
                return (
                  <li key={tx.id} className="flex items-center justify-between gap-3 rounded-2xl border border-white/5 bg-white/[0.03] px-3 py-2 text-sm animate-pop">
                    <div className="min-w-0">
                      <div className="font-bold">
                        {tx.amount.toFixed(2)} {tx.currency === "EUR" ? "€" : tx.currency}
                      </div>
                      <div className="truncate font-mono text-[11px] text-slate-500">
                        {tx.time} · {tx.reference}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="font-mono text-xs text-slate-400">{tx.latency_ms} ms</span>
                      <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${st.cls}`}>{st.label}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>

          {/* ZONE 3 — Détecteur */}
          <Card
            zone="3 · Détecteur IA"
            color="bg-amber-500/15 text-amber-300"
            title="Le détecteur d'attaques"
            subtitle="Une IA apprend à quoi ressemble le trafic normal. Quand ça dérape, le score monte."
          >
            <AnomalyGauge score={demoScore} simulated={demoScore !== null} />
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Brain className="h-4 w-4 text-amber-300" /> Le modèle
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  <b className="text-slate-200">Isolation Forest</b>, dans le resilience-engine : il repère ce qui est « isolé » du comportement habituel, sans règle écrite à la main.
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Sparkles className="h-4 w-4 text-violet-300" /> L&apos;assistant
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  Qwen 2.5 1.5B via Ollama répond aux opérateurs à partir de nos procédures. Lecture seule : il ne répare rien. <span className="text-slate-500">(à brancher)</span>
                </p>
              </div>
            </div>
          </Card>

          {/* ZONE 4 — Réparation */}
          <Card
            zone="4 · Réparation auto"
            color="bg-fuchsia-500/15 text-fuchsia-300"
            title="La réparation automatique"
            subtitle="Les 4 étapes que le resilience-engine enchaîne seul quand la plateforme est attaquée."
          >
            <ol className="space-y-3">
              {STEPS.map((step, i) => {
                const stepIndex = i + 1; // 0 = ATTACK dans PHASE_ORDER
                const reached = phase === "VERIFY_FAILED" ? PHASE_ORDER.indexOf("VERIFY") : currentStep;
                const done = phase === "RECOVERED" || reached > stepIndex;
                const active = currentStep === stepIndex;
                const failed = phase === "VERIFY_FAILED" && step.phase === "VERIFY";
                return (
                  <li
                    key={step.phase}
                    className={`flex items-center gap-4 rounded-2xl border p-3 transition-all duration-500 ${
                      failed
                        ? "border-rose-400/50 bg-rose-500/10"
                        : active
                          ? "scale-[1.02] border-fuchsia-400/60 bg-fuchsia-500/15 shadow-lg shadow-fuchsia-500/20"
                          : done
                            ? "border-emerald-400/30 bg-emerald-500/10"
                            : "border-white/10 bg-black/20"
                    }`}
                  >
                    <div
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xl ${
                        active ? "bg-fuchsia-500/30 animate-pulse" : done ? "bg-emerald-500/25" : "bg-white/5"
                      }`}
                    >
                      {failed ? "❌" : done ? "✅" : step.emoji}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 font-bold">
                        <step.icon className="h-4 w-4 text-slate-400" />
                        {i + 1}. {step.title}
                      </div>
                      <p className="text-xs text-slate-400">{step.text}</p>
                      <p className="mt-0.5 font-mono text-[10px] text-slate-500">↳ {step.ref}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                <div className="text-sm font-bold">⏱️ Clip Chrono</div>
                <div className="text-[11px] text-slate-400">Attaque → preuve, sans coupe</div>
                <div
                  className={`mt-1 font-mono text-lg font-black ${
                    recoverySeconds !== null ? (recoverySeconds <= 60 ? "text-emerald-300" : "text-rose-300") : "text-slate-400"
                  }`}
                >
                  {recoverySeconds !== null ? `${recoverySeconds} s` : "60 s max"}
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                <div className="text-sm font-bold">🎯 Objectif de reprise</div>
                <div className="text-[11px] text-slate-400">RTO proposé (à confirmer dans le PCA)</div>
                <div className="mt-1 font-mono text-lg font-black text-sky-300">{RTO_SECONDS / 60} min</div>
              </div>
            </div>
          </Card>

          {/* ZONE 5 — Risques EBIOS */}
          <Card
            zone="5 · Risques (EBIOS RM)"
            color="bg-rose-500/15 text-rose-300"
            title="Ce qu'on redoute, et comment on s'en protège"
            subtitle="Les 7 événements redoutés de notre analyse de risques. G4 = critique, G3 = grave. 🎬 = montré pendant la démo."
            className="lg:col-span-2"
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {RISKS.map((r) => {
                const underAttack = isDemoRunning && r.id === activeRisk;
                const handled = phase === "RECOVERED" && r.id === activeRisk;
                return (
                  <div
                    key={r.id}
                    className={`rounded-2xl border p-4 transition-all duration-500 ${
                      underAttack
                        ? "scale-[1.03] border-rose-400/70 bg-rose-500/15 animate-siren"
                        : handled
                          ? "border-emerald-400/50 bg-emerald-500/10"
                          : "border-white/10 bg-black/20 hover:-translate-y-0.5"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-2xl">{r.emoji}</span>
                      <div className="flex items-center gap-1.5">
                        {r.scenario && <span title="Montré pendant la démo">🎬</span>}
                        <span className="font-mono text-[11px] text-slate-500">{r.id}</span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-black ${
                            r.gravity === 4 ? "bg-rose-500/25 text-rose-200" : "bg-orange-500/20 text-orange-200"
                          }`}
                        >
                          G{r.gravity}
                        </span>
                      </div>
                    </div>
                    <div className="mt-2 text-sm font-bold leading-snug">{r.title}</div>
                    <div className="mt-1.5 text-[11px] text-slate-400">🛡️ {r.protection}</div>
                    {(underAttack || handled) && (
                      <div className={`mt-2 text-xs font-bold ${underAttack ? "text-rose-300" : "text-emerald-300"}`}>
                        {underAttack ? "🔴 Attaque en cours" : "✅ Maîtrisé automatiquement"}
                      </div>
                    )}
                  </div>
                );
              })}
              <div className="flex flex-col justify-center rounded-2xl border border-dashed border-white/15 p-4 text-xs text-slate-400">
                <b className="text-slate-200">À retenir :</b> les risques les plus graves (G4) ne sont pas ceux de la démo. On les évite dès la conception de
                l&apos;architecture.
              </div>
            </div>
          </Card>
        </main>

        {/* ================= LEXIQUE ================= */}
        <footer className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-xl">
          <h3 className="text-sm font-bold text-slate-300">📖 Petit lexique</h3>
          <dl className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {[
              ["API", "La porte d'entrée de la plateforme : c'est elle qui reçoit les demandes de paiement."],
              ["WAF", "Un videur devant la porte : il refuse les requêtes qui ont l'air malveillantes."],
              ["Score d'anomalie", "Une note de 0 à 1 donnée par l'IA : plus elle est haute, plus le trafic est bizarre."],
              ["Remédiation", "La réparation automatique : bloquer l'attaquant, relancer, puis vérifier."],
              ["SOPS", "Le coffre-fort chiffré où sont rangés les mots de passe et les clés."],
              ["EBIOS RM", "La méthode de l'ANSSI pour lister ce qu'on redoute et s'en protéger."],
            ].map(([term, def]) => (
              <div key={term} className="rounded-2xl bg-black/20 p-3">
                <dt className="font-bold text-fuchsia-300">{term}</dt>
                <dd className="mt-1 text-xs text-slate-400">{def}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-center text-[11px] text-slate-500">
            Consortium Resilience-Alpha • Workshop Bac+5 EPSI 2026 • Architecture v2.1 + EBIOS RM atelier 1 • API : <span className="font-mono">{apiUrl}</span>
          </p>
        </footer>
      </div>
    </div>
  );
}
