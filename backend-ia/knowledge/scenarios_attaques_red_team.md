# SCÉNARIOS D'ATTAQUES ET RÉSILIENCE OPÉRATIONNELLE - RED TEAM & BLUE TEAM

Ce document détaille l'ensemble des attaques subies et simulées par l'équipe Red Team sur la plateforme bancaire PROJECT RESILIENCE-ALPHA, ainsi que les mécanismes de détection et contre-mesures appliqués par la Blue Team (WAF, IA et Ansible).

---

## 1. Vue d'ensemble des Scénarios d'Attaques EBIOS RM

Quatre scénarios principaux ont été définis selon la méthode EBIOS RM et testés opérationnellement via l'outil Red Team multi-threadé (`scripts/red_attack.py`) :

### Scénario SC-01 : Déni de Service Volumétrique Applicatif L7 (DDoS HTTP Flood)
- **Vecteur d'attaque :** Inondation asynchrone et concurrente de requêtes POST sur l'endpoint transactionnel `/pay` (>100 requêtes/seconde).
- **Commande Red Team :** `python3 scripts/red_attack.py --mode flood --count 60 --concurrency 20`
- **Cible et vulnérabilité visée :** Saturation de la boucle événementielle Uvicorn et épuisement du pool de connexions PostgreSQL.
- **Symptômes observés :** Explosion du débit de requêtes (`request_rate` monte à 30-80 req/s), hausse de la latence au-delà de 200 ms, émission d'erreurs HTTP 503.
- **Détection par l'IA :** L'algorithme Isolation Forest classe ce flux comme anomalie critique avec un score fortement négatif (`anomaly_score = -0.2092`) et ordonne `TRIGGER_REMEDIATION`.
- **Contre-mesure & Résilience :**
  1. *WAF Applicatif (FastAPI) :* Le Sliding-Window Rate Limiter intercepte le surplus au-delà de 40 requêtes par 2 secondes par IP en renvoyant immédiatement un code HTTP 429 (Too Many Requests).
  2. *WAF Nginx (Edge) :* Limitation de débit Nginx (`limit_req_zone`).
  3. *Remédiation Ansible :* Injection d'une règle de bannissement IP dans `/etc/nginx/blocklist/*.conf` coupant immédiatement l'attaquant au niveau Nginx (HTTP 403 Forbidden).

---

### Scénario SC-02 : Fuzzing et Injection de Payloads Malformés (Erreurs 422)
- **Vecteur d'attaque :** Envoi continu de charges utiles invalides sur `/pay` : montants négatifs (ex: -50.00€), types de données erronés (chaînes à la place de floats), champs obligatoires manquants, tentatives d'injection SQL mockées (`' OR '1'='1`).
- **Commande Red Team :** `python3 scripts/red_attack.py --mode malformed --count 40`
- **Cible et vulnérabilité visée :** Contournement de la logique métier bancaire et surcharge CPU par traitement d'exceptions de parsing.
- **Symptômes observés :** Taux d'erreurs HTTP 422 (Unprocessable Entity) grimpant au-delà de 30% à 70% alors que le débit reste modéré.
- **Détection par l'IA :** L'Isolation Forest détecte une anomalie basée sur la corrélation anormale `error_rate` / `request_rate` avec un score de `-0.1204`.
- **Contre-mesure & Résilience :**
  1. *Validation stricte Pydantic :* Rejet immédiat de toute transaction invalide avant tout accès à la base de données PostgreSQL.
  2. *Bannissement IP ou User-Agent :* Le WAF consigne les `fuzzing_drops` et Ansible applique un confinement si l'IP persiste.

---

### Scénario SC-03 : Fuite d'Informations Système (CWE-209)
- **Vecteur d'attaque :** Déclenchement intentionnel d'exceptions non gérées pour tenter de capturer des traces de débogage internes (stack traces Python).
- **Cible et vulnérabilité visée :** Récupération de chemins de fichiers internes, versions de librairies (FastAPI, Starlette, SQLAlchemy) ou schémas de base de données.
- **Symptômes observés :** Réponses d'erreurs internes (HTTP 500).
- **Contre-mesure & Résilience :**
  - *Exception Handler Global FastAPI :* Masquage absolu de la stack trace.
  - Le client reçoit un message neutre contenant uniquement un identifiant d'incident anonymisé : `SEC-ERR-XXXXXXXX`.
  - La trace complète n'est stockée que dans les logs internes sécurisés (Loki / PostgreSQL `service_audit_logs`) pour l'équipe SOC.

