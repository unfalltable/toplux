import requests,bs4,hashlib,pathlib,json,xml.etree.ElementTree as ET
url='https://www.silversea.com/static/svg-sprite-b69c3407e16ca34463387332ab594568.svg'
r=requests.get(url,headers={'User-Agent':'Mozilla/5.0'},timeout=12);out={'status':r.status_code}
if r.status_code==200:
 tree=ET.fromstring(r.content);symbol=next((s for s in tree.iter() if s.get('id')=='svg--logo'),None)
 if symbol is not None:
  symbol.tag='{http://www.w3.org/2000/svg}svg';ET.register_namespace('','http://www.w3.org/2000/svg');raw=ET.tostring(symbol,encoding='utf8');sha=hashlib.sha256(raw).hexdigest();f=pathlib.Path('artifacts/media-research')/(sha+'.svg');f.write_bytes(raw)
  out={'key':'Silversea','logo':{'file':str(f).replace('\\','/'),'url':url+'#svg--logo','page':'https://www.silversea.com/','alt':'Silversea official logo','kind':'logo','sha256':sha,'checkedAt':'2026-10-28','approved':True}}
pathlib.Path('artifacts/media-research/recovery-silversea-logo.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps(out))
