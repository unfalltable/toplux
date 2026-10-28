import fs from 'node:fs';import sharp from 'sharp';
const file='artifacts/media-research/browser-results.json';let data;try{data=JSON.parse(fs.readFileSync(file,'utf8'))}catch{data=JSON.parse(fs.readFileSync('artifacts/media-research/results.json','utf8'))}
console.log(JSON.stringify({total:data.length,logos:data.filter(x=>x.logo).length,products:data.reduce((n,r)=>n+Object.keys(r.products||{}).length,0)}));
fs.writeFileSync('artifacts/media-research/product-audit.json',JSON.stringify(data.flatMap(r=>Object.entries(r.products||{}).map(([name,a])=>({brand:r.key,name,alt:a.alt,url:a.url,page:a.page}))),null,2));
const list=data.flatMap(r=>Object.entries(r.products||{}).map(([name,a])=>({brand:r.key,name,...a})));
let comps=[],valid=[];
for(const a of list){try{const {data:b,info}=await sharp(a.file).resize(150,100,{fit:'contain',background:'#fff'}).flatten({background:'#fff'}).jpeg().toBuffer({resolveWithObject:true});const i=valid.length,x=i%6*175,y=Math.floor(i/6)*135;valid.push(a);comps.push({input:b,left:x,top:y});
comps.push({input:Buffer.from('<svg width="175" height="32"><text x="3" y="12" font-size="9">'+a.brand.replace(/&/g,'&amp;')+'</text><text x="3" y="25" font-size="9">'+a.name.replace(/&/g,'&amp;').replace(/</g,'&lt;').slice(0,25)+'</text></svg>'),left:x,top:y+100});}catch{}}
const height=Math.ceil(valid.length/6)*135;
await sharp({create:{width:1050,height,channels:3,background:'#eee'}}).composite(comps).jpeg({quality:65}).toFile('artifacts/media-research/products-contact.jpg');
for(let i=0;i<Math.ceil(height/900);i++)await sharp('artifacts/media-research/products-contact.jpg').extract({left:0,top:i*900,width:1050,height:Math.min(900,height-i*900)}).resize({width:840}).jpeg({quality:45}).toFile('artifacts/media-research/products-contact-'+i+'.jpg');
console.log(JSON.stringify({reviewed:valid.length,sheets:Math.ceil(height/900)}));
