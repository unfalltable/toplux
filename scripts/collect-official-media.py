"""Collect public assets from listed official websites. Never crawls private/admin pages."""
import concurrent.futures, hashlib, json, pathlib, re, threading, time, unicodedata
from urllib.parse import urljoin,urlparse,unquote
import requests
from bs4 import BeautifulSoup
ROOT=pathlib.Path.cwd()
CACHE=ROOT/'artifacts/media-research';CACHE.mkdir(parents=True,exist_ok=True)
lock=threading.Lock()
headers={'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36','Accept-Language':'en-US,en;q=0.9'}
def norm(s):
 return re.sub('[^a-z0-9]+',' ',unicodedata.normalize('NFKD',unquote(s)).encode('ascii','ignore').decode().lower()).strip()
def get(url, binary=False):
 if not url.startswith('https://'):return None
 key=hashlib.sha256(url.encode()).hexdigest();p=CACHE/(key+('.bin' if binary else '.html'));m=CACHE/(key+'.json')
 if p.exists() and m.exists():
  meta=json.loads(m.read_text());return p.read_bytes(),meta
 try:
  r=requests.get(url,headers=headers,timeout=(6,14))
  if r.status_code!=200 or len(r.content)>16000000:return None
  meta={'url':url,'finalUrl':r.url,'type':r.headers.get('content-type',''),'status':200}
  p.write_bytes(r.content);m.write_text(json.dumps(meta));return r.content,meta
 except Exception:return None
def asset(url,page,kind,alt=''):
 url=urljoin(page,url)
 if not url.startswith('https://') or any(x in url.lower() for x in ['doubleclick','facebook.com','google-analytics','youtube.com','twitter.com','schema.org']):return None
 result=get(url,True)
 if not result:return None
 blob,meta=result
 if not ('image/' in meta['type'] or re.search(r'\.(svg|png|jpg|jpeg|webp|ico)(\?|$)',url,re.I)):return None
 if len(blob)<150:return None
 key=hashlib.sha256(blob).hexdigest();ext='.svg' if b'<svg' in blob[:500] else '.img'
 path=CACHE/(key+ext);path.write_bytes(blob)
 return {'file':str(path.relative_to(ROOT)).replace('\\','/'),'url':url,'page':page,'alt':alt[:300],'kind':kind,'sha256':key,'checkedAt':'2026-10-28'}
def parse_page(url):
 result=get(url)
 if not result:return None
 blob,meta=result
 html=blob.decode('utf8','replace')
 if len(html)<500 or any(x in html[:6000].lower() for x in ['just a moment...','access denied','request unsuccessful','datadome']):return None
 return BeautifulSoup(html,'html.parser'),meta['finalUrl']
def img_url(img,base):
 for key in ['src','data-src','data-lazy-src','data-original','data-image']:
  val=img.get(key)
  if val and not val.startswith('data:') and 'placeholder' not in val.lower():return urljoin(base,val)
 val=img.get('srcset') or img.get('data-srcset')
 return urljoin(base,val.split(',')[-1].strip().split(' ')[0]) if val else ''
def images(soup,url):
 out=[]
 for el in soup.find_all(['img','source']):
  src=img_url(el,url)
  if src:out.append({'url':src,'alt':el.get('alt',''),'context':(' '.join(el.get('class',[]))+' '+str(el.get('id',''))+' '+str(el.parent.get('class',''))+' '+str(el.parent.get('id','')))[:500]})
 for el in soup.find_all('meta'):
  if el.get('property') in ['og:image','og:image:url'] and el.get('content'):out.append({'url':urljoin(url,el['content']),'alt':str(soup.title.get_text() if soup.title else ''),'context':'og:image'})
 return out
def logo_candidates(soup,url):
 out=[]
 for im in images(soup,url):
  s=(im['url']+' '+im['alt']+' '+im['context']).lower()
  if 'logo' in s or 'wordmark' in s or 'brand-mark' in s:out.append((120 if 'logo' in im['context'].lower() else 100,im))
 for i,svg in enumerate(soup.find_all('svg')):
  context=str(svg.attrs)+' '+str(svg.parent.attrs)
  if re.search('logo|wordmark',context,re.I) and not re.search('paypal|klarna|visa|mastercard|trustpilot',context,re.I):
   value=str(svg)
   if '<use' not in value and len(value)>300:
    if not svg.get('xmlns'):svg['xmlns']='http://www.w3.org/2000/svg'
    blob=str(svg).encode();key=hashlib.sha256(blob).hexdigest();path=CACHE/(key+'.svg');path.write_bytes(blob)
    out.append((140,{'inline':{'file':str(path.relative_to(ROOT)).replace('\\','/'),'url':url+'#official-logo','page':url,'alt':'Official brand logo','kind':'logo','sha256':key,'checkedAt':'2026-10-28'}}))
 for el in soup.find_all('link'):
  rel=' '.join(el.get('rel',[]))
  if re.search(r'(^| )(icon|apple-touch-icon)( |$)',rel) and el.get('href'):out.append((10,{'url':urljoin(url,el['href']),'alt':'Official website icon','context':'icon'}))
 return sorted(out,key=lambda x:-x[0])
