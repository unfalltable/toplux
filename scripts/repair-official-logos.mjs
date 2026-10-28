import {chromium} from 'playwright';import fs from 'node:fs';import {createHash} from 'node:crypto';import sharp from 'sharp';
const dir='artifacts/media-research';const source=JSON.parse(fs.readFileSync(dir+'/browser-results.json','utf8'));
const names=['Apple','Chaumet','Messika','Leica','MV Agusta','Sub-Zero & Wolf','TWG Tea','Silversea','Flos','Falcon Northwest','ORIGIN PC','Creed','Petrossian','Veilance','Colnago','PENT.'];
const data=JSON.parse(fs.readFileSync('design/atlas-ranking.json','utf8'));const out=[];
const browser=await chromium.launch({channel:'chrome',headless:true}),context=await browser.newContext({viewport:{width:1440,height:1000}});
await context.route('**/*',r=>/analytics|doubleclick|hotjar/.test(r.request().url())?r.abort():r.continue());
let queue=[...names];try{await Promise.all(Array.from({length:3},async()=>{while(queue.length){const name=queue.shift(),b=data.categories.flatMap(c=>c.items).find(b=>b.english===name);if(!b)continue;
 const page=await context.newPage(),result={key:name,candidates:[]};
 try{const res=await page.goto(b.url,{waitUntil:'domcontentloaded',timeout:20000});if(!res?.ok())throw Error('HTTP '+res?.status());await page.waitForTimeout(1500);
 const candidates=page.locator('a[class*="logo" i],a[id*="logo" i],[class*="logo" i]>svg,[class*="logo" i]>img,svg[class*="logo" i],img[alt*="logo" i],header a[href="/"],header a[aria-label*="home" i],.globalnav-link-apple');
 for(let i=0;i<Math.min(await candidates.count(),55)&&result.candidates.length<6;i++){const el=candidates.nth(i),box=await el.boundingBox();if(!box||box.width<25||box.height<14||box.width>700||box.height>230)continue;
 const html=await el.evaluate(e=>e.outerHTML.slice(0,1800));if(/paypal|mastercard|payment|klarna|google|visa|instagram|tiktok|facebook|youtube|cobrand|group-logo/i.test(html))continue;
 if(/Arcade|News|TV\+|Fitness|Royal.Caribbean|my.twg/i.test(html))continue;
 const blob=await el.screenshot({type:'png',omitBackground:false}),sha=createHash('sha256').update(blob).digest('hex'),file=dir+'/'+sha+'.img';fs.writeFileSync(file,blob);
 if(!result.candidates.some(x=>x.sha256===sha))result.candidates.push({file,sha256:sha,url:page.url()+'#rendered-brand-mark',page:page.url(),alt:name+' official website logo',kind:'logo',checkedAt:'2026-10-28',html:html.slice(0,500)});
 }
 result.header=await page.locator('header').first().innerText().catch(()=>'');
 }catch(e){result.error=e.message}finally{await page.close();}
 out.push(result);fs.writeFileSync(dir+'/logo-repairs.json',JSON.stringify(out,null,2));console.log(JSON.stringify({name,candidates:result.candidates.length,error:result.error}));
 }}));}finally{await context.close();await browser.close();}
const tiles=out.flatMap(x=>x.candidates.map((a,i)=>({...a,key:x.key,index:i}))),comps=[];
for(let i=0;i<tiles.length;i++){const t=tiles[i],x=i%5*180,y=Math.floor(i/5)*110;comps.push({input:await sharp(t.file).resize(175,75,{fit:'contain',background:'#ddd'}).flatten({background:'#ddd'}).png().toBuffer(),left:x,top:y});comps.push({input:Buffer.from('<svg width="180" height="30"><text x="3" y="18" font-size="10">'+t.key.replace(/&/g,'&amp;')+' #'+t.index+'</text></svg>'),left:x,top:y+78});}
await sharp({create:{width:900,height:Math.ceil(tiles.length/5)*110,channels:3,background:'#eee'}}).composite(comps).jpeg({quality:55}).toFile(dir+'/logo-repairs.jpg');
