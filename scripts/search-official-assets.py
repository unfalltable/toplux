import requests,bs4,json
urls=['https://www.google.com/search?tbm=isch&q=site%3Arolex.com+rolex+logo','https://www.bing.com/images/search?q=Rolex+logo+site%3Arolex.com&FORM=HDRSC3&setlang=en-US','https://www.google.com/search?q=site%3Achanel.com+logo.svg']
for i,url in enumerate(urls):
 try:
  r=requests.get(url,headers={'User-Agent':'Mozilla/5.0'},timeout=12);open('artifacts/media-research/search-'+str(i)+'.html','w',encoding='utf8').write(r.text);s=bs4.BeautifulSoup(r.text,'html.parser')
  print(json.dumps({'url':url,'status':r.status_code,'text':s.get_text(' ',strip=True)[:1500],'links':[a.get('href') for a in s.select('a[href]')[:15]]},ensure_ascii=True),flush=True)
 except Exception as e:print(str(e))
