import requests,bs4,json,concurrent.futures,pathlib,hashlib,re
from urllib.parse import urljoin
D=pathlib.Path('artifacts/media-research')
targets=[
('Falcon Northwest','Talon','https://www.falcon-nw.com/desktops/talon'),
('Falcon Northwest','Tiki','https://www.falcon-nw.com/desktops/tiki'),
('Apple','Mac Studio','https://www.apple.com/mac-studio/'),
('Apple','Mac Pro','https://www.apple.com/newsroom/2023/06/apple-introduces-m2-ultra/'),
('Sennheiser','HD 800 S','https://www.sennheiser-hearing.com/en-US/p/hd-800-s/'),
('Focal','Utopia 耳机','https://www.focal.com/products/utopia-headphones'),
('Cartier','Santos de Cartier','https://www.cartier.com/en-us/watches/collections/santos-de-cartier/'),
('Cartier','Tank','https://www.cartier.com/en-us/watches/collections/tank/'),
('Cartier','LOVE','https://www.cartier.com/en-us/jewelry/collections/love/'),
('Cartier','Panthère de Cartier','https://www.cartier.com/en-us/jewelry/collections/panthere-de-cartier/'),
('Hermès','Birkin','https://www.hermes.com/us/en/content/106191-birkin/'),
('Hermès','Kelly','https://www.hermes.com/us/en/content/106196-kelly/'),
('Rolex','Submariner 潜航者','https://www.rolex.com/watches/submariner'),
('Rolex','Day-Date 星期日历型','https://www.rolex.com/watches/day-date'),
('Louis Vuitton','Speedy','https://us.louisvuitton.com/eng-us/women/handbags/iconic-monogram-bags/speedy/_/N-tfr7qdp'),
('Chanel','经典手袋','https://www.chanel.com/us/fashion/handbags/c/1x1x1x1/'),
('Dior','Lady Dior','https://www.dior.com/en_us/fashion/womens-fashion/bags/lady-dior'),
('RIMOWA','Classic','https://www.rimowa.com/us/en/luggage/collection/classic/'),
('La Mer','Crème de la Mer','https://www.cremedelamer.com/product/5834/12343/moisturizers/creme-de-la-mer'),
('The Ritz-Carlton','The Ritz-Carlton Kyoto','https://www.ritzcarlton.com/en/hotels/ukyrz-the-ritz-carlton-kyoto/overview/'),
('The Ritz-Carlton','The Ritz-Carlton Maldives, Fari Islands','https://www.ritzcarlton.com/en/hotels/malrz-the-ritz-carlton-maldives-fari-islands/overview/'),
('Rosewood Hotels & Resorts','Rosewood Hong Kong','https://www.rosewoodhotels.com/en/hong-kong'),
('Rosewood Hotels & Resorts','Rosewood Mayakoba','https://www.rosewoodhotels.com/en/mayakoba')
]
def save(url,page,alt):
 try:
  r=requests.get(url,headers={'User-Agent':'Mozilla/5.0'},timeout=(5,12))
  if r.status_code!=200 or len(r.content)>15000000 or len(r.content)<1000:return None
  if not 'image' in r.headers.get('Content-Type',''):return None
  sha=hashlib.sha256(r.content).hexdigest();f=D/(sha+'.img');f.write_bytes(r.content)
  return {'file':str(f).replace('\\','/'),'url':url,'page':page,'alt':alt,'sha256':sha,'kind':'product','checkedAt':'2026-10-28'}
 except:return None
def run(t):
 name,product,url=t
 try:
  r=requests.get(url,headers={'User-Agent':'Mozilla/5.0'},timeout=(5,15));s=bs4.BeautifulSoup(r.content.decode('utf8','replace'),'html.parser');candidates=[]
  if r.status_code!=200:return {'key':name,'product':product,'status':r.status_code,'candidates':[]}
  for img in s.find_all('img'):
   src=img.get('src') or img.get('data-src') or ''
   alt=img.get('alt','');key=product.lower().split()[0]
   if any(x in (src+' '+alt).lower() for x in [key,product.lower().replace(' ','-')]) and not re.search('logo|icon|nav_',src,re.I):
    candidates.append((100,urljoin(r.url,src),alt))
  for meta in s.select('meta[property="og:image"]'):
   candidates.append((40,urljoin(r.url,meta.get('content','')),s.title.get_text() if s.title else product))
  candidates.sort(reverse=True);out=[]
  for score,link,alt in candidates[:5]:
   a=save(link,r.url,alt)
   if a:out.append(a)
  print(json.dumps({'key':name,'product':product,'candidates':len(out)},ensure_ascii=True),flush=True)
  return {'key':name,'product':product,'page':r.url,'candidates':out}
 except Exception as e:return {'key':name,'product':product,'error':str(e),'candidates':[]}
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as p:out=list(p.map(run,targets))
(D/'direct-products.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf8')