def tokens(name):
 return [w for w in norm(name).split() if len(w)>2 and w not in ['the','and','collection','series','de','for','with','watches']]
def score(name,s):
 terms=tokens(name);v=norm(s)
 if not terms:return 0
 if norm(name) in v:return 30+len(terms)*10
 return sum(10 for t in terms if t in v)
def run(b):
 name=b['english'];url=b['url'];report={'english':name,'officialUrl':url,'logo':None,'products':{},'pages':[],'candidates':[]}
 roots=[url]
 if name=='Apple':roots.insert(0,'https://www.apple.com/')
 if name=='Rolex':roots+=['https://www.rolex.org/']
 if name=='Louis Vuitton':roots+=['https://us.louisvuitton.com/eng-us/homepage']
 if name=='Dior':roots+=['https://www.dior.com/en_us']
 pages=[]
 for root in roots:
  p=parse_page(root)
  if p:pages.append(p);break
 if not pages:
  with lock:print(json.dumps({'brand':name,'status':'BLOCKED'}),flush=True)
  return report
 soup,base=pages[0];report['pages'].append(base)
 for _,im in logo_candidates(soup,base)[:12]:
  s=(im.get('url','')+' '+im.get('alt','')).lower()
  if any(x in s for x in ['paypal','klarna','payment','visa','mastercard','trustpilot','google','facebook','instagram','youtube']):continue
  a=im.get('inline') or asset(im['url'],base,'logo',im.get('alt',''))
  if a:report['logo']=a;break
 if not report['logo']:
  report['logo']=asset(urljoin(base,'/favicon.ico'),base,'icon','Official website icon')
 all_images=images(soup,base)
 links=[]
 host=urlparse(base).hostname
 for a in soup.find_all('a',href=True):
  dest=urljoin(base,a['href'])
  if urlparse(dest).hostname==host and not any(x in dest.lower() for x in ['login','account','cart','privacy','terms','mailto:','javascript:','contact','cookie']) and dest.startswith('https://'):
   links.append((dest,a.get_text(' ',strip=True)+' '+str(a.get('aria-label',''))))
 for prod in b['products']:
  pn=prod['name'];terms=tokens(pn);best=[]
  for im in all_images:
   sc=score(pn,im['alt']+' '+im['url'])
   if sc>=10 and not any(x in im['context'].lower() for x in ['logo','icon']):best.append((sc,im,base))
  candidates=sorted({dest:score(pn,dest+' '+txt) for dest,txt in links}.items(),key=lambda x:-x[1])
  for dest,sc in candidates[:2]:
   if sc<10:continue
   p=parse_page(dest)
   if not p:continue
   child,childurl=p;report['pages'].append(childurl)
   for im in images(child,childurl):
    isc=score(pn,im['alt']+' '+im['url'])
    if im['context']=='og:image' and sc>=20:isc+=20
    if isc>=10 and not any(x in im['context'].lower() for x in ['logo','icon']):best.append((isc+sc//4,im,childurl))
  for sc,im,page in sorted(best,key=lambda x:-x[0])[:4]:
   if any(x in im['url'].lower() for x in ['logo','sprite','icon','placeholder']):continue
   a=asset(im['url'],page,'product',im['alt'])
   if a:
    a['matchScore']=sc;a['product']=pn;report['products'][pn]=a;break
  if pn not in report['products']:report['candidates'].append({'product':pn,'links':candidates[:3]})
 # General official photography retained as brand mood only, never mislabeled as a named product.
 for im in all_images:
  if im['context']=='og:image':
   a=asset(im['url'],base,'brand-image',im['alt'])
   if a:report['cover']=a;break
 with lock:print(json.dumps({'brand':name,'logo':bool(report['logo']),'products':len(report['products'])}),flush=True)
 return report
data=json.loads((ROOT/'design/atlas-ranking.json').read_text(encoding='utf8'))
brands={}
for cat in data['categories']:
 for b in cat['items']:
  # Distinguish Spanish fashion LOEWE from German electronics Loewe.
  key=b['english'] if b['english']!='Loewe' else 'Loewe (TV)'
  if key not in brands:brands[key]={**b,'products':[]}
  for p in b['products']:
   if p['name'] not in [x['name'] for x in brands[key]['products']]:brands[key]['products'].append(p)
results=[]
with concurrent.futures.ThreadPoolExecutor(max_workers=10) as pool:
 futures={pool.submit(run,b):key for key,b in brands.items()}
 for future in concurrent.futures.as_completed(futures):
  key=futures[future]
  try:r=future.result();r['key']=key;results.append(r)
  except Exception as e:results.append({'key':key,'error':str(e)})
  (CACHE/'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({'done':len(results),'logos':sum(bool(r.get('logo')) for r in results),'products':sum(len(r.get('products',{})) for r in results)}),flush=True)
