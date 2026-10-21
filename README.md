# PROJECT RESILIENCE-ALPHA — Workshop National Bac+5 (EPSI)

## Plateforme Financière Cyber-Résiliente & Auto-Remédiée (Zero-Touch)

Ce dépôt constitue le démonstrateur complet **PROJECT RESILIENCE-ALPHA** (Groupe G4). Il intègre 17 services conteneurisés articulés autour des 5 domaines d'expertise du Workshop :
1. **Développement & Persistance (`postgres`, `payment-api`, `auth`)** : PostgreSQL 16 avec schéma ACID, requêtes analytiques en **Common Table Expressions (CTE)** (sans vues matérialisées bloquantes), API transactionnelle FastAPI idempotente (`/pay`, `/health`, `/analytics/*`) et service d'authentification JWT (`HS256`).
2. **Infrastructure, Chaos & Auto-Remédiation (`remediation`, `waf`, `prometheus`, `grafana`, `loki`)** : Architecture multi-réseaux cloisonnée (`dmz`, `app`, `data`, `mgmt`), supervision temps réel et démon Ansible exécutant automatiquement les playbooks de reprise via socket-proxy restreint.
3. **Cybersécurité & Red/Blue Team (`waf`, `scripts/red_attack.py`, SOPS + `age`)** : Filtrage L7, limitation de débit, liste de blocage dynamique, chiffrement des secrets `.env.enc` et contrôles d'audit automatisés (`make security-check`, `make secret-scan`).
4. **IA & AIOps (`ml-detector`, `ai-api`, `ollama`)** : Détection d'anomalies non supervisée (**Isolation Forest**) déclenchant automatiquement la remédiation Ansible, couplée à un assistant Cyber-SOC **RAG local** (FAISS + `all-MiniLM-L6-v2` + Ollama `qwen2.5:0.5b`) indexant le corpus de procédures et les dossiers EBIOS RM / PCA-PRA / DORA.
5. **Frontend & Supervision 4 Zones (`frontend`)** : Portail React 19 + TypeScript + Vite + Tailwind CSS v4 servi derrière le WAF (`http://localhost:8082`), offrant la vue unifiée des 4 zones, le Pipeline Graphique de Résilience, le mode **Clip Chrono 60s** et le Cockpit d'investigation CTE/AIOps.

---

## 📁 Architecture des fichiers

```text
WORKSHOP_2026_2027/
├── docker-compose.yml              # Stack complète (17 services, 4 réseaux isolés)
├── .env.example                    # Modèle des variables d'environnement
├── secrets.enc.env                 # Secrets chiffrés avec SOPS + age
├── Makefile                        # Commandes d'exploitation, chaos, tests et audit
├── README.md
│
├── docs/
│   ├── architecture.md             # Dossier d'architecture & choix techniques
│   ├── plan-adressage.md           # Plan d'adressage IP, ports, réseaux Docker & flux
│   ├── cybersécurité/ebios-rm.md   # Analyse EBIOS RM, Red/Blue Team & durcissement
│   └── gouvernance/gouvernance.md  # BIA financier, PCA/PRA, RACI & conformité NIS2/DORA
│
├── infra/                          # Services d'infrastructure & moteurs autonomes
│   ├── auth/                       # Service FastAPI d'authentification JWT (/auth/login, /auth/verify)
│   ├── ml-detector/                # Boucle AIOps Isolation Forest -> déclenchement auto Ansible
│   ├── remediation/                # Serveur HTTP (port 8020) d'exécution des playbooks Ansible
│   ├── waf/                        # Reverse-proxy Nginx L7 & filtrage des routes sensibles
│   ├── prometheus/                 # Collecte des métriques applicatives et système
│   ├── grafana/                    # Dashboards provisionnés (RESILIENCE-ALPHA)
│   ├── loki/ & promtail/           # Centralisation des journaux conteneurs
│   └── traffic-gen/                # Générateur continu de trafic marchand légitime
│
├── ansible/                        # Playbooks Zero-Touch : restart_service, block_source, restore_database
├── scripts/                        # red_attack.py, normal_traffic.py, chaos.sh, security-check.sh, secret-scan.sh
│
├── database/
│   ├── init.sql                    # Schéma relationnel (merchants, accounts, transactions, service_audit_logs)
│   └── queries_analytics.sql       # Requêtes analytiques CTE (Santé glissante, Profiling marchand, Preuve de reprise)
│
├── backend/
│   ├── Dockerfile                  # Image durcie non-root
│   └── app/                        # API FastAPI (/pay, /health, /transactions, /analytics/*, /waf/*)
│
├── backend-ia/                     # Pilier IA & Cyber-SOC (API /analyze Isolation Forest & /ask RAG FAISS)
│   ├── Dockerfile                  # Image CPU optimisée (PyTorch CPU, HuggingFace, FAISS)
│   ├── api.py                      # Moteur d'inférence ML + indexation RAG (procedures.pdf + docs/**/*.md)
│   └── procedures.pdf              # Corpus de procédures d'urgence Cyber-SOC
│
└── frontend/                       # Portail React 19 + TypeScript + Vite + Tailwind CSS v4
    ├── Dockerfile                  # Build multi-stage + serveur Nginx non-root (port 8080 interne)
    └── src/
        ├── App.tsx                 # Orchestration temps réel, polling et bannière d'état
        └── components/
            ├── Dashboard4Zones.tsx         # Vue principale à 4 zones + Chrono 60s
            ├── LiveResiliencePipeline.tsx  # Topologie interactive en 5 nœuds & onde Heartbeat
            ├── AiCyberSocPanel.tsx         # Console interactive Isolation Forest (/analyze) & RAG (/ask)
            └── AnalyticsCtePanel.tsx       # Visualisation en direct des 3 requêtes analytiques SQL CTE
```

