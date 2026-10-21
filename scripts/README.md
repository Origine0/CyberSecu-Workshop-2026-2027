# 🛡️ Scripts de Test & Cybersécurité — PROJECT RESILIENCE-ALPHA

Ce répertoire regroupe les outils opérationnels développés pour l'axe **Cybersécurité & Résilience** sous la responsabilité de **Clara** (Lead Cyber & Sécurité opérationnelle).

---

## 📋 Sommaire des Outils

| Fichier | Rôle & Usage |
| :--- | :--- |
| `normal_traffic.py` | 🟢 Générateur de trafic légitime (baseline saine) pour entraîner le Machine Learning d'Agathe |
| `red_attack.py` | 🔴 Boîte à outils offensive Red Team (DDoS L7, Injections 422, Chaos, Mode Clip Chrono 60s) |
| `generate_traffic_baseline.py` | 📊 Exportateur du dataset standardisé (`traffic_baseline.csv`) pour l'entraînement ML d'Agathe |
| `decrypt_secrets.sh` | 🔐 Déchiffrement automatique des secrets chiffrés (`secrets.enc.env`) via SOPS + age |
| `backend/app/waf.py` | 🛡️ Pare-feu applicatif (WAF), Rate Limiter glissant anti-DDoS L7 et Blacklist de remédiation |

---

## 1. 🟢 `normal_traffic.py` — Flux nominal (Baseline)

Génère des requêtes POST régulières et conformes vers `/pay` pour simuler des utilisateurs réels.

```bash
# Exécution par défaut en continu (cible http://localhost:8082/api/pay via le WAF) :
python3 scripts/normal_traffic.py

# Générer exactement 200 transactions saines pour le dataset d'Agathe :
python3 scripts/normal_traffic.py --count 200 --min-delay 0.1 --max-delay 0.3

# Cibler le PC Hôte distant (192.168.137.1) :
python3 scripts/normal_traffic.py --remote
```

---

## 2. 🔴 `red_attack.py` — Attaque Red Team & Démonstration

Outil multi-vecteurs permettant de tester et démontrer la résilience de l'API.

### Modes disponibles :
- **`flood`** : 🌊 DoS applicatif multi-threadé saturant les workers et le pool DB.
- **`malformed`** : 💥 Fuzzing de payloads avec montants négatifs/invalides (codes HTTP 422 et 400).
- **`chaos`** : ⚡ Injection de pannes bancaires (`simulate_failure=True`, code `ERR_GATEWAY_TIMEOUT`).
- **`full`** : 🚨 Vague combinée simultanée (Flood + 422 + Chaos).
- **`chrono`** : ⏱️ Scénario chronométré automatique en 60 secondes pour le **Clip Chrono** (Axe 3).

```bash
# 1. Attaque Flood (DDoS L7 à 25 threads concurrents) :
python3 scripts/red_attack.py --mode flood --count 300 --concurrency 25

# 2. Injection de payloads malformés (Fuzzing 422) :
python3 scripts/red_attack.py --mode malformed --count 50

# 3. Injection Chaos Engineering (Panne bancaire) :
python3 scripts/red_attack.py --mode chaos --count 30

# 4. Vague d'attaque combinée complète :
python3 scripts/red_attack.py --mode full --count 200 --concurrency 20

# 5. Démonstration Clip Chrono 60 secondes (Séquence automatique 4 phases) :
python3 scripts/red_attack.py --mode chrono

# Pour cibler le PC distant :
python3 scripts/red_attack.py --mode chrono --remote
```

---

## 3. 🔐 `decrypt_secrets.sh` — Gestion des Secrets (SOPS + age)

Permet aux membres de l'équipe possédant la clé privée age de déchiffrer `secrets.enc.env` et d'initialiser leur environnement `.env` local sans exposer de mot de passe en clair dans Git.

```bash
./scripts/decrypt_secrets.sh
```

---

## 4. 🛡️ Pare-Feu Applicatif (WAF) & Remédiation Autonome (Zero-Touch)

Le module `backend/app/waf.py` assure le filtrage en amont de FastAPI avec un sliding-window rate limiter et une blacklist dynamique en mémoire.

### Endpoints de supervision et remédiation :
- **Consulter l'état et les métriques du WAF :**
  ```bash
  curl http://localhost:8000/waf/status
  ```
- **Bannir une adresse IP malveillante (Trigger Remédiation Zero-Touch) :**
  ```bash
  curl -X POST "http://localhost:8000/waf/block?ip=192.168.1.100&duration=120"
  ```
  *Réponse (HTTP 403 Forbidden sur toute tentative de paiement de l'attaquant) :*
  ```json
  {
    "error": "IP_BLOCKED_BY_WAF",
    "message": "Accès refusé par le pare-feu applicatif (WAF). Adresse IP sous restriction de sécurité.",
    "client_ip": "192.168.1.100",
    "action": "THREAT_MITIGATED"
  }
  ```
- **Réhabiliter une adresse IP :**
  ```bash
  curl -X POST "http://localhost:8000/waf/unblock?ip=192.168.1.100"
  ```
- **Mitigation automatique DDoS L7 (Rate Limiter) :**
  - Seuil d'alerte : > 40 requêtes en 2 secondes par IP.
  - Réponse : `HTTP 429 Too Many Requests` avec en-tête `Retry-After: 2` sans saturer la base de données.

---

## 5. 📊 `generate_traffic_baseline.py` — Dataset & Calibration IA (Agathe)

Génère et exporte le jeu de données calibré `backend-ia/traffic_baseline.csv` combinant les échantillons sains et les vecteurs d'attaques.

```bash
# Générer le dataset d'entraînement pour l'IA :
python3 scripts/generate_traffic_baseline.py
```

### Format du fichier CSV produit :
```csv
timestamp,request_rate,error_rate,latency_ms,label
```
- `label = 0` : Trafic nominal sain (utilisé pour calibrer l'hyperplan de l'Isolation Forest).
- `label = 1` : Attaque réelle (utilisé pour ajuster le ratio de contamination).

### Ré-entraînement à chaud de l'IA :
Dès que le fichier est mis à jour dans `backend-ia/`, déclencher la recalibration instantanée sans redémarrage :
```bash
curl -X POST http://localhost:8001/retrain
```


