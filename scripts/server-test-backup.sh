set -euo pipefail
root=/opt/shebang-prod
compose="$root/current/infra/production/compose.yml"
latest=$(find "$root/backups" -maxdepth 1 -name 'shebang-*.sql.gz' -type f | sort | tail -n 1)
test -n "$latest"
restore_db=shebang_backup_verification_20261028
existing=$(docker compose -f "$compose" exec -T db psql -U postgres -d postgres -At -c "SELECT count(*) FROM pg_database WHERE datname='$restore_db'")
[ "$existing" = 0 ] || { printf 'Restore verification database already exists; inspect it before continuing\n'; exit 1; }
docker compose -f "$compose" exec -T db createdb -U postgres "$restore_db"
trap 'docker compose -f "$compose" exec -T db dropdb -U postgres "$restore_db"' EXIT
gzip -dc "$latest" | docker compose -f "$compose" exec -T db psql -U postgres -d "$restore_db" -v ON_ERROR_STOP=1 > /dev/null
docker compose -f "$compose" exec -T db psql -U postgres -d "$restore_db" -At -c "SELECT json_build_object('restoredProfiles',(SELECT count(*) FROM profiles WHERE NOT demo),'restoredOrders',(SELECT count(*) FROM orders),'restoredDemo',(SELECT count(*) FROM profiles WHERE demo));"
printf 'RESTORE_VERIFIED\n'
