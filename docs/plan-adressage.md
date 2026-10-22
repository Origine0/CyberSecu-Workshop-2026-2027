# Plan d'adressage

Réseau du labo, ports exposés et réseaux Docker. À mettre à jour à chaque changement de port ou de réseau dans `docker-compose.yml`.

## 1. Réseau du labo (Wi-Fi)

| Élément | Valeur |
|---|---|
| SSID | `RESILIENCE-G4` (point d'accès mobile Windows sur le PC Hôte) |
| Sous-réseau | `192.168.137.0/24` |
| Passerelle / DNS | `192.168.137.1` (PC Hôte, partage de connexion Windows) |
| Accès Internet | Partage USB du téléphone de Mélanie vers le PC Hôte (interface « Ethernet »), séparé de la carte Wi-Fi qui diffuse le hotspot. Pas d'Internet pendant la démo : images Docker et modèles Ollama téléchargés à l'avance |

| Membre | Rôle | Machine | IP |
|---|---|---|---|
| Mélanie | Infra | PC Hôte (Windows + WSL2 + Docker Desktop), crée le hotspot | `192.168.137.1` |
| Clara | Cyber | PC Attaquant | `192.168.137.50` |
| Agathe | IA | PC IA (Ollama) | `192.168.137.60` |
| Antoine | Dev | Portable équipe | `192.168.137.101` |
| Timéo | Transfo / PMO | Portable équipe | `192.168.137.102` |

Le partage de connexion Windows distribue les adresses par DHCP sans réservation possible.
Chaque PC configure donc son IP en statique : masque `255.255.255.0`, passerelle et DNS `192.168.137.1`.

Attention : le DHCP du hotspot distribue toute la plage `.2–.254`, sans exclusion possible.
Un appareil en DHCP (téléphone, PC d'un visiteur) peut donc recevoir `.50`, `.60`, `.101` ou `.102`.
Il faut donc ne connecter au hotspot que les 5 PC de l'équipe, et vérifier avant la démo, sur le PC Hôte,
qu'aucune autre adresse n'apparaît (`arp -a -N 192.168.137.1` dans PowerShell).

```powershell
# Windows (PowerShell administrateur) — remplacer l'IP par celle du membre
Get-NetAdapter                                            # nom exact de la carte, en général "Wi-Fi"
netsh interface ipv4 set address name="Wi-Fi" static 192.168.137.50 255.255.255.0 192.168.137.1
netsh interface ipv4 set dnsservers name="Wi-Fi" static 192.168.137.1 primary
ipconfig                                                  # vérifier
netsh interface ipv4 set address name="Wi-Fi" dhcp        # revenir en DHCP après le workshop
netsh interface ipv4 set dnsservers name="Wi-Fi" dhcp
```

```bash
# macOS (Terminal) — remplacer l'IP par celle du membre
networksetup -listallnetworkservices                     # nom exact du service, en général "Wi-Fi"
sudo networksetup -setmanual "Wi-Fi" 192.168.137.101 255.255.255.0 192.168.137.1
sudo networksetup -setdnsservers "Wi-Fi" 192.168.137.1
ipconfig getifaddr en0                                   # vérifier l'IP obtenue
sudo networksetup -setdhcp "Wi-Fi"                       # revenir en DHCP après le workshop
```

Tests de connectivité : le ping vers l'hôte est instable avec le hotspot Windows, on teste donc un port TCP :

```powershell
# Windows : seule la ligne "TcpTestSucceeded : True" compte.
# Test-NetConnection tente aussi un ping, et l'avertissement "Ping failed" peut être ignoré.
Test-NetConnection 192.168.137.1 -Port 8082
```
```bash
# Linux
nc -vz -w 3 192.168.137.1 8082
```
```bash
# macOS (nc BSD intégré : -G = délai de connexion en secondes)
nc -vz -G 3 192.168.137.1 8082
# alternative sans nc
curl -s -o /dev/null -w '%{http_code}\n' --connect-timeout 3 http://192.168.137.1:8082/
```

## 2. Ports publiés sur le Wi-Fi

Seuls deux ports sont publiés sur le PC Hôte. Tout le reste est interne à Docker.

Le WAF écoute sur 8080 à l'intérieur de Docker et est publié sur 8082 côté Wi-Fi
(réglable avec la variable `WAF_PORT` du `.env`).

| Port hôte | Service | Rôle | Qui peut y accéder |
|---|---|---|---|
| `8082/tcp` | `waf` | Point d'entrée unique de la plateforme (front `/`, API `/api/`, auth `/auth/`) | Tout `192.168.137.0/24`, y compris l'attaquant `.50` (c'est la cible de la démo) |
| `3000/tcp` | `grafana` | Supervision (lecture) | Tout `192.168.137.0/24` au niveau réseau ; accès protégé par le compte Grafana (mot de passe hors Git, pas d'accès anonyme) |

L'adresse d'écoute est pilotée par la variable `PUBLISH_IP` du `.env` :
- `0.0.0.0` par défaut, pratique hors du labo ;
- `192.168.137.1` pour n'écouter que sur l'interface du hotspot.

Conséquences de `PUBLISH_IP=192.168.137.1` (à tester avant de l'adopter) :
- `localhost:8082` ne répond plus sur le PC Hôte : il faut utiliser `http://192.168.137.1:8082` ;
- si le hotspot tombe, cette adresse disparaît, et le redémarrage du `waf` (y compris par la remédiation) échoue,
  car Docker ne peut pas écouter sur une IP absente.

Tant que ce n'est pas validé, on reste sur `0.0.0.0`.

À vérifier : avec Docker Desktop, le WAF peut voir une adresse interne de Docker (la passerelle
`10.77.10.1` ou une adresse `192.168.65.x` de Docker Desktop) à la place de l'IP réelle du client (`192.168.137.50`). Dans ce cas, bannir une IP reviendrait à
bannir tout le monde. À tester dès le premier `up` : `curl` depuis le PC Attaquant, puis lire l'IP dans les logs
du WAF. Si l'IP réelle n'apparaît pas, le confinement se fera par signature et par limitation de débit, pas par IP.

Publié sur le PC Hôte uniquement (`127.0.0.1`, invisible depuis le Wi-Fi) : `ai-api` sur 8001, appelé par le
navigateur du dashboard (zone 3) affiché sur le PC Hôte.

Jamais publiés : Postgres (5432), API (8000), Prometheus (9090), Loki (3100), remediation, ml-detector,
socket-proxy. Ces services n'ont aucune directive `ports:` dans le compose.

### Pare-feu Windows

Choix de l'équipe : on ne modifie pas le pare-feu Windows du PC Hôte.

- Docker Desktop a installé une règle « Docker Desktop Backend » qui autorise `com.docker.backend.exe` sur tous les ports.
  Les ports publiés (8082 et 3000) sont donc joignables depuis tout le Wi-Fi, y compris depuis le PC Attaquant.
- Ce n'est pas un problème pour le WAF, qui doit être joignable par tous.
- Pour Grafana, la protection se fait au niveau de l'application : pas d'accès anonyme, pas d'inscription, mot de passe admin
  défini uniquement dans le `.env` local (non versionné), chiffré dans le dépôt avec SOPS + age (`secrets.enc.env`).
- Le reste n'est pas exposé de toute façon : aucun autre service n'a de port publié.

Règle ICMP créée sur le PC Hôte pour autoriser le ping (sans restriction d'adresse) ; sans elle le ping échoue,
mais les tests de port restent la vraie preuve de connectivité :

```powershell
New-NetFirewallRule -DisplayName "ICMP labo" -Protocol ICMPv4 -IcmpType 8 -Direction Inbound -Action Allow
```

Le ping reste instable à travers le hotspot Windows. Il sert seulement d'indication : la preuve de connectivité reste le
test de port TCP (§ 1).

## 3. Ports internes (réseaux Docker uniquement)

| Service | Port conteneur | Publié ? | Consommé par |
|---|---|---|---|
| `waf` | 8080 | oui → hôte 8082 | Navigateurs du Wi-Fi |
| `frontend` (Antoine) | 3000 | non | `waf` |
| `ai-api` (Agathe) | 8000 | 127.0.0.1:8001 seulement | navigateur du PC Hôte (zone 3 du dashboard) |
| `traffic-gen` | — (client uniquement) | non | — (il appelle `waf:8080`) |
| `payment-api` | 8000 | non | `waf`, `prometheus` (`/metrics`) |
| `auth` | 8001 | non | `waf`, `payment-api` |
| `postgres` (PostgreSQL 16) | 5432 | non | `payment-api` |
| `prometheus` | 9090 | non | `grafana` (datasource) |
| `grafana` | 3000 | oui → hôte 3000 | Équipe sur le Wi-Fi |
| `loki` | 3100 | non | `promtail` (push), `grafana`, `ml-detector` (lecture), `prometheus` (métriques) |
| `promtail` | 9080 | non | `prometheus` (métriques propres) |
| `cadvisor` | 8080 | non | `prometheus` |
| `docker-stats-exporter` | 9105 | non | `prometheus`, `ml-detector` (état des conteneurs) |
| `ml-detector` | 8010 | non | `prometheus` (métriques) |
| `remediation` | 8020 | non | `ml-detector` (déclenchement), `prometheus` (métriques) |
| `socket-proxy-ro` | 2375 | non | `promtail`, `cadvisor`, `docker-stats-exporter` |
| `socket-proxy-remed` | 2375 | non | `remediation` uniquement (filtrage par IP source dans le proxy) |

Le port 8080 de `cadvisor` (et de `waf` en interne) et le port 3000 de `frontend` ne sont pas en conflit :
chaque conteneur a sa propre pile réseau, et seuls `waf` (→ hôte 8082) et `grafana` (→ hôte 3000) sont mappés sur l'hôte.

## 4. Réseaux Docker

On utilise la plage `10.77.0.0/16` pour éviter deux conflits :
- WSL2 et Docker Desktop utilisent `172.17–172.20.x` (WSL `eth0` est actuellement en `172.18.1.106/20`) ;
- le hotspot est en `192.168.137.x`.

| Réseau | Sous-réseau | `internal` | Membres | Rôle |
|---|---|---|---|---|
| `edge` | `10.77.10.0/24` | non | waf, grafana, ai-api | Seul réseau relié à l'extérieur, nécessaire pour publier un port |
| `app` | `10.77.20.0/24` | oui | waf, frontend, payment-api, auth, prometheus, traffic-gen, remediation | Trafic applicatif derrière le WAF |
| `data` | `10.77.30.0/24` | oui | payment-api, auth, postgres, remediation  | L'API écrit, la remédiation lit (compte `remediation_ro`) |
| `monitoring` | `10.77.40.0/24` | oui | prometheus, grafana, loki, promtail, cadvisor, docker-stats-exporter, ml-detector, socket-proxy-ro, remediation | Collecte et lecture des métriques et des logs ; ml-detector y prévient remediation |
| `remediation` | `10.77.50.0/24` | oui | remediation, socket-proxy-remed | Seul le moteur de remédiation joint le proxy qui redémarre les conteneurs |

`internal: true` signifie que Docker ne crée ni NAT ni route vers l'extérieur. Un conteneur placé uniquement sur
des réseaux internes ne peut joindre ni Internet, ni le Wi-Fi, ni le PC d'Agathe.

À l'intérieur d'un réseau Docker, tous les membres peuvent se parler sur tous les ports. On isole donc
en choisissant qui est sur quel réseau :
- `ml-detector` n'est pas sur `remediation`. Il ne peut pas redémarrer un conteneur lui-même : il doit passer
  par l'API de remediation (authentifiée par jeton), qui applique la liste blanche Ansible.
- Le proxy en lecture seule (`socket-proxy-ro`) est sur `monitoring`. C'est un risque connu, voir § 5.

### Adresses fixes des conteneurs

Chaque service garde le même dernier octet sur tous ses réseaux, pour qu'on le reconnaisse
immédiatement dans les logs. Le `.1` de chaque sous-réseau est réservé à la passerelle du bridge Docker.

| Service | Octet | Adresses |
|---|---|---|
| waf | `.10` | 10.77.10.10, 10.77.20.10 |
| frontend | `.11` | 10.77.20.11 |
| ai-api | `.41` | 10.77.10.41 |
| traffic-gen | `.14` | 10.77.20.14 |
| payment-api | `.12` | 10.77.20.12, 10.77.30.12 |
| auth | `.13` | 10.77.20.13, 10.77.30.13 |
| postgres | `.20` | 10.77.30.20 |
| prometheus | `.30` | 10.77.20.30, 10.77.40.30 |
| grafana | `.31` | 10.77.10.31, 10.77.40.31 |
| loki | `.32` | 10.77.40.32 |
| promtail | `.33` | 10.77.40.33 |
| cadvisor | `.34` | 10.77.40.34 |
| docker-stats-exporter | `.35` | 10.77.40.35 |
| ml-detector | `.40` | 10.77.40.40 |
| remediation | `.50` | 10.77.20.50, 10.77.30.50, 10.77.40.50, 10.77.50.50 |
| socket-proxy-ro | `.60` | 10.77.40.60 |
| socket-proxy-remed | `.61` | 10.77.50.61 |

### Volume partagé

| Volume | Écriture | Lecture | Rôle |
|---|---|---|---|
| `waf-blocklist` (en mémoire) | remediation (`/blocklist`) | waf (`/etc/nginx/blocklist`, lecture seule) | Règles de confinement écrites par `block_source.yml`. Pas de lien réseau direct entre remediation et waf. |

## 5. Matrice des flux autorisés

Tout flux absent de ce tableau est interdit. Il est bloqué soit parce que les deux conteneurs ne partagent
aucun réseau, soit parce que le réseau est `internal`.

| # | Source | Destination | Port | Pourquoi |
|---|---|---|---|---|
| F1 | Wi-Fi (`192.168.137.0/24`) | waf | 8082 | Accès à la plateforme et attaque de démo |
| F2 | Équipe (`.1 .60 .101 .102`) | grafana | 3000 | Supervision |
| F3 | waf | frontend | 3000 | Pages du dashboard (`/`) |
| F4 | waf | payment-api | 8000 | Uniquement `/api/pay`, `/api/health` et `/api/transactions` (`/docs`, `/openapi.json` et `/metrics` refusés) |
| F5 | waf | auth | 8001 | Routes `/auth/*` |
| F6 | payment-api | auth | 8001 | Vérification des jetons |
| F7 | payment-api | postgres | 5432 | Transactions SQL |
| F8 | prometheus | payment-api, cadvisor, docker-stats-exporter, loki, promtail, ml-detector, remediation | 8000, 8080, 9105, 3100, 9080, 8010, 8020 | Collecte des métriques |
| F9 | grafana | prometheus, loki | 9090, 3100 | Datasources |
| F10 | promtail | socket-proxy-ro | 2375 | Découverte des conteneurs et lecture des logs (GET seulement) |
| F11 | cadvisor, docker-stats-exporter | socket-proxy-ro | 2375 | Métadonnées et statistiques des conteneurs (GET seulement) |
| F12 | promtail | loki | 3100 | Envoi des logs |
| F13 | ml-detector | loki, docker-stats-exporter | 3100, 9105 | Mesures de la détection (logs du waf et du trafic, état des conteneurs) |
| F14 | ml-detector | remediation | 8020 | `POST /alerts` avec jeton, quand le modèle Isolation Forest confirme une anomalie |
| F15 | remediation | socket-proxy-remed | 2375 | Lecture (conteneurs, réseaux, volumes) et `POST /containers/{id}/restart` uniquement, depuis le seul conteneur `remediation` |
| F16 | traffic-gen | waf | 8080 | Trafic normal : un `POST /api/pay` toutes les 2 s, par le même chemin qu'un vrai client |
| F17 | remediation | waf | 8080 | Paiement de test après une action de remédiation, par le chemin d'un vrai client |
| F18 | remediation | postgres | 5432 | Contrôle d'intégrité et preuve de reprise, compte `remediation_ro` en lecture seule (deux tables) |
| F19 | ai-api | Ollama (PC Hôte ou PC IA `.60`) | 11434 | Assistant RAG : seul service à sortir vers Ollama, par le réseau `edge` |
| F20 | waf | ai-api | 8000 | Route `/ai/` de l'assistant, par le réseau `edge` |
| F21 | auth | postgres | 5432 | Comptes et soldes du service d'authentification |

### Flux interdits

| Source | Destination | Comment c'est garanti |
|---|---|---|
| Wi-Fi (dont l'attaquant `.50`) | postgres, payment-api, prometheus, loki, remediation | Aucun port publié pour ces services |
| Attaquant `.50` | contenu de Grafana | Le port 3000 est joignable, mais il faut le compte Grafana (pas d'anonyme, mot de passe hors Git) |
| waf, frontend, ml-detector | postgres | Pas sur le réseau `data` |
| remediation | écriture dans postgres | Compte `remediation_ro` : lecture seule par défaut et aucun droit d'écriture |
| payment-api | loki, grafana, remediation, socket-proxy | Aucun réseau partagé (payment-api n'est que sur `app` et `data`) |
| ml-detector, grafana, tout `monitoring` | socket-proxy-remed (redémarrage direct) | Le réseau `remediation` ne contient que remediation et ce proxy |
| remediation, ml-detector | Ollama `192.168.137.60:11434` | Uniquement sur des réseaux `internal` : aucune route vers le Wi-Fi |
| N'importe quel autre conteneur | `/var/run/docker.sock` | Seuls les deux socket-proxy montent la socket. Ce qu'on peut faire à travers eux est limité par leurs règles d'API (liste blanche de chemins par méthode HTTP) : le montage `:ro` seul n'empêche pas d'envoyer des commandes à Docker |

### Risques restants

| Risque | Pourquoi il existe | Mesures qui le réduisent |
|---|---|---|
| Un conteneur de `monitoring` compromis (par exemple grafana, publié sur le Wi-Fi) interroge `socket-proxy-ro` et lit la configuration des conteneurs | Le proxy en lecture partage le réseau `monitoring` et n'a pas d'authentification | Proxy en GET uniquement. Prévu : passer les mots de passe en secrets Docker (`/run/secrets/…`) pour qu'ils n'apparaissent plus dans `docker inspect`. Accès à Grafana protégé par compte. |
| Un conteneur de `monitoring` compromis appelle l'API de remediation | remediation est sur `monitoring` pour recevoir les alertes de ml-detector | API protégée par jeton. Actions limitées à la liste blanche Ansible. Toutes les demandes sont journalisées dans Loki. |
| Le PC Attaquant atteint la page de connexion de Grafana | Pare-feu Windows non modifié (choix de l'équipe) : la règle de Docker Desktop ouvre les ports publiés | Pas d'accès anonyme, mot de passe hors Git (chiffré avec SOPS + age). Possible ensuite : comptes Viewer pour l'équipe |

Une amélioration possible serait d'isoler `socket-proxy-ro` sur un réseau dédié à promtail et cadvisor
(un 6e réseau). Nous l'avons écartée pour garder l'architecture lisible en 5 zones. Cette limite est documentée dans le dossier.

## 6. Séparation RAG / LLM et remédiation

- Ollama tourne sur le PC d'Agathe (`192.168.137.60:11434`), en dehors de la plateforme Docker.
- `ai-api` (détection + RAG d'Agathe) est sur `edge`, le seul réseau avec une sortie : il peut joindre Ollama, mais il n'est
  sur aucun réseau de la remédiation et ne peut joindre ni le moteur ni les proxys Docker.
- remediation et ml-detector ne peuvent pas joindre `192.168.137.60`, car ils n'ont que des réseaux internes.
  Seuls `waf` et `grafana`, sur `edge`, ont une route sortante. Ils ne parlent ni à remediation ni au proxy qui redémarre les conteneurs.
- L'assistant RAG ne déclenche jamais de remédiation. S'il a besoin de contexte (métriques, logs), il passe par
  Grafana (`192.168.137.1:3000`) avec un compte Viewer en lecture seule.
- Si l'assistant RAG tourne sur le PC d'Agathe lui-même, Ollama peut rester sur `127.0.0.1:11434`, ce qui est le
  plus sûr. Sinon, il faut limiter le port 11434 par pare-feu aux seules IP qui en ont besoin.

## 7. Vérifications à faire (recette réseau)

Depuis un PC du Wi-Fi :

| Test | Résultat attendu |
|---|---|
| Port `8082` — Windows : `Test-NetConnection 192.168.137.1 -Port 8082` · Linux : `nc -vz -w 3 192.168.137.1 8082` · macOS : `nc -vz -G 3 192.168.137.1 8082` | Succès |
| idem port `3000` depuis un PC de l'équipe | Succès |
| idem port `3000` depuis le PC Attaquant `.50` | Port ouvert, mais connexion à Grafana refusée sans le mot de passe |
| idem ports `5432`, `8000`, `9090`, `3100` | Échec |

### Matrice de connectivité à cocher

Cocher ✅ (conforme), ❌ (non conforme) ou laisser vide (pas encore testé). Date et testeur en bas.
Ping : indicatif seulement. Ports : la vraie preuve.

Les 4 PC de l'équipe joignent le WAF (port 8082). Les ports 5432 et 8000 sont fermés (aucun port publié dans le
compose), et Grafana (3000) est joignable mais protégé par mot de passe. Comportement des ports garanti par
l'architecture et vérifié côté hôte par `make security-check` ; test multi-PC confirmé en direct.

| Depuis ↓ / Test → | Ping hôte | `:8082` (WAF) | `:3000` (Grafana) | `:5432` | `:8000` | Ping autres PC |
|---|---|---|---|---|---|---|
| Clara `.50` (Attaquant) | indicatif | ✅ | ✅ ouvert, login refusé | ❌ fermé | ❌ fermé | indicatif |
| Agathe `.60` (IA) | indicatif | ✅ | ✅ (avec compte) | ❌ fermé | ❌ fermé | indicatif |
| Antoine `.101` | indicatif | ✅ | ✅ (avec compte) | ❌ fermé | ❌ fermé | indicatif |
| Timéo `.102` | indicatif | ✅ | ✅ (avec compte) | ❌ fermé | ❌ fermé | indicatif |

Testé le : 22/10/2026 · par : équipe G4

Depuis le PC Hôte (WSL) :

```bash
# Les 5 réseaux du projet, leur sous-réseau et leur caractère internal
docker network inspect -f '{{.Name}} internal={{.Internal}} {{range .IPAM.Config}}{{.Subnet}}{{end}}' \
  $(docker network ls -q --filter label=com.docker.compose.project=cybersecu-workshop-2026-2027)

# remediation ne doit pas joindre Ollama (doit afficher BLOQUÉ)
docker compose exec remediation python -c "import socket
try: socket.create_connection(('192.168.137.60', 11434), 3); print('JOIGNABLE : ANOMALIE')
except OSError: print('BLOQUÉ : conforme')"
```
