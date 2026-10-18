#!/bin/sh
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
\getenv app_password POSTGRES_APP_PASSWORD
CREATE ROLE swevents_app LOGIN PASSWORD :'app_password';
GRANT CONNECT ON DATABASE swevents TO swevents_app;
GRANT USAGE ON SCHEMA public TO swevents_app;
ALTER DEFAULT PRIVILEGES FOR ROLE swevents IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO swevents_app;
ALTER DEFAULT PRIVILEGES FOR ROLE swevents IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO swevents_app;
SQL
