#!/bin/sh
# Schéma et données de départ (database/init.sql, monté en dossier sur /database).
# Monter des dossiers plutôt que des fichiers : un fichier remplacé par git (pull, changement de branche)
# casserait le montage au prochain redémarrage du conteneur.
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -f /database/init.sql
