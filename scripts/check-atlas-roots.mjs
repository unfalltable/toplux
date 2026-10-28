import {mkdirSync,writeFileSync} from 'node:fs';
const urls=['https://www.steinway.com/','https://www.montblanc.com/en-us/','https://leica-camera.com/en-int/','https://www.bang-olufsen.com/en/int/','https://www.rolls-roycemotorcars.com/en_GB/home.html','https://www.baccarat.com/en_us/','https://www.hermes.com/us/en/','https://www.aman.com/'];
const results=[];
for(let offset=0;offset<urls.length;offset+=3)await Promise.all(urls.slice(offset,offset+3).map(async url=>{
 try{const response=await fetch(url,{signal:AbortSignal.timeout(10000),headers:{'User-Agent':'Mozilla/5.0'}}),html=await response.text();
 const text=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');
 const extracts=(text.match(/.{0,60}(?:1853|1764|1837|1924|Meisterst.ck|M11|SL3|Beosound|Phantom|Birkin|Kelly|Harcourt|Louxor|Amanpuri|since|Founded|history).{0,200}/gi)||[]).slice(0,12);
 const links=[...html.matchAll(/href=["']([^"']+)["']/g)].map(match=>match[1]).filter(link=>/history|heritage|about|meister|harcourt|leica-m|m-system|model-d|amanpuri|birkin|kelly|story/i.test(link)).slice(0,15);
 const result={url,finalUrl:response.url,status:response.status,extracts,links};results.push(result);console.log(JSON.stringify(result));
 }catch(error){results.push({url,error:error.message});console.log(JSON.stringify({url,error:error.message}));}
}));
mkdirSync('artifacts',{recursive:true});writeFileSync('artifacts/atlas-root-check.json',JSON.stringify({checkedAt:new Date().toISOString(),results},null,2));
