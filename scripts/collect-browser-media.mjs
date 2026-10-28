import {chromium} from 'playwright';import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';import {createHash} from 'node:crypto';
const dir='artifacts/media-research';mkdirSync(dir,{recursive:true});
const data=JSON.parse(readFileSync('design/atlas-ranking.json','utf8')),base=JSON.parse(readFileSync(dir+'/results.json','utf8'));
const brands=new Map();for(const c of data.categories)for(const b of c.items){const key=b.english==='Loewe'?'Loewe (TV)':b.english;if(!brands.has(key))brands.set(key,{...b,key,products:[]});for(const p of b.products)if(!brands.get(key).products.some(x=>x.name===p.name))brands.get(key).products.push(p);}
const alternates={
'Louis Vuitton':'https://www.lvmh.com/en/our-maisons/fashion-leather-goods/louis-vuitton','Dior':'https://www.lvmh.com/en/our-maisons/fashion-leather-goods/christian-dior','LOEWE':'https://www.lvmh.com/en/our-maisons/fashion-leather-goods/loewe','Fendi':'https://www.lvmh.com/en/our-maisons/fashion-leather-goods/fendi','Berluti':'https://www.lvmh.com/en/our-maisons/fashion-leather-goods/berluti','Loro Piana':'https://www.lvmh.com/en/our-maisons/fashion-leather-goods/loro-piana','Celine':'https://www.lvmh.com/en/our-maisons/fashion-leather-goods/celine',
'Bvlgari':'https://www.lvmh.com/en/our-maisons/watches-jewelry/bvlgari','Tiffany & Co.':'https://www.lvmh.com/en/our-maisons/watches-jewelry/tiffany-co','RIMOWA':'https://www.lvmh.com/en/our-maisons/other-activities/rimowa',
'Gucci':'https://www.kering.com/en/houses/couture-and-leather-goods/gucci/','Saint Laurent':'https://www.kering.com/en/houses/couture-and-leather-goods/saint-laurent/','Bottega Veneta':'https://www.kering.com/en/houses/couture-and-leather-goods/bottega-veneta/','Brioni':'https://www.kering.com/en/houses/couture-and-leather-goods/brioni/','Boucheron':'https://www.kering.com/en/houses/jewelry/boucheron/',
'Cartier':'https://www.richemont.com/our-maisons/cartier/','Van Cleef & Arpels':'https://www.richemont.com/our-maisons/van-cleef-arpels/','IWC Schaffhausen':'https://www.richemont.com/our-maisons/iwc-schaffhausen/','Jaeger-LeCoultre':'https://www.richemont.com/our-maisons/jaeger-lecoultre/','Vacheron Constantin':'https://www.richemont.com/our-maisons/vacheron-constantin/',
'Omega':'https://www.swatchgroup.com/en/brands-companies/omega','Harry Winston':'https://www.swatchgroup.com/en/brands-companies/harry-winston',
'Rolex':'https://newsroom.rolex.com/','Tudor':'https://www.tudorwatch.com/en','CHANEL':'https://www.chanel.com/us/'};
function norm(s){return s.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();}
function score(n,s){let terms=norm(n).split(' ').filter(t=>t.length>2&&!['the','and','collection','series','watches'].includes(t)),v=norm(s);return terms.length?(v.includes(norm(n))?40:terms.reduce((a,t)=>a+(v.includes(t)?10:0),0)):0;}
const browser=await chromium.launch({channel:'chrome',headless:true}),context=await browser.newContext({viewport:{width:1440,height:1000},locale:'en-US'});
await context.route('**/*',route=>/google-analytics|doubleclick|facebook.net|analytics|hotjar/.test(route.request().url())?route.abort():route.continue());
let queue=[...brands.values()].filter(b=>{const r=base.find(x=>x.key===b.key);return !r?.logo||Object.keys(r.products||{}).length<b.products.length;});
async function save(url,page,kind,alt){
 try{const res=await context.request.get(url,{timeout:10000});if(!res.ok())return null;const bytes=await res.body();if(bytes.length<300||bytes.length>16000000)return null;
 if(!/image/.test(res.headers()['content-type']||'')&&!/\.svg|\.jpg|\.png|\.webp/.test(url))return null;
 const sha=createHash('sha256').update(bytes).digest('hex'),file=dir+'/'+sha+(/svg/.test(res.headers()['content-type']||'')?'.svg':'.img');writeFileSync(file,bytes);return {file,url,page,kind,alt,sha256:sha,checkedAt:'2026-10-28'};
 }catch{return null;}
}
async function imgs(page){return page.locator('img').evaluateAll(els=>els.map(el=>({url:el.currentSrc||el.src,alt:el.alt,context:el.className+' '+el.parentElement?.className,width:el.naturalWidth,height:el.naturalHeight}))).catch(()=>[]);}
async function collect(b){
 const page=await context.newPage(),r=base.find(x=>x.key===b.key)||{key:b.key,english:b.english,officialUrl:b.url,logo:null,products:{},pages:[]};
 try{
  for(const url of [b.url,alternates[b.key]].filter(Boolean)){
   const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:22000}).catch(()=>null);if(!response?.ok())continue;await page.waitForTimeout(1200);
   if(/access denied|just a moment|request unsuccessful/i.test((await page.locator('body').innerText()).slice(0,500)))continue;
   const current=page.url();r.pages.push(current);const ims=await imgs(page);
   if(!r.logo){
    for(const im of ims.filter(im=>/logo|wordmark/i.test(im.url+' '+im.alt+' '+im.context)&&! /paypal|mastercard|klarna|visa|google|cookie|facebook|instagram|youtube/i.test(im.url+' '+im.alt)).sort((a,b)=>b.width-a.width)){
     const found=await save(im.url,current,'logo',im.alt);if(found){r.logo=found;break;}
    }
    if(!r.logo&&!alternates[b.key]?.includes(new URL(current).hostname)){
     const candidates=page.locator('header svg,header a:has(img),[class*="logo"] svg,svg[class*="logo"],a[class*="logo"],[id*="logo"]');
     for(let i=0;i<Math.min(await candidates.count(),20);i++){const el=candidates.nth(i),box=await el.boundingBox();if(!box||box.width<45||box.height<15||box.width>600||box.height>200)continue;
      const attrs=await el.evaluate(e=>e.outerHTML.slice(0,1500));if(/paypal|visa|mastercard|klarna|social/i.test(attrs))continue;
      if(!/logo|brand|home|falcon|origin/i.test(attrs))continue;
      const bytes=await el.screenshot({type:'png',omitBackground:true}),sha=createHash('sha256').update(bytes).digest('hex'),file=dir+'/'+sha+'.img';writeFileSync(file,bytes);r.logo={file,url:current+'#rendered-brand-mark',page:current,kind:'logo',alt:b.english+' official website mark',sha256:sha,checkedAt:'2026-10-28'};break;
     }
    }
   }
   const links=await page.locator('a[href]').evaluateAll(els=>els.map(a=>({url:a.href,text:a.textContent||a.getAttribute('aria-label')||''})));
   for(const p of b.products){
    if(r.products[p.name])continue;
    let candidates=ims.map(im=>({...im,sc:score(p.name,im.url+' '+im.alt),page:current}));
    for(const link of links.map(l=>({...l,sc:score(p.name,l.url+' '+l.text)})).filter(l=>l.sc>=10&&new URL(l.url).hostname===new URL(current).hostname).sort((a,b)=>b.sc-a.sc).slice(0,1)){
     const resp=await page.goto(link.url,{waitUntil:'domcontentloaded',timeout:18000}).catch(()=>null);if(!resp?.ok())continue;await page.waitForTimeout(650);
     const child=await imgs(page);candidates.push(...child.map(im=>({...im,sc:score(p.name,im.url+' '+im.alt),page:page.url()})));
    }
    for(const im of candidates.filter(im=>im.sc>=10&&im.width>=180&&im.height>=140&&!/logo|icon|swatch|placeholder/i.test(im.url)).sort((a,b)=>b.sc-a.sc).slice(0,3)){
     const found=await save(im.url,im.page,'product',im.alt);if(found){found.product=p.name;r.products[p.name]=found;break;}
    }
   }
   if(r.logo&&Object.keys(r.products).length>=b.products.length)break;
  }
 }catch(e){r.browserError=e.message.slice(0,200);}finally{await page.close();}
 const i=base.findIndex(x=>x.key===b.key);if(i<0)base.push(r);else base[i]=r;writeFileSync(dir+'/browser-results.json',JSON.stringify(base,null,2));console.log(JSON.stringify({brand:b.key,logo:!!r.logo,products:Object.keys(r.products).length}));
}
try{await Promise.all(Array.from({length:4},async()=>{while(queue.length)await collect(queue.shift());}));}finally{await context.close();await browser.close();}
console.log(JSON.stringify({done:base.length,logos:base.filter(r=>r.logo).length,products:base.reduce((n,r)=>n+Object.keys(r.products||{}).length,0)}));
