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
├── docker-compose.yml              # Stack complète (application, WAF, supervision, remédiation)
├── .env.example                    # Variables d'environnement
├── Makefile                        # Commandes courantes (make help)
├── README.md
│
├── docs/plan-adressage.md          # IP du labo, ports, réseaux Docker, flux autorisés
├── infra/                          # Configs Prometheus / Grafana / Loki / promtail, générateur de trafic, exporteur
├── ansible/                        # Playbooks de remédiation : redémarrage, blocage WAF, contrôle de la base
├── scripts/                        # chaos.sh et security-check.sh (make chaos, make security-check)
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

### 1. Déchiffrement des Secrets (SOPS + age)

Les secrets de configuration du projet sont chiffrés avec SOPS et la clé `age`. Pour générer le fichier local `.env` :

```bash
# Déchiffrement direct :
sops -d .env.enc > .env

# Ou via le script d'automatisation :
./scripts/decrypt_secrets.sh
```

### 2. Lancement de l'Infrastructure Conteneurisée (PostgreSQL & FastAPI)

Depuis la racine du projet :
```bash
docker compose up -d --build
```

Vérifier l'état des conteneurs :
```bash
docker compose ps
```

### 2. Test des Endpoints FastAPI

L'API n'est plus exposée directement : tout passe par le WAF sur le port 8082.

- **Healthcheck actif :**
  ```bash
  curl http://localhost:8082/api/health
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
  curl -X POST http://localhost:8082/api/pay \
    -H "Content-Type: application/json" \
    -d '{
      "merchant_code": "MERCH_ALPHA",
      "amount": 75.50,
      "currency": "EUR",
      "idempotency_key": "IDEMP-DEMO-001"
    }'
  ```

- **Documentation Swagger :** volontairement bloquée par le WAF (403). Pour la consulter en local :
  ```bash
  docker compose exec payment-api curl -s http://localhost:8000/openapi.json
  ```

- **Métriques Prometheus :** collectées en interne par Prometheus, visibles dans Grafana (`http://localhost:3000`).

---

## 🏗️ Infrastructure (docker compose, supervision, Ansible)

Toute la plateforme tourne sur le PC Hôte (Windows + WSL2 + Docker Desktop). Détail des IP, ports, réseaux et flux :
[`docs/plan-adressage.md`](docs/plan-adressage.md).

### Prérequis
- Docker Desktop (sous Windows : avec l'intégration WSL activée, et les commandes lancées depuis Ubuntu)
- `make`, `curl`, `nc` et `python3` sur la machine (Ubuntu : `sudo apt install -y make curl netcat-openbsd python3`).
  Ansible n'est pas nécessaire sur la machine : il tourne dans le conteneur `remediation`.
- Environ 3 Go de RAM libres pour Docker.

Vérifier le groupe de la socket Docker, à reporter dans `DOCKER_SOCKET_GID` du `.env` s'il est différent de 1001 :
```bash
docker run --rm -v /var/run/docker.sock:/s python:3.12.11-alpine3.22 stat -c %g /s
```
Symptôme d'une mauvaise valeur : `socket-proxy-remed` redémarre en boucle avec `permission denied` dans ses logs,
et la remédiation ne peut plus rien redémarrer.

### Déployer
```bash
make env     # crée .env depuis .env.example si besoin (définir GRAFANA_ADMIN_PASSWORD et REMEDIATION_DB_PASSWORD)
make pull    # télécharge les images, à faire avant la démo (pas d'Internet sur place)
make up      # démarre toute la stack
```

### Après un `git pull`
```bash
make reload  # recrée les conteneurs pour qu'ils voient les fichiers et dossiers mis à jour
```
Sans cela, un conteneur dont un dossier monté a été remplacé par Git tourne encore, mais ne peut plus redémarrer
(y compris par la remédiation automatique).

### Vérifier
```bash
make ps      # état des services (tous doivent être healthy)
make check   # config, santé, API via le WAF, /api/docs bloqué, ports internes fermés, syntaxe Ansible
make security-check   # exposition réseau, isolation entre conteneurs, droits des proxys Docker et du compte Postgres
```

| Accès | URL |
|---|---|
| Plateforme (WAF) | `http://192.168.137.1:8082` (ou `http://localhost:8082` sur le PC Hôte) |
| Grafana | `http://192.168.137.1:3000`, compte `admin`, mot de passe dans `.env` |

Le tableau de bord « Resilience-Alpha - Infra » est chargé automatiquement dans Grafana (dossier RESILIENCE-ALPHA).

Seuls le WAF (8082) et Grafana (3000) sont publiés. Postgres, l'API, Prometheus, Loki et la remédiation ne sont
joignables qu'à l'intérieur des réseaux Docker.

### Relancer un service
```bash
make restart SERVICE=payment-api
```
Le playbook Ansible vérifie que le service est dans la liste blanche (`ansible/group_vars/all.yml`), le redémarre, attend
qu'il soit healthy, puis envoie un paiement de test qui doit revenir en `SUCCESS`. `postgres`, les socket-proxy, la
remédiation et la supervision sont exclus de la liste.

### Remédiation et chaos
Les playbooks de remédiation tournent dans le conteneur `remediation`, avec les mêmes droits que le futur moteur
(accès Docker limité à lister et redémarrer, compte Postgres en lecture seule) :
```bash
make block TYPE=user_agent VALUE=sqlmap     # confinement dans le WAF (TYPE : ip, user_agent, ratelimit)
make unblock TYPE=user_agent VALUE=sqlmap   # retire la règle
make block-test                             # vérifie que le WAF applique la liste de blocage
make restore                                # contrôle d'intégrité de la base, redémarrage de l'API, preuve de reprise
make chaos SERVICE=payment-api PANNE=20     # panne simulée puis réparation, avec mesure du temps de reprise
```

### Services provisoires
`auth`, `frontend`, `ml-detector`, `remediation` et `waf` tournent pour l'instant avec des conteneurs temporaires
(`infra/placeholders/`) qui seront remplacés par les vrais services, sous le même nom et sur le même port.
Le conteneur `remediation` utilise déjà l'image `resilience/ansible-runner` (`infra/ansible-runner/`), base du futur moteur.

### Arrêter
```bash
make down    # arrête la stack, les volumes (base, métriques, logs) sont conservés
```

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
npm run dev -- -p 3001
```
Accéder au tableau de bord sur [http://localhost:3001](http://localhost:3001) (le port 3000 est pris par Grafana).
Dans le champ « URL de l'API » du dashboard, indiquer `http://localhost:8082/api`.

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
