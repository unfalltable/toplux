set -eu
root=/opt/shebang-prod
if [ -f "$root/shared/deploy-status" ]; then cat "$root/shared/deploy-status"; else printf 'NOT_STARTED\n'; fi
systemctl show shebang-deploy-20261028-fb213c227556 -p ActiveState -p SubState -p Result || true
if [ -f "$root/shared/deploy-20261028-fb213c227556.log" ]; then tail -n 35 "$root/shared/deploy-20261028-fb213c227556.log"; fi
