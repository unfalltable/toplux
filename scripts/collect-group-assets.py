import requests,bs4,concurrent.futures,json,pathlib,hashlib,re,unicodedata
from urllib.parse import urljoin
D=pathlib.Path('artifacts/media-research');D.mkdir(exist_ok=True)
roots=json.loads((D/'official-group-roots.json').read_text(encoding='utf8'))
names={'Louis Vuitton':'louis-vuitton','Dior':'christian-dior','LOEWE':'/loewe','Fendi':'/fendi','Berluti':'berluti','Loro Piana':'loro-piana','Celine':'/celine','RIMOWA':'rimowa','Bvlgari':'bulgari','Tiffany & Co.':'tiffany-co','Gucci':'/gucci','Saint Laurent':'saint-laurent','Bottega Veneta':'bottega-veneta','Brioni':'/brioni','Boucheron':'/boucheron','Frédéric Malle':'frederic-malle','Jo Malone London':'jo-malone-london','La Mer':'/la-mer','Le Labo':'/le-labo'}
headers={'User-Agent':'Mozilla/5.0'}
def norm(s):return re.sub('[^a-z0-9]','',unicodedata.normalize('NFKD',s).encode('ascii','ignore').decode().lower())
def save(url,page,alt):
 try:
  r=requests.get(url,headers=headers,timeout=(5,12))
  if r.status_code!=200 or len(r.content)<200 or len(r.content)>12000000:return None
  if not ('image' in r.headers.get('Content-Type','') or b'<svg' in r.content[:300]):return None
  sha=hashlib.sha256(r.content).hexdigest();f=D/(sha+('.svg' if b'<svg' in r.content[:300] else '.img'));f.write_bytes(r.content)
  return {'file':str(f).replace('\\','/'),'url':url,'page':page,'alt':alt,'kind':'logo','sha256':sha,'checkedAt':'2026-10-28'}
 except:return None
def run(k,term):
 url=next((l['url'] for root in roots for l in root.get('links',[]) if term in l['url'] and '/our-maisons/' in l['url'] or term in l['url'] and '/houses/' in l['url'] or term in l['url'] and '/our-brands/' in l['url']),None)
 if not url:return {'key':k,'error':'no page'}
 try:
  r=requests.get(url,headers=headers,timeout=(5,15));s=bs4.BeautifulSoup(r.text,'html.parser');images=[]
  for el in s.find_all(['img','source']):
   src=el.get('src') or el.get('data-src') or (el.get('srcset','').split(',')[0].split(' ')[0])
   if not src or src.startswith('data:'):continue
   alt=el.get('alt','');ctx=str(el.attrs)
   n=norm(k.replace('& Co.',''));txt=norm(src+' '+alt)
   score=(100 if n in norm(alt) else 0)+(40 if n in norm(src) else 0)+(60 if 'logo' in ctx.lower() else 0)
   if any(x in txt for x in ['lvmhlogo','keringlogo','elcologo']):score=0
   images.append({'url':urljoin(r.url,src),'alt':alt,'score':score,'context':ctx[:200]})
  images.sort(key=lambda x:-x['score']);candidates=[]
  for im in images[:5]:
   if im['score']<60:continue
   a=save(im['url'],r.url,im['alt'])
   if a:candidates.append(a)
  result={'key':k,'page':r.url,'status':r.status_code,'candidates':candidates,'images':images[:12]}
  print(json.dumps({'brand':k,'status':r.status_code,'logos':len(candidates)}),flush=True);return result
 except Exception as e:return {'key':k,'page':url,'error':str(e)}
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as p:results=list(p.map(lambda x:run(*x),names.items()))
(D/'group-assets.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf8')
