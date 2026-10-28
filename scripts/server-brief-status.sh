set -eu
if [ -f /opt/shebang-prod/shared/deploy-status ]; then cat /opt/shebang-prod/shared/deploy-status; fi
docker ps --filter label=com.docker.compose.project=shebang-prod --format '{{.Names}}|{{.Status}}|{{.Ports}}'
if [ -f /opt/shebang-prod/shared/deploy-20261028-fb213c227556.log ]; then grep -E '^#[0-9]+ .* (DONE|RUN|ERROR)|^#[0-9]+ (DONE|ERROR)|error|Error|failed|Healthy|Started|Unhealthy|SUCCESS' /opt/shebang-prod/shared/deploy-20261028-fb213c227556.log | tail -n 20; fi
