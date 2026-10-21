#!/bin/sh
# Compte Postgres du moteur de remédiation : lecture seule, uniquement les tables utiles au contrôle d'intégrité.
# Lancé automatiquement à la création de la base, et relançable sans risque.
# Pas de « set -eu » : si le fichier n'est pas exécutable, Postgres le lit dans son propre script d'initialisation.
# Les erreurs SQL arrêtent quand même tout grâce à ON_ERROR_STOP.
psql -v ON_ERROR_STOP=1 -v ro_password="$REMEDIATION_DB_PASSWORD" \
     --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
SELECT format('CREATE ROLE remediation_ro LOGIN PASSWORD %L', :'ro_password')
 WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'remediation_ro') \gexec
ALTER ROLE remediation_ro WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD :'ro_password';
ALTER ROLE remediation_ro SET default_transaction_read_only = on;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM remediation_ro;
GRANT CONNECT ON DATABASE resilience_db TO remediation_ro;
GRANT USAGE ON SCHEMA public TO remediation_ro;
GRANT SELECT ON accounts, transactions TO remediation_ro;
SQL
