import requests,bs4,pathlib,json,re,hashlib,concurrent.futures,unicodedata
from urllib.parse import urljoin
D=pathlib.Path('artifacts/media-research');data=json.loads(pathlib.Path('design/atlas-ranking.json').read_text(encoding='utf8'))
targets={'Rolex':'https://www.rolex.cn/','Tudor':'https://www.tudorwatch.cn/','Louis Vuitton':'https://www.louisvuitton.cn/zhs-cn/homepage','Dior':'https://www.dior.cn/zh_cn','Bvlgari':'https://www.bulgari.cn/zh-cn/','Moncler':'https://www.moncler.cn/','Gucci':'https://www.gucci.cn/zh/'}
def norm(s):return re.sub('[^a-z0-9]+',' ',unicodedata.normalize('NFKD',s).encode('ascii','ignore').decode().lower()).strip()
def get(url):
 p=D/(hashlib.sha256(url.encode()).hexdigest()+'.html')
 if p.exists():return p.read_bytes()
 try:
  r=requests.get(url,headers={'User-Agent':'Mozilla/5.0'},timeout=(5,12))
  if r.status_code==200 and len(r.content)<15000000:p.write_bytes(r.content);return r.content
 except:pass
def run(x):
 key,url=x;out={'key':key,'products':{},'candidates':{}}
 blob=get(url)
 if not blob:return out
 soup=bs4.BeautifulSoup(blob.decode('utf8','replace'),'html.parser')
 prods={p['name']:p for c in data['categories'] for b in c['items'] if b['english']==key for p in b['products']}
 for name in prods:
  terms=[w for w in norm(name).split() if w not in norm(key).split()+['de','the','系列','collection'] and len(w)>2]
  if not terms:continue
  items=[]
  for img in soup.find_all('img'):
   src=img.get('src') or img.get('data-src') or ''
   parent=img.find_parent('a',href=True);text=norm(src+' '+img.get('alt','')+' '+(parent.get('href','') if parent else ''))
   if all(t in text for t in terms) and not re.search('logo|icon|swatch',src,re.I):items.append((src,img.get('alt','')))
  out['candidates'][name]=[]
  for src,alt in items[:3]:
   link=urljoin(url,src);b=get(link)
   if not b or len(b)<2000:continue
   sha=hashlib.sha256(b).hexdigest();f=D/(sha+'.img');f.write_bytes(b)
   out['candidates'][name].append({'file':str(f).replace('\\','/'),'url':link,'page':url,'alt':alt,'sha256':sha,'checkedAt':'2026-10-28','kind':'product'})
 print(json.dumps({'key':key,'products':{k:len(v) for k,v in out['candidates'].items()}},ensure_ascii=True),flush=True);return out
with concurrent.futures.ThreadPoolExecutor(max_workers=7) as p:out=list(p.map(run,targets.items()))
(D/'country-products.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf8')
