import requests,bs4,json,hashlib,pathlib,re,concurrent.futures,html
from urllib.parse import urljoin,unquote
D=pathlib.Path('artifacts/media-research');base=json.loads((D/'browser-results.json').read_text(encoding='utf8'))
groups=json.loads((D/'group-assets.json').read_text(encoding='utf8'))
alternateRoots={"Louis Vuitton":"https://www.louisvuitton.cn/zhs-cn/homepage","Dior":"https://www.dior.cn/zh_cn","CHANEL":"https://www.chanel.cn/zh_CN/","Gucci":"https://www.gucci.cn/zh/","Fendi":"https://www.fendi.cn/","Celine":"https://www.celine.com/zhs-cn/home","Loro Piana":"https://cn.loropiana.com/","Berluti":"https://www.berluti.cn/","Bvlgari":"https://www.bulgari.cn/zh-cn/","Tiffany & Co.":"https://www.tiffany.cn/","Rolex":"https://www.rolex.cn/","Tudor":"https://www.tudorwatch.cn/","Coach":"https://www.coach.com.cn/","Ferrari":"https://www.ferrari.com/zh-CN","Bentley":"https://www.bentleymotors.com/cn/zh.html","Porsche":"https://www.porsche.cn/china/","Mercedes-Maybach":"https://www.mercedes-benz.com.cn/","Maserati":"https://www.maserati.com/cn/zh","ORIGIN PC":"https://www.originpc.com/configurator/","Moncler":"https://www.moncler.cn/","Technogym":"https://www.technogym.com/en-US/","Frette":"https://eu.frette.com/","Rolls-Royce":"https://www.rolls-roycemotorcars.com/zh_CN/home.html","La Cornue":"https://lacornue.com/en-GB","Loewe (TV)":"https://www.loewe.tv/int/en","Gulfstream":"https://www.gulfstream.com/en/","Meissen":"https://www.meissen.com/en/","Christian Louboutin":"https://asia.christianlouboutin.com/","Roger Vivier":"https://www.rogervivier.com/cn-zh/","Jimmy Choo":"https://www.jimmychoo.cn/","Ferragamo":"https://www.ferragamo.com/shop/chn/zh"}
targets=['Leica','Messika','Chaumet','MV Agusta','TWG Tea','Sub-Zero & Wolf','Falcon Northwest','Dior','Louis Vuitton','LOEWE','Fendi','Celine','Loro Piana','Berluti','Bvlgari','Tiffany & Co.','RIMOWA','Rolex','Tudor','CHANEL','Coach','Ferrari','Bentley','Bugatti','Porsche','Mercedes-Maybach','Maserati','ORIGIN PC','Hasselblad','La Cornue','Loewe (TV)','Bentley Home','Moncler','Technogym','Tom Ford','Frette','Preciosa Lighting','Rolls-Royce','Mariage Frères','Cheval Blanc','Gulfstream','Meissen','Christian Louboutin','Roger Vivier','Jimmy Choo','Ferragamo','Colnago','PENT.']
H={'User-Agent':'Mozilla/5.0'}
def get(url):
 try:
  key=hashlib.sha256(url.encode()).hexdigest();cache=D/(key+'.html')
  if cache.exists():return cache.read_bytes()
  r=requests.get(url,headers=H,timeout=(4,10))
  if r.status_code!=200:return None
  if len(r.content)>12000000:return None
  cache.write_bytes(r.content);return r.content
 except:return None
def save(data,url,page,kind='logo'):
 if not data:return None
 sha=hashlib.sha256(data).hexdigest();file=D/(sha+('.svg' if b'<svg' in data[:400] else '.img'));file.write_bytes(data)
 return {'file':str(file).replace('\\','/'),'url':url,'page':page,'kind':kind,'alt':'Official brand logo','sha256':sha,'checkedAt':'2026-10-28'}
def svgfix(svg):
 txt=str(svg)
 for a,b in [('viewbox','viewBox'),('preserveaspectratio','preserveAspectRatio'),('clippath','clipPath'),('lineargradient','linearGradient'),('radialgradient','radialGradient')]:txt=re.sub(a,b,txt,flags=re.I)
 txt=re.sub(r'var\(--[^)]+\)','#000',txt)
 return txt.encode()
def run(name):
 b=next((b for b in base if b.get('key')==name),{})
 urls=[alternateRoots.get(name)]
 g=next((g for g in groups if g['key']==name),None)
 if g and not alternateRoots.get(name):urls.append(g['page'])
 
 
 
 result={'key':name,'candidates':[],'pages':[]}
 for url in filter(None,urls):
  data=get(url)
  if not data:continue
  soup=bs4.BeautifulSoup(data.decode('utf8','replace'),'html.parser');result['pages'].append(url)
  images=[]
  for im in soup.find_all('img'):
   src=im.get('src') or im.get('data-src') or '';alt=im.get('alt','');attrs=str(im.attrs);parent=im.find_parent(['header','nav'])
   if not src or src.startswith('data:'):continue
   score=(200 if parent else 0)+(120 if re.search('logo|wordmark',src,re.I) else 0)+(90 if re.search('logo|brand',str(im.parent.attrs),re.I) else 0)+(60 if alt.lower() in ['home',name.lower()] else 0)
   if re.search('no.logo|nl-logo|my.logo|facebook|instagram|payment|mastercard|google|youtube|paypal|footer-brand|lvmh|social',alt+' '+src,re.I) and name not in ['Dior','Louis Vuitton','LOEWE','Fendi','Celine','Loro Piana','Berluti','Bvlgari','Tiffany & Co.','RIMOWA']:continue
   if score>=120:images.append((score,src,alt))
  for score,src,alt in sorted(images,reverse=True)[:3]:
   link=urljoin(url,src);a=save(get(link),link,url)
   if a:a['alt']=alt;result['candidates'].append(a)
  for svg in soup.find_all('svg'):
   attrs=str(svg.attrs)+' '+str(svg.parent.attrs);use=svg.find('use')
   if not re.search('logo|brand|wordmark',attrs,re.I):continue
   if re.search('news|arcade|fitness|klarna|paypal|video|youtube|footer|payment',attrs,re.I):continue
   if use:
    ref=use.get('href') or use.get('xlink:href') or ''
    if '#' not in ref:continue
    path,ident=ref.split('#',1)
    symbols=soup if not path else bs4.BeautifulSoup(get(urljoin(url,path)) or b'','html.parser')
    symbol=symbols.find(id=ident)
    if not symbol:continue
    if symbol.name not in ['symbol','svg']:continue
    newsvg=bs4.BeautifulSoup('<svg xmlns="http://www.w3.org/2000/svg"></svg>','html.parser').svg
    newsvg['viewbox']=symbol.get('viewbox') or svg.get('viewbox') or '0 0 300 100'
    for child in list(symbol.children):newsvg.append(child)
    a=save(svgfix(newsvg),urljoin(url,path)+'#'+ident,url)
   else:a=save(svgfix(svg),url+'#official-brand-logo',url)
   if a:result['candidates'].insert(0,a)
  if result['candidates']:break
 print(json.dumps({'name':name,'candidates':len(result['candidates'])}),flush=True)
 return result
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as p:results=list(p.map(run,alternateRoots.keys()))
(D/'alternate-logo-candidates.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf8')
