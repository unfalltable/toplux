#!/bin/bash
set -euo pipefail
root=/opt/shebang-prod
key=__RELEASE_KEY__
expected=__SOURCE_SHA__
old=20261028-3d4240dd7992
release="$root/releases/$key"
archive="/tmp/shebang-$key.tar.gz"
unit="shebang-publish-$key"
status="$root/shared/publish-$key.status"
test -f "$root/.shebang-owned"
if [ "$(cat "$status" 2>/dev/null || true)" = "SUCCESS $key" ]; then printf 'ALREADY_SUCCESS %s\n' "$key"; exit 0; fi
if systemctl is-active --quiet "$unit"; then printf 'ALREADY_RUNNING %s\n' "$key"; exit 0; fi
[ "$(readlink -f "$root/current")" = "$root/releases/$old" ] || { printf 'Active release changed; inspect before publishing\n'; exit 1; }
[ "$(cat "$root/current/.source-sha256")" = "3d4240dd799293f2b64364cc6d14501a08625ac3fdf7590be165a613449b56b7" ]
[ "$(sha256sum "$archive" | cut -d' ' -f1)" = "$expected" ] || { printf 'Archive checksum mismatch\n'; exit 1; }
if [ ! -e "$release" ]; then
 mkdir "$release"
 tar -xzf "$archive" -C "$release"
 printf '%s\n' "$expected" > "$release/.source-sha256"
else
 [ "$(cat "$release/.source-sha256")" = "$expected" ]
fi
chmod 0700 "$release/infra/production/backup.sh"
docker compose -f "$release/infra/production/compose.yml" config --quiet
cat > "$root/shared/publish-$key.sh" <<'PUBLISH_JOB'
#!/bin/bash
set -euo pipefail
root=/opt/shebang-prod
key=__RELEASE_KEY__
old=20261028-3d4240dd7992
release="$root/releases/$key"
status="$root/shared/publish-$key.status"
rollback="shebang/app:before-$key"
switched=false
exec 9>"$root/shared/deploy.lock"
flock -n 9
exec >> "$root/shared/publish-$key.log" 2>&1
on_error() {
 set +e
 printf 'FAILED %s\n' "$key" > "$status"
 if [ "$switched" = true ]; then
  docker image tag "$rollback" shebang/app:production &&
  ln -s "$root/releases/$old" "$root/current.rollback-$key" &&
  mv -Tf "$root/current.rollback-$key" "$root/current" &&
  docker compose -f "$root/releases/$old/infra/production/compose.yml" up -d --no-deps --wait --wait-timeout 120 api &&
  printf 'FAILED_ROLLED_BACK %s\n' "$key" > "$status"
 fi
}
trap on_error ERR
[ "$(readlink -f "$root/current")" = "$root/releases/$old" ]
printf 'RUNNING %s\n' "$key" > "$status"
"$root/current/infra/production/backup.sh"
image="$(docker inspect --format '{{.Image}}' shebang-prod-api-1)"
docker image tag "$image" "$rollback"
cd "$release"
docker compose -f infra/production/compose.yml build api
ln -s "$release" "$root/current.next-$key"
mv -Tf "$root/current.next-$key" "$root/current"
switched=true
docker compose -f infra/production/compose.yml up -d --no-deps --wait --wait-timeout 120 api
for attempt in $(seq 1 20); do
 if docker compose -f infra/production/compose.yml exec -T web wget -q -O /dev/null http://127.0.0.1:8080/api/v1/health; then break; fi
 sleep 2
done
docker compose -f infra/production/compose.yml exec -T web wget -q -O /dev/null http://127.0.0.1:8080/api/v1/health
docker compose -f infra/production/compose.yml exec -T web nginx -t
"$release/infra/production/backup.sh"
printf 'SUCCESS %s\n' "$key" > "$status"
PUBLISH_JOB
chmod 0700 "$root/shared/publish-$key.sh"
systemd-run --unit="$unit" --collect --property=Type=exec /bin/bash "$root/shared/publish-$key.sh"
printf 'PUBLISH_STARTED %s\n' "$key"
