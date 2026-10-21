# Dossier de gouvernance : continuité, risques et conformité

> PROJECT RESILIENCE-ALPHA • Groupe G4 • 21/10/2026 • Rédaction : Timéo (Lead Transformation & PMO)
> BIA • PCA/PRA • EBIOS RM ateliers 2 à 5 • NIS2/DORA • Recommandations. Mesures réalisées sur la stack réelle.

## 0. L'essentiel en une page

Ce dossier couvre la partie **gouvernance** exigée par le sujet (section 3.5) : ce que coûte un arrêt (BIA), comment on reprend (PCA/PRA), l'analyse de risques EBIOS RM (ateliers 2 à 5 et mise à jour de l'atelier 1), la conformité NIS2/DORA et nos recommandations à la direction.

**Tous les chiffres de reprise ont été mesurés les 20 et 21/10/2026** sur la stack réelle (17 services Docker), en provoquant de vraies pannes et attaques.

| Ce qu'on a mesuré | Résultat | Ce que ça veut dire |
|---|---|---|
| Crash de l'API de paiement | **reprise en 1,8 s** | Docker relance le conteneur tout seul |
| Crash de la base PostgreSQL | **reprise en 0,4 s, 0 transaction perdue** | PostgreSQL rejoue son journal (WAL) au redémarrage |
| Boucle autonome `ml-detector -> remediation` | **détection + playbook en < 25 s** | Isolation Forest détecte l'anomalie et déclenche Ansible sans humain |
| Procédure Ansible `restore_database` | **9,8 s**, contrôles OK | Contrôle d'intégrité, relance de l'API, paiement de preuve |
| Flood de Clara (400 requêtes, 730/s) | **90,5 % rejetées**, service maintenu | La limitation de débit et le playbook `dos` absorbent l'attaque |
| Client légitime extérieur pendant le flood | **3 paiements sur 25 refusés** | Effet collatéral temporaire (même IP NAT vue par le WAF sous Docker Desktop) |

**À retenir :** 1 minute d'arrêt coûte environ **346 € de commissions** et bloque **28 800 € de paiements** pour nos marchands. Nos reprises mesurées se comptent en secondes et la boucle **Zero-Touch (`ml-detector` → `remediation` → Ansible)** est opérationnelle. Nos limites résiduelles relèvent de l'industrialisation multi-sites : les **sauvegardes externalisées** et le **déploiement hors NAT Docker Desktop**.

## 1. Analyse d'impact (BIA) : combien coûte un arrêt des paiements

Les chiffres de l'entreprise sont **fictifs** (le sujet l'impose) mais réalistes pour un prestataire de paiement de taille moyenne. Ils servent à fixer nos objectifs de reprise et à relier la gravité EBIOS à un coût.

### 1.1 Hypothèses

| Hypothèse | Valeur | Commentaire |
|---|---|---|
| Volume moyen en journée | 600 paiements / min | Pic : 1500 / min (soldes, fin de mois) |
| Montant moyen d'un paiement | 48 € | Panier e-commerce moyen |
| Commission perçue | 1.2 % | Notre chiffre d'affaires sur chaque paiement |
| Pénalité partenaires (SLA 99,9 %) | 5 000 € / heure entamée | Au-delà de 15 min d'arrêt |
| Cellule de crise | 4 personnes x 90 €/h | Mobilisée au-delà de 15 min |

### 1.2 Coût selon la durée de l'arrêt

| Durée | Paiements bloqués | Flux bloqué (marchands) | Commissions perdues | Pénalités | Crise | Coût pour nous | Gravité EBIOS |
|---|---|---|---|---|---|---|---|
| 2 s (crash API mesuré) | 20 | 960 € | 12 € | — | — | **12 €** | G1 |
| **2 min (RTO cible)** | 1 200 | 57 600 € | 691 € | — | — | **691 €** | G2 |
| 15 min | 9 000 | 432 000 € | 5 184 € | — | 90 € | **5 274 €** | G3 |
| 1 h | 36 000 | 1 728 000 € | 20 736 € | 5 000 € | 360 € | **26 096 €** | G3 |
| 4 h | 144 000 | 6 912 000 € | 82 944 € | 20 000 € | 1 440 € | **104 384 €** | G4 |

- **1 minute d'arrêt** = 346 € de commissions perdues et 28 800 € de paiements bloqués (au pic : 864 € et 72 000 €).
- **Au-delà de 15 min**, les pénalités partenaires et la cellule de crise s'ajoutent : le coût change d'échelle.
- **Le vrai risque n'est pas que financier** : un arrêt long est un incident majeur au sens de DORA (notification à l'autorité), et les marchands peuvent partir chez un concurrent. Ces impacts ne sont pas chiffrés ici.

