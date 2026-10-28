import requests,bs4,json,pathlib,concurrent.futures
jobs=[('Reflection','https://amouage.com/products/reflection-man'),('Aventus','https://www.creedfragrance.com/p/aventus/12870045/'),('LCD-5','https://www.audeze.com/blogs/audeze-journal/introducing-lcd-5')]
def run(j):
 name,url=j
 try:
  r=requests.get(url,headers={'User-Agent':'Mozilla/5.0'},timeout=12);s=bs4.BeautifulSoup(r.content.decode('utf8','replace'),'html.parser')
  result={'name':name,'url':r.url,'status':r.status_code,'title':s.title.get_text() if s.title else '', 'meta':[e.get('content') for e in s.select('meta[property="og:image"]')],'images':[{'src':e.get('src'),'alt':e.get('alt','')} for e in s.find_all('img') if name.lower().replace('-','') in str(e).lower().replace('-','')][:12]}
  return result
 except Exception as e:return {'name':name,'error':str(e)}
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as p:out=list(p.map(run,jobs))
pathlib.Path('artifacts/media-research/product-corrections.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps(out,ensure_ascii=True))
