set -euo pipefail
root=/opt/shebang-prod
unit=shebang-deploy-20261028-fb213c227556
if systemctl is-active --quiet "$unit"; then printf 'DEPLOY_ALREADY_RUNNING\n'; exit 0; fi
if [ "$(cat "$root/shared/deploy-status" 2>/dev/null || true)" = 'SUCCESS 20261028-fb213c227556' ]; then printf 'DEPLOY_ALREADY_COMPLETE\n'; exit 0; fi
cat > "$root/shared/deploy-20261028-fb213c227556.sh" <<'SHEBANG_DEPLOY_SCRIPT'
#!/bin/bash
set -euo pipefail
root=/opt/shebang-prod
status="$root/shared/deploy-status"
if [ "$(cat "$status" 2>/dev/null || true)" = 'SUCCESS 20261028-fb213c227556' ]; then exit 0; fi
printf 'RUNNING 20261028-fb213c227556\n' > "$status"
trap 'printf "FAILED 20261028-fb213c227556\n" > "$status"' ERR
exec >> "$root/shared/deploy-20261028-fb213c227556.log" 2>&1
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
printf 'SUCCESS 20261028-fb213c227556\n' > "$status"

SHEBANG_DEPLOY_SCRIPT
chmod 0700 "$root/shared/deploy-20261028-fb213c227556.sh"
systemd-run --unit="$unit" --collect --property=Type=exec /bin/bash "$root/shared/deploy-20261028-fb213c227556.sh"
printf 'DEPLOY_STARTED\n'
