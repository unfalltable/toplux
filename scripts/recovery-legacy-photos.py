import requests,bs4,pathlib,json,hashlib,concurrent.futures
from urllib.parse import urljoin
D=pathlib.Path('artifacts/media-research')
jobs=[('Leica','M11 系列','https://leica-camera.com/en-int/photography/cameras/m/m11-p-black'),('Leica','M6','https://leica-camera.com/en-int/photography/cameras/m/m6-black'),('Bang & Olufsen','Beosound 2','https://www.bang-olufsen.com/en/int/speakers/beosound-2')]
def run(job):
 key,name,url=job;out={'key':key,'name':name,'assets':[]}
 try:
  r=requests.get(url,headers={'User-Agent':'Mozilla/5.0'},timeout=12);s=bs4.BeautifulSoup(r.content.decode('utf8','replace'),'html.parser');out['status']=r.status_code;out['page']=r.url
  if r.status_code!=200:return out
  for el in s.select('meta[property="og:image"]'):
   link=urljoin(r.url,el.get('content',''));a=requests.get(link,timeout=12,headers={'User-Agent':'Mozilla/5.0'})
   if a.status_code!=200 or 'image' not in a.headers.get('content-type',''):continue
   blob=a.content;sha=hashlib.sha256(blob).hexdigest();f=D/(sha+'.img');f.write_bytes(blob)
   out['assets'].append({'file':str(f).replace('\\','/'),'url':link,'page':r.url,'alt':s.title.get_text() if s.title else name,'kind':'product','sha256':sha,'checkedAt':'2026-10-28'})
 except Exception as e:out['error']=str(e)
 return out
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as p:out=list(p.map(run,jobs))
(D/'recovery-legacy-photos.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(out,ensure_ascii=True))
