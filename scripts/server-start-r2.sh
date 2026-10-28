set -euo pipefail
root=/opt/shebang-prod
unit=shebang-fix-20261028-3d4240dd7992
if systemctl is-active --quiet "$unit"; then printf 'FIX_ALREADY_RUNNING\n'; exit 0; fi
if [ "$(cat "$root/shared/deploy-status" 2>/dev/null || true)" = 'SUCCESS 20261028-3d4240dd7992' ]; then printf 'FIX_ALREADY_COMPLETE\n'; exit 0; fi
cat > "$root/shared/fix-20261028-3d4240dd7992.sh" <<'FIX_SCRIPT'
#!/bin/bash
set -euo pipefail
root=/opt/shebang-prod
status="$root/shared/deploy-status"
printf 'RUNNING 20261028-3d4240dd7992\n' > "$status"
trap 'printf "FAILED 20261028-3d4240dd7992\n" > "$status"' ERR
exec >> "$root/shared/fix-20261028-3d4240dd7992.log" 2>&1
cd "$root/current"
docker compose -f infra/production/compose.yml build api
docker compose -f infra/production/compose.yml up -d --no-deps --wait --wait-timeout 120 api
for attempt in $(seq 1 20); do
 if docker compose -f infra/production/compose.yml exec -T web wget -q -O /dev/null http://127.0.0.1:8080/api/v1/health; then break; fi
 sleep 2
done
docker compose -f infra/production/compose.yml exec -T web wget -q -O /dev/null http://127.0.0.1:8080/api/v1/health
docker compose -f infra/production/compose.yml exec -T web nginx -t
if [ ! -e /etc/cron.d/shebang-prod-backup ]; then
 printf '15 3 * * * root /opt/shebang-prod/current/infra/production/backup.sh >> /opt/shebang-prod/shared/backup.log 2>&1\n' > /etc/cron.d/shebang-prod-backup
 chmod 0644 /etc/cron.d/shebang-prod-backup
fi
"$root/current/infra/production/backup.sh"
printf 'SUCCESS 20261028-3d4240dd7992\n' > "$status"
FIX_SCRIPT
chmod 0700 "$root/shared/fix-20261028-3d4240dd7992.sh"
systemd-run --unit="$unit" --collect --property=Type=exec /bin/bash "$root/shared/fix-20261028-3d4240dd7992.sh"
printf 'FIX_STARTED\n'
