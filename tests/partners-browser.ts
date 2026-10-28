import {chromium,expect,type Page} from 'playwright/test';
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
const base='http://127.0.0.1:3100',dir='artifacts/partners';mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true}),contexts:Awaited<ReturnType<typeof browser.newContext>>[]=[],errors:string[]=[];
const create=async()=>{const context=await browser.newContext({viewport:{width:1440,height:1100}});contexts.push(context);const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));return page;};
try{
 const smoke=await create();await smoke.route('**/api/v1/analytics/events',route=>route.fulfill({json:{ok:true}}));
 const cats=(await (await smoke.request.get(base+'/api/v1/categories')).json()).items,brand=(await (await smoke.request.get(base+'/api/v1/search?q=Herm')).json()).items[0];
 const atlas=(await (await smoke.request.get(base+'/api/v1/merchants/'+brand.brand_id+'/atlas')).json());
 assert.ok(atlas.profiles[0].editorial.socialContext.audience);
 await smoke.goto(base+'/#atlas/'+brand.brand_id);await expect(smoke.locator('.partner-social-context')).toContainText('大众辨识度');
 await expect(smoke.locator('.partner-directory')).toHaveCount(0);
 await expect(smoke.getByRole('link',{name:'门店／销售合作'})).toHaveCount(0);
 assert.equal((await smoke.request.get(base+'/api/v1/partners/brand/'+brand.brand_id)).status(),404);
 assert.equal((await smoke.request.get(base+'/api/v1/admin/partners')).status(),401);
 assert.equal((await smoke.request.get(base+'/api/v1/admin/partner-analytics')).status(),401);
 assert.equal((await smoke.request.post(base+'/api/v1/partners/apply',{data:{}})).status(),404);
 assert.equal((await smoke.request.post(base+'/api/v1/admin/partners/00000000-0000-4000-8000-000000000001/review',{data:{}})).status(),401);
 await smoke.screenshot({path:dir+'/actual-atlas.png',fullPage:true});
 await smoke.goto(base+'/#partners');await expect(smoke.getByRole('heading',{name:'该功能暂未开放'})).toBeVisible();await expect(smoke.locator('.partner-form')).toHaveCount(0);
 const lid='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',cid='33333333-3333-4333-8333-333333333333',aid='44444444-4444-4444-8444-444444444444';
 let listings:any[]=[],campaigns:any[]=[],appointments:any[]=[],metrics:any[]=[],revision:any=null,fail=false;const actions:string[]=[];
 const item=(l:any)=>({id:l.id,...l.payload,phone:undefined,wechat:undefined,hasPhone:!!l.payload.phone,hasWechat:!!l.payload.wechat,verification:l.verification,campaignId:campaigns.find(c=>c.listing_id===l.id&&c.state==='ACTIVE')?.id||null,promoted:campaigns.some(c=>c.listing_id===l.id&&c.state==='ACTIVE')});
 const install=async(page:Page,role:'owner'|'guest'|'reviewer')=>{
  if(role==='reviewer')await page.route(base+'/admin',route=>route.fulfill({contentType:'text/html',body:readFileSync('dist/web/admin.html','utf8')}));
  await page.route('**/api/v1/**',async route=>{
   const req=route.request(),url=new URL(req.url()),path=url.pathname.slice('/api/v1'.length);let data:any;
   if(path==='/public/session')data={csrf:'isolated'};
   else if(path==='/categories')data={items:cats};
   else if(path==='/capabilities')data={canPurchasePromotion:true,partnerMarketEnabled:true};
   else if(path==='/public/brands')data={items:[{id:brand.brand_id,name:brand.name,categories:cats,stats:{},classification:{state:'UNSET'}}]};
   else if(path==='/support/orders')data={items:[]};
   else if(path==='/merchant-board'||path.endsWith('/merchant-board'))data={items:[],serverTime:new Date().toISOString(),events:[],activityCursor:'0'};
   else if(path==='/analytics/events')data={ok:true};
   else if(path==='/merchants/'+brand.brand_id+'/atlas')data=atlas;
   else if(path.startsWith('/categories/')&&path.endsWith('/brands'))data={items:[]};
   else if(path==='/partners/mine')data={items:listings.filter(l=>l.id===lid),campaigns,appointments,metrics,revisions:revision?[revision]:[],mode:'SANDBOX'};
   else if(path==='/partners/apply'){
    const body=req.postDataJSON();assert.equal(body.consent,true);assert.deepEqual(body.brandIds,[brand.brand_id]);assert.ok(req.headers()['idempotency-key']);
    listings=[{id:lid,status:'PENDING',version:1,verification:'INDEPENDENT',payload:body}];actions.push('apply');data={id:lid,state:'PENDING'};
   }else if(path==='/partners/'+lid+'/revisions'){revision={id:'revision',listing_id:lid,state:'PENDING',payload:req.postDataJSON(),base_version:listings[0].version};data={id:lid,revisionId:'revision'};actions.push('revise');}
   else if(path==='/partners/brand/'+brand.brand_id){
    if(fail){await route.fulfill({status:503,json:{message:'门店读取暂缓'}});return;}
    const active=listings.filter(l=>l.status==='APPROVED');data={items:active.filter(l=>!url.searchParams.get('city')||l.payload.city===url.searchParams.get('city')).map(item),cities:[...new Set(active.map(l=>l.payload.city))],mode:'SANDBOX'};
   }else if(path==='/partners/campaigns'){
    const b=req.postDataJSON();assert.equal(b.consent,true);assert.equal(b.bidFen,100);assert.equal(b.budgetFen,10000);
    campaigns=[{id:cid,listing_id:lid,brand_id:brand.brand_id,city:'上海市',bid_fen:b.bidFen,budget_fen:b.budgetFen,spent_fen:0,state:'ACTIVE',ends_at:new Date(Date.now()+86400000).toISOString()}];data=campaigns[0];actions.push('campaign');
   }else if(path==='/partners/campaigns/'+cid+'/state'){campaigns[0].state=req.postDataJSON().state;data={ok:true};actions.push('campaign-state');}
   else if(path.endsWith('/events')){
    const b=req.postDataJSON(),listing=listings.find(l=>path.includes(l.id));assert.equal(b.brandId,brand.brand_id);assert.ok(b.eventKey);
    const m=metrics.find(m=>m.listing_id===listing.id&&m.kind===b.kind);if(m)m.total++;else metrics.push({listing_id:listing.id,kind:b.kind,total:1,visitors:1});
    if(campaigns.length&&['PHONE','WECHAT'].includes(b.kind))campaigns[0].spent_fen=100;
    data={ok:true,value:b.kind==='PHONE'?listing.payload.phone:b.kind==='WECHAT'?listing.payload.wechat:null};actions.push(b.kind);
   }else if(path==='/partners/'+lid+'/appointments'){
    const b=req.postDataJSON();assert.equal(b.consent,true);assert.ok(b.eventKey);appointments=[{id:aid,listing_id:lid,name:b.name,phone:b.phone,note:b.note,preferred_at:b.preferredAt,state:'NEW'}];metrics.push({listing_id:lid,kind:'APPOINTMENT',total:1,visitors:1});data={id:aid,state:'NEW'};actions.push('appointment');
   }else if(path==='/partners/appointments/'+aid+'/state'){appointments[0].state=req.postDataJSON().state;data={ok:true};actions.push('follow-up');}
   else if(path==='/me')data={id:'reviewer',name:'reviewer',role:'REVIEWER',csrf:'staff'};
   else if(path==='/admin/overview')data={partnerMarketEnabled:true,categories:cats,profiles:[],profile_revisions:[],merchants:[{id:brand.brand_id,name:brand.name}],links:[],feedback:[],orders:[],audit_logs:[]};
   else if(path==='/admin/partners')data={items:listings,revisions:revision?.state==='PENDING'?[revision]:[]};
   else if(path==='/admin/partners/'+lid+'/review'){
    const b=req.postDataJSON();assert.equal(b.approved,true);assert.equal(b.verification,'INDEPENDENT');assert.ok(b.reason);
    listings[0].status='APPROVED';listings[0].version++;if(b.revisionId){listings[0].payload=revision.payload;revision.state='APPROVED';}
    data={ok:true};actions.push('review');
   }else if(path==='/admin/partners/'+lid+'/visibility'){listings[0].status=req.postDataJSON().visible?'APPROVED':'HIDDEN';listings[0].version++;data={ok:true};}
   else throw new Error('Unexpected '+role+' API '+path);
   await route.fulfill({json:data});
  });
 };
 const owner=await create();await install(owner,'owner');await owner.goto(base+'/#partners?brand='+brand.brand_id);
 await expect(owner.locator('.partner-form')).toBeVisible();
 await owner.getByRole('textbox',{name:'展示名称',exact:true}).fill('虹桥会客厅（虚构演示）');
 await owner.getByRole('textbox',{name:'所在城市',exact:true}).fill('上海市');
 await owner.getByRole('textbox',{name:'门店地址',exact:true}).fill('虚构演示地址，不对应真实门店');
 await owner.getByRole('textbox',{name:'业务电话',exact:true}).fill('+1 202-555-0100');
 await owner.getByRole('textbox',{name:'业务微信',exact:true}).fill('demo_store_only');
 await owner.getByRole('textbox',{name:'服务介绍',exact:true}).fill('功能演示资料，无真实商品或到店服务。');
 await owner.locator('.partner-consent input').check();await owner.getByRole('button',{name:'提交平台审核',exact:true}).click();
 await expect(owner.locator('.partner-status')).toHaveText('待平台审核');
 const admin=await create();await install(admin,'reviewer');await admin.goto(base+'/admin');
 await admin.getByRole('button',{name:'门店与销售',exact:true}).click();
 await admin.getByRole('button',{name:'审核资料',exact:true}).click();await expect(admin.getByRole('dialog')).toContainText('demo_store_only');
 await admin.getByRole('textbox',{name:'审核／处理依据'}).fill('核实演示商家资料；不标注官方身份。');
 await admin.getByRole('button',{name:'确认并记录门店审核'}).click();await expect(admin.getByRole('dialog')).toHaveCount(0);
 await owner.getByRole('button',{name:'刷新资料与数据'}).click();await expect(owner.locator('.partner-status')).toHaveText('已展示');
 await owner.getByRole('button',{name:'创建沙箱推广',exact:true}).click();
 await owner.getByRole('checkbox',{name:'确认以上沙箱出价、总预算和投放周期。'}).check();
 await owner.getByRole('button',{name:'确认创建沙箱推广',exact:true}).click();await expect(owner.locator('.partner-campaign')).toContainText('投放中');
 listings.push({id:other,status:'APPROVED',version:2,verification:'INDEPENDENT',payload:{...listings[0].payload,name:'北京体验店（虚构演示）',city:'北京市'}});
 const guest=await create();await install(guest,'guest');await guest.goto(base+'/#atlas/'+brand.brand_id);
 await expect(guest.locator('.partner-card')).toHaveCount(2);await expect(guest.locator('.partner-sponsored')).toHaveText('推广 · 沙箱');
 await guest.getByRole('combobox',{name:'门店城市'}).selectOption('上海市');await expect(guest.locator('.partner-card')).toHaveCount(1);
 await guest.getByRole('button',{name:'查看与联系',exact:true}).click();await expect(guest.getByRole('dialog')).toBeVisible();assert.ok(await guest.locator('.site-header').evaluate(el=>(el as HTMLElement).inert),'嵌套弹窗隔离页面导航');
 await guest.getByRole('button',{name:'查看电话',exact:true}).click();await expect(guest.locator('.partner-contact-value')).toHaveText('+1 202-555-0100');
 await guest.getByRole('button',{name:'复制微信',exact:true}).click();await expect(guest.locator('.partner-contact-value')).toHaveText('demo_store_only');
 await guest.keyboard.press('Shift+Tab');assert.ok(await guest.getByRole('dialog').evaluate(el=>el.contains(document.activeElement)));
 await guest.getByRole('button',{name:'预约到店',exact:true}).last().click();
 await guest.getByRole('textbox',{name:'称呼',exact:true}).fill('测试访客');
 await guest.getByRole('textbox',{name:'联系电话',exact:true}).fill('+1 202-555-0101');
 const future=new Date(Date.now()+86400000);const localTime=new Date(future.getTime()-future.getTimezoneOffset()*60000).toISOString().slice(0,16);
 await guest.locator('input[name=time]').fill(localTime);await guest.locator('.partner-dialog .partner-consent input').check();
 await guest.getByRole('button',{name:'提交预约',exact:true}).click();await expect(guest.getByRole('status')).toContainText('预约已提交');
 await guest.getByRole('button',{name:'关闭门店窗口'}).click();
 await owner.getByRole('button',{name:'刷新资料与数据'}).click();
 await expect(owner.locator('.partner-appointments')).toContainText('测试访客');
 await owner.getByRole('combobox',{name:'预约跟进'+aid}).selectOption('CONTACTED');await expect.poll(()=>appointments[0].state).toBe('CONTACTED');
 await owner.getByRole('button',{name:'暂停',exact:true}).click();await expect(owner.locator('.partner-campaign')).toContainText('已暂停');
 await owner.getByRole('button',{name:'恢复',exact:true}).click();
 await owner.getByRole('button',{name:'修订资料',exact:true}).click();await owner.getByRole('textbox',{name:'服务介绍',exact:true}).fill('修订服务介绍，平台审核后公开。');
 await owner.locator('.partner-form .partner-consent input').check();await owner.getByRole('button',{name:'提交平台审核',exact:true}).click();
 assert.notEqual(listings[0].payload.description,revision.payload.description);
 await admin.getByRole('button',{name:'刷新',exact:true}).click();await admin.getByRole('button',{name:'审核修订',exact:true}).click();
 await expect(admin.getByRole('dialog')).toContainText('修订服务介绍');
 await admin.getByRole('textbox',{name:'审核／处理依据'}).fill('修订已核对。');await admin.getByRole('button',{name:'确认并记录门店审核'}).click();
 assert.equal(listings[0].payload.description,revision.payload.description);
 await admin.getByRole('combobox',{name:'门店审核状态'}).selectOption('ALL');
 await admin.screenshot({path:dir+'/admin-review.png',fullPage:true});
 fail=true;await guest.reload();await expect(guest.getByRole('alert')).toContainText('门店读取暂缓');fail=false;await guest.getByRole('button',{name:'重新加载门店'}).click();await expect(guest.locator('.partner-card')).toHaveCount(2);
 for(const width of [375,390,430,768,1280]){
  await guest.setViewportSize({width,height:900});await guest.locator('.partner-directory').scrollIntoViewIfNeeded();
  assert.ok(await guest.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'目录 '+width);
  await guest.screenshot({path:dir+'/directory-'+width+'.png',fullPage:true});
  await guest.getByRole('button',{name:'查看与联系',exact:true}).first().click();
  assert.ok(await guest.getByRole('dialog').evaluate(el=>el.scrollWidth<=el.clientWidth+1),'联系弹窗 '+width);
  await guest.screenshot({path:dir+'/contact-'+width+'.png'});
  await guest.keyboard.press('Escape');
  await owner.setViewportSize({width,height:900});assert.ok(await owner.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'合作页 '+width);
  await owner.screenshot({path:dir+'/portal-'+width+'.png',fullPage:true});
 }
 assert.deepEqual(errors,[]);
 for(const expected of ['apply','review','campaign','PHONE','WECHAT','appointment','follow-up','campaign-state','revise'])assert.ok(actions.includes(expected),expected);
 writeFileSync(dir+'/result.json',JSON.stringify({ok:true,actualAtlasRead:true,isolatedBusinessInteractions:true,widths:[375,390,430,768,1280],flows:actions,pageErrors:errors},null,2));
 console.log('Chrome门店入驻、平台审核、沙箱推广与预约回归通过');
}finally{for(const context of contexts)await context.close();await browser.close();}
