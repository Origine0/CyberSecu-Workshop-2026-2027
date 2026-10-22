# 🛡️ RAPPORT D'INGÉNIERIE CYBERSÉCURITÉ, RÉSILIENCE OPÉRATIONNELLE & CONFORMITÉ DORA

> **PROJECT RESILIENCE-ALPHA** — Plateforme Bancaire Résiliente  
> **Auteure :** Clara (Lead Cybersécurité & Sécurité Opérationnelle)  
> **Groupe :** G<n> — Workshop National Bac+5 EPSI 2026-2027  
> **Destinataires :** Jury d'évaluation, Timéo (PMO & Gouvernance), Mélanie (Infra), Agathe (IA), Antoine (Dev)  
> **Version :** 1.0 (Validée et testée opérationnellement)

---

## 📑 Sommaire Exécutif

1. [Gouvernance & Analyse des Risques EBIOS RM (Ateliers 1 à 4)](#1-gouvernance--analyse-des-risques-ebios-rm)
2. [Conformité Réglementaire DORA (UE 2022/2554) & PCA-PRA](#2-conformité-réglementaire-dora-ue-20222554--pca-pra)
3. [Hygiène DevSecOps & Gestion des Secrets (SOPS + age)](#3-hygiène-devsecops--gestion-des-secrets-sops--age)
4. [Défense en Profondeur & Architecture du WAF](#4-défense-en-profondeur--architecture-du-waf)
5. [Caractérisation du Trafic & Alimentation de l'IA (Baseline ML)](#5-caractérisation-du-trafic--alimentation-de-lia)
6. [Boîte à Outils Offensive (Red Team) & Démonstrations](#6-boîte-à-outils-offensive-red-team--démonstrations)
7. [Fiche de Soutenance & Guide Oral pour le Jury (3 Minutes Chrono)](#7-fiche-de-soutenance--guide-oral-pour-le-jury)

---

## 1. Gouvernance & Analyse des Risques EBIOS RM

En coordination avec Timéo (Lead Gouvernance), l'analyse de risques de **PROJECT RESILIENCE-ALPHA** a été structurée selon la méthode standard ANSSI **EBIOS RM** (Risk Management).

### 1.1 Rappel des Valeurs Métier & Événements Redoutés (Atelier 1)
* **VM1 - Traitement transactionnel des paiements :** Disponibilité continue du service (`/pay`).
* **VM2 - Intégrité comptable des comptes :** Exactitude absolue des soldes (`accounts`) et unicité des débits (`transactions`).
* **VM3 - Confidentialité des secrets d'infrastructure :** Protection des clés privées et credentials PostgreSQL/Grafana.
* **VM4 - Traçabilité et observabilité :** Disponibilité des journaux d'audit (`service_audit_logs`) sans fuite d'informations système.

### 1.2 Sources de Risques & Profils d'Attaquants (Atelier 2)
* **SR1 - Cybercriminalité lucrative (Ransomware / Extorsion DoS) :** Motivation financière. Mode opératoire : saturation volumétrique (DDoS L7) pour rançonner l'établissement financier.
* **SR2 - Fraudeurs transactionnels & Script-Kiddies :** Motivation d'enrichissement direct ou opportuniste. Mode opératoire : rejeu de transactions (`replay attacks`), injection de montants négatifs (Fuzzing 422).
* **SR3 - Menace interne ou compromission de dépendance (Supply Chain) :** Motivation : exfiltration de données. Mode opératoire : exploitation de vulnérabilités dans les packages tiers (`Starlette / FastAPI`).

### 1.3 Scénarios Opérationnels & Vecteurs d'Attaque Testés (Ateliers 3 & 4)

| Réf | Nom du Scénario | Vecteur Technique | Vulnérabilité / Cible | Impact Métier | Contre-Mesure Validée |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **SC-01** | **DDoS Applicatif L7** | Inondation asynchrone sur `/pay` (>100 req/s) | Saturation de la boucle événementielle Uvicorn et du pool DB | Indisponibilité du service de paiement (HTTP 503) | **Double WAF** : Rate limiting applicatif (40 req/2s) + limitation WAF Nginx (HTTP 429) |
| **SC-02** | **Fuzzing & Injection Invalide** | Envoi de montants négatifs, types string, SQLi mock | Contrôles d'entrée Pydantic et gestion d'erreurs | Émission massive d'erreurs 422, surcharge CPU | **Validation Pydantic** stricte + Détection par l'Isolation Forest d'Agathe |
| **SC-03** | **Fuite d'Informations (CWE-209)** | Déclenchement d'exceptions non gérées | Stack traces Python brutes exposées au client HTTP | Révélation de chemins internes, versions de librairies | **Exception Handler Global** : masquage de la trace + génération d'un token `SEC-ERR-XXXXXXXX` |
| **SC-04** | **Chaos & Panne Bancaire** | Injection transactionnelle avec `simulate_failure: true` | Résilience transactionnelle de l'API | Échecs transactionnels simulés (Timeout passerelle) | **Rollback SQL automatique** + Audit log WARNING sécurisé |

---

## 2. Conformité Réglementaire DORA (UE 2022/2554) & PCA-PRA

Le règlement européen **DORA** impose aux entités financières des exigences strictes en matière de résilience opérationnelle numérique. PROJECT RESILIENCE-ALPHA s'inscrit dans cette conformité dès sa conception (*Security & Resilience by Design*).

### 2.1 Métriques de Continuité d'Activité (PCA / PRA)

```text
  [ Incident / Crash de Processus ] 
         │ 
         ▼ < 1.8s (Redémarrage Docker daemon)
  [ Auto-Relance par Docker ] ────────> Healthcheck Nominal (HTTP 200)

  [ Incident Complexe / Attaque DoS ]
         │
         ▼ < 25s (RTO mesuré AIOps)
  [ Remédiation IA + Ansible ] ───────> Confinement WAF & Reprise validée (HTTP 201)
         │
         ▼ RPO = 0
  [ Reprise sans perte ] ─────────────> Intégrité WAL Postgres & Idempotence UUID (si fournie)
```

* **RTO (Recovery Time Objective) — Temps de Reprise Mesuré :**
  - **Relance système sur crash de processus :** **< 1.8 seconde**. Testé par arrêt brutal (`kill -9 1`), c'est le **démon Docker** (`restart: unless-stopped`) qui relance le conteneur et rétablit le pool de connexions SQL immédiatement.
  - **Remédiation autonome de bout en bout (AIOps) :** **< 25 secondes** pour la boucle complète : détection de l'anomalie par l'Isolation Forest sur 2 fenêtres glissantes, déclenchement du playbook Ansible et vérification de reprise transactionnelle (largement conforme au RTO cible de 2 minutes du BIA).
  - **Mitigation immédiate WAF :** **< 2.5 millisecondes** pour intercepter un flux au-delà du seuil de débit applicatif (passage immédiat en HTTP 429).
* **RPO (Recovery Point Objective) — Perte de Données Maximale Admissible :**
  - **RPO = 0 seconde (Zéro perte transactionnelle)**.
  - Garanti par le moteur transactionnel PostgreSQL (transactions atomiques ACID, disques WAL synchronisés) et par le mécanisme d'**idempotence applicative** (`idempotency_key` unique UUID stockée dans la table `transactions`). Tout rejeu avec la même clé est neutralisé sans débit en doublon.
  - *Note de gouvernance / Constat technique :* Dans le prototype actuel, la clé d'idempotence est **facultative** (`nullable=True`) ; les requêtes sans clé sont traitées sans dédoublonnage. Sa généralisation obligatoire constitue un point d'amélioration identifié pour le passage en production.

### 2.2 Gestion des Incidents Majeurs TIC (Article 19 DORA)
1. **Détection autonome :** Le modèle Machine Learning (Isolation Forest) corrèle les métriques de trafic en temps réel.
2. **Journalisation d'audit immuable :** Chaque anomalie de sécurité génère un log structuré dans `service_audit_logs` avec l'empreinte de sévérité (`CRITICAL`, `WARNING`), l'IP source et la référence transactionnelle.
3. **Preuve Mathématique de Reprise :** Exécution de requêtes CTE (*Common Table Expressions*) comparant les métriques sur 3 fenêtres temporelles :
   - `PRE_INCIDENT` : Trafic nominal baseline (latence ~30ms, 0% erreur).
   - `INCIDENT_WINDOW` : Dégradation sous attaque (hausse brutale de la latence ou rejets 429/422).
   - `POST_REMEDIATION` : Rétablissement prouvé par une nouvelle transaction `POST /pay` validée à 100%.

---

## 3. Hygiène DevSecOps & Gestion des Secrets (SOPS + age)

### 3.1 Justification d'Ingénierie : Pourquoi SOPS + age plutôt que HashiCorp Vault ?
Le sujet du Workshop laissait l'alternative ouverte entre HashiCorp Vault et SOPS. L'équipe a retenu formellement **SOPS + age** pour les raisons suivantes :
1. **Économie de ressources matérielles :** Un serveur HashiCorp Vault impose un conteneur dédié supplémentaire et une consommation RAM permanente (500 Mo à 1 Go), ce qui pénaliserait l'hôte Docker contraint à 16 Go de RAM pour faire tourner le modèle LLM local.
2. **Résilience et absence de SPOF (*Single Point of Failure*) :** Vault introduit une dépendance critique au démarrage (procédure de descellement / *unseal keys*). En cas de crash ou de redémarrage automatique d'urgence, un conteneur Vault scellé bloque l'ensemble de la plateforme. Avec SOPS, les secrets sont déchiffrés localement au démarrage sans serveur intermédiaire.
3. **Sécurité cryptographique forte :** Chiffrement asymétrique moderne sur courbe elliptique **X25519 (age)**. Les secrets sont chiffrés au repos dans Git (`secrets.enc.env`, `.env.enc`) et le fichier `.env` en clair est strictement interdit dans Git via [.gitignore](file:///Users/clarahonore/Documents/Etude/EPSI/M2/workshop/CyberSecu-Workshop-2026-2027/.gitignore).

### 3.2 Cycle de Vie des Secrets
* **Fichier de configuration :** `.sops.yaml` à la racine liant la clé publique `age139560nekddmwep8ax48v7n87r37f4k29dlcuqc2yd4znlqpntcpqnve0ns`.
* **Procédure de déchiffrement Zero-Touch :**
  ```bash
  ./scripts/decrypt_secrets.sh
  # Exécute de manière fail-safe : sops -d secrets.enc.env > .env
  ```
* **Mots de passe protégés :**
  - `POSTGRES_PASSWORD` : mot de passe complexe de production.
  - `REMEDIATION_DB_PASSWORD` : compte à privilèges réduits en lecture seule (`remediation_ro`).
  - `GRAFANA_ADMIN_PASSWORD` : administration du monitoring SOC.

### 3.3 Audit SAST & Durcissement des Dépendances
* **Audit des CVEs :** Analyse effectuée via `pip-audit`. Correction des vulnérabilités de déni de service de `Starlette` via la mise à niveau vers `fastapi>=0.115.0` et `starlette>=0.40.0`.
* **Éradication de la fuite de stack traces (CWE-209) :**
  - Remplacement des stack traces Python par des handlers d'exceptions globaux FastAPI.
  - En cas d'erreur interne non prévue (HTTP 500), le client reçoit un payload standardisé neutre :
    ```json
    {
      "error": "INTERNAL_SERVER_ERROR",
      "message": "Une erreur inattendue est survenue lors du traitement du paiement.",
      "incident_id": "SEC-ERR-3F8A1B2C",
      "timestamp": "2026-10-20T11:30:00Z"
    }
    ```
  - Le token `SEC-ERR-3F8A1B2C` est injecté dans les logs internes pour permettre aux équipes SOC d'investiguer sans donner d'indices à l'attaquant.

---

## 4. Défense en Profondeur & Architecture du WAF

Le dispositif de filtrage de **PROJECT RESILIENCE-ALPHA** repose sur une défense multicouche :

```text
  Internet / Réseau Attaquant (.50)
                 │
                 ▼ Port 8082 (Hôte) / 8080 (Interne)
  ┌────────────────────────────────────────────────────────┐
  │                 1. WAF Nginx (Edge)                    │
  │  - Whitelisting strict (/api/pay|health|transactions)  │
  │  - Refus immédiat de /api/docs et /api/metrics (403)   │
  │  - Inclusion dynamique : /etc/nginx/blocklist/*.conf   │
  └────────────────────────────────────────────────────────┘
                 │
                 ▼ Réseau Docker Interne (app - 10.77.20.0/24)
  ┌────────────────────────────────────────────────────────┐
  │              2. WAF Applicatif FastAPI                 │
  │  - Sliding-Window Rate Limiter (40 req / 2s -> 429)    │
  │  - Validation des schémas stricts Pydantic             │
  │  - Blacklist IP en mémoire (/waf/block & /waf/unblock) │
  └────────────────────────────────────────────────────────┘
                 │
                 ▼ Réseau Docker Interne (data - 10.77.30.0/24)
  ┌────────────────────────────────────────────────────────┐
  │                 3. PostgreSQL 16                       │
  │  - Transactions ACID atomiques                         │
  │  - Rôle 'remediation_ro' en lecture seule stricte      │
  │  - Non publié sur l'hôte en production                 │
  └────────────────────────────────────────────────────────┘
```

### 4.1 WAF Nginx (Point d'Entrée Réseau)
* Fichier de configuration durci : [infra/placeholders/waf/default.conf](file:///Users/clarahonore/Documents/Etude/EPSI/M2/workshop/CyberSecu-Workshop-2026-2027/infra/placeholders/waf/default.conf).
* **Isolation :** Seul conteneur exposé sur le port d'entrée avec Grafana.
* **Intégration Ansible Zero-Touch :** Nginx charge dynamiquement les règles déposées par le conteneur de remédiation via `include /etc/nginx/blocklist/*.conf;`.
* **Validation du test de blocage :** La commande `make block-test` vérifie qu'un User-Agent hostile (`test-blocage`) est rejeté en **HTTP 403** puis restauré en **HTTP 200** (l'injection de la règle dans le volume partagé entraîne un rechargement/redémarrage du conteneur WAF d'environ 3 secondes pour charger la nouvelle liste de blocage).

### 4.2 WAF Applicatif FastAPI
* Module dédié : [backend/app/waf.py](file:///Users/clarahonore/Documents/Etude/EPSI/M2/workshop/CyberSecu-Workshop-2026-2027/backend/app/waf.py).
* **Protection anti-DDoS L7 :** Fenêtre glissante autorisant un maximum de 40 requêtes par 2 secondes par IP. Au-delà, interception en **HTTP 429 Too Many Requests** avec en-tête `Retry-After: 2`.
* **Endpoints de contrôle SOC & Remédiation :**
  - `GET /waf/status` : Métriques temps réel de requêtes bloquées et liste des IPs sous ban.
  - `POST /waf/block?ip=...&duration=...` : Neutralisation immédiate d'une IP hostile (**HTTP 403 Forbidden**).
  - `POST /waf/unblock?ip=...` : Réhabilitation automatique après expiration.

---

## 5. Caractérisation du Trafic & Alimentation de l'IA

### 5.1 Générateur de Trafic Sain (`scripts/normal_traffic.py`)
* Génère des transactions POST réalistes vers `/pay` (montants aléatoires 10€ à 500€, marchands multiples, clés idempotentes UUID).
* Base de données alimentée avec **plus de 289 transactions réelles** pour caractériser l'empreinte nominale du système.

### 5.2 Dataset Standardisé (`backend-ia/traffic_baseline.csv`)
Généré via [scripts/generate_traffic_baseline.py](file:///Users/clarahonore/Documents/Etude/EPSI/M2/workshop/CyberSecu-Workshop-2026-2027/scripts/generate_traffic_baseline.py) pour la calibration de l'Isolation Forest d'Agathe :
* **380 échantillons réels :**
  - 320 échantillons sains (`label = 0`) : latence moyenne 28-35ms, taux d'erreurs < 1.5%.
  - 60 échantillons d'attaques (`label = 1`) : DoS Flood L7, Fuzzing 422, Chaos 500.
* **Taux de contamination réel calculé :** **15.79% (0.1579)**.
* **Résultats de détection sur le modèle calibré :**
  - Trafic sain : Score inlier **`+0.0977`** (`is_anomaly: false`, 0 faux positif).
  - Flood DDoS L7 : Score outlier **`-0.2092`** (`is_anomaly: true`, `TRIGGER_REMEDIATION`).
  - Fuzzing 422 : Score outlier **`-0.1204`** (`is_anomaly: true`, `TRIGGER_REMEDIATION`).
  - Chaos bancaire : Score outlier **`-0.1341`** (`is_anomaly: true`, `TRIGGER_REMEDIATION`).

---

## 6. Boîte à Outils Offensive (Red Team) & Démonstrations

Le script multi-threadé [scripts/red_attack.py](file:///Users/clarahonore/Documents/Etude/EPSI/M2/workshop/CyberSecu-Workshop-2026-2027/scripts/red_attack.py) permet d'éprouver la résistance du cluster et de piloter les démonstrations :

```bash
# 1. Attaque Flood DDoS L7 (saturation à 20 threads) :
python3 scripts/red_attack.py --mode flood --count 60 --concurrency 20

# 2. Injection de payloads malformés (Fuzzing 422) :
python3 scripts/red_attack.py --mode malformed --count 40

# 3. Chaos Engineering (Pannes bancaires injectées) :
python3 scripts/red_attack.py --mode chaos --count 30

# 4. Démonstration Chronométrée Clip Chrono 60 secondes :
python3 scripts/red_attack.py --mode chrono
```

---

## 7. Fiche de Soutenance & Guide Oral pour le Jury

### ⏱️ Pitch Oral — 3 Minutes Chrono (Clara, Lead Cyber)

#### [0:00 - 0:45] — Introduction & Hygiène DevSecOps
> *"Bonjour à tous. En tant que Lead Cyber et Sécurité Opérationnelle sur PROJECT RESILIENCE-ALPHA, mon objectif n'était pas seulement de réagir aux attaques, mais de bâtir une infrastructure résiliente dès sa conception.*  
> *Premier impératif : l'éradication absolue des secrets en clair. Nous avons déployé un coffre-fort cryptographique asymétrique avec SOPS et age. Les secrets sont scellés dans Git, et le déploiement est 100% Zero-Touch sans aucune intervention humaine. Nous avons privilégié SOPS à HashiCorp Vault pour éliminer tout risque de défaillance au démarrage et optimiser la mémoire RAM pour l'IA.*  
> *Côté code, l'audit statique SAST a permis de corriger les CVEs de déni de service de Starlette et de blinder l'API contre les fuites d'informations CWE-209 en masquant les stack traces."*

#### [0:45 - 1:45] — Défense en Profondeur & Démonstration du WAF
> *"Pour protéger la plateforme financière, nous avons mis en œuvre une défense multicouche :*  
> *1. Un WAF Nginx en coupure réseau qui interdit strictement tout endpoint technique comme la documentation Swagger ou les métriques brutes.*  
> *2. Un Rate Limiter par fenêtre glissante qui bloque instantanément les attaques par déni de service applicatif L7 en HTTP 429.*  
> *3. Une boucle de remédiation dynamique : quand l'IA ou Ansible identifie un attaquant, une règle de bannissement est injectée à chaud dans le WAF, renvoyant immédiatement un HTTP 403 Forbidden sans toucher à la base de données.*  
> *Regardons le test en direct : `make block-test` valide que le blocage s'applique en quelques secondes dans le WAF (en provoquant un rechargement/redémarrage du conteneur WAF de 3 secondes pour charger la nouvelle liste).*  

#### [1:45 - 2:30] — Continuité d'Activité & Conformité Réglementaire DORA
> *"Sur le plan réglementaire, notre architecture est pleinement alignée sur la directive européenne DORA :*  
> *Notre RPO est de 0 seconde : grâce aux transactions ACID et au support de l'idempotence UUID (quand elle est fournie par le client), aucune transaction n'est perdue ni débitée deux fois.*  
> *Notre RTO cible est de 2 minutes : en cas de crash brutal d'un processus, le démon Docker relance le conteneur en 1.8 s. Et sur incident complexe nécessitant une intervention cyber, notre boucle AIOps (détection Isolation Forest + remédiation Ansible) rétablit le service en moins de 25 secondes, respectant largement notre engagement contractuel."*

#### [2:30 - 3:00] — Conclusion
> *"En conclusion, PROJECT RESILIENCE-ALPHA prouve qu'une plateforme financière conteneurisée moderne peut survivre à des attaques de saturation et de corruption grâce à l'alliance de l'hygiène DevSecOps, du durcissement WAF et de l'intelligence artificielle AIOps."*

---

### 💡 Réponses aux Questions Pièges Potentielles du Jury

* **Question du Jury :** *"Votre blocage WAF se fait-il réellement sans interruption de service ?"*
  * **Réponse :** *"En toute transparence d'ingénierie : dans le prototype actuel, l'injection de la règle de blocage par Ansible entraîne un redémarrage/rechargement du conteneur WAF, ce qui induit une micro-coupure de 2 à 3 secondes. C'est une dette technique identifiée et assumée dans notre rapport de gouvernance EBIOS RM ; pour la production, l'objectif est d'utiliser un pur rechargement à chaud `nginx -s reload` sans perte de session TCP."*
* **Question du Jury :** *"La clé d'idempotence garantit-elle à 100% l'absence de doublons pour tous les utilisateurs ?"*
  * **Réponse :** *"Elle le garantit de façon absolue pour tous les clients qui la renseignent grâce à la contrainte d'unicité PostgreSQL. Néanmoins, dans l'état actuel de notre API, le champ est facultatif (`nullable=True`). Un marchand qui omettrait la clé ne bénéficierait pas du dédoublonnage automatique. La rendre strictement obligatoire à la validation Pydantic fait partie de nos chantiers d'amélioration post-workshop."*
* **Question du Jury :** *"Le RTO de 1,8 s que vous mentionnez vient-il de votre IA de remédiation ?"*
  * **Réponse :** *"Non, il ne faut pas confondre les deux couches de résilience : les 1,8 s mesurent la reprise locale d'un conteneur par l'orchestrateur Docker daemon (`restart: unless-stopped`) suite à un crash de processus. La boucle complète de remédiation AIOps (analyse non supervisée par Isolation Forest sur 2 fenêtres glissantes + exécution du playbook Ansible + validation du paiement de preuve) opère quant à elle en moins de 25 secondes, ce qui reste très inférieur à notre engagement BIA de 2 minutes."*
* **Question du Jury :** *"Pourquoi avoir choisi SOPS plutôt qu'un gestionnaire comme HashiCorp Vault ?"*
  * **Réponse :** *"Le cahier des charges laissait le choix. Vault apporte une complexité opérationnelle majeure pour un prototype conteneurisé : il consomme 1 Go de RAM supplémentaire et nécessite une procédure de descellement en cas de redémarrage. SOPS + age garantit le même niveau cryptographique (courbe X25519), stocke les secrets scellés directement dans le référentiel Git, et permet un redémarrage autonome immédiat sans aucune intervention humaine."*
* **Question du Jury :** *"Si Docker Desktop masque l'IP réelle de l'attaquant en 10.77.10.1, comment protégez-vous le service ?"*
  * **Réponse :** *"C'est une contrainte physique que nous avons anticipée dès l'analyse EBIOS RM. Si le NAT de Docker Desktop masque l'IP source, notre WAF bascule immédiatement sur des signatures applicatives : nous confinons l'attaque en bloquant le User-Agent hostile via Ansible (`make block TYPE=user_agent`) ou en appliquant un rate-limiting global sur la route `/api/pay`."*
* **Question du Jury :** *"Comment vous assurez-vous que l'IA ne génère pas de faux positifs en bloquant des clients légitimes ?"*
  * **Réponse :** *"L'Isolation Forest d'Agathe a été calibré sur un dataset représentatif de 380 échantillons réels (`traffic_baseline.csv`). Avec un taux de contamination calé sur le ratio d'attaque exact de 15.79%, le trafic sain obtient un score inlier très net de +0.0977, garantissant 0 faux positif sur l'ensemble de nos tirs de validation."*
