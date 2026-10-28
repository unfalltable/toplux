#!/bin/sh
set -eu
app_password="$(cat /run/secrets/app_password)"
psql --username postgres --dbname shebang --set ON_ERROR_STOP=1 --set app_password="$app_password" <<'SQL'
SELECT format('CREATE ROLE shebang LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD %L', :'app_password') \gexec
ALTER DATABASE shebang OWNER TO shebang;
GRANT ALL ON SCHEMA public TO shebang;
SQL
unset app_password
