import {chromium} from 'playwright';import {readFileSync,writeFileSync,existsSync} from 'node:fs';import {createHash} from 'node:crypto';import sharp from 'sharp';
const D='artifacts/media-research/recovery-logos',day=new Date().toISOString().slice(0,10),out=[];
function save(bytes,url,page,alt,context){const sha256=createHash('sha256').update(bytes).digest('hex'),file=D+'/'+sha256+(bytes.toString('utf8',0,400).includes('<svg')?'.svg':'.img');if(!existsSync(file))writeFileSync(file,bytes);return {file,url,page,alt,sha256,checkedAt:day,context};}
for(const [key,url,selector] of [['Jimmy Choo','https://www.jimmychoo.cn/','svg.header-logo'],['Omega','https://www.omegawatches.cn/','symbol#logo-omega']]){
 const path=D+'/'+createHash('sha256').update(url).digest('hex')+'-rendered.html',text=readFileSync(path,'utf8');
 const browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage();await page.route('**/*',r=>r.abort());await page.setContent(text,{waitUntil:'domcontentloaded'});
 const svg=await page.locator(selector).first().evaluate(el=>{const s=document.createElementNS('http://www.w3.org/2000/svg','svg');s.setAttribute('xmlns','http://www.w3.org/2000/svg');s.setAttribute('viewBox',el.getAttribute('viewBox'));s.innerHTML=el.innerHTML;return new XMLSerializer().serializeToString(s)});
 out.push({key,candidates:[save(Buffer.from(svg),url+(key==='Omega'?'#logo-omega':'#header-logo'),url,key+' official wordmark','Extracted unchanged paths from rendered official website SVG')]});await browser.close();
}
const browser=await chromium.launch({channel:'chrome',headless:true});const ctx=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:3});
for(const [key,url,selectors] of [
 ['Fendi','https://www.fendi.cn/',['.header-logo']],
 ['Rolls-Royce','https://www.rolls-roycemotorcars.com/en_GB/home.html',['.rrmc-footer-monogram','.rrmc-header-monogram','.rrmc-header__monogram']],
 ['Ferragamo','https://group.ferragamo.com/en/',['.header__logo--desktop']]
]){
 const page=await ctx.newPage(),row={key,candidates:[]};
 try{await page.goto(url,{waitUntil:'domcontentloaded',timeout:18000});await page.waitForTimeout(1700);
 for(const selector of selectors){const el=page.locator(selector).first();if(!await el.count())continue;
 const box=await el.boundingBox();if(!box||box.width<20||box.height<10)continue;
 await el.scrollIntoViewIfNeeded({timeout:4000});const bytes=await el.screenshot({type:'png',omitBackground:true,timeout:5000});row.candidates.push(save(bytes,url+'#'+selector.replace(/[^a-zA-Z0-9_-]/g,''),url,key+' official website logo',await el.evaluate(e=>e.outerHTML.slice(0,600))));}
 }catch(e){row.error=e.message.slice(0,120)}out.push(row);await page.close();
}
await browser.close();writeFileSync(D+'/candidates-precise.json',JSON.stringify(out,null,2));console.log(JSON.stringify(out.map(r=>({key:r.key,count:r.candidates.length,error:r.error}))));
