import fs from 'node:fs';import {createHash} from 'node:crypto';
const p='artifacts/media-research/proposed-media.json';const raw=fs.readFileSync(p,'utf8'),d=JSON.parse(raw);
const compact=JSON.stringify(d);
const target='artifacts/media-research/proposed-media-recovery.json';if(!fs.existsSync(target))fs.writeFileSync(target,compact);else if(fs.readFileSync(target,'utf8')!==compact)throw Error('Existing recovery snapshot differs; inspect first');
const catalogue=JSON.parse(fs.readFileSync('design/atlas-ranking.json','utf8'));
console.log(JSON.stringify({sourceHash:createHash('sha256').update(raw).digest('hex'),entries:d.entries.length,logos:d.entries.filter(e=>e.logo).length,photos:d.entries.reduce((n,e)=>n+Object.keys(e.products).length,0),missingLogos:d.entries.filter(e=>!e.logo).map(e=>e.key),profiles:catalogue.categories.reduce((n,c)=>n+c.items.length,0),brands:new Set(catalogue.categories.flatMap(c=>c.items.map(b=>b.english))).size}));
for(const url of ['http://127.0.0.1:3100/api/v1/health','http://149.88.67.92:8080/api/v1/health']){try{const r=await fetch(url,{signal:AbortSignal.timeout(5000)});console.log(JSON.stringify({url,status:r.status,data:await r.json()}));}catch(e){console.log(JSON.stringify({url,error:e.message}));}}
