import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import sharp from 'sharp';
const input=JSON.parse(readFileSync('artifacts/media-research/browser-results.json','utf8'));
const repairs=JSON.parse(readFileSync('artifacts/media-research/logo-repairs.json','utf8'));
for(const [key,index] of Object.entries({'Apple':0,'Silversea':0,'Petrossian':1,'Creed':0,'Falcon Northwest':0})){const item=input.find(r=>r.key===key),repair=repairs.find(r=>r.key===key)?.candidates?.[index];if(item&&repair)item.logo=repair;}
const groups=JSON.parse(readFileSync('artifacts/media-research/group-assets.json','utf8'));
for(const [key,index] of Object.entries({'Gucci':0,'Bottega Veneta':0,'Brioni':0,'Boucheron':0,'Frédéric Malle':1,'Jo Malone London':0,'La Mer':1,'Le Labo':1})){const item=input.find(r=>r.key===key),asset=groups.find(r=>r.key===key)?.candidates?.[index];if(item&&asset)item.logo=asset;}
if(existsSync('artifacts/media-research/approved-extra-media.json')){for(const extra of JSON.parse(readFileSync('artifacts/media-research/approved-extra-media.json','utf8'))){const item=input.find(r=>r.key===extra.key);if(item){if(extra.logo)item.logo=extra.logo;Object.assign(item.products,extra.products||{});}}}
for(const key of ['Messika','MV Agusta','Leica','TWG Tea','Cartier','Jaeger-LeCoultre','Van Cleef & Arpels','Vacheron Constantin','Saint Laurent','John Lobb','Chaumet','LOUIS XIII']){const item=input.find(r=>r.key===key);if(item&&!item.logo?.approved)item.logo=null;}
const rejected={'Amouage':['Reflection'],'Audeze':['LCD-5'],'Creed':['Aventus'],'Cartier':['Santos de Cartier','Panthère de Cartier'],'Brunello Cucinelli':['Cashmere Knitwear'],'Apple':['Mac Pro'],'Sennheiser':['HD 800 S'],'Focal':['Utopia 耳机'],'ALPA':['12 SWA','12 STC'],'S.T. Dupont':['Défi'],'LINDBERG':['air titanium rim','n.o.w. titanium'],'Rosewood Hotels & Resorts':['Rosewood Hong Kong','Rosewood Mayakoba'],'The Ritz-Carlton':['The Ritz-Carlton Kyoto','The Ritz-Carlton Maldives, Fari Islands'],'Silversea':['Ocean Voyages'],'Manolo Blahnik':['Hangisi']};
for(const item of input){for(const name of rejected[item.key]||[])if(!item.products[name]?.approved)delete item.products[name];if(item.logo&&/facebook|instagram|arcade|royal_caribbean|no%20logo|no.logo/i.test(item.logo.url))item.logo=null;}
mkdirSync('apps/admin_web/public/media/brands',{recursive:true});
const entries=[],issues=[];
for(const r of input){
 if(r.error)continue;
 const key=r.key||r.english,slug=key.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
 async function convert(a,kind){
  if(!a)return null;
  try{
   let raw=readFileSync(a.file);const icon=a.file.replace(/\.img$/,'.png');if(existsSync(icon))raw=readFileSync(icon);
   if(raw.toString('utf8',0,500).includes('<svg')){if(kind==='product'||kind==='cover')throw Error('Vector icon is not a product photograph');raw=Buffer.from(raw.toString().replace(/viewbox=/g,'viewBox=').replace(/preserveaspectratio=/g,'preserveAspectRatio=').replace(/clippath/g,'clipPath').replace(/var\(--[^)]+\)/g,'#000')); }
   const original=sharp(raw,{limitInputPixels:50000000,density:180}),meta=await original.metadata();
   if(!meta.width||!meta.height||(kind==='product'&&(meta.width<180||meta.height<120)))throw Error('too small');
   const name=slug+'-'+kind+'-'+a.sha256.slice(0,12)+'-v2'+(kind==='logo'?'.png':'.webp');
   const target='apps/admin_web/public/media/brands/'+name;
   if(!existsSync(target)){if(kind==='logo')await original.resize(520,220,{fit:'inside',withoutEnlargement:meta.format!=='svg'}).png().toFile(target);
   else await original.resize(1400,1000,{fit:'inside',withoutEnlargement:true}).webp({quality:83}).toFile(target);}
   const {data,info}=await sharp(target).ensureAlpha().raw().toBuffer({resolveWithObject:true});
   let opaque=0,white=0,transparent=0;for(let i=0;i<data.length;i+=4){if(data[i+3]<50)transparent++;else{opaque++;if(data[i]+data[i+1]+data[i+2]>660)white++;}}
   return {src:'/media/brands/'+name,sourceUrl:a.url,sourcePage:a.page,caption:a.alt||r.english,checkedAt:a.checkedAt,sha256:a.sha256,width:meta.width,height:meta.height,dark:kind==='logo'&&transparent/(info.width*info.height)>.1&&white/opaque>.8};
  }catch(e){issues.push({key,kind,url:a.url,error:e.message});return null;}
 }
 const entry={key,english:r.english,officialUrl:r.officialUrl,logo:await convert(r.logo,'logo'),products:{}};
 for(const [name,a] of Object.entries(r.products||{})){const p=await convert(a,'product');if(p)entry.products[name]=p;}
 const aliases={'Hermès':{'Kelly 系列':'Kelly','90 方巾与 Twilly':'Twilly'},'Montblanc':{'StarWalker 系列':'StarWalker'},'Baccarat':{'Harcourt 1841 酒杯':'Harcourt'},'Steinway & Sons':{'Model D 三角钢琴':'Model D','Steinway 三角钢琴系列':'Model B'}};
 for(const [alias,canonical] of Object.entries(aliases[r.english]||{})){if(entry.products[canonical])entry.products[alias]={...entry.products[canonical],caption:entry.products[canonical].caption+(alias.includes('90 方巾')?'（本图为Twilly）':alias.includes('Steinway 三角')?'（本图为Model B）':'')};}
 entry.brandCover=await convert(r.cover,'cover');entry.cover=Object.values(entry.products)[0]||entry.brandCover;
 entries.push(entry);
}
writeFileSync('artifacts/media-research/proposed-media.json',JSON.stringify({version:1,checkedAt:'2026-10-28',entries},null,2));
writeFileSync('artifacts/media-research/conversion-issues.json',JSON.stringify(issues,null,2));
console.log(JSON.stringify({entries:entries.length,logos:entries.filter(e=>e.logo).length,products:entries.reduce((n,e)=>n+Object.keys(e.products).length,0),covers:entries.filter(e=>e.cover).length,issues:issues.length}));
const list=entries.filter(e=>e.logo),comps=[];
for(let i=0;i<list.length;i++){const e=list[i],x=(i%7)*190,y=Math.floor(i/7)*115;
 comps.push({input:await sharp('apps/admin_web/public'+e.logo.src).resize(170,75,{fit:'contain',background:e.logo.dark?'#17261b':'#ffffff'}).flatten({background:e.logo.dark?'#17261b':'#ffffff'}).png().toBuffer(),left:x,top:y});
 comps.push({input:Buffer.from('<svg width="185" height="30"><text x="3" y="18" font-size="11">'+e.key.replace(/&/g,'&amp;').replace(/</g,'&lt;')+'</text></svg>'),left:x,top:y+77});
}
await sharp({create:{width:1330,height:Math.ceil(list.length/7)*115,channels:3,background:'#e6e6e6'}}).composite(comps).jpeg({quality:80}).toFile('artifacts/media-research/logos-v2.jpg');
