import {chromium} from 'playwright';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
const D='artifacts/media-research/recovery-logos',today=new Date().toISOString().slice(0,10);
const urls={
'CHANEL':['https://www.chanel.cn/cn/','https://www.chanel.com/cn/'],
'Coach':['https://www.coach.com.cn/'],
'Jimmy Choo':['https://www.jimmychoo.cn/'],
'Fendi':['https://www.fendi.cn/'],
'John Lobb':['https://www.johnlobb.com/en_gb/'],
'Omega':['https://www.omegawatches.cn/'],
'Preciosa Lighting':['https://www.preciosalighting.com/'],
'Helena Rubinstein':['https://www.helenarubinstein.cn/'],
'Lladró':['https://www.lladro.com/'],
'Celine':['https://www.celine.com/en-us/home'],
'Tiffany & Co.':['https://www.tiffany.cn/'],
'Loro Piana':['https://cn.loropiana.com/'],
'Rolls-Royce':['https://www.rolls-roycemotorcars.com/en_GB/home.html'],
'Bentley':['https://www.bentleymedia.com/en/'],
'Bugatti':['https://newsroom.bugatti.com/'],
'Ferrari':['https://www.ferrari.com/en-EN/corporate'],
'RIMOWA':['https://www.rimowa.com/cn/zh/']
};
const browser=await chromium.launch({channel:'chrome',headless:true});
const ctx=await browser.newContext({viewport:{width:1440,height:1000},locale:'en-US'});
await ctx.route('**/*',r=>/google-analytics|doubleclick|facebook.net|hotjar/.test(r.request().url())?r.abort():r.continue());
const output=[];
async function save(bytes,url,page,alt,context){
 const sha256=createHash('sha256').update(bytes).digest('hex'),file=D+'/'+sha256+(bytes.toString('utf8',0,500).includes('<svg')?'.svg':'.img');
 if(!existsSync(file))writeFileSync(file,bytes);
 return {file,url,page,alt,sha256,checkedAt:today,context};
}
let queue=Object.entries(urls);
async function work([key,links]){
 const p=await ctx.newPage(),row={key,candidates:[],pages:[]};
 for(const link of links)try{
 const res=await p.goto(link,{waitUntil:'domcontentloaded',timeout:16000}).catch(()=>null);
 row.pages.push({url:link,final:p.url(),status:res?.status()||0});
 if(!res?.ok())continue;
 await p.waitForTimeout(1200);
 if(/Access Denied|Client Challenge|Request Rejected|Forbidden/i.test((await p.locator('body').first().innerText()).slice(0,250)))continue;
 const html=await p.content();const cache=D+'/'+createHash('sha256').update(p.url()).digest('hex')+'-rendered.html';writeFileSync(cache,html);
 const candidates=await p.locator('header img,[class*="logo"] img,[class*="Logo"] img,img[alt],header svg,[class*="logo"] svg,[class*="Logo"] svg').evaluateAll(els=>els.map(el=>{
 const r=el.getBoundingClientRect(),context=[el.tagName,el.className.baseVal||el.className,el.parentElement?.className,el.getAttribute('aria-label')].join(' ');
 return {tag:el.tagName,src:el.currentSrc||el.src||'',alt:el.getAttribute('alt')||'',context,svg:el.tagName.toLowerCase()==='svg'?el.outerHTML:'',width:r.width,height:r.height};
 }).filter(el=>el.width>=40&&el.height>=8&&el.width<=800&&el.height<=400));
 for(const c of candidates){
 if(!/logo|wordmark|brand/i.test(c.context+' '+c.src+' '+c.alt)||/payment|paypal|mastercard|visa|facebook|instagram|twitter|tiktok|google|klarna|wechat|weibo|youtube|icon-user|icon-search|menu/i.test(c.context+' '+c.src+' '+c.alt))continue;
 if(c.tag.toLowerCase()==='img'&&c.src&&!c.src.startsWith('data:')){
  try{const res=await ctx.request.get(c.src,{timeout:9000});if(res.ok()){const b=await res.body();row.candidates.push(await save(b,c.src,p.url(),c.alt,c.context));}}catch{}
 }else if(c.svg){
  const clean=await p.evaluate(svgText=>{const doc=new DOMParser().parseFromString(svgText,'image/svg+xml'),svg=doc.documentElement;
   for(const use of [...svg.querySelectorAll('use')]){const ref=use.getAttribute('href')||use.getAttribute('xlink:href');if(!ref?.startsWith('#'))continue;const sym=document.getElementById(ref.slice(1));if(!sym)continue;if(sym.getAttribute('viewBox'))svg.setAttribute('viewBox',sym.getAttribute('viewBox'));const g=doc.createElementNS('http://www.w3.org/2000/svg','g');g.innerHTML=sym.innerHTML;use.replaceWith(g);}
   svg.setAttribute('xmlns','http://www.w3.org/2000/svg');return new XMLSerializer().serializeToString(svg);
  },c.svg);
  if(!clean.includes('<use'))row.candidates.push(await save(Buffer.from(clean),p.url()+'#official-brand-mark',p.url(),key+' official mark',c.context));
 }
 }
 const list=p.locator('header [class*="logo"],header [class*="Logo"],[class*="header"] [class*="logo"],[class*="header"] [class*="Logo"]');
 for(let i=0;i<Math.min(await list.count(),8);i++){
 const el=list.nth(i),box=await el.boundingBox();if(!box||box.width<60||box.height<12||box.width>600||box.height>160)continue;
 const context=await el.evaluate(e=>e.outerHTML.slice(0,2500));
 if(/payment|paypal|mastercard|visa|facebook|instagram|twitter|tiktok|google|klarna|wechat|weibo|youtube|icon-user|icon-search|menu/i.test(context))continue;
 try{const bytes=await el.screenshot({type:'png',omitBackground:true,timeout:4000});row.candidates.push(await save(bytes,p.url()+'#rendered-logo',p.url(),key+' website header logo',context));}catch{}
 }
 }catch(e){row.error=e.message.slice(0,140);}
 row.candidates=row.candidates.filter((a,i,all)=>all.findIndex(x=>x.sha256===a.sha256)===i);
 output.push(row);writeFileSync(D+'/candidates-browser.json',JSON.stringify(output,null,2));console.log(JSON.stringify({key,count:row.candidates.length,pages:row.pages}));
 await p.close();
}
try{await Promise.all(Array.from({length:4},async()=>{while(queue.length)await work(queue.shift())}));}finally{await ctx.close();await browser.close();}
