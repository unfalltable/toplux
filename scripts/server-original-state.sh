set -eu
python3 - <<'PY'
import subprocess,json,re,urllib.request,ssl
raw=subprocess.check_output(["docker","ps","--format","{{.Names}}"]).decode().splitlines()
names=[n for n in raw if n.startswith("offerflow-")]
state={}
for name in names:
 item=json.loads(subprocess.check_output(["docker","inspect",name]))[0]
 state[name]={"id":item["Id"],"startedAt":item["State"]["StartedAt"],"status":item["State"]["Status"],"health":item["State"].get("Health",{}).get("Status")}
try:
 cfg=json.loads(subprocess.check_output(["docker","exec","offerflow-gateway-1","caddy","adapt","--config","/etc/caddy/Caddyfile","--adapter","caddyfile"],stderr=subprocess.DEVNULL))
 domains=set()
 def walk(x):
  if isinstance(x,dict):
   for k,v in x.items():
    if k=="host" and isinstance(v,list):domains.update(h for h in v if re.fullmatch(r"[a-zA-Z0-9.-]+",h))
    walk(v)
  elif isinstance(x,list):
   for v in x:walk(v)
 walk(cfg)
except Exception:domains=set()
checks=[]
for host in sorted(domains)[:6]:
 try:
  r=urllib.request.urlopen("https://"+host,timeout=5)
  checks.append({"host":host,"status":r.status})
 except Exception as e:checks.append({"host":host,"error":type(e).__name__})
print(json.dumps({"containers":state,"existingSites":checks}))
PY
