import json,pathlib
from bs4 import BeautifulSoup
from urllib.parse import urljoin
r=json.loads(pathlib.Path('artifacts/media-research/results.json').read_text(encoding='utf8'))
for key in ['Apple','Messika','Chaumet','Leica','MV Agusta','Sub-Zero & Wolf','TWG Tea','Silversea','Flos','Falcon Northwest','ORIGIN PC']:
 a=next((x for x in r if x.get('key')==key),{})
 print(json.dumps({'brand':key,'logo':a.get('logo'),'products':a.get('products'),'pages':a.get('pages')},ensure_ascii=True))