### 1.3 Objectifs de reprise retenus

| Objectif | Cible | Justification | Mesuré aujourd'hui |
|---|---|---|---|
| **RTO** : durée maximale d'arrêt | **2 min** | Coût encore limité (~700 €), avant les pénalités | 1,8 s (crash API), 0,4 s (crash base), < 25 s (boucle ML + Ansible) |
| **RPO** : perte de données maximale | **0 paiement validé** | Un paiement confirmé perdu = litige client | 0 perte sur crash de la base |
| Temps de détection | < 30 s | Laisser le temps de réparer et vérifier dans le RTO | **10 à 15 s** (`ml-detector` fenêtre de 5 s, 2 fenêtres consécutives) |

## 2. Plan de continuité et de reprise (PCA/PRA)

Le **PCA** décrit comment le service **continue** pendant l'incident, le **PRA** comment on le **rétablit** ensuite. Chaque procédure s'appuie sur un composant actif dans le dépôt.

### 2.1 Scénarios couverts

| Scénario | Ce qui se passe | Réponse (automatique ou procédure) | Résultat mesuré | Couvert ? |
|---|---|---|---|---|
| S1 - Flood sur /api/pay (ER1) | Attaque depuis le PC Attaquant (`red_attack.py --mode flood`) | Rate-limit API (40 req / 2 s) + `ml-detector` déclenche l'action `dos` (`block_source.yml` + `restart_service.yml`) | 90,5 % de l'attaque rejetée, remédiation autonome exécutée, service maintenu | ✅ Fait |
| S2 - Crash de l'API | Le processus de `payment-api` s'arrête | Docker relance le conteneur (`restart: unless-stopped`) + surveillance `ml-detector` | Reprise en 1,8 s | ✅ Fait |
| S3 - Crash de la base | Arrêt brutal de PostgreSQL | Docker relance PostgreSQL, rejeu du journal (WAL) | Reprise en 0,4 s, 0 transaction perdue | ✅ Fait |
| S4 - Doute sur l'intégrité des données | Après un incident, il faut prouver que les comptes sont justes | Playbook `restore_database` | 9,8 s, contrôles OK, paiement de preuve accepté | ✅ Fait |
| S5 - Source malveillante identifiée | Un outil d'attaque reconnaissable (`User-Agent: sqlmap...`) | `ml-detector` détecte l'intrusion et déclenche `block_source` + `restore_database` | Règle appliquée automatiquement dans le WAF + vérification d'intégrité | ✅ Fait |
| S6 - Service dégradé sans crash | L'API répond en erreur 5xx ou latence > 1,5 s | `ml-detector` déclenche automatiquement l'action `restart` (`restart_service.yml`) | Redémarrage ciblé et paiement de preuve validé en < 15 s | ✅ Fait |
| S7 - Perte du PC Hôte ou du disque | Matériel en panne, volume de données perdu | Aucune : pas de sauvegarde externe, pas de second PC | Non couvert sur le prototype | ❌ Absent |

### 2.2 Procédures de reprise (playbooks Ansible)

Les playbooks tournent dans le conteneur `remediation`. Ils sont déclenchés **automatiquement** par le service `ml-detector` via `POST http://remediation:8020/trigger` dès que deux fenêtres consécutives de 5 s présentent une anomalie (Isolation Forest ou règles de sécurité). Ils ne peuvent agir sur Docker qu'à travers un proxy qui n'autorise **que la lecture et le redémarrage**, et seulement sur une liste blanche de services (jamais la base, la supervision ou les proxys).

| Playbook | Déclencheur automatique (`ml-detector`) | Étapes | Preuve de reprise | Durée |
|---|---|---|---|---|
| **restart_service** | Service dégradé ou 5xx (S2, S6) | 1. Vérifie que le service est autorisé 2. Le redémarre 3. Attend qu'il soit sain (60 s max) | Paiement de test via le WAF | ~4 à 6 s |
| **block_source** | Flood DoS (S1) ou User-Agent malveillant (S5) | 1. Contrôle la valeur (refuse les IP Docker) 2. Écrit la règle (IP, User-Agent ou limitation) 3. Recharge le WAF | Requête de contrôle bloquée (403/429) | ~3 à 5 s |
| **restore_database** | Suspicion d'intrusion ou corruption (S4, S5) | 1. Contrôles d'intégrité 2. Redémarre l'API 3. Paiement de test 4. Nouveaux contrôles | Contrôles OK avant et après + paiement accepté | 9,8 s |

