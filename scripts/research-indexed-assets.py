import requests,bs4,json
for q in ['site:falcon-nw.com logo','site:rolex.com logo','site:hermes.com Birkin']:
 try:
  r=requests.get('https://www.bing.com/images/search',params={'q':q},headers={'User-Agent':'Mozilla/5.0'},timeout=15)
  soup=bs4.BeautifulSoup(r.text,'html.parser');out=[]
  for a in soup.select('a.iusc'):
   try:
    x=json.loads(a['m']);out.append({k:x.get(k) for k in ['murl','purl','t','desc']})
   except:pass
  print(json.dumps({'query':q,'status':r.status_code,'images':out[:8]},ensure_ascii=True))
 except Exception as e:print(type(e).__name__)