---

## 🚀 Démarrage Rapide

### 1. Déchiffrement des Secrets (SOPS + age)

Les secrets de configuration du projet sont chiffrés avec SOPS et la clé `age`. Pour générer le fichier local `.env` :

```bash
# Déchiffrement direct :
sops -d secrets.enc.env > .env

# Ou via le script d'automatisation :
./scripts/decrypt_secrets.sh
```

### 2. Lancement de la Stack Conteneurisée

Depuis la racine du projet :
```bash
docker compose up -d --build
```

Vérifier l'état des conteneurs :
```bash
docker compose ps
```

### 3. Accès aux Interfaces

Seuls le WAF (`8082`) et Grafana (`3000`) sont exposés sur l'hôte :

| Interface | URL | Détails |
|---|---|---|
| **Dashboard Principal (via WAF)** | `http://localhost:8082` (ou `http://192.168.137.1:8082`) | Portail React 4 Zones, Pipeline, Cockpit IA/CTE & Auth JWT |
| **API de Paiement (via WAF)** | `http://localhost:8082/api/health` et `/api/pay` | Routes publiques filtrées par le WAF |
| **API IA & RAG (via WAF)** | `http://localhost:8082/ai/analyze` et `/ai/ask` | Détection Isolation Forest & Assistant RAG |
| **Grafana** | `http://localhost:3000` | Compte `admin`, mot de passe défini dans `.env` |

### 4. Test Rapide des Endpoints API

- **Healthcheck actif :**
  ```bash
  curl http://localhost:8082/api/health
  ```
- **Paiement transactionnel `/api/pay` :**
  ```bash
  curl -X POST http://localhost:8082/api/pay \
    -H "Content-Type: application/json" \
    -d '{
      "merchant_code": "MERCH_ALPHA",
      "amount": 75.50,
      "currency": "EUR",
      "idempotency_key": "IDEMP-DEMO-001"
    }'
  ```
- **Documentation Swagger & Routes d'administration :** volontairement bloquées par le WAF (`HTTP 403` sur `/api/docs`, `/api/metrics`, `/api/waf/block`).

---

## 🛡️ Boucle d'Auto-Remédiation (Zero-Touch) & Scénario Chrono 60s

La boucle autonome fonctionne sans aucune intervention humaine :
1. **Attaque / Perturbation** : Depuis le PC Attaquant (ou localement), lancement du scénario de démonstration :
   ```bash
   python3 scripts/red_attack.py --url http://localhost:8082/api/pay --mode chrono
   ```
2. **Détection ML (`ml-detector`)** : Le service collecte toutes les 5 secondes les métriques de `payment-api` et du `waf`. Dès que le modèle **Isolation Forest** (ou les seuils de sécurité 422/429/5xx) détecte deux fenêtres anormales consécutives, il qualifie l'incident (`dos`, `intrusion` ou `restart`).
3. **Exécution Ansible (`remediation`)** : `ml-detector` appelle `POST http://remediation:8020/trigger`. Le conteneur `remediation` exécute immédiatement les playbooks Ansible (`block_source.yml`, `restart_service.yml`, `restore_database.yml`) via `socket-proxy-remed`.
4. **Preuve de Reprise** : Le playbook et le script vérifient `/api/health` puis valident une transaction de preuve (`77.77 €`), visible en direct dans la **Zone 2**, la **Zone 4** et l'onglet **Preuve de Reprise (CTE #3)** du Dashboard.

### Commandes Makefile utiles
```bash
make ps               # État des 17 services
make check            # Santé globale, filtrage WAF, isolation des ports internes et syntaxe Ansible
make security-check   # Audit complet d'exposition réseau, des droits Docker socket-proxy et Postgres
make secret-scan      # Vérification d'absence de secrets en clair dans le dépôt Git
make chaos SERVICE=payment-api PANNE=20   # Panne simulée puis réparation automatique chronométrée
```

---

## 📊 Requêtes Analytiques en CTE (`database/queries_analytics.sql`)

> **Choix d'ingénierie :** Nous avons délibérément exclu les vues matérialisées ou vues complexes lourdes. Lors d'un pic de charge ou d'une attaque par déni de service, le rafraîchissement d'une vue matérialisée pose des verrous (`locks`) et sature le cache RAM. Les Common Table Expressions (CTE) permettent d'extraire les métriques à la demande pour l'AIOps sans compromettre la latence transactionnelle.

Les 3 requêtes CTE sont exposées par le backend et visualisables en direct dans le Dashboard :
1. **WindowStats & HealthEvaluation (`/api/analytics/window-health`)** : Calcule le taux d'erreur et la latence moyenne sur une fenêtre glissante de 30 minutes pour alimenter la détection d'anomalies ML.
2. **MerchantRecentActivity (`/api/analytics/merchant-activity`)** : Détecte les attaques applicatives ciblées par marchand (taux de blocage WAF / rejets anormaux).
3. **Preuve Mathématique de Reprise (`/api/analytics/recovery-proof`)** : Compare les performances sur 3 fenêtres temporelles (`1_PRE_INCIDENT`, `2_INCIDENT_WINDOW`, `3_POST_REMEDIATION`) pour prouver au jury le retour au fonctionnement nominal sans intervention humaine.

---

## 💻 Développement Local du Frontend (React 19 + Vite)

Le frontend est automatiquement construit et servi par le conteneur `frontend` derrière le WAF sur `http://localhost:8082`. Pour le lancer en mode développement local avec rechargement à chaud :

```bash
cd frontend
npm install
npm run dev
```
L'interface de développement démarre sur `http://localhost:3001` (avec proxy Vite configuré vers `:8082`).
