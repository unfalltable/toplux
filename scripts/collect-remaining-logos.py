import requests,bs4,json,re,pathlib,hashlib,concurrent.futures
from urllib.parse import urljoin
D=pathlib.Path('artifacts/media-research');a=json.loads((D/'browser-results.json').read_text(encoding='utf8'));alt=json.loads((D/'alternate-logo-candidates.json').read_text(encoding='utf8'))
proposed=json.loads((D/'proposed-media.json').read_text(encoding='utf8'))
names=[b['key'] for b in proposed['entries'] if not b['logo']]
def get(url):
 key=hashlib.sha256(url.encode()).hexdigest();p=D/(key+'.html')
 if p.exists():return p.read_bytes()
 try:
  r=requests.get(url,headers={'User-Agent':'Mozilla/5.0'},timeout=(4,10))
  if r.status_code!=200 or len(r.content)>12000000:return None
  p.write_bytes(r.content);return r.content
 except:return None
def run(name):
 b=next(x for x in a if x.get('key')==name);other=next((x for x in alt if x.get('key')==name),{})
 urls=[*other.get('pages',[]),b['officialUrl'],*list(dict.fromkeys(b.get('pages',[])))[:2]]
 if name in ['Jaeger-LeCoultre','Cartier','Van Cleef & Arpels','Vacheron Constantin']:urls+=['https://www.richemont.com/our-maisons/'+{'Jaeger-LeCoultre':'jaeger-lecoultre','Cartier':'cartier','Van Cleef & Arpels':'van-cleef-arpels','Vacheron Constantin':'vacheron-constantin'}[name]+'/']
 out={'key':name,'candidates':[]}
 for url in dict.fromkeys(urls):
  data=get(url)
  if not data:continue
  soup=bs4.BeautifulSoup(data.decode('utf8','replace'),'html.parser')
  for svg in soup.select('svg'):
   vb=svg.get('viewbox','');nums=re.findall(r'[-\d.]+',vb)
   if len(nums)!=4:continue
   try:w,h=float(nums[2]),float(nums[3])
   except:continue
   if h<=0 or w<60 or len(str(svg))<1000 or len(str(svg))>200000:continue
   if w/h<1.6 and len(str(svg))<5000:continue
   txt=str(svg)
   if '<use' in txt:continue
   txt=txt.replace('viewbox','viewBox').replace('preserveaspectratio','preserveAspectRatio').replace('clippath','clipPath');txt=re.sub(r'var\(--[^)]+\)','#000',txt)
   if 'xmlns=' not in txt:txt=txt.replace('<svg','<svg xmlns="http://www.w3.org/2000/svg"',1)
   blob=txt.encode();sha=hashlib.sha256(blob).hexdigest();f=D/(sha+'.svg');f.write_bytes(blob)
   if any(c['sha256']==sha for c in out['candidates']):continue
   out['candidates'].append({'file':str(f).replace('\\','/'),'url':url+'#official-svg-mark','page':url,'kind':'logo','alt':name+' official mark','sha256':sha,'checkedAt':'2026-10-28','context':str(svg.attrs)+' '+str(svg.parent.attrs)})
  for im in soup.find_all('img'):
   src=im.get('src','')
   if not re.search('logo|wordmark',src,re.I) or re.search('no.logo|twitter|instagram|facebook|google|lvmh|kering|visa|icon|menu|product|catalog|image/upload|my.logo',src,re.I):continue
   link=urljoin(url,src);blob=get(link)
   if not blob:continue
   sha=hashlib.sha256(blob).hexdigest();f=D/(sha+('.svg' if b'<svg' in blob[:300] else '.img'));f.write_bytes(blob)
   if any(c['sha256']==sha for c in out['candidates']):continue
   out['candidates'].append({'file':str(f).replace('\\','/'),'url':link,'page':url,'kind':'logo','alt':im.get('alt',''),'sha256':sha,'checkedAt':'2026-10-28'})
 print(json.dumps({'key':name,'marks':len(out['candidates'])}),flush=True);return out
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:out=list(pool.map(run,names))
(D/'remaining-logo-candidates.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf8')
