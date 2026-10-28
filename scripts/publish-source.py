"""Copy an audited source snapshot into the user's existing empty clone; never initialize Git."""
import pathlib,json,subprocess,shutil,re,hashlib
root=pathlib.Path.cwd()
target=root/".publish-toplux"
def git(*args):
 return subprocess.run(["git","-C",str(target),*args],check=True,capture_output=True,text=True).stdout.strip()
if git("remote","get-url","origin")!="https://github.com/unfalltable/toplux.git":raise RuntimeError("Unexpected remote")
git("fetch","origin")
if git("ls-remote","--heads","origin"):raise RuntimeError("Remote gained history; review and merge before copying")
if git("status","--porcelain"):raise RuntimeError("Clone has changes; inspect instead of overwriting")
head=subprocess.run(["git","-C",str(target),"rev-parse","--verify","HEAD"],capture_output=True)
if head.returncode==0:raise RuntimeError("Clone has existing history; review before copying")
roots=[".gitignore",".dockerignore","README.md","TEST_REPORT.md","package.json","package-lock.json","tsconfig.json","tsconfig.server.json","vite.config.ts","config.example.txt","apps/api","apps/admin_web","design","docs","infra","tests","scripts","apps/client_flutter/lib","apps/client_flutter/test","apps/client_flutter/web","apps/client_flutter/pubspec.yaml","apps/client_flutter/pubspec.lock","apps/client_flutter/analysis_options.yaml","apps/client_flutter/.gitignore","apps/client_flutter/.metadata","apps/client_flutter/README.md"]
skip={"node_modules","dist","build",".dart_tool",".git",".idea",".data",".tools",".publish-toplux",".closeai-attachments","artifacts","__pycache__"}
active=set()
def collect(v):
 if isinstance(v,dict):
  if isinstance(v.get("src"),str) and v["src"].startswith("/media/brands/"):active.add(v["src"])
  for child in v.values():collect(child)
 elif isinstance(v,list):
  for child in v:collect(child)
collect(json.loads((root/"design/brand-media.json").read_text(encoding="utf8")))
selected={}
for name in roots:
 p=root/name
 for f in ([p] if p.is_file() else p.rglob("*")):
  if not f.is_file():continue
  rel=f.relative_to(root)
  if any(part in skip for part in rel.parts) or f.name.startswith(".env") or f.suffix.lower() in {".log",".pem",".key",".p12",".iml",".pyc"}:continue
  s=rel.as_posix()
  if s.startswith("apps/admin_web/public/media/brands/") and "/"+s.removeprefix("apps/admin_web/public/") not in active:continue
  if f.is_symlink():raise RuntimeError("Symlink requires review: "+s)
  selected[s]=f
sensitive=re.compile(rb"(?:github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9]{30,}|-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----|AKIA[A-Z0-9]{16})")
bad=[]
for rel,f in selected.items():
 if f.suffix.lower() in {".png",".jpg",".jpeg",".webp",".ico",".woff",".woff2",".ttf"}:continue
 if sensitive.search(f.read_bytes()):bad.append(rel)
if bad:raise RuntimeError("Potential credential literals; excluded output: "+", ".join(bad))
for rel,f in selected.items():
 dest=target/rel
 if dest.exists():raise RuntimeError("Refusing to overwrite existing clone file: "+rel)
 dest.parent.mkdir(parents=True,exist_ok=True)
 shutil.copyfile(f,dest)
for rel,f in selected.items():
 if hashlib.sha256(f.read_bytes()).digest()!=hashlib.sha256((target/rel).read_bytes()).digest():raise RuntimeError("Snapshot mismatch: "+rel)
print(json.dumps({"files":len(selected),"bytes":sum(f.stat().st_size for f in selected.values()),"activeBrandMedia":len(active),"target":str(target)},ensure_ascii=False))
