#!/usr/bin/env bash
# Simule une panne puis la répare avec le playbook Ansible, et mesure la coupure.
# Usage : scripts/chaos.sh [service] [durée_panne_en_s]     (par défaut : payment-api 20)
set -euo pipefail
cd "$(dirname "$0")/.."

SERVICE="${1:-payment-api}"
PANNE_S="${2:-20}"
PROJET=cybersecu-workshop-2026-2027

# on ne casse que ce qu'Ansible sait réparer
if ! grep -qE "^[[:space:]]+- ${SERVICE}[[:space:]]*$" ansible/group_vars/all.yml; then
  echo "Refusé : '$SERVICE' n'est pas dans la liste blanche (ansible/group_vars/all.yml)."
  exit 1
fi

heure() { date +%H:%M:%S; }
debut=$(date +%s)
debut_iso=$(date -u +%Y-%m-%dT%H:%M:%SZ)

echo "[$(heure)] PANNE : arrêt de $SERVICE pendant ${PANNE_S} s (à regarder dans Grafana)"
docker compose -p "$PROJET" stop "$SERVICE" >/dev/null 2>&1
sleep "$PANNE_S"

debut_rep=$(date +%s)
echo "[$(heure)] RÉPARATION : playbook Ansible restart_service.yml"
docker compose -p "$PROJET" exec -T remediation ansible-playbook /ansible/playbooks/restart_service.yml -e service="$SERVICE" | grep -E "msg:|failed=" | sed 's/^ *//'
fin=$(date +%s)

# bilan vu par le générateur de trafic (un paiement toutes les 2 s)
docker logs --since "$debut_iso" resilience-traffic-gen 2>&1 | python3 -c '
import sys, json, collections
c = collections.Counter(json.loads(l)["tx_status"] for l in sys.stdin if l.startswith("{\"event\": \"traffic_payment\""))
print("Transactions pendant le test :", dict(c) or "aucune")'
echo "[$(heure)] Service rétabli."
echo "Durée de la panne : $((debut_rep - debut)) s | temps de réparation (playbook) : $((fin - debut_rep)) s"
