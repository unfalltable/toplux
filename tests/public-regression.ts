import {chromium,expect,type Page} from 'playwright/test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
const base='http://127.0.0.1:3100',dir='artifacts/live-ranking';
mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const errors:string[]=[];
const page=await browser.newPage({viewport:{width:1440,height:1100}});
page.on('pageerror',error=>errors.push(error.message));
const nav=async(p:Page,label:string)=>{
 const toggle=p.getByRole('button',{name:'打开导航'});
 if(await toggle.isVisible()&&await toggle.getAttribute('aria-expanded')==='false')await toggle.click();
 await p.getByRole('navigation',{name:'主导航'}).getByRole('button',{name:label,exact:true}).click();
};
const money=(fen:number)=>'¥'+(fen/100).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2});
const overflow=async(p:Page,label:string)=>assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),label);
try{
 await page.route('**/api/v1/analytics/events',route=>route.fulfill({json:{ok:true}}));
 await page.goto(base,{waitUntil:'domcontentloaded'});
 await expect(page.locator('.header-support')).toBeEnabled();
 await expect(page).toHaveTitle('奢榜 · 贵有其位');
 await expect(page.locator('.public-nav').getByRole('button',{name:'奢品图鉴',exact:true})).toHaveCount(1);
 await expect(page.locator('.public-nav').getByRole('button',{name:'品类榜',exact:true})).toHaveCount(0);
 await expect(page.getByRole('combobox',{name:'榜单品类'})).toHaveValue('');
 await expect(page.locator('.podium-card')).toHaveCount(3);
 await expect(page.locator('.leader-reign time')).toBeVisible();
 const second=await page.locator('.place-2').boundingBox(),first=await page.locator('.place-1').boundingBox(),third=await page.locator('.place-3').boundingBox();
 assert.ok(second&&first&&third&&second.x<first.x&&first.x<third.x,'桌面三甲顺序');
 assert.ok(first.height>second.height,'冠军高度');
 const cats=(await (await page.request.get(base+'/api/v1/categories')).json()).items;
 const since=await page.locator('.leader-reign time').getAttribute('datetime');
 await page.reload();await expect(page.locator('.leader-reign time')).toHaveAttribute('datetime',since!);
 await page.screenshot({path:dir+'/home-desktop.png',fullPage:true});
 await page.getByRole('combobox',{name:'榜单品类'}).selectOption(cats[0].id);
 await expect(page.locator('.ranking-section-title h2')).toContainText(cats[0].name);
 await expect(page.locator('.podium-card').first()).toBeVisible();
 await nav(page,'奢品图鉴');await expect(page.locator('.category-tile')).toHaveCount(cats.length);
 await page.locator('.category-tile').first().click();await expect(page.locator('.catalog-card').first()).toBeVisible();
 await page.locator('.compare-button').nth(0).click();await page.locator('.compare-button').nth(1).click();
 await page.getByRole('button',{name:'开始对比'}).click();await expect(page.locator('.comparison thead th')).toHaveCount(3);
 await page.getByRole('button',{name:'清空对比'}).click();
 assert.equal((await page.request.get(base+'/admin')).status(),404);
 assert.equal((await page.request.get(base+'/api/v1/admin/categories')).status(),401);
 assert.equal((await page.request.get(base+'/api/v1/admin/brand-categories')).status(),401);
 assert.equal((await page.request.post(base+'/api/v1/admin/brand-categories/00000000-0000-4000-8000-000000000001',{data:{categoryId:cats[0].id,version:0,reason:'访客越权验证，不应写入'}})).status(),401);

 const context=await browser.newContext({viewport:{width:1440,height:1100}});
 const ui=await context.newPage();ui.on('pageerror',error=>errors.push(error.message));
 const ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444'];
 const names=['回归品牌甲','回归品牌乙','回归品牌丙','回归品牌丁'],[a,b,c]=cats;
 let revision=0,followed=false,paid=false,failCategory='',heldCategory='',release:()=>void=()=>{},staleHandled:()=>void=()=>{},gate:Promise<void>|null=null;
 const staleDone=new Promise<void>(resolve=>{staleHandled=resolve;});
 const began=new Date(Date.now()-7200000).toISOString();
 const rows=()=>{
  const values=revision===0?[10000,9000,8000,7000]:revision<3?[10000,9000,8000,15000]:[18000,9000,8000,15000];
  return ids.map((id,index)=>({id,merchant_id:id,name:names[index],logo:base+'/brand.svg',net_fen:values[index],category_names:[a.name],classification:{state:'CONFIRMED',categoryId:a.id,categoryName:a.name,version:1},stats:{heat:12,followers:followed?3:2,website_clicks:4,live_clicks:5,supporters:2,followed}})).sort((x,y)=>y.net_fen-x.net_fen).map((row,index)=>({...row,rank:index+1}));
 };
 const payment=(id:string,combo:number)=>({id,merchant_id:ids[3],category_id:a.id,name:names[3],amount_fen:8000,combo,paid_at:new Date().toISOString()});
 await ui.route('**/api/v1/**',async route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname.slice('/api/v1'.length);
  let data:any;
  if(path==='/public/session')data={csrf:'test',loginRequired:false};
  else if(path==='/categories')data={items:cats};
  else if(path==='/capabilities')data={canPurchasePromotion:true};
  else if(path==='/merchant-board'||path.endsWith('/merchant-board')){
   const category=path==='/merchant-board'?'':path.split('/')[2];
   if(category===heldCategory&&gate){await gate;await route.fulfill({status:503,json:{message:'旧品类错误'}}).catch(()=>{});staleHandled();return;}
   if(category===failCategory&&category){await route.fulfill({status:503,json:{message:'网络暂时不可用'}});return;}
   const items=category?[{...rows()[0],net_fen:4000,rank:1,category_id:category,category_names:[cats.find((cat:any)=>cat.id===category).name]}]:rows();
   const cursor=String(revision),events=!url.searchParams.has('after')||revision===0?[]:[payment(String(revision),revision===1?1:revision===2?3:4)];
   data={items,leaderSince:began,serverTime:new Date().toISOString(),updatedAt:new Date().toISOString(),activityCursor:cursor,events};
  }else if(path==='/public/brands')data={items:rows().map(row=>({...row,categories:[a,b,c]}))};
  else if(path==='/support/orders'&&req.method()==='GET')data={items:[]};
  else if(path==='/support/orders'){assert.equal(req.postDataJSON().amountFen,100);data={id:'ui-order',state:'PENDING'};}
  else if(path==='/sandbox/orders/ui-order/pay'){paid=true;data={id:'ui-order',state:'PAID',amountFen:100,event:payment('10',2)};}
  else if(path.includes('/follow')){followed=req.postDataJSON().followed;data={stats:{heat:12,followers:3,followed}};}
  else if(path.startsWith('/merchants/')){const id=path.split('/').at(-1)!;data={id,name:names[ids.indexOf(id)],logo:base+'/brand.svg',entries:[{id:'a',category_name:a.name,net_fen:10000},{id:'b',category_name:b.name,net_fen:5000}],classification:{state:'CONFIRMED',categoryId:a.id,categoryName:a.name,version:1},stats:rows()[0].stats,links:[]};}
  else if(path==='/analytics/events')data={ok:true};
  else if(path.endsWith('/brands'))data={items:[{...rows()[0],id:'profile',brand_id:ids[0],category_id:a.id,english:'REGRESSION',tier:'演示',summary:'资料',occasion:'日常',source:'回归'}]};
  else throw new Error('Unexpected '+path);
  await route.fulfill({json:data});
 });
 await ui.goto(base,{waitUntil:'domcontentloaded'});
 await expect(ui.locator('.place-1 h3')).toHaveText(names[0]);
 const startTime=await ui.locator('.leader-reign time').textContent();
 await expect(ui.locator('.leader-reign time')).not.toHaveText(startTime!);
 revision=1;
 await expect(ui.locator('.place-1 h3')).toHaveText(names[3],{timeout:6500});
 const moved=ui.locator('article[data-brand-id="'+ids[3]+'"]');
 assert.ok(await moved.evaluate(element=>element.getAnimations().some(animation=>animation.effect instanceof KeyframeEffect&&animation.effect.getKeyframes().some(frame=>String(frame.transform||'').startsWith('translate(')))),'跨越前三名的位移动画');
 await expect(moved.locator('.rank-trend')).toContainText('3');
 await expect(moved.locator('.animated-amount')).toHaveText(money(15000));
 await expect(ui.locator('.payment-toast')).toHaveAttribute('data-event-id','1');
 await ui.screenshot({path:dir+'/live-rank-change.png',fullPage:true});
 await expect(ui.locator('.payment-toast')).toHaveCount(0,{timeout:7000});
 // Repeated receipt id from the next poll must remain deduplicated.
 const response=ui.waitForResponse(res=>res.url().includes('/merchant-board?after=1'));await response;
 await expect(ui.locator('.payment-toast')).toHaveCount(0);
 revision=2;
 await expect(ui.locator('.critical-payment')).toHaveAttribute('data-event-id','2',{timeout:6500});
 await expect(ui.locator('.payment-kind')).toContainText('连击 ×3');
 await ui.setViewportSize({width:390,height:900});
 await ui.screenshot({path:dir+'/critical-mobile.png',fullPage:true});await overflow(ui,'暴击提示手机');
 await ui.emulateMedia({reducedMotion:'reduce'});
 revision=3;
 await expect(ui.locator('.place-1 h3')).toHaveText(names[0],{timeout:6500});
 await expect(ui.locator('.place-1 .animated-amount')).toHaveText(money(18000));
 assert.equal(await ui.locator('.place-1').evaluate(element=>element.getAnimations().length),0,'减少动态效果');
 await ui.emulateMedia({reducedMotion:'no-preference'});
 await ui.setViewportSize({width:1440,height:1100});
 heldCategory=a.id;gate=new Promise<void>(resolve=>{release=resolve;});
 await ui.getByRole('combobox',{name:'榜单品类'}).selectOption(a.id);
 await expect(ui.locator('.podium-card')).toHaveCount(0);
 await ui.getByRole('combobox',{name:'榜单品类'}).selectOption(b.id);
 await expect(ui.locator('.place-1 .podium-category')).toHaveText(b.name);
 release();await staleDone;
 await expect(ui.getByRole('alert')).toHaveCount(0);
 heldCategory='';gate=null;failCategory=c.id;
 await ui.getByRole('combobox',{name:'榜单品类'}).selectOption(c.id);
 await expect(ui.getByRole('alert')).toContainText('网络暂时不可用');
 failCategory='';await ui.getByRole('button',{name:'重新加载',exact:true}).click();
 await expect(ui.locator('.place-1 .podium-category')).toHaveText(c.name);
 const opener=ui.locator('.podium-brand');await opener.click();
 await expect(ui.locator('.detail-amount strong')).toHaveText(money(15000));
 await expect(ui.getByRole('button',{name:'关闭',exact:true})).toBeFocused();
 await ui.keyboard.press('Shift+Tab');assert.ok(await ui.getByRole('dialog').evaluate(el=>el.contains(document.activeElement)));
 await ui.keyboard.press('Escape');await expect(opener).toBeFocused();
 await ui.locator('.place-1 .follow-button').click();await expect(ui.locator('.place-1 .follow-button')).toHaveAttribute('aria-pressed','true');
 await ui.locator('.place-1 .support-button').click();await ui.getByRole('spinbutton',{name:'助力金额'}).fill('1');
 await ui.locator('input[name=consent]').check();await ui.getByRole('button',{name:'确认沙箱助力',exact:true}).click();
 await expect(ui.locator('.support-success')).toBeVisible();assert.ok(paid);
 await expect(ui.locator('.payment-toast')).toHaveAttribute('data-event-id','10');
 await ui.getByRole('button',{name:'返回品牌总榜'}).click();await expect(ui.getByRole('combobox',{name:'榜单品类'})).toHaveValue('');

 for(const width of [375,390,430,768,1280]){
  await page.setViewportSize({width,height:900});await page.goto(base,{waitUntil:'domcontentloaded'});
  await expect(page.locator('.podium-card')).toHaveCount(3);await overflow(page,'首页 '+width);
  await page.screenshot({path:dir+'/home-'+width+'.png',fullPage:true});
  await page.getByRole('combobox',{name:'榜单品类'}).selectOption(cats[0].id);
  await expect(page.locator('.podium-card').first()).toBeVisible();await overflow(page,'品类筛选 '+width);
  await nav(page,'奢品图鉴');await page.locator('.category-tile').first().click();
  await expect(page.locator('.catalog-card').first()).toBeVisible();await overflow(page,'图鉴 '+width);
  await page.locator('.catalog-card .support-button').first().click();await expect(page.getByRole('dialog')).toBeVisible();
  await overflow(page,'助力弹窗 '+width);await page.keyboard.press('Escape');
 }
 assert.deepEqual(errors,[]);
 writeFileSync(dir+'/result.json',JSON.stringify({ok:true,widths:[375,390,430,768,1280],liveReadSmoke:true,mockedInteractions:true,flows:['one atlas navigation','default total and home category filter','persisted leader timer','automatic rank swap across podium and list','animated amounts and movement badges','payment effects and receipt deduplication','three-hit critical animation','reduced motion','stale responses and retry','focus and support receipt'],pageErrors:errors},null,2));
 console.log('Chrome动态榜单回归通过');await context.close();
}finally{await browser.close();}
