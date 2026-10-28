import requests,bs4,json,re,pathlib,hashlib,concurrent.futures,datetime
from urllib.parse import urljoin,unquote
D=pathlib.Path('artifacts/media-research');O=D/'recovery-logos';day=datetime.datetime.now(datetime.timezone.utc).date().isoformat()
pages={
'Saint Laurent':['https://www.kering.com/en/houses/fashion-and-leather-goods/saint-laurent/'],
'Coach':['https://www.coach.com.cn/','https://www.tapestry.com/our-brands/coach/','https://www.tapestry.com/our-brands/'],
'John Lobb':['https://www.johnlobb.com/en_gb/'],
'Jimmy Choo':['https://www.pradagroup.com/en/brands/jimmy-choo.html'],
'Roger Vivier':['https://www.todsgroup.com/en/brands/roger-vivier.html'],
'Ferragamo':['https://group.ferragamo.com/en/'],
'Bentley Home':['https://www.luxurylivinggroup.com/en/brands/bentley-home/'],
'Bentley':['https://www.bentleymedia.com/en/'],
'Bugatti':['https://newsroom.bugatti.com/','https://www.bugatti-rimac.com/'],
'ORIGIN PC':['https://www.corsair.com/us/en/s/originpc','https://ir.corsair.com/'],
'Loewe (TV)':['https://www.loewe.tv/en/'],
'CHANEL':['https://www.chanel.cn/cn/','https://inside.chanel.com/en/'],
'Omega':['https://www.swatchgroup.com/en/brands-companies/watches-jewelry/omega'],
'Harry Winston':['https://www.swatchgroup.com/en/brands-companies/watches-jewelry/harry-winston'],
'Meissen':['https://www.meissen.com/en_int/'],
'Frette':['https://frette.com/'],
'Preciosa Lighting':['https://www.preciosa.com/'],
'Cheval Blanc':['https://www.chevalblanc.com/en/maison/'],
'Mariage Frères':['https://www.mariagefreres.com/en/'],
}
def get(url):
 h=hashlib.sha256(url.encode()).hexdigest()
 for p in [O/(h+'.html'),D/(h+'.html')]:
  if p.exists():return p.read_bytes(),200,'cache'
 try:
  r=requests.get(url,timeout=(4,8),headers={'User-Agent':'Mozilla/5.0'})
  if r.status_code==200 and len(r.content)<10000000:(O/(h+'.html')).write_bytes(r.content)
  return r.content if r.status_code==200 else b'',r.status_code,r.url
 except Exception as e:return b'',0,str(e)[:90]
def save(data,url,page,alt,context):
 if not data or b'html' in data[:30].lower():return None
 sha=hashlib.sha256(data).hexdigest();p=O/(sha+('.svg' if b'<svg' in data[:500] else '.img'))
 if not p.exists():p.write_bytes(data)
 return dict(file=str(p).replace('\\','/'),url=url,page=page,alt=alt,sha256=sha,checkedAt=day,context=context)
def run(entry):
 key,urls=entry;row={'key':key,'candidates':[],'pages':[]}
 for url in urls:
  b,status,src=get(url);row['pages'].append(dict(url=url,status=status,source=src))
  if not b:continue
  text=b.decode('utf8','replace');soup=bs4.BeautifulSoup(text,'html.parser');links=[]
  # JSON-LD logo definitions and lazy image attributes
  for script in soup.find_all('script',type='application/ld+json'):
   try:
    x=json.loads(script.string or script.text)
    if isinstance(x,dict) and x.get('logo') and key.lower().split()[0] in str(x.get('name','')).lower():
     logo=x['logo'];links.append((logo.get('url') if isinstance(logo,dict) else logo,'JSON-LD brand logo'))
   except:pass
  for img in soup.find_all('img'):
   context=str(img.attrs)+' '+str(img.parent.attrs)
   for attr in ['src','data-src','data-lazy-src','data-original']:
    link=img.get(attr,'')
    if not link or link.startswith('data:'):continue
    if key=='Saint Laurent' and 'Logo_blanc_320_320_7c701386f6' in link:links.append((link,'Saint Laurent carousel logo on Kering official house page'))
    elif re.search('logo|wordmark',context,re.I) and not re.search('lvmh|paypal|facebook|twitter|pinterest|youtube|instagram|linkedin|mastercard|visa|google|tapestry|prada',context,re.I):links.append((link,context[:500]))
  # CSS referenced logo assets
  for m in re.finditer(r'url\(["\x27]?([^)"\x27]+)["\x27]?\)',text):
   if re.search('logo|wordmark',m.group(1),re.I):links.append((m.group(1),'Official page CSS logo reference'))
  links=list(dict.fromkeys((urljoin(url,a),ctx) for a,ctx in links if a))
  for link,context in links[:8]:
   data,_,_=get(link);a=save(data,link,url,key+' official brand logo',context)
   if a and a['sha256'] not in [x['sha256'] for x in row['candidates']]:row['candidates'].append(a)
  if row['candidates']:break
 print(json.dumps({'key':key,'count':len(row['candidates']),'statuses':[x['status'] for x in row['pages']]}),flush=True);return row
with concurrent.futures.ThreadPoolExecutor(max_workers=7) as pool:rows=list(pool.map(run,pages.items()))
(O/'candidates-extra.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf8')
