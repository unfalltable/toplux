#!/bin/bash
set -euo pipefail
umask 077
root=/opt/shebang-prod
mkdir -p "$root/backups"
target="$root/backups/shebang-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"
docker compose -f "$root/current/infra/production/compose.yml" exec -T db pg_dump -U postgres -d shebang | gzip > "$target.tmp"
gzip -t "$target.tmp"
mv "$target.tmp" "$target"
find "$root/backups" -type f -name 'shebang-*.sql.gz' -mtime +14 -delete
printf 'BACKUP_OK\n'