> **Conformité Jury (Axe 1 Zero-Touch) :** Le démon `remediation` (`infra/remediation/server.py`) expose également son historique d'exécution en temps réel (`/status`), affiché directement dans la Zone 4 et le Pipeline du Dashboard React.

### 2.3 Qui fait quoi (RACI)

**R** = réalise, **A** = rend des comptes (un seul par ligne), **C** = consulté, **I** = informé.

| Activité | Moteur auto | Antoine (Dev) | Mélanie (Infra) | Clara (Cyber) | Agathe (IA) | Timéo (Gouv.) |
|---|---|---|---|---|---|---|
| Détecter l'anomalie | R | I | C | C | A | I |
| Décider de la réparation | R | A | C | C | C | I |
| Redémarrer / restaurer (playbooks) | R | C | A | I | — | I |
| Bloquer une source dans le WAF | R | I | C | A | — | I |
| Vérifier par une transaction test | R | A | C | — | — | I |
| Rotation des secrets (fuite) | — | C | C | A/R | — | I |
| Communication, notification DORA | — | C | C | C | C | A/R |
| Retour d'expérience (post-mortem) | — | R | R | R | R | A |

### 2.4 Risques résiduels après reprise

| Risque résiduel | Pourquoi | Décision |
|---|---|---|
| **Un seul PC Hôte** | Tout tourne sur une machine : panne matérielle = arrêt total (S7) | Accepté pour le prototype, à traiter (R2) |
| **Pas de sauvegarde externalisée** | `restore_database` contrôle l'intégrité ACID et relance, mais ne restaure pas depuis un dump froid externe | Accepté pour le prototype, à traiter (R2) |
| **NAT Docker Desktop sur les IP sources** | Sous Docker Desktop Windows, le WAF voit les clients extérieurs avec l'IP de passerelle Docker (`10.77.10.1`). Le playbook privilégie donc le durcissement `ratelimit` et le blocage par `User-Agent` | Géré par limitation de débit et signature L7 (R3) |
| **Effet collatéral de la limitation de débit** | Pendant un flood massif, quelques clients légitimes partageant l'IP NAT peuvent subir un `429` temporaire | Accepté temporairement, à traiter par déploiement Linux natif / reverse-proxy frontal (R3) |

## 3. EBIOS RM : ateliers 2 à 5

Version courte, reliée au démonstrateur. Elle reprend les sources de risque du rapport de Clara pour éviter les doublons.

### 3.1 Atelier 2 : qui pourrait attaquer, et pourquoi

| Source de risque | Ce qu'elle veut (objectif visé) | Motivation | Ressources | Retenue ? |
|---|---|---|---|---|
| **SR1 - Cybercriminel** | Rendre les paiements indisponibles pour exiger une rançon | Forte (argent) | Moyennes (outils de flood) | Oui : scénario de la démo |
| **SR2 - Fraudeur** | Passer des paiements frauduleux, rejouer des transactions | Forte (argent) | Faibles à moyennes | Oui |
| **SR3 - Initié ou dépendance piégée** | Voler les secrets ou les données clients | Moyenne | Élevées (accès interne, chaîne logicielle) | Oui |
| Hacktiviste | Nuire à l'image de l'entreprise | Faible pour un acteur du paiement | Variables | Non (pertinence faible) |

### 3.2 Atelier 3 : par où passerait l'attaquant (scénarios stratégiques)

| Partie prenante | Pourquoi elle compte | Niveau de confiance |
|---|---|---|
| Clients (navigateurs) | Seul accès autorisé à la plateforme, via le WAF | Faible : n'importe qui |
| Marchands partenaires | Reçoivent les paiements, subissent l'arrêt | Moyen |
| Équipe d'exploitation | Détient la clé SOPS et l'accès au PC Hôte | Élevé mais risque d'erreur ou de malveillance |
| Fournisseurs logiciels | Images Docker, paquets Python et npm, modèle d'IA | Moyen : versions figées pour les images |

- **Scénario stratégique 1** (SR1 → ER1) : le cybercriminel sature l'API de paiement depuis le réseau ; les marchands ne sont plus payés.
- **Scénario stratégique 2** (SR2 → ER2, ER3) : le fraudeur tente de passer des paiements malformés ou de rejouer une transaction.
- **Scénario stratégique 3** (SR3 → ER4, ER6) : une dépendance piégée ou un initié tente de voler les secrets ou de détourner le moteur de réparation.

