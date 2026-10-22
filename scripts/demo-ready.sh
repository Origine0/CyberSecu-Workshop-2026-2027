#!/usr/bin/env bash
# Remet la plateforme dans l'état de départ d'une démo ou d'une répétition :
# stack démarrée, liste de blocage du WAF vide, moteur de remédiation remis à zéro, contrôles verts.
# À lancer quand aucune attaque n'est en cours.
set -uo pipefail
cd "$(dirname "$0")/.."

COMPOSE="docker compose"
REMED="$COMPOSE exec -T remediation"
FENETRE_S=35  # fenêtre du détecteur (30 s) + marge : sinon il revoit l'attaque précédente et rebloque

echo "== 1. Services"
$COMPOSE up -d --wait >/dev/null 2>&1 || { echo "Des services ne sont pas healthy : make ps, puis make reload"; exit 1; }
echo "  17 services démarrés et healthy"

echo "== 2. Attente de ${FENETRE_S} s : la fenêtre du détecteur se vide de l'attaque précédente"
sleep "$FENETRE_S"

echo "== 3. Liste de blocage du WAF vidée"
regles=$($REMED sh -c 'ls /blocklist | grep -v "^00-version.conf$"' 2>/dev/null)
for f in $regles; do
  contenu=$($REMED cat "/blocklist/$f")
  case "$f" in
    ratelimit.conf)  type=ratelimit;  valeur=x ;;
    user_agent-*)    type=user_agent; valeur=$(echo "$contenu" | sed -n 's/.*~\* "\([^"]*\)".*/\1/p') ;;
    ip-*)            type=ip;         valeur=$(echo "$contenu" | sed -n 's/^deny \([^;]*\);.*/\1/p') ;;
    *) echo "  règle inconnue $f : laissée en place, à vérifier"; continue ;;
  esac
  $REMED ansible-playbook /ansible/playbooks/block_source.yml -e block_type="$type" -e value="$valeur" -e state=absent \
    >/dev/null 2>&1 && echo "  retirée : $type $valeur" || echo "  ÉCHEC du retrait : $type $valeur"
done
[ -z "$regles" ] && echo "  déjà vide"

echo "== 4. Moteur de remédiation remis à zéro (délais, compteur d'alertes, historique)"
$COMPOSE restart remediation >/dev/null 2>&1 && $COMPOSE up -d --wait remediation >/dev/null 2>&1 && echo "  remediation redémarré"

echo "== 5. Contrôles"
make -s check || exit 1
make -s security-check | tail -1

echo "== 6. État du détecteur"
$REMED python3 -c "
import json, urllib.request as u
s = json.load(u.urlopen('http://ml-detector:8010/status', timeout=3))
f = s['features']
print(f\"  anomalie={s['anomaly']}  score={s['score']:.3f}  req/s={f.get('request_rate')}  erreurs={f.get('error_rate')}  latence={f.get('latency_ms')} ms\")"
echo "Prêt : la prochaine attaque partira d'un état propre."
