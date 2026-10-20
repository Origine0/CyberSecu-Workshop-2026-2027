#!/usr/bin/env bash
# Vérifie qu'aucun secret n'apparaît en clair dans ce qui part dans l'archive Code.zip (contenu du dernier commit),
# et signale les secrets restés dans l'historique Git.
# Sort en erreur si l'archive contiendrait un secret.
set -uo pipefail
cd "$(dirname "$0")/.."

GITLEAKS=zricethezav/gitleaks:v8.30.1
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
bloquants=0
avertissements=0

ok()   { echo "  OK        $1"; }
ko()   { echo "  BLOQUANT  $1"; bloquants=$((bloquants + 1)); }
warn() { echo "  ATTENTION $1"; avertissements=$((avertissements + 1)); }

# Contenu exact de l'archive : les fichiers du dernier commit (ni .env, ni node_modules, ni fichiers non suivis)
git archive HEAD | tar -x -C "$WORK"
[ -z "$(git status --porcelain --untracked-files=no)" ] || warn "modifications non commitées : elles ne seront pas dans l'archive"
echo "Archive analysée : $(find "$WORK" -type f | wc -l) fichiers du commit $(git rev-parse --short HEAD)"

# fichiers qui contiennent volontairement des valeurs interdites (pour vérifier qu'elles sont refusées)
EXCLUS='scripts/secret-scan.sh|scripts/security-check.sh'

echo "== 1. gitleaks sur le contenu de l'archive"
if docker run --rm -v "$WORK:/src:ro" -v "$PWD/.gitleaksignore:/cfg/.gitleaksignore:ro" "$GITLEAKS" \
     dir /src --gitleaks-ignore-path /cfg/.gitleaksignore --redact --no-banner --log-level error; then
  ok "aucune clé, aucun jeton reconnu"
else
  ko "gitleaks a trouvé des secrets (détail ci-dessus)"
fi

echo "== 2. valeurs réelles du .env"
if [ -f .env ]; then
  trouve=0
  while IFS='=' read -r cle valeur; do
    case "$cle" in *PASSWORD*|*SECRET*|*TOKEN*) ;; *) continue ;; esac
    [ "${#valeur}" -ge 6 ] && [ "$valeur" != CHANGE_ME ] || continue
    fichiers=$(grep -rlF -- "$valeur" "$WORK" | sed "s#$WORK/##" | tr '\n' ' ')
    [ -n "$fichiers" ] && { ko "valeur de $cle présente dans : $fichiers"; trouve=1; }
  done < <(grep -E '^[A-Z_]+=' .env)
  [ "$trouve" = 0 ] && ok "aucune valeur du .env dans l'archive"
else
  warn ".env absent : contrôle des valeurs réelles impossible"
fi

echo "== 3. mots de passe et jetons par défaut connus"
for valeur in resilience_pass resilience_grafana resilience-remediation-secret; do
  fichiers=$(grep -rlF -- "$valeur" "$WORK" | sed "s#$WORK/##" | grep -vE "^($EXCLUS)$" | tr '\n' ' ')
  [ -n "$fichiers" ] && ko "\"$valeur\" écrit en dur dans : $fichiers" || ok "\"$valeur\" absent"
done

echo "== 4. réglages avec un secret par défaut écrit en dur"
lignes=$(grep -rnE "(PASSWORD|SECRET|TOKEN)[A-Z_]*\s*:\s*(str|Optional\[str\])\s*=\s*[\"'][^\"']+[\"']" "$WORK" --include=*.py | sed "s#$WORK/##")
[ -n "$lignes" ] && ko "secret par défaut dans le code :"$'\n'"$(echo "$lignes" | sed 's/^/            /')" || ok "aucun"

echo "== 5. clés privées et fichiers sensibles"
cles=$(grep -rlE "AGE-SECRET-KEY-|BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY" "$WORK" | sed "s#$WORK/##")
[ -n "$cles" ] && ko "clé privée dans : $cles" || ok "aucune clé privée ni clé age"
sensibles=$(cd "$WORK" && find . -type f \( -name .env -o -name '.env.local' -o -name key.txt -o -name '*.pem' -o -name '*.key' -o -name '*.p12' -o -name keys.txt \))
[ -n "$sensibles" ] && ko "fichiers sensibles : $sensibles" || ok "aucun .env, key.txt, keys.txt, .pem, .key"
for f in .env.enc secrets.enc.env; do
  [ -f "$WORK/$f" ] || continue
  grep -q 'ENC\[AES256_GCM' "$WORK/$f" && ok "$f est chiffré (SOPS)" || ko "$f n'est pas chiffré"
done

echo "== 6. historique Git (non inclus dans l'archive, mais visible sur GitHub)"
for valeur in resilience_pass resilience-remediation-secret; do
  n=$(git log --all -S"$valeur" --format=%h | wc -l)
  [ "$n" -gt 0 ] && warn "\"$valeur\" présent dans $n commit(s) : à considérer comme public, changer la valeur réelle"
done
if docker run --rm -v "$PWD:/repo:ro" -v "$PWD/.gitleaksignore:/cfg/.gitleaksignore:ro" "$GITLEAKS" \
     git /repo --gitleaks-ignore-path /cfg/.gitleaksignore --redact --no-banner --log-level error; then
  ok "gitleaks : aucune clé reconnue dans l'historique"
else
  warn "gitleaks : secrets dans l'historique (détail ci-dessus)"
fi

echo
echo "Résultat : $bloquants bloquant(s), $avertissements avertissement(s)"
[ "$bloquants" -eq 0 ] || { echo "Ne pas créer l'archive avant d'avoir corrigé les points bloquants."; exit 1; }
