#!/usr/bin/env bash
# ==============================================================================
# PROJECT RESILIENCE-ALPHA : Script de déchiffrement sécurisé des secrets (SOPS + age)
# Responsable : Clara (Lead Cyber & Sécurité opérationnelle)
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

SECRETS_ENC="${ROOT_DIR}/secrets.enc.env"
ENV_TARGET="${ROOT_DIR}/.env"
ENV_EXAMPLE="${ROOT_DIR}/.env.example"

echo "🔐 [SOPS] Vérification des prérequis de chiffrement..."

if ! command -v sops &> /dev/null; then
    echo "❌ Erreur: 'sops' n'est pas installé. Installez-le avec : brew install sops"
    exit 1
fi

if [ ! -f "${SECRETS_ENC}" ]; then
    echo "❌ Erreur: Fichier de secrets chiffré introuvable : ${SECRETS_ENC}"
    exit 1
fi

echo "🔓 [SOPS] Déchiffrement de ${SECRETS_ENC} vers les variables locales..."

# Déchiffrement en mémoire
DECRYPTED_SECRETS=$(sops -d "${SECRETS_ENC}")

if [ ! -f "${ENV_TARGET}" ]; then
    echo "📋 Création de .env à partir de .env.example..."
    cp "${ENV_EXAMPLE}" "${ENV_TARGET}"
fi

# Injection sécurisée des secrets déchiffrés dans .env
while IFS='=' read -r key val || [ -n "$key" ]; do
    # Ignore les commentaires ou lignes vides
    if [[ -z "$key" || "$key" =~ ^# ]]; then
        continue
    fi
    
    # Remplacement ou ajout dans .env
    if grep -q "^${key}=" "${ENV_TARGET}"; then
        sed -i '' "s|^${key}=.*|${key}=${val}|" "${ENV_TARGET}"
    else
        echo "${key}=${val}" >> "${ENV_TARGET}"
    fi
done <<< "${DECRYPTED_SECRETS}"

echo "✅ [SOPS] Secrets injectés avec succès dans .env (fichier ignoré par git)."
echo "🛡️  Vérification de sécurité : .env ne doit JAMAIS être commité."
