set -euo pipefail
root=/opt/shebang-prod
test -f "$root/.shebang-owned"
readlink -f "$root/current"
cat "$root/current/.source-sha256"
docker ps --filter label=com.docker.compose.project=shebang-prod --format '{{.Names}}|{{.ID}}|{{.Status}}|{{.Ports}}'
docker compose -f "$root/current/infra/production/compose.yml" exec -T db psql -U postgres -d shebang -At -c "SELECT json_build_object('profiles',(SELECT count(*) FROM profiles),'brands',(SELECT count(*) FROM merchants),'orders',(SELECT count(*) FROM orders),'ledger',(SELECT count(*) FROM rank_ledger),'amount',(SELECT COALESCE(sum(net_fen),0) FROM merchant_categories));"
