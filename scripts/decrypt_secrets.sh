#!/usr/bin/env bash
# ==============================================================================
# PROJECT RESILIENCE-ALPHA : Script de déchiffrement sécurisé des secrets (SOPS + age)
# Responsable : Clara (Lead Cyber & Sécurité opérationnelle)
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

SECRETS_ENC="${ROOT_DIR}/.env.enc"
[ ! -f "${SECRETS_ENC}" ] && SECRETS_ENC="${ROOT_DIR}/secrets.enc.env"
ENV_TARGET="${ROOT_DIR}/.env"

echo "🔐 [SOPS] Vérification des prérequis de chiffrement..."

if ! command -v sops &> /dev/null; then
    echo "❌ Erreur: 'sops' n'est pas installé. Installez-le avec : brew install sops"
    exit 1
fi

if [ ! -f "${SECRETS_ENC}" ]; then
    echo "❌ Erreur: Fichier de configuration chiffré introuvable (.env.enc)"
    exit 1
fi

echo "🔓 [SOPS] Déchiffrement direct de ${SECRETS_ENC} vers .env..."
sops -d "${SECRETS_ENC}" > "${ENV_TARGET}"

echo "✅ [SOPS] Fichier .env généré avec succès à partir des secrets chiffrés (fichier ignoré par git)."
echo "🛡️  Vérification de sécurité : .env ne doit JAMAIS être commité."
