import requests,bs4,json
for url in ['https://www.lvmh.com/en/our-maisons/fashion-leather-good/louis-vuitton','https://www.lvmh.com/en/our-maisons/fashion-leather-good/christian-dior','https://www.messika.com/fr','https://leica-camera.com/en-int','https://www.falcon-nw.com/']:
 try:
  r=requests.get(url,timeout=15,headers={'User-Agent':'Mozilla/5.0'});s=bs4.BeautifulSoup(r.text,'html.parser')
  print(json.dumps({'url':url,'status':r.status_code,'headings':[str(h)[:2000] for h in s.select('h1')[:2]],'svg':[{'attrs':str(e.attrs),'parent':str(e.parent.attrs),'length':len(str(e)),'start':str(e)[:300]} for e in s.select('svg')[:18]],'dataImages':[str(i)[:500] for i in s.select('img') if str(i.get('src','')).startswith('data:')][:5],'logoCandidates':[str(i)[:1000] for i in s.select('img') if 'logo' in str(i).lower()][:6]},ensure_ascii=True),flush=True)
 except Exception as e:print(str(e),flush=True)
