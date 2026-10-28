import requests,bs4,json,pathlib,hashlib,re,datetime
from urllib.parse import urljoin
D=pathlib.Path('artifacts/media-research/recovery-logos');day=datetime.datetime.now(datetime.timezone.utc).date().isoformat();out=[]
def get(u):
 p=D/(hashlib.sha256(u.encode()).hexdigest()+'.html')
 if p.exists():return p.read_bytes()
 try:
  r=requests.get(u,timeout=(4,8),headers={'User-Agent':'Mozilla/5.0'})
  if r.status_code==200:p.write_bytes(r.content);return r.content
 except:pass
 return b''
u='https://group.ferragamo.com/static/images/svg/spritemap.svg';raw=get(u)
if raw:
 soup=bs4.BeautifulSoup(raw,'html.parser')
 row={'key':'Ferragamo','candidates':[]}
 print('Ferragamo symbols',[(s.get('id'),s.get('viewbox')) for s in soup.find_all('symbol') if re.search('logo|ferragamo',str(s.get('id')),re.I)],flush=True)
 for sym in soup.find_all('symbol'):
  if not re.search('logo',str(sym.get('id')),re.I):continue
  txt='<svg xmlns="http://www.w3.org/2000/svg" viewBox="'+str(sym.get('viewbox','0 0 300 100'))+'">'+sym.decode_contents()+'</svg>'
  sha=hashlib.sha256(txt.encode()).hexdigest();p=D/(sha+'.svg');p.write_text(txt,encoding='utf8')
  row['candidates'].append(dict(file=str(p).replace('\\','/'),url=u+'#'+sym.get('id'),page='https://group.ferragamo.com/en/',alt='Ferragamo official mark',sha256=sha,checkedAt=day,context=sym.get('id')))
 out.append(row)
u='https://www.preciosa.com/script/dist/themes/classic/browser/main-AUIYCEHV.js';raw=get(u)
if raw:
 text=raw.decode('utf8','replace');print('Preciosa',re.findall(r'.{0,90}(?:logo|lighting).{0,130}',text,re.I)[:15],flush=True)
(D/'candidates-last-check.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf8')