---

### Scénario SC-04 : Chaos Engineering et Panne Bancaire Simulée
- **Vecteur d'attaque :** Injection de requêtes de paiement avec le marqueur `simulate_failure: true` pour tester le comportement transactionnel lors d'un crash de passerelle bancaire partenaire.
- **Commande Red Team :** `python3 scripts/red_attack.py --mode chaos --count 30`
- **Cible et vulnérabilité visée :** Risque de perte de cohérence comptable, solde débité sans confirmation, orphelinat de transaction.
- **Symptômes observés :** Timeout de passerelle simulé et codes d'erreur 500 contrôlés.
- **Contre-mesure & Résilience :**
  - *Rollback SQL automatique :* Annulation immédiate de la transaction dans PostgreSQL grâce au moteur transactionnel ACID.
  - *Garantie RPO = 0 :* Aucun compte bancaire n'est débité par erreur.
  - *Audit logging :* Émission d'un log structuré de sévérité WARNING dans la table d'audit.

---

## 2. Démonstration Chronométrée (Clip Chrono 60 Secondes)

Pour les présentations et soutenance devant le jury, l'outil Red Team intègre un mode scénarisé automatisé :
- **Commande Red Team :** `python3 scripts/red_attack.py --mode chrono`
- **Déroulement de la séquence :**
  1. *Seconde 0 à 15 :* Trafic nominal sain (1 req/2s, latence 28 ms, 0% erreur). L'orbe IA est Cyan (Nominal).
  2. *Seconde 15 à 30 :* Déclenchement de l'attaque Flood DDoS L7. L'orbe IA bascule au Rouge (Attaque détectée), l'Isolation Forest émet `TRIGGER_REMEDIATION`.
  3. *Seconde 30 à 45 :* Phase de confinement WAF et remédiation. L'orbe bascule à l'Ambre (Remédiation). Les requêtes hostiles sont rejetées en HTTP 429 et 403.
  4. *Seconde 45 à 60 :* Validation du rétablissement nominal. Transaction de preuve réussie (HTTP 201), retour au Cyan (Système rétabli).

---

## 3. Métriques Réelles et Dataset de Référence de l'IA

Le modèle Machine Learning (Isolation Forest) d'Agathe est calibré sur `traffic_baseline.csv` :
- **Taille du jeu d'entraînement :** 380 échantillons réels et standardisés.
- **Échantillons sains (label 0) :** 320 échantillons (débit 0.5 req/s, latence 28-35 ms, taux d'erreurs < 1.5%).
- **Échantillons d'attaque (label 1) :** 60 échantillons (DDoS, Fuzzing, Chaos).
- **Taux de contamination réel :** 15.79% (0.1579).
- **Score d'anomalie normal :** `+0.0977` (inlier sain, 0 faux positif).
- **Score d'anomalie sous Flood DDoS :** `-0.2092` (outlier critique, alerte immédiate).
- **Temps d'inférence ML :** < 1.2 milliseconde par échantillon.

---

## 4. Rôles et Attribution des Membres de l'Équipe

- **Mélanie (Lead Infra & Déploiement) :** Architecture Docker Compose (15 conteneurs), segmentation réseau en 5 sous-réseaux étanches, Point d'accès Wi-Fi labo `192.168.137.1` (SSID `RESILIENCE-G4`).
- **Clara (Lead Cybersécurité & EBIOS RM) :** Modélisation des risques EBIOS RM, scripts Red Team (`red_attack.py`), WAF Nginx durci, conformité DORA et gestion des secrets SOPS + age.
- **Agathe (Lead IA & AIOps) :** Modèle Machine Learning Isolation Forest sans règles en dur, assistant documentaire RAG (LangChain + FAISS + Ollama qwen2.5:1.5b), moteur vocal proactif et HUD Robot HDMI.
- **Antoine (Lead Dév & APIs) :** Backend FastAPI des paiements (`/pay`), gestion de l'idempotence UUID, table de transactions PostgreSQL ACID, Frontend Next.js.
- **Timéo (Lead Gouvernance & PMO) :** Documentation de continuité PCA-PRA, BIA (Business Impact Analysis), conformité réglementaire DORA et coordination des livrables.
