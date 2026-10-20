# PROJECT RESILIENCE-ALPHA — Workshop National Bac+5 (EPSI)

## Domaine Développement : Service de Paiement Résilient & Dashboard

Ce projet constitue le socle applicatif du démonstrateur de cyber-résilience **PROJECT RESILIENCE-ALPHA**. Il intègre :
1. **Un conteneur PostgreSQL 16** avec schéma relationnel robuste et requêtes analytiques en **Common Table Expressions (CTE)** (sans vues lourdes pénalisantes).
2. **Un backend FastAPI** conteneurisé avec les routes `/pay` (insertion transactionnelle idempotente) et `/health` (monitoring actif de l'API et de la base).
3. **Un frontend Next.js 16 (React + Tailwind CSS)** avec maquette de supervision à **4 zones** (Observabilité Infra, Flux Métier, Cyber SOC / IA, Remédiation Zero-Touch).

---

## 📁 Architecture des fichiers

```text
WORKSHOP_2026_2027/
├── docker-compose.yml              # Orchestration Docker (PostgreSQL + FastAPI)
├── .env.example                    # Variables d'environnement
├── README.md
│
├── database/
│   ├── init.sql                    # Initialisation schéma, tables (merchants, accounts, transactions, audit), index et seeds
│   └── queries_analytics.sql       # Analyses via CTEs (Taux d'échec glissant, Profiling marchand, Preuve mathématique de reprise)
│
├── backend/
│   ├── Dockerfile                  # Image durcie (non-root, healthcheck intégré)
│   ├── requirements.txt            # FastAPI, SQLAlchemy 2, asyncpg, Prometheus
│   └── app/
│       ├── main.py                 # Points d'entrée FastAPI (/pay, /health, /transactions, /metrics)
│       ├── config.py               # Paramètres applicatifs & injection de défaillances
│       ├── database.py             # Session async SQLAlchemy & pool de connexions
│       ├── models.py               # Modèles de données PostgreSQL
│       ├── schemas.py              # Schémas Pydantic (validation entrées/sorties)
│       └── services.py             # Logique métier, idempotence & simulation bancaire
│
├── backend-ia/                     # Pilier IA & Cyber-SOC (Détection ML & RAG)
│   ├── Dockerfile                  # Image CPU optimisée (torch CPU, FAISS libgomp)
│   ├── requirements.txt            # FastAPI, Scikit-Learn, LangChain, FAISS-cpu
│   ├── api.py                      # Détection d\'anomalies (Isolation Forest) & RAG (Ollama)
│   ├── procedures.pdf              # Corpus documentaire de sécurité indexé
│   └── README.md
│
└── frontend/                       # Application Next.js (App Router + Tailwind CSS)
    ├── app/
    │   ├── layout.tsx              # Thème sombre & typographie Geist
    │   ├── globals.css             # Directives Tailwind v4
    │   └── page.tsx                # Dashboard de supervision interactif à 4 zones
    └── package.json
```

---

## 🚀 Démarrage Rapide

### 1. Lancement de l'Infrastructure Conteneurisée (PostgreSQL & FastAPI)

Depuis la racine du projet :
```bash
docker compose up -d --build
```

Vérifier l'état des conteneurs :
```bash
docker compose ps
```

### 2. Test des Endpoints FastAPI

- **Healthcheck actif :**
  ```bash
  curl http://localhost:8000/health
  ```
  *Réponse attendue (HTTP 200) :*
  ```json
  {
    "status": "UP",
    "service": "payment-api",
    "database": "healthy",
    "version": "1.0.0",
    "uptime_seconds": 12.4,
    "timestamp": "2026-10-19T10:00:00.000Z"
  }
  ```

- **Paiement transactionnel `/pay` :**
  ```bash
  curl -X POST http://localhost:8000/pay \
    -H "Content-Type: application/json" \
    -d '{
      "merchant_code": "MERCH_ALPHA",
      "amount": 75.50,
      "currency": "EUR",
      "idempotency_key": "IDEMP-DEMO-001"
    }'
  ```

- **Documentation Swagger interactive :**
  Ouvrir `http://localhost:8000/docs`

- **Métriques Prometheus :**
  Ouvrir `http://localhost:8000/metrics`

---

## 📊 Requêtes Analytiques en CTE (`database/queries_analytics.sql`)

> **Choix d'ingénierie :** Nous avons délibérément exclu les vues matérialisées ou vues complexes lourdes. Lors d'un pic de charge ou d'une attaque par déni de service, le rafraîchissement d'une vue matérialisée pose des verrous (`locks`) et sature le cache RAM. Les Common Table Expressions (CTE) permettent d'extraire les métriques à la demande pour l'AIOps sans compromettre la latence transactionnelle.

Les 3 requêtes CTE prévues :
1. **WindowStats & HealthEvaluation** : Calcule le taux d'erreur et la latence moyenne sur une fenêtre glissante de 30 minutes pour alimenter la détection d'anomalies ML.
2. **MerchantRecentActivity** : Détecte les attaques applicatives ciblées par marchand (taux de blocage WAF / rejets anormaux).
3. **Preuve Mathématique de Reprise** : Compare les performances sur 3 fenêtres temporelles (`PRE_INCIDENT`, `INCIDENT_WINDOW`, `POST_REMEDIATION`) pour prouver au jury le retour au fonctionnement nominal sans intervention humaine (Axe 1 de la grille d'évaluation).

---

## 💻 Lancement du Dashboard Frontend (Next.js)

Dans un terminal dédié :
```bash
cd frontend
npm run dev
```
Accéder au tableau de bord sur [http://localhost:3000](http://localhost:3000).

### Les 4 Zones du Dashboard :
* **Zone 1 (Haut-Gauche) : Santé de l'Infrastructure & Microservices**
  * Statut en temps réel de FastAPI, PostgreSQL 16, WAF et Loki. Bouton d'interrogation active de `/health`.
* **Zone 2 (Haut-Droite) : Flux Métier & Transactions en Direct**
  * Formulaire d'injection de transaction `/pay` en direct (montant, mode nominal ou défaillance forcée).
  * Fil d'eau des transactions en temps réel avec références uniques, montants et temps de réponse (ms).
* **Zone 3 (Bas-Gauche) : Détection d'Anomalies IA & Cyber SOC**
  * Visualisation de l'état du modèle de détection ML AIOps (Isolation Forest), score d'anomalie, et statut de l'assistant local RAG (Ollama).
* **Zone 4 (Bas-Droite) : Moteur de Remédiation Autonome (Zero-Touch Recovery)**
  * Cycle en 4 étapes de reprise automatique (Détection → Arbitrage Ansible → Remédiation conteneur → Vérification par nouvelle transaction `/pay`).
  * Indicateur dédié au format **Clip Chrono 60 secondes**.
