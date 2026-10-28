set -euo pipefail
root=/opt/shebang-prod
release="$root/releases/RELEASE_ID"
archive=/tmp/SOURCE_ARCHIVE
expected=SOURCE_HASH
actual=$(sha256sum "$archive" | cut -d' ' -f1)
[ "$actual" = "$expected" ] || { printf 'Archive checksum mismatch\n'; exit 1; }
if [ -e "$root" ] && [ ! -f "$root/.shebang-owned" ]; then printf 'Unrecognized target directory\n'; exit 1; fi
install -d -m 0755 "$root" "$root/releases"
touch "$root/.shebang-owned"
install -d -m 0700 "$root/shared" "$root/shared/secrets" "$root/backups"
if [ ! -e "$release" ]; then
 mkdir "$release"
 tar -xzf "$archive" -C "$release"
 printf '%s\n' "$expected" > "$release/.source-sha256"
else
 [ "$(cat "$release/.source-sha256")" = "$expected" ] || { printf 'Release mismatch\n'; exit 1; }
fi
python3 - <<'PY'
import os,secrets,pathlib
folder=pathlib.Path("/opt/shebang-prod/shared/secrets")
for name in ("postgres_password","app_password"):
 p=folder/name
 if not p.exists():
  with p.open("x") as f:f.write(secrets.token_urlsafe(40))
  p.chmod(0o444)
url=folder/"db_url"
if not url.exists():
 password=(folder/"app_password").read_text()
 with url.open("x") as f:f.write("postgres://shebang:"+password+"@db:5432/shebang")
 url.chmod(0o444)
PY
if [ -e "$root/current" ] || [ -L "$root/current" ]; then
 [ "$(readlink -f "$root/current")" = "$release" ] || { printf 'An existing different release is active; refusing to switch\n'; exit 1; }
else
 ln -s "$release" "$root/current"
fi
chmod 0700 "$release/infra/production/backup.sh"
cd "$release"
docker compose -f infra/production/compose.yml config --quiet
printf 'PREPARED RELEASE_ID\n'
