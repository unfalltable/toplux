set -euo pipefail
root=/opt/shebang-prod
release="$root/releases/20261028-3d4240dd7992"
archive=/tmp/shebang-3d4240dd7992.tar.gz
expected=3d4240dd799293f2b64364cc6d14501a08625ac3fdf7590be165a613449b56b7
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
 active="$(readlink -f "$root/current")"
 [ "$active" = "$root/releases/20261028-fb213c227556" ] || [ "$active" = "$release" ] || { printf 'Active release mismatch\n'; exit 1; }
 if [ "$active" != "$release" ]; then
  [ "$(cat "$active/.source-sha256")" = "fb213c2275562a13a746ce4c76b76295ff4ce39af20edcfcdbc1ed0ea2bf6490" ] || { printf 'Original release checksum marker mismatch\n'; exit 1; }
  ln -s "$release" "$root/current.next"
  mv -Tf "$root/current.next" "$root/current"
 fi
else
 ln -s "$release" "$root/current"
fi
chmod 0700 "$release/infra/production/backup.sh"
cd "$release"
docker compose -f infra/production/compose.yml config --quiet
printf 'PREPARED 20261028-3d4240dd7992\n'
