#!/bin/sh
# Tourne dans le conteneur du WAF, à côté de nginx.
# Recharge nginx à chaud quand la liste de blocage change (écrite par la remédiation dans le volume waf-blocklist) :
# pas de redémarrage du conteneur, donc aucune connexion coupée, et aucun droit Docker en plus pour la remédiation.
# Si la nouvelle configuration est invalide, nginx garde l'ancienne (le playbook le voit et retire la règle).
DIR=/etc/nginx/blocklist

etat() { ls "$DIR"; cat "$DIR"/*.conf 2>/dev/null; }

dernier=$(etat | md5sum)
while sleep 1; do
  actuel=$(etat | md5sum)
  [ "$actuel" = "$dernier" ] && continue
  dernier=$actuel
  if nginx -t -q 2>/dev/null; then
    nginx -s reload && echo "waf-reload : liste de blocage rechargée"
  else
    echo "waf-reload : configuration refusée par nginx -t, ancienne configuration conservée"
  fi
done
