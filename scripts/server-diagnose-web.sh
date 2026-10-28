set -eu
cd /opt/shebang-prod/current
docker compose -f infra/production/compose.yml logs --tail=15 web
docker compose -f infra/production/compose.yml exec -T web nginx -t
docker compose -f infra/production/compose.yml exec -T web sh -c 'wget -S -O /dev/null http://api:3180/api/v1/health 2>&1' || true
docker compose -f infra/production/compose.yml ps --format json
