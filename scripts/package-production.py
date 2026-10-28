import tarfile,pathlib,hashlib,json,sys
root=pathlib.Path.cwd()
paths=["package.json","package-lock.json","tsconfig.json","tsconfig.server.json","vite.config.ts",".dockerignore","apps/api/src","apps/api/migrations","apps/admin_web","design/contracts/categories.json","design/atlas-seed.json","design/atlas-ranking.json","design/brand-media.json","infra/production"]
media=json.loads((root/"design/brand-media.json").read_text(encoding="utf8"))
active=set()
def collect(value):
 if isinstance(value,dict):
  if isinstance(value.get("src"),str) and value["src"].startswith("/media/brands/"):active.add(value["src"])
  for child in value.values():collect(child)
 elif isinstance(value,list):
  for child in value:collect(child)
collect(media)
target=root/"artifacts"/(sys.argv[1] if len(sys.argv)>1 else "shebang-production-20261028.tar.gz")
if target.exists():raise RuntimeError("Archive already exists; inspect it and choose a new release filename")
target.parent.mkdir(exist_ok=True)
with tarfile.open(target,"w:gz") as archive:
 for relative in paths:
  path=root/relative
  if path.is_dir():
   for item in sorted(path.rglob("*")):
    if item.is_file() and "node_modules" not in item.parts and not item.name.startswith(".env"):
     rel=item.relative_to(root).as_posix()
     if rel.startswith("apps/admin_web/public/media/brands/") and "/"+rel.removeprefix("apps/admin_web/public/") not in active:continue
     if any(part in {".git","dist","build",".data",".dart_tool"} for part in item.relative_to(root).parts):continue
     archive.add(item,arcname=rel)
  else:archive.add(path,arcname=relative)
digest=hashlib.sha256(target.read_bytes()).hexdigest()
print(json.dumps({"path":str(target.relative_to(root)),"sha256":digest,"bytes":target.stat().st_size}))
