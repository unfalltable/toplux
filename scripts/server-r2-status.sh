set -eu
root=/opt/shebang-prod
cat "$root/shared/deploy-status"
systemctl show shebang-fix-20261028-3d4240dd7992 -p ActiveState -p SubState -p Result || true
if [ -f "$root/shared/fix-20261028-3d4240dd7992.log" ]; then tail -n 20 "$root/shared/fix-20261028-3d4240dd7992.log"; fi