### 3.3 Atelier 4 : scénario opérationnel n°1, le flood & fuzzing (attaque de Clara)

| Étape | Ce que fait l'attaquant | Ce que fait la plateforme (constaté) |
|---|---|---|
| 1. Repérage | Cible la façade publique sur `:8082/api/pay` | Le WAF bloque `/api/docs`, `/api/metrics`, `/api/waf/block` (403) |
| 2. Attaque | Lance `red_attack.py --mode chrono` : salve de flood + requêtes malformées (`sqlmap`) | Le WAF et l'API rejettent le flood (`429`) et les payloads invalides (`422`) |
| 3. Détection IA | Maintient la pression sur > 2 fenêtres de 5 s | `ml-detector` (Isolation Forest + règles) détecte l'anomalie (`score < 0`) |
| 4. Remédiation Zero-Touch | — | `ml-detector` appelle `remediation:8020/trigger` → Ansible exécute `block_source.yml` + `restart_service.yml` |
| 5. Preuve de reprise | — | Transaction de preuve (`77.77 €`) validée avec succès en base PostgreSQL |

**Vraisemblance : V3 (très vraisemblable)**. **Gravité initiale : G3**, ramenée à **G1** grâce à la remédiation autonome sous les 25 secondes.

### 3.4 Atelier 5 : plan de traitement

| Risque | Mesure implémentée ou planifiée | Responsable | Échéance | Risque résiduel |
|---|---|---|---|---|
| ER1 Flood | Rate-limit WAF/API + boucle automatique `ml-detector -> remediation` | Clara, Antoine, Agathe | ✅ Fait | Effet collatéral mineur sous NAT Docker Desktop |
| ER2 Paiement faux | Validation Pydantic stricte + contrainte `CHECK (amount > 0)` + clé d'idempotence `UNIQUE` | Antoine | ✅ Fait | Faible |
| ER3 Compte client | Service `auth` JWT (`HS256`, `/auth/login`, `/auth/verify`) intégré au portail | Antoine | ✅ Fait | MFA à ajouter après le workshop |
| ER4 Secrets | Chiffrement SOPS + `age` (`.env.enc`), scan CI `secret-scan.sh` | Clara | ✅ Fait | Passer aux Docker Secrets fichiers en production |
| ER6 Moteur | Routes `/waf/block` interdites depuis le WAF (403) + proxy Docker restreint + liste blanche Ansible | Clara, Mélanie | ✅ Fait | Faible |
| ER7 PC Hôte | Sauvegarde quotidienne de la base hors du PC + test de restauration | Mélanie | Après le workshop | Accepté pour le prototype |

## 4. Atelier 1 mis à jour : ce qui nous protège vraiment

Voici l'état réel vérifié sur la stack complète au 21/10/2026 :

| Risque | Gravité | Protection annoncée le 19/10 | État réel au 21/10 | Statut |
|---|---|---|---|---|
| ER1 Les paiements ne passent plus | G3 | WAF qui limite le débit, détection ML, remédiation auto | Rate-limit actif + `ml-detector` (Isolation Forest) déclenchant automatiquement Ansible (`block_source` + `restart_service`) | ✅ Fait |
| ER2 Un paiement est faux | G4 | Paiement avec contrôle et idempotence | Validation Pydantic (422), contrainte SQL `amount > 0` et unicité de la clé d'idempotence en base | ✅ Fait |
| ER3 Un pirate entre dans un compte | G3 | Authentification JWT et contrôle d'accès | Service `auth` FastAPI opérationnel (JWT HS256, comptes hachés SHA-256, connecté au Dashboard React) | ✅ Fait |
| ER4 Vol de nos secrets | G4 | Secrets chiffrés SOPS, clé JWT isolée | SOPS + `age` en place (`.env.enc`), `.env` hors de Git, vérification automatique `make secret-scan` | ✅ Fait |
| ER5 Fuite des données clients | G3 | Règles anti-injection du WAF, base inaccessible | WAF : routes sensibles bloquées (403), base PostgreSQL isolée sur réseau interne `data`, erreurs masquées (CWE-209) | ✅ Fait |
| ER6 Moteur de réparation détourné | G4 | Accès Docker limité, aucune commande de l'extérieur | Proxy Docker limité au redémarrage + liste blanche Ansible + routes `/api/waf/block` bloquées par le WAF (403) | ✅ Fait |
| ER7 Le PC Hôte tombe | G3 | Relance automatique des conteneurs | Relance automatique Docker mesurée (0,4 s à 1,8 s). Pas de second site physique | ⚠️ Partiel |

