import {readFileSync,writeFileSync,existsSync} from 'node:fs';import {createHash} from 'node:crypto';import sharp from 'sharp';
const D='artifacts/media-research/recovery-logos',selected=JSON.parse(readFileSync(D+'/selected-for-review.json')),p=JSON.parse(readFileSync(D+'/candidates-precise.json')),last=JSON.parse(readFileSync(D+'/candidates-last-check.json'));
selected.find(x=>x.key==='Fendi').logo=p.find(x=>x.key==='Fendi').candidates[0];
for(const key of ['Jimmy Choo','Omega','Rolls-Royce'])selected.push({key,logo:p.find(x=>x.key===key).candidates[0]});
for(const a of last[0].candidates)selected.push({key:'Ferragamo '+a.context,logo:a});
for(const r of selected){
 if(r.key==='Saint Laurent'){
 const raw=readFileSync(r.logo.file),m=await sharp(raw).metadata();const blob=await sharp(raw).trim().png().toBuffer(),sha=createHash('sha256').update(blob).digest('hex'),file=D+'/'+sha+'.png';if(!existsSync(file))writeFileSync(file,blob);r.logo={...r.logo,file,sha256:sha,alt:'Saint Laurent official logo, transparent margins trimmed',rawFile:r.logo.file};
 }
}
writeFileSync(D+'/selected-final-review.json',JSON.stringify(selected,null,2));
const comps=[];for(let i=0;i<selected.length;i++){const r=selected[i],x=i%4*300,y=Math.floor(i/4)*180;
let b=readFileSync(r.logo.file),m=await sharp(b).metadata();const {data,info}=await sharp(b).ensureAlpha().raw().toBuffer({resolveWithObject:true});let n=0,w=0,t=0;for(let j=0;j<data.length;j+=4){if(data[j+3]<50)t++;else{n++;if(data[j]+data[j+1]+data[j+2]>650)w++}}const bg=t/(info.width*info.height)>.1&&w/Math.max(1,n)>.7?'#203125':'#fff';
comps.push({input:await sharp(b,{density:150}).resize(280,125,{fit:'contain',background:bg}).flatten({background:bg}).png().toBuffer(),left:x+10,top:y+5});
const label=r.key.replace(/&/g,'&amp;');comps.push({input:Buffer.from('<svg width="300" height="45"><text x="7" y="20" font-family="Arial" font-size="13">'+(i+1)+'. '+label+'</text></svg>'),left:x,top:y+135});}
await sharp({create:{width:1200,height:Math.ceil(selected.length/4)*180,channels:3,background:'#e4e8e2'}}).composite(comps).png().toFile(D+'/contact-sheet-final-review.png');console.log(JSON.stringify({candidates:selected.length,sheet:D+'/contact-sheet-final-review.png'}));