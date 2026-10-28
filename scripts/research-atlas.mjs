import {mkdirSync,writeFileSync} from 'node:fs';
const sources=[
 ['Rolex','https://www.rolex.com/about-rolex/history'],
 ['Louis Vuitton','https://us.louisvuitton.com/eng-us/magazine/art-and-culture/a-legendary-history'],
 ['Rolls-Royce','https://www.rolls-roycemotorcars.com/en_GB/inspiring-greatness.html'],
 ['Hermes','https://www.hermes.com/us/en/'],
 ['Rimowa','https://www.rimowa.com/us/en/our-story'],
 ['Steinway','https://www.steinway.com/about/our-story'],
 ['Baccarat','https://www.baccarat.com/en_us/'],
 ['Montblanc','https://www.montblanc.com/en-us/discover/meisterstueck'],
 ['Leica','https://leica-camera.com/en-int/photography/leica-m'],
 ['Aman','https://www.aman.com/brands/aman'],
 ['Bang and Olufsen','https://www.bang-olufsen.com/en/int/story']
];
const results=[];
for(let offset=0;offset<sources.length;offset+=3){
 await Promise.all(sources.slice(offset,offset+3).map(async([brand,url])=>{
  try{
   const response=await fetch(url,{signal:AbortSignal.timeout(12000),headers:{'User-Agent':'Mozilla/5.0'}});
   const html=await response.text(),title=(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||'').replace(/\s+/g,' ').trim();
   const plain=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/\s+/g,' ');
   const hits=plain.match(/.{0,80}(?:1905|1854|1837|1853|1764|1937|1924|M-System|Meisterst.ck|Amanpuri|Phantom|Beoplay|Beosound|Birkin|Kelly|Monogram|Submariner|Datejust|since|founded).{0,220}/gi)||[];
   const result={brand,url,finalUrl:response.url,status:response.status,title,extracts:hits.slice(0,10)};results.push(result);console.log(JSON.stringify(result));
  }catch(error){const result={brand,url,error:error.message};results.push(result);console.log(JSON.stringify(result));}
 }));
}
mkdirSync('artifacts',{recursive:true});writeFileSync('artifacts/atlas-source-check.json',JSON.stringify({checkedAt:new Date().toISOString(),results},null,2));