## 5. Conformité NIS2 / DORA

Pour une entité financière, **DORA** (règlement (UE) 2022/2554) s'applique en priorité : c'est la règle spécifique au secteur, NIS2 (directive (UE) 2022/2555) reste la référence générale.

| Exigence DORA | Ce que le démonstrateur prouve | Ce qu'il ne peut pas prouver | Statut |
|---|---|---|---|
| Cadre de gestion du risque TIC (art. 5 à 9) | Inventaire des actifs (architecture, plan d'adressage), analyse EBIOS RM, durcissement des conteneurs, réseaux isolés | Implication formelle d'un conseil d'administration réel | ✅ Fait (échelle lab) |
| Détection (art. 10) | Modèle Isolation Forest (`ml-detector` & `ai-api`) branché en continu + supervision Prometheus, Loki, Grafana | Corrélation SIEM multi-datacenters | ✅ Fait |
| Réponse et rétablissement (art. 11) | Reprises mesurées (1,8 s et 0,4 s), déclenchement automatique `ml-detector -> remediation` avec preuve par transaction | Bascule sur site secondaire actif/passif | ✅ Fait |
| Sauvegarde et restauration (art. 12) | Aucune perte sur crash de la base (journal WAL) + playbook `restore_database` | Sauvegardes externalisées hors du PC Hôte | ⚠️ Partiel |
| Gestion et classification des incidents (art. 17 et 18) | Journal d'audit en base (`service_audit_logs`), journaux centralisés dans Loki, historique des playbooks en Zone 4 | Workflow formel d'escalade comité exécutif | ✅ Fait (échelle lab) |
| Notification des incidents majeurs (art. 19) | Les données nécessaires existent (heure, durée, impact financier BIA, preuves CTE) + assistant RAG réglementaire | Télétransmission réelle à l'ACPR | ⚠️ Partiel |
| Tests de résilience (art. 24 à 27) | Tests de panne réels (`make chaos`), attaques Red Team (`red_attack.py`), audit (`make security-check`) | Tests de pénétration avancés (TLPT) par un prestataire externe | ✅ Fait |
| Risque lié aux prestataires TIC (art. 28 et suivants) | Versions d'images Docker figées | Registre contractuel des prestataires tiers | ❌ Absent |

**Côté NIS2**, les mesures de l'article 21 (analyse de risques, gestion des incidents, continuité, sécurité de la chaîne d'approvisionnement, contrôle d'accès) recoupent le tableau ci-dessus.

## 6. Recommandations à la direction

Ce que nous ferions pour passer du démonstrateur validé à une mise en production industrielle, par ordre de priorité :

| # | Recommandation | Pourquoi (preuve) | Effort | Indicateur de succès |
|---|---|---|---|---|
| **R1** | **Sauvegarder la base hors du serveur et ajouter un second site** | Une panne matérielle du PC Hôte = perte totale (S7). Exigence DORA art. 12 | Moyen à élevé (budget infra) | RPO < 15 min sur stockage externe S3 immuable, restauration testée chaque trimestre |
| **R2** | **Déployer sur hôte Linux natif avec reverse-proxy en coupure directe** | Évite le NAT Docker Desktop Windows (`10.77.10.1`) et permet le bannissement IP granulaire sans effet collatéral | Faible | 0 client légitime refusé pendant un flood ; bannissement IP individuel actif |
| **R3** | **Renforcer l'authentification par MFA et rotation automatique des clés JWT** | Le service `auth` valide aujourd'hui par mot de passe + JWT HS256 | Moyen | 100 % des accès opérateurs sous MFA (FIDO2/TOTP) |
| **R4** | **Formaliser la télé-notification DORA (ACPR)** | Les métriques d'incident sont prêtes dans le Dashboard et le RAG, mais l'envoi réglementaire reste manuel | Faible | Exercice de crise semestriel, rapport initial généré en moins de 4 h |
| **R5** | **Maîtriser la chaîne logicielle (SBOM & signature d'images)** | Garantir l'intégrité des images Docker et des modèles IA pré-embarqués | Faible à moyen | 100 % des images signées (Cosign) et scannées en CI/CD |

**Arbitrage proposé :** R2 et R4 immédiatement (faible coût, gain opérationnel et réglementaire direct), puis R1 et R3 pour l'homologation de production.
