set -eu
uname -m
docker compose version
docker version --format '{{.Server.Version}}'
for p in /opt/shebang /opt/shebang-prod; do if [ -e "$p" ]; then ls -ld "$p"; else printf 'AVAILABLE %s\n' "$p"; fi; done
ufw status 2>/dev/null || true
docker inspect offerflow-gateway-1 --format '{{.Id}}|{{.State.StartedAt}}|{{json .Mounts}}'
docker ps --format '{{.Names}}|{{.ID}}|{{.Status}}'
