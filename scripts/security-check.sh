#!/usr/bin/env bash
# Vérifie l'exposition réseau, l'isolation entre conteneurs et les droits des socket-proxy.
# Chaque ligne affiche OK ou ANOMALIE ; le script sort en erreur s'il y a au moins une anomalie.
set -uo pipefail
cd "$(dirname "$0")/.."

PROJET=cybersecu-workshop-2026-2027
WAF_PORT="${WAF_PORT:-8082}"
PY=python:3.12.11-alpine3.22
anomalies=0

ok()  { echo "  OK        $1"; }
ko()  { echo "  ANOMALIE  $1"; anomalies=$((anomalies + 1)); }
attendu() { [ "$2" = "$3" ] && ok "$1 ($2)" || ko "$1 : obtenu $2, attendu $3"; }

# Les tests réseau tournent dans un conteneur python temporaire qui partage le réseau du service testé :
# on teste la position réseau du service, sans dépendre de ce qu'il y a dans son image.
tcp() {  # tcp <service> <hôte> <port> -> JOIGNABLE | bloqué
  docker run --rm --network "container:resilience-$1" "$PY" python -c "
import socket
try: socket.create_connection(('$2', $3), 2); print('JOIGNABLE')
except OSError: print('bloqué')"
}
http() {  # http <service> <méthode> <url> -> code HTTP
  docker run --rm --network "container:resilience-$1" "$PY" python -c "
import urllib.request as u
try: print(u.urlopen(u.Request('$3', method='$2', data=b'' if '$2' == 'POST' else None), timeout=5).status)
except u.HTTPError as e: print(e.code)
except OSError: print('bloqué')"
}

echo "== Ports publiés sur le PC hôte"
publies=$(docker compose -p "$PROJET" ps --format '{{.Service}} {{.Ports}}' | grep -o '^[a-z-]* .*0\.0\.0\.0' | cut -d' ' -f1 | sort | tr '\n' ' ')
attendu "services publiés" "$publies" "grafana waf "
for p in 5432 8000 9090 3100 2375; do
  nc -z -w 2 localhost "$p" 2>/dev/null && ko "port $p ouvert sur l'hôte" || ok "port $p fermé sur l'hôte"
done

echo "== WAF et Grafana"
for chemin in /api/docs /api/openapi.json /api/metrics; do
  attendu "WAF $chemin" "$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$WAF_PORT$chemin")" 403
done
attendu "Grafana sans mot de passe" "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/api/dashboards/uid/resilience-infra)" 401

echo "== Isolation entre conteneurs"
attendu "frontend -> postgres"              "$(tcp frontend postgres 5432)" bloqué
attendu "waf -> postgres"                   "$(tcp waf postgres 5432)" bloqué
attendu "ml-detector -> postgres"           "$(tcp ml-detector postgres 5432)" bloqué
attendu "ml-detector -> socket-proxy-remed" "$(tcp ml-detector socket-proxy-remed 2375)" bloqué
attendu "payment-api -> loki"               "$(tcp payment-api loki 3100)" bloqué
attendu "remediation -> Ollama (.60)"       "$(tcp remediation 192.168.137.60 11434)" bloqué
attendu "remediation -> Internet"           "$(tcp remediation 1.1.1.1 443)" bloqué

echo "== Compte Postgres de la remédiation (lecture seule)"
pg() { docker compose -p "$PROJET" exec -T remediation psql -X -A -t -c "set default_transaction_read_only = off" -c "$1" 2>&1 | tail -1; }
attendu "lecture des transactions"  "$(pg 'select 1 from transactions limit 1')" 1
case "$(pg 'update accounts set balance = balance')" in *"permission denied"*) ok "écriture refusée" ;; *) ko "écriture possible avec remediation_ro" ;; esac
case "$(pg 'select 1 from merchants limit 1')" in *"permission denied"*) ok "table merchants (clés API) refusée" ;; *) ko "merchants lisible par remediation_ro" ;; esac

echo "== Droits du proxy de remédiation"
R=http://socket-proxy-remed:2375
attendu "lister les conteneurs"   "$(http remediation GET  $R/containers/json)" 200
attendu "créer un conteneur"      "$(http remediation POST $R/containers/create)" 403
attendu "exec dans postgres"      "$(http remediation POST $R/containers/resilience-postgres/exec)" 403
attendu "arrêter un conteneur"    "$(http remediation POST $R/containers/resilience-auth/stop)" 403
attendu "lister les images"       "$(http remediation GET  $R/images/json)" 403
attendu "kill du waf"              "$(http remediation POST "$R/containers/resilience-waf/kill?signal=KILL")" 403
code=$(docker run --rm --network "${PROJET}_remediation" "$PY" python -c "
import urllib.request as u
try: print(u.urlopen('$R/containers/json', timeout=5).status)
except u.HTTPError as e: print(e.code)")
attendu "autre client que remediation" "$code" 403

echo "== Droits du proxy en lecture"
attendu "redémarrer via socket-proxy-ro" "$(http ml-detector POST http://socket-proxy-ro:2375/containers/resilience-auth/restart)" 403

echo "== Liste blanche Ansible"
avant=$(docker inspect -f '{{.State.StartedAt}}' resilience-postgres)
docker compose -p "$PROJET" exec -T remediation ansible-playbook /ansible/playbooks/restart_service.yml -e service=postgres >/dev/null 2>&1 \
  && ko "redémarrage de postgres accepté" || ok "redémarrage de postgres refusé"
attendu "postgres non touché" "$(docker inspect -f '{{.State.StartedAt}}' resilience-postgres)" "$avant"

echo
if [ "$anomalies" -eq 0 ]; then echo "Résultat : aucune anomalie"; else echo "Résultat : $anomalies anomalie(s)"; exit 1; fi
