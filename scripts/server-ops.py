"""Credential-free deployment transport. Password is supplied to the process environment only."""
import os,sys,json,hashlib,posixpath
import paramiko
HOST="149.88.67.92"
client=paramiko.SSHClient()
client.load_host_keys(os.path.expanduser("~/.ssh/known_hosts"))
client.set_missing_host_key_policy(paramiko.RejectPolicy())
client.connect(HOST,username="root",password=os.environ.pop("PAIHANG_DEPLOY_PASSWORD"),look_for_keys=False,allow_agent=False,timeout=10,banner_timeout=10,auth_timeout=10)
try:
 mode=sys.argv[1]
 if mode=="inspect":
  commands={
   "os":"uname -s; cat /etc/os-release",
   "capacity":"free -m; df -h /; nproc",
   "ports":"ss -lntp",
   "versions":"nginx -v 2>&1; command -v node || true; command -v docker || true; command -v psql || true",
   "nginx_service":"systemctl show nginx -p MainPID -p ActiveState -p SubState",
   "web_services":"systemctl list-units --type=service --state=running --no-pager --no-legend",
   "containers":"if command -v docker >/dev/null; then docker ps --format '{{.Names}}|{{.Image}}|{{.Ports}}'; fi",
   "folders":"ls -ld /opt /srv /var/www; ls -1 /etc/nginx/sites-enabled /etc/nginx/conf.d 2>/dev/null || true"
  }
  for key,cmd in commands.items():
   _,out,err=client.exec_command(cmd,timeout=15);txt=out.read().decode("utf8","replace");e=err.read().decode("utf8","replace");print(json.dumps({key:txt,"stderr":e},ensure_ascii=False))
  sftp=client.open_sftp()
  config=[]
  for folder in ("/etc/nginx/sites-enabled","/etc/nginx/conf.d"):
   try:
    for name in sftp.listdir(folder):
     path=posixpath.join(folder,name)
     try:
      with sftp.open(path,"rb") as f:raw=f.read()
      lines=[]
      for line in raw.decode("utf8","replace").splitlines():
       value=line.strip()
       if value.startswith(("listen ","server_name ","root ","proxy_pass ","include ","return 30","location ","upstream ")):
        if "@" in value:value="[redacted upstream credentials]"
        lines.append(value)
      config.append({"path":path,"sha256":hashlib.sha256(raw).hexdigest(),"routes":lines})
     except IOError:pass
   except IOError:pass
  print(json.dumps({"nginx_configs":config},ensure_ascii=False))
  sftp.close()
 elif mode=="exec":
  with open(sys.argv[2],encoding="utf8") as f:command=f.read()
  _,out,err=client.exec_command(command)
  print(out.read().decode("utf8","replace"),end="")
  print(err.read().decode("utf8","replace"),end="",file=sys.stderr)
  sys.exit(out.channel.recv_exit_status())
 elif mode=="put":
  sftp=client.open_sftp();sftp.put(sys.argv[2],sys.argv[3]);sftp.close();print("UPLOAD_OK")
 else:raise ValueError("Unknown operation")
finally:client.close()
