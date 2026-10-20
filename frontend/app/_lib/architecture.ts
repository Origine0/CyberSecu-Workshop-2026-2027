// Données issues du document « Architecture et analyse de risques » (architecture v2.1 + EBIOS RM atelier 1).
// Source unique pour le dashboard : à mettre à jour ici si l'architecture ou l'analyse de risques évolue.

export type Bloc = "Application" | "Supervision" | "Résilience" | "Assistant IA";

/** Services dont le dashboard connaît déjà l'état réel. Les autres s'afficheront quand resilience-engine exposera /status. */
export type LiveSource = "api" | "db" | "web";

export interface ServiceInfo {
  name: string;
  bloc: Bloc;
  role: string;
  port: string;
  exposure: "réseau" | "local" | "interne";
  owner: string;
  live?: LiveSource;
}

export const BLOCS: { name: Bloc; emoji: string; color: string }[] = [
  { name: "Application", emoji: "💳", color: "text-emerald-300" },
  { name: "Supervision", emoji: "📈", color: "text-sky-300" },
  { name: "Résilience", emoji: "🛠️", color: "text-fuchsia-300" },
  { name: "Assistant IA", emoji: "🤖", color: "text-amber-300" },
];

export const SERVICES: ServiceInfo[] = [
  { name: "waf", bloc: "Application", role: "Seule porte d'entrée : filtre et bannit les IP", port: "80", exposure: "réseau", owner: "Clara" },
  { name: "web", bloc: "Application", role: "Page de paiement + ce dashboard", port: "3000", exposure: "local", owner: "Antoine", live: "web" },
  { name: "auth", bloc: "Application", role: "Connexion des clients, signe les jetons JWT", port: "8001", exposure: "interne", owner: "Antoine" },
  { name: "payment", bloc: "Application", role: "Enregistre les paiements", port: "8000", exposure: "interne", owner: "Antoine", live: "api" },
  { name: "db", bloc: "Application", role: "Base PostgreSQL : comptes et transactions", port: "5432", exposure: "interne", owner: "Antoine", live: "db" },
  { name: "prometheus", bloc: "Supervision", role: "Collecte les métriques toutes les 5 s", port: "9090", exposure: "interne", owner: "Mélanie" },
  { name: "loki", bloc: "Supervision", role: "Centralise les journaux", port: "3100", exposure: "interne", owner: "Mélanie" },
  { name: "promtail", bloc: "Supervision", role: "Envoie les journaux à Loki", port: "—", exposure: "interne", owner: "Mélanie" },
  { name: "grafana", bloc: "Supervision", role: "Tableaux de bord + vue SOC", port: "3001", exposure: "local", owner: "Mélanie / Clara" },
  { name: "resilience-engine", bloc: "Résilience", role: "Détecte (ML), répare (Ansible), vérifie", port: "8020", exposure: "interne", owner: "Agathe + Mélanie" },
  { name: "docker-proxy", bloc: "Résilience", role: "Seule voie vers Docker, limitée au redémarrage", port: "2375", exposure: "interne", owner: "Mélanie" },
  { name: "ollama", bloc: "Assistant IA", role: "Modèle de langage local (Qwen 2.5 1.5B)", port: "11434", exposure: "interne", owner: "Agathe" },
  { name: "assistant", bloc: "Assistant IA", role: "Répond aux opérateurs à partir de docs/", port: "8501", exposure: "local", owner: "Agathe" },
];

// ---------------------------------------------------------------------------
// EBIOS RM — événements redoutés
// ---------------------------------------------------------------------------

export type Scenario = "flood" | "bruteforce";

export interface Risk {
  id: string;
  emoji: string;
  title: string;
  gravity: 3 | 4;
  protection: string;
  scenario?: Scenario;
}

export const RISKS: Risk[] = [
  { id: "ER1", emoji: "🌊", title: "Les paiements ne passent plus (flood)", gravity: 3, protection: "WAF qui limite le débit, détection ML, IP bannie automatiquement", scenario: "flood" },
  { id: "ER2", emoji: "🧮", title: "Un paiement est faux (double débit)", gravity: 4, protection: "Paiement enregistré en une seule requête (tout ou rien)" },
  { id: "ER3", emoji: "🔑", title: "Un pirate entre dans un compte client", gravity: 3, protection: "Essais limités sur /login, détection ML", scenario: "bruteforce" },
  { id: "ER4", emoji: "🗝️", title: "Un pirate vole nos secrets", gravity: 4, protection: "Secrets chiffrés avec SOPS, clé JWT seulement dans auth" },
  { id: "ER5", emoji: "📤", title: "Les données clients fuient", gravity: 3, protection: "Règles anti-injection du WAF, base inaccessible du réseau" },
  { id: "ER6", emoji: "🤖", title: "Le moteur de réparation est détourné ou se trompe", gravity: 4, protection: "Accès Docker limité, aucune commande de l'extérieur, transaction test" },
  { id: "ER7", emoji: "💻", title: "Le PC Hôte tombe", gravity: 3, protection: "Playbook Ansible pour tout réinstaller vite" },
];

// ---------------------------------------------------------------------------
// Scénarios de démo (ceux retenus dans l'EBIOS : ER1 et ER3)
// ---------------------------------------------------------------------------

export const SCENARIOS: Record<
  Scenario,
  { label: string; emoji: string; risk: string; unit: string; attack: string; heal: string }
> = {
  flood: {
    label: "Flood",
    emoji: "🌊",
    risk: "ER1",
    unit: "requêtes / s sur /api/pay",
    attack: "Un flot de requêtes s'abat sur /api/pay depuis le PC Attaquant. Les clients commencent à attendre.",
    heal: "L'IP de l'attaquant est bannie au WAF et le service payment est relancé. Personne ne touche au clavier.",
  },
  bruteforce: {
    label: "Force brute",
    emoji: "🔑",
    risk: "ER3",
    unit: "mots de passe testés / s sur /login",
    attack: "Des milliers de mots de passe sont testés sur /api/auth/login pour entrer dans un compte client.",
    heal: "L'IP de l'attaquant est bannie au WAF : les comptes visés sont protégés. Personne ne touche au clavier.",
  },
};

/** Objectif de reprise proposé pour le démonstrateur (à confirmer dans le PCA/PRA). */
export const RTO_SECONDS = 120;
