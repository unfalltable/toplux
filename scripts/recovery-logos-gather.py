import requests,bs4,json,re,pathlib,hashlib,concurrent.futures,datetime
from urllib.parse import urljoin
D=pathlib.Path('artifacts/media-research'); O=D/'recovery-logos'; O.mkdir(exist_ok=True)
TODAY=datetime.datetime.now(datetime.timezone.utc).date().isoformat()
missing=[r for r in json.loads((D/'proposed-media.json').read_text(encoding='utf8'))['entries'] if not r['logo']]
alts={
'CHANEL':['https://www.chanel.com/us/','https://www.chanel.cn/zh_CN/'],
'Vacheron Constantin':['https://www.richemont.com/our-maisons/vacheron-constantin/'],
'Celine':['https://www.celine.com/zhs-cn/home','https://www.celine.com/en-us/home'],
'Saint Laurent':['https://www.kering.com/en/houses/fashion-and-leather-goods/saint-laurent/'],
'Coach':['https://www.coach.com.cn/','https://www.tapestry.com/brands/coach/'],
'Tiffany & Co.':['https://www.tiffany.cn/'],
'Loro Piana':['https://cn.loropiana.com/'],
'John Lobb':['https://www.johnlobb.com/en_gb/','https://www.hermes.com/us/en/story/maison-john-lobb/'],
'Messika':['https://www.messika.com/fr'],
'Roger Vivier':['https://www.rogervivier.com/cn-zh/','https://www.todsgroup.com/en/brands/roger-vivier'],
'Christian Louboutin':['https://asia.christianlouboutin.com/'],
'Jimmy Choo':['https://www.jimmychoo.cn/','https://www.jimmychoo.com/en/home'],
'Ferragamo':['https://www.ferragamo.com/shop/chn/zh','https://group.ferragamo.com/en/group/brand'],
'Helena Rubinstein':['https://www.helenarubinstein.cn/','https://www.loreal.com/en/loreal-luxe/helena-rubinstein/'],
'Ferrari':['https://www.ferrari.com/en-EN','https://www.ferrari.com/zh-CN'],
'Bugatti':['https://www.bugatti.com/en/'],
'Bentley':['https://www.bentleymotors.com/en.html','https://www.bentleymotors.com/cn/zh.html'],
'Mercedes-Maybach':['https://www.mercedes-benz.com/en/vehicles/mercedes-maybach/','https://www.mercedes-benz.com.cn/mercedes-maybach.html'],
'Ducati':['https://www.ducati.com/ww/en/home'],
'ORIGIN PC':['https://www.originpc.com/configurator/'],
'La Cornue':['https://lacornue.com/en-GB','https://lacornueusa.com/'],
'Loewe (TV)':['https://www.loewe.tv/int/en'],
'Omega':['https://www.swatchgroup.com/en/brands-companies/omega','https://www.omegawatches.cn/'],
'Bentley Home':['https://www.luxurylivinggroup.com/brands/bentley-home'],
'Fendi':['https://www.fendi.cn/'],
'Technogym':['https://www.technogym.com/en-US/','https://corporate.technogym.com/'],
'RIMOWA':['https://www.rimowa.com/cn/zh/'],
'Harry Winston':['https://www.swatchgroup.com/en/brands-companies/harry-winston'],
'Frette':['https://eu.frette.com/'],
'Preciosa Lighting':['https://www.preciosalighting.com/en/'],
'Rolls-Royce':['https://www.rolls-roycemotorcars.com/zh_CN/home.html','https://www.rolls-roycemotorcars.com/en_GB/home.html'],
'Lladró':['https://www.lladro.com/en_us/'],
'Mariage Frères':['https://www.mariagefreres.com/FR/accueil.html'],
'Cheval Blanc':['https://www.chevalblanc.com/en/'],
'Meissen':['https://www.meissen.com/en/']}
assets={}
def index(x):
 if isinstance(x,dict):
  if x.get('url') and x.get('file') and pathlib.Path(x['file']).exists(): assets.setdefault(x['url'],x['file'])
  for y in x.values():index(y)
 elif isinstance(x,list):
  for y in x:index(y)
for f in ['browser-results.json','remaining-logo-candidates.json','alternate-logo-candidates.json','precise-logo-candidates.json','group-assets.json','all-svg-logo-candidates.json']:
 if (D/f).exists():index(json.loads((D/f).read_text(encoding='utf8')))
