
import {chromium} from 'playwright';
import {writeFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
const base='http://127.0.0.1:3100';
let server:ReturnType<typeof spawn>|undefined;
try{await fetch(base+'/api/v1/health');}catch{server=spawn(process.execPath,['--import','tsx','apps/api/src/main.ts'],{stdio:'ignore'});}
for(let i=0;i<40;i++){try{if((await fetch(base+'/api/v1/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,500));}
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:390,height:900}});
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/flutter/');
 await page.locator('flutter-view').waitFor({timeout:60000});
 await page.locator('canvas').first().waitFor({state:'attached',timeout:60000});
 await page.screenshot({path:'artifacts/flutter-mobile.png',fullPage:true});
 writeFileSync('artifacts/flutter-browser.json',JSON.stringify({rendered:true,errors},null,2));
 console.log('Flutter Web canvas rendered');
}finally{await browser.close();server?.kill();}
