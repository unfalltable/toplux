import {readFileSync,writeFileSync,existsSync} from 'node:fs';import sharp from 'sharp';import {spawn} from 'node:child_process';import http from 'node:http';
const D='artifacts/media-research/recovery-logos';
if(process.argv.includes('--serve')){const server=http.createServer((req,res)=>{if(req.url==='/contact-sheet.png'){res.setHeader('Content-Type','image/png');res.end(readFileSync(D+'/contact-sheet.png'));}else{res.setHeader('Content-Type','text/html');res.end('<style>body{margin:0;background:#eee}img{display:block;width:1200px;max-width:100%}</style><img src="/contact-sheet.png">')}});server.listen(8796,'127.0.0.1');setTimeout(()=>server.close(),600000);process.on('SIGTERM',()=>server.close());}
else{
const sets={r:JSON.parse(readFileSync(D+'/candidates-round1.json')),b:JSON.parse(readFileSync(D+'/candidates-browser.json')),e:JSON.parse(readFileSync(D+'/candidates-extra.json'))};
const picks=[['r','Vacheron Constantin',0],['r','Messika',0],['r','Ducati',0],['r','La Cornue',0],['r','Technogym',0],['b','CHANEL',0],['e','Coach',0],['b','Fendi',0],['b','Helena Rubinstein',0],['b','Bentley',0],['e','Bugatti',0],['e','Saint Laurent',0]];
const selected=picks.map(([set,key,i])=>({key,logo:sets[set].find(x=>x.key===key).candidates[i]}));
const composite=[],issues=[];
for(let i=0;i<selected.length;i++){const r=selected[i],x=(i%3)*400,y=Math.floor(i/3)*190;
try{let s=sharp(readFileSync(r.logo.file),{density:150}),m=await s.metadata();const {data,info}=await s.ensureAlpha().raw().toBuffer({resolveWithObject:true});let white=0,n=0,transparent=0;for(let j=0;j<data.length;j+=4){if(data[j+3]<50)transparent++;else{n++;if(data[j]+data[j+1]+data[j+2]>650)white++}};const dark=transparent/(info.width*info.height)>.1&&white/Math.max(1,n)>.7;const background=dark?'#203125':'#ffffff';
const thumb=await sharp(readFileSync(r.logo.file),{density:150}).resize(370,135,{fit:'contain',background}).flatten({background}).png().toBuffer();composite.push({input:thumb,left:x+10,top:y+6});r.width=m.width;r.height=m.height;r.dark=dark;
const label=r.key.replace(/&/g,'&amp;').replace(/</g,'&lt;');composite.push({input:Buffer.from('<svg width="390" height="35"><text x="10" y="20" font-family="Arial" font-size="16">'+(i+1)+'. '+label+'</text></svg>'),left:x,top:y+145});
}catch(e){issues.push({key:r.key,error:e.message})}}
await sharp({create:{width:1200,height:Math.ceil(selected.length/3)*190,channels:3,background:'#e4e8e2'}}).composite(composite).png().toFile(D+'/contact-sheet.png');writeFileSync(D+'/selected-for-review.json',JSON.stringify(selected,null,2));
const child=spawn(process.execPath,[process.argv[1],'--serve'],{detached:true,stdio:'ignore',cwd:process.cwd()});child.unref();writeFileSync(D+'/preview-server.json',JSON.stringify({pid:child.pid,port:8796,startedAt:new Date().toISOString()}));console.log(JSON.stringify({selected:selected.length,issues,pid:child.pid,preview:'http://127.0.0.1:8796'}));
}