def get(url):
 if url in assets:return pathlib.Path(assets[url]).read_bytes(),200,'existing-asset'
 h=hashlib.sha256(url.encode()).hexdigest()
 for p in [O/(h+'.html'),D/(h+'.html')]:
  if p.exists():return p.read_bytes(),200,'cache'
 try:
  r=requests.get(url,headers={'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36'},timeout=(4,9))
  if r.status_code==200 and len(r.content)<12000000:
   (O/(h+'.html')).write_bytes(r.content)
  return r.content if r.status_code==200 else b'',r.status_code,r.url
 except Exception as e:return b'',0,str(e)[:100]
def save(blob,url,page,alt,context):
 if not blob:return None
 if b'<svg' not in blob[:500] and (blob[:50].lower().find(b'html')>=0 or blob.startswith(b'<!')):return None
 sha=hashlib.sha256(blob).hexdigest()
 path=O/(sha+('.svg' if b'<svg' in blob[:500] else '.img'))
 if not path.exists():path.write_bytes(blob)
 return dict(file=str(path).replace('\\','/'),url=url,page=page,alt=alt,sha256=sha,checkedAt=TODAY,context=context)
def run(row):
 name=row['key'];out={'key':name,'candidates':[],'pages':[]}
 for url in dict.fromkeys([row['officialUrl'],*alts.get(name,[])]):
  blob,status,source=get(url);out['pages'].append(dict(url=url,status=status,source=source))
  if not blob:continue
  soup=bs4.BeautifulSoup(blob.decode('utf8','replace'),'html.parser')
  if re.search('Access Denied|Client Challenge|Request Rejected',str(soup.title),re.I):continue
  cand=[]
  for el in soup.find_all(['img','image']):
   src=el.get('src') or el.get('href') or el.get('xlink:href') or el.get('data-src') or ''
   ctx=str(el.attrs)+' '+str(el.parent.attrs)
   if not src or src.startswith('data:') or re.search('no.logo|paypal|mastercard|visa|twitter|facebook|instagram|youtube|payment|cookie|scrambler|lvmh|richmontlogo|klarna|google',ctx,re.I):continue
   if re.search('logo|wordmark|brand',ctx,re.I) or el.get('alt','').lower()==name.lower():
    score=(100 if el.find_parent(['header','nav']) else 0)+(100 if re.search('logo|wordmark',ctx,re.I) else 0)
    cand.append((score,urljoin(url,src),el.get('alt',''),ctx[:500]))
  for _,link,alt,ctx in sorted(cand,reverse=True)[:6]:
   img,_,_=get(link);a=save(img,link,url,alt,ctx)
   if a and a['sha256'] not in [c['sha256'] for c in out['candidates']]:out['candidates'].append(a)
  for svg in soup.find_all('svg'):
   ctx=str(svg.attrs)+' '+str(svg.parent.attrs);use=svg.find('use')
   ref=(use.get('href') or use.get('xlink:href') or '') if use else ''
   if not re.search('logo|wordmark|brand|'+re.escape(name),ctx+' '+ref,re.I):continue
   if re.search('paypal|mastercard|visa|twitter|facebook|instagram|youtube|payment|scrambler|lvmh|kering|google',ctx+' '+ref,re.I):continue
   mark=svg;link=url+'#official-brand-mark'
   if use:
    if '#' not in ref:continue
    p,ident=ref.split('#',1);external=soup
    if p:
     data,_,_=get(urljoin(url,p));external=bs4.BeautifulSoup(data,'html.parser')
    sym=external.find(id=ident)
    if not sym or sym.name not in ['svg','symbol']:continue
    mark=bs4.BeautifulSoup('<svg xmlns="http://www.w3.org/2000/svg"></svg>','html.parser').svg
    mark['viewbox']=sym.get('viewbox') or svg.get('viewbox') or '0 0 300 100'
    for child in list(sym.children):mark.append(child)
    link=urljoin(url,p)+'#'+ident
   txt=str(mark)
   for x,y in [('viewbox','viewBox'),('preserveaspectratio','preserveAspectRatio'),('clippath','clipPath'),('lineargradient','linearGradient'),('radialgradient','radialGradient')]:txt=txt.replace(x,y)
   if 'xmlns=' not in txt:txt=txt.replace('<svg','<svg xmlns="http://www.w3.org/2000/svg"',1)
   txt=re.sub(r'var\(--[^)]+\)','#000',txt)
   a=save(txt.encode(),link,url,name+' official brand mark',ctx[:600])
   if a and a['sha256'] not in [c['sha256'] for c in out['candidates']]:out['candidates'].append(a)
  if out['candidates']:break
 print(json.dumps({'key':name,'candidates':len(out['candidates']),'status':[p['status'] for p in out['pages']]}),flush=True)
 return out
with concurrent.futures.ThreadPoolExecutor(max_workers=7) as pool:out=list(pool.map(run,missing))
(O/'candidates-round1.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf8')
