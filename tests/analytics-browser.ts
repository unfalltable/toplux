import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {writeFileSync,mkdirSync} from 'node:fs';
const browser=await chromium.launch({channel:'chrome',headless:true});
const owner=await browser.newContext({viewport:{width:1440,height:1000}}),admin=await browser.newContext(),visitor=await browser.newContext({viewport:{width:1440,height:1000}});
const base='http://127.0.0.1:3100',stamp=String(Date.now()),name='数据验收'+stamp,errors:string[]=[];
let userCsrf='',adminCsrf='',mid='',webId='',liveId='';
async function request(context:any,path:string,method='GET',body?:any,csrf=''){
 const response=await context.request.fetch(base+'/api/v1'+path,{method,data:body,headers:{'X-CSRF-Token':csrf,'Idempotency-Key':crypto.randomUUID()}});
 assert.ok(response.ok(),path+': '+await response.text());return response.json();
}
try{
 const u=await request(owner,'/auth/local','POST',{name:'user'});userCsrf=u.csrf;
 const a=await request(admin,'/auth/local','POST',{name:'admin'});adminCsrf=a.csrf;
 const cat=(await request(owner,'/categories')).items[0];
 const png=await sharp({create:{width:64,height:64,channels:3,background:'#214b39'}}).png().toBuffer();
 const asset=await request(owner,'/assets','POST',{data:'data:image/png;base64,'+png.toString('base64')},userCsrf);
 mid=(await request(owner,'/merchants','POST',{displayName:name,logoAssetId:asset.id},userCsrf)).id;
 const order=await request(owner,'/contributions/orders','POST',{merchantId:mid,categoryId:cat.id,amountFen:10000},userCsrf);
 await request(owner,'/sandbox/orders/'+order.id+'/pay','POST',{},userCsrf);
 const page=await owner.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/#analytics');
 await page.locator('.analytics-panel').waitFor();await page.getByLabel('品牌范围').selectOption(mid);
 await page.getByRole('button',{name:'品牌资料与链接'}).waitFor();await page.getByRole('button',{name:'品牌资料与链接'}).click();
 await page.locator('[name=description]').fill('数据看板自动化验收品牌，仅用于本地沙箱。');
 await page.locator('[name=type]').selectOption('WEBSITE');await page.locator('[name=platform]').fill('官网验收'+stamp);await page.locator('[name=url]').fill('https://www.rolex.com/zh-hans');
 await page.getByRole('button',{name:'保存选填资料'}).click();await page.locator('.modal').waitFor({state:'hidden'});
 // The dashboard can be refreshed independently after changing a channel.
 await page.getByRole('button',{name:'刷新统计'}).click();await page.getByRole('button',{name:'品牌资料与链接'}).click();
 await page.locator('[name=type]').selectOption('LIVE');await page.locator('[name=platform]').fill('直播验收'+stamp);await page.locator('[name=url]').fill('https://live.douyin.com/123');
 await page.getByRole('button',{name:'保存选填资料'}).click();await page.locator('.modal').waitFor({state:'hidden'});
 let report=await request(owner,'/me/analytics?merchantId='+mid);assert.equal(report.channels.length,2);webId=report.channels.find((l:any)=>l.type==='WEBSITE').id;liveId=report.channels.find((l:any)=>l.type==='LIVE').id;
 const adm=await admin.newPage();adm.on('pageerror',e=>errors.push(e.message));await adm.goto(base+'/#admin');await adm.locator('.admin-tabs').waitFor();await adm.getByRole('button',{name:'链接审核',exact:false}).click();
 for(const label of ['官网验收'+stamp,'直播验收'+stamp]){
  await adm.locator('.admin-list article').filter({hasText:label}).getByRole('button',{name:'审核链接'}).click();await adm.locator('[name=reason]').fill('验证公开HTTPS目标与引流统计，仅限本地演示');await adm.getByRole('button',{name:'确认并记录审计'}).click();await adm.locator('.modal').waitFor({state:'hidden'});
 }
 const view=await visitor.newPage();view.on('pageerror',e=>errors.push(e.message));await view.goto(base);
 await view.locator('[data-merchant-id="'+mid+'"]').waitFor();await view.locator('[data-merchant-id="'+mid+'"]').scrollIntoViewIfNeeded();
 await view.waitForFunction(()=>document.visibilityState==='visible');
 await view.waitForTimeout(1500);
 await view.locator('[data-merchant-id="'+mid+'"]').click();await view.getByRole('dialog').waitFor();
 await view.getByRole('button',{name:/访问品牌官网/}).click();
 const go=view.getByRole('link',{name:'打开外部页面'});assert.match(await go.getAttribute('href')||'',new RegExp('/links/'+webId+'/go'));
 const web=await visitor.request.get(base+(await go.getAttribute('href')),{maxRedirects:0});assert.equal(web.status(),302);assert.equal(web.headers().location,'https://www.rolex.com/zh-hans');
 const live=await visitor.request.get(base+'/api/v1/links/'+liveId+'/go?eventKey='+crypto.randomUUID(),{maxRedirects:0});assert.equal(live.status(),302);
 await page.getByRole('button',{name:'近90天',exact:true}).click();await page.locator('.analytics-metrics').waitFor();
 await page.getByRole('button',{name:'近7天',exact:true}).click();await page.locator('.analytics-metrics').waitFor();
 for(let i=0;i<20;i++){report=await request(owner,'/me/analytics?merchantId='+mid);if(report.summary.views&&report.summary.impressions)break;await page.waitForTimeout(200);}
 assert.equal(report.summary.visitors,1);assert.equal(report.summary.views,1);assert.ok(report.summary.impressions>=1);assert.equal(report.summary.website,1);assert.equal(report.summary.live,1);assert.equal(report.summary.click_visitors,1);
 await page.getByRole('button',{name:'刷新统计'}).click();await page.locator('.analytics-metrics').waitFor();
 await page.getByRole('button',{name:'近30天',exact:true}).click();await page.locator('.analytics-metrics').waitFor();
 const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'导出数据'}).click();const download=await downloadPromise;await download.saveAs('artifacts/analytics-export.csv');
 await page.screenshot({path:'artifacts/merchant-analytics-desktop.png',fullPage:true});
 await adm.getByRole('button',{name:'数据总览',exact:true}).click();await adm.locator('.analytics-metrics').waitFor();await adm.screenshot({path:'artifacts/platform-dashboard.png',fullPage:true});
 const forbidden=await owner.request.get(base+'/api/v1/admin/analytics');assert.equal(forbidden.status(),403);
 const unauth=await visitor.request.get(base+'/api/v1/me/analytics');assert.equal(unauth.status(),401);
 for(const width of [375,390,430,768,1280]){
  await page.setViewportSize({width,height:900});await page.goto(base+'/#analytics');await page.locator('.analytics-metrics').waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'商家数据溢出 '+width);await page.screenshot({path:'artifacts/analytics-'+width+'.png',fullPage:true});
  await adm.setViewportSize({width,height:900});await adm.goto(base+'/#admin');await adm.locator('.analytics-metrics').waitFor();assert.ok(await adm.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'平台后台溢出 '+width);
 }
 await page.goto(base+'/#manage');await page.locator('.analytics-panel').waitFor();assert.equal(await page.getByText('商家中心',{exact:true}).count(),0);
 assert.deepEqual(errors,[]);mkdirSync('artifacts',{recursive:true});writeFileSync('artifacts/analytics-browser-result.json',JSON.stringify({ok:true,flows:['configure website and live links','platform review','visible impression','detail view PV/UV','server redirect tracking','owner isolation','admin access','7/30/90 range','CSV export','legacy route','responsive dashboard'],summary:report.summary,errors},null,2));
 console.log('Analytics Chrome E2E passed');
}finally{await browser.close();}
