import requests,bs4,json,concurrent.futures,pathlib
from urllib.parse import urljoin
urls=['https://www.lvmh.com/en','https://www.kering.com/en/houses/','https://www.richemont.com/our-maisons/','https://www.swatchgroup.com/en/brands-companies','https://www.elcompanies.com/en/our-brands']
def run(url):
 try:
  r=requests.get(url,headers={'User-Agent':'Mozilla/5.0'},timeout=14);s=bs4.BeautifulSoup(r.text,'html.parser')
  out={'url':url,'status':r.status_code,'title':s.title.get_text() if s.title else '', 'links':[{'url':urljoin(r.url,a['href']),'text':a.get_text(' ',strip=True)[:100]} for a in s.find_all('a',href=True)],'images':[{'src':urljoin(r.url,a.get('src','')),'alt':a.get('alt','')} for a in s.find_all('img')]}
  print(json.dumps(out,ensure_ascii=True),flush=True);return out
 except Exception as e:return {'url':url,'error':str(e)}
with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:out=list(pool.map(run,urls))
pathlib.Path('artifacts/media-research/official-group-roots.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf8')
