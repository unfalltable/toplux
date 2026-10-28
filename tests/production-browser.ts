import {chromium,expect} from 'playwright/test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
const base=process.env.DEPLOY_URL||'http://149.88.67.92:8080',dir='artifacts/production';
mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true}),context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors:string[]=[];
page.on('pageerror',e=>errors.push(e.message));
try{
 // A deployment check must not seed synthetic analytics into the live database.
 await context.route('**/api/v1/analytics/events',r=>r.abort());
 const health=await (await page.request.get(base+'/api/v1/health')).json();assert.equal(health.mode,'production');
 const cap=await (await page.request.get(base+'/api/v1/capabilities')).json();assert.equal(cap.sandbox,false);assert.equal(cap.canPurchasePromotion,false);assert.equal(cap.realPaymentEnabled,false);assert.deepEqual(cap.paymentChannels,[]);
 const cats=(await (await page.request.get(base+'/api/v1/categories')).json()).items;
 assert.equal(cats.length,40);assert.ok(cats.every((c:any)=>c.brand_count>=3));
 const board=(await (await page.request.get(base+'/api/v1/merchant-board')).json());assert.equal(board.items.length,0);
 for(const path of ['/admin','/admin/enter','/api/v1/admin/overview','/api/v1/auth/local','/api/v1/sandbox/orders/00000000-0000-4000-8000-000000000000/pay']){
  const response=path.includes('/auth/')||path.includes('/sandbox/')?await page.request.post(base+path,{data:{}}):await page.request.get(base+path);
  assert.ok([401,403,404].includes(response.status()),path+' should be closed');
 }
 for(const path of ['/support/orders','/contributions/orders']){
  const r=await page.request.post(base+'/api/v1'+path,{data:{}});assert.equal(r.status(),503);
 }
 await page.goto(base);await expect(page.locator('.header-support')).toBeEnabled();
 await expect(page.locator('.ranking-empty')).toBeVisible();
 await expect(page.locator('.podium-card')).toHaveCount(0);
 assert.ok(!/沙箱|模拟|自动化演示|接口测试/.test(await page.locator('body').innerText()));
 const uuid=await page.evaluate(()=>({secure:isSecureContext,nativeUuid:typeof crypto.randomUUID}));
 // An ordinary HTTP page must still render and load the atlas using getRandomValues.
 await page.locator('.hero-cta').click();await expect(page.locator('.category-tile')).toHaveCount(40);
 await page.getByRole('button',{name:/^手表 /}).click();await expect(page.locator('.catalog-card')).toHaveCount(cats.find((c:any)=>c.slug===(page.url().includes('brands')?'watches':'watches'))?.brand_count||11);
 await expect(page.locator('.catalog-title h2').first()).toHaveText('百达翡丽');
 await page.locator('.catalog-reading-link').first().click();await expect(page.locator('.atlas-brand-title h1')).toHaveText('百达翡丽');
 await expect(page.locator('.atlas-section')).toHaveCount(6);
 await page.reload();await expect(page.locator('.atlas-brand-title h1')).toHaveText('百达翡丽');
 const visitor=()=>context.cookies().then(c=>c.find(x=>x.name==='sb_visitor')?.value);
 const first=await visitor();await page.reload();await expect(page.locator('.atlas-brand-title h1')).toHaveText('百达翡丽');assert.ok(first);assert.equal(await visitor(),first);
 await page.getByRole('button',{name:'为它助力',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('助力收款尚未开放');
 assert.ok(!/沙箱|模拟/.test(await page.getByRole('dialog').innerText()));await page.getByRole('button',{name:'关闭',exact:true}).click();
 for(const width of [375,390,430,768,1280]){
  await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:dir+'/atlas-'+width+'.png',fullPage:true});
 }
 await page.goto(base+'/#orders');await expect(page.locator('main')).toContainText('目前没有助力订单');assert.ok(!/沙箱|模拟/.test(await page.locator('body').innerText()));
 await page.goto(base);await expect(page.locator('.ranking-empty')).toBeVisible();await page.screenshot({path:dir+'/home.png',fullPage:true});
 assert.deepEqual(errors,[]);
 writeFileSync(dir+'/browser-result.json',JSON.stringify({ok:true,url:base,categories:40,paidBrands:0,paymentClosed:true,adminClosed:true,analyticsSuppressed:true,httpBrowserContext:uuid,visitorCookieStable:true,widths:[375,390,430,768,1280],pageErrors:errors},null,2));
 console.log('Production Chrome verification passed; no analytics, orders or follows created.');
}finally{await context.close();await browser.close();}
