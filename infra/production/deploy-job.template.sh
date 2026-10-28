#!/bin/bash
set -euo pipefail
root=/opt/shebang-prod
status="$root/shared/deploy-status"
if [ "$(cat "$status" 2>/dev/null || true)" = 'SUCCESS RELEASE_ID' ]; then exit 0; fi
printf 'RUNNING RELEASE_ID\n' > "$status"
trap 'printf "FAILED RELEASE_ID\n" > "$status"' ERR
exec >> "$root/shared/deploy-RELEASE_ID.log" 2>&1
cd "$root/current"
docker compose -f infra/production/compose.yml pull db web
docker compose -f infra/production/compose.yml build api
docker compose -f infra/production/compose.yml up -d --wait --wait-timeout 180
docker compose -f infra/production/compose.yml exec -T web nginx -t
if [ ! -e /etc/cron.d/shebang-prod-backup ]; then
 printf '15 3 * * * root /opt/shebang-prod/current/infra/production/backup.sh >> /opt/shebang-prod/shared/backup.log 2>&1\n' > /etc/cron.d/shebang-prod-backup
 chmod 0644 /etc/cron.d/shebang-prod-backup
fi
"$root/current/infra/production/backup.sh"
printf 'SUCCESS RELEASE_ID\n' > "$status"
