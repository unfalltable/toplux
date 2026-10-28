set -euo pipefail
root=/opt/shebang-prod
compose="$root/current/infra/production/compose.yml"
docker ps --filter label=com.docker.compose.project=shebang-prod --format '{{.Names}}|{{.Status}}|{{.Ports}}'
docker compose -f "$compose" exec -T db psql -U postgres -d shebang -At -c "
SELECT json_build_object(
 'categories',(SELECT count(*) FROM categories),
 'realProfiles',(SELECT count(*) FROM profiles WHERE NOT demo),
 'demoProfiles',(SELECT count(*) FROM profiles WHERE demo),
 'brands',(SELECT count(*) FROM merchants),
 'users',(SELECT count(*) FROM users),
 'orders',(SELECT count(*) FROM orders),
 'receipts',(SELECT count(*) FROM receipts),
 'ledger',(SELECT count(*) FROM rank_ledger),
 'analytics',(SELECT count(*) FROM analytics_events),
 'follows',(SELECT count(*) FROM brand_follows),
 'fundedBrands',(SELECT count(*) FROM merchant_categories WHERE net_fen>0),
 'amountFen',(SELECT COALESCE(sum(net_fen),0) FROM merchant_categories)
);"
docker compose -f "$compose" exec -T api node -e "fetch('http://127.0.0.1:3180/api/v1/health').then(r=>r.json()).then(x=>console.log(JSON.stringify(x)))"
ls -l "$root/backups"
test -f /etc/cron.d/shebang-prod-backup && printf 'BACKUP_SCHEDULE_PRESENT\n'
