import {chromium,expect,type Page} from 'playwright/test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
const base='http://127.0.0.1:3100',dir='artifacts/classification';
mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true}),errors:string[]=[];
const context=await browser.newContext({viewport:{width:1440,height:1100}});
const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
const a={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',name:'手表',active:true},b={id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',name:'箱包',active:true},id='11111111-1111-4111-8111-111111111111';
let assignment:any={state:'UNSET',version:0},total=0,createdBody:any,report:any=null,history:any[]=[];
const stats={heat:1,followers:0,website_clicks:0,live_clicks:0,supporters:1};
const brand=()=>({id,merchant_id:id,name:'品类流程验证品牌',logo:base+'/brand.svg',categories:[a,b],classification:assignment,category_names:assignment.state==='UNSET'?[]:[assignment.categoryName||assignment.suggestedCategoryName],net_fen:total,rank:1,stats});
const routeApi=async(p:Page,admin=false)=>{
 await p.route('**/api/v1/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname.slice('/api/v1'.length);let data:any;
  if(path==='/public/session')data={csrf:'isolated-public'};
  else if(path==='/categories')data={items:[a,b]};
  else if(path==='/capabilities')data={canPurchasePromotion:true};
  else if(path==='/public/brands')data={items:[brand()]};
  else if(path==='/support/orders'&&req.method()==='GET')data={items:[]};
  else if(path==='/support/orders'){
   createdBody=req.postDataJSON();
   if(assignment.state==='UNSET')assert.equal(createdBody.categoryId,b.id);
   else assert.equal(createdBody.categoryId,undefined);
   data={id:'isolated-order',state:'PENDING'};
  }else if(path==='/sandbox/orders/isolated-order/pay'){
   if(assignment.state==='UNSET')assignment={state:'PENDING',suggestedCategoryId:b.id,suggestedCategoryName:b.name,version:1};
   total+=100;data={id:'isolated-order',state:'PAID',amountFen:100,classification:assignment};
  }else if(path==='/merchant-board'||path.endsWith('/merchant-board'))data={items:total?[brand()]:[],serverTime:new Date().toISOString(),activityCursor:'0',events:[]};
  else if(path.endsWith('/brands'))data={items:[]};
  else if(path==='/merchants/'+id)data={...brand(),entries:[],links:[]};
  else if(path==='/analytics/events')data={ok:true};
  else if(path==='/public/brands/'+id+'/category-report'){report={id:'report',merchant_id:id,suggested_category_id:a.id,suggested_category_name:a.name,reason:req.postDataJSON().reason,state:'OPEN'};data={id:report.id,state:'OPEN'};}
  else if(path==='/me'&&admin)data={id:'admin',name:'admin',role:'ADMIN',csrf:'isolated-admin'};
  else if(path==='/admin/analytics'&&admin)data={summary:{impressions:0,impressionVisitors:0,views:0,viewers:0,clicks:0,clickVisitors:0},series:[],channels:[],brands:[],merchants:[],from:new Date().toISOString(),updatedAt:new Date().toISOString()};
  else if(path==='/admin/overview'&&admin)data={categories:[a,b],profiles:[],profile_revisions:[],merchants:[brand()],links:[],feedback:[],orders:[],audit_logs:[]};
  else if(path==='/admin/brand-categories'&&admin)data={items:[{...brand(),classification_state:assignment.state,category_id:assignment.categoryId,category_name:assignment.categoryName,suggested_category_id:assignment.suggestedCategoryId,suggested_category_name:assignment.suggestedCategoryName,version:assignment.version,reports:report?.state==='OPEN'?1:0}],reports:report?[report]:[],history};
  else if(path==='/admin/brand-categories/'+id&&admin){
   const body=req.postDataJSON();assert.equal(body.version,assignment.version);assert.equal(body.categoryId,a.id);
   history=[{id:'history',merchant_id:id,before_name:b.name,after_name:a.name,reason:body.reason,created_at:new Date().toISOString()}];
   assignment={...assignment,state:'CONFIRMED',categoryId:a.id,categoryName:a.name,version:2};if(report)report.state='RESOLVED';data={ok:true,classification:assignment};
  }else throw new Error('Unexpected API '+path);
  await route.fulfill({json:data});
 });
};
try{
 await routeApi(page);await page.goto(base);
 await expect(page.locator('.header-support')).toBeEnabled();
 await page.locator('.header-support').click();
 await page.getByRole('combobox',{name:'助力品牌'}).selectOption(id);
 await expect(page.getByRole('combobox',{name:'首次建议品类'})).toHaveValue('');
 await expect(page.locator('.first-category')).toContainText('首次到账后立即');
 await page.getByRole('button',{name:'关闭',exact:true}).click();
 assert.equal(assignment.state,'UNSET','打开表单不会预占品类');
 await page.locator('.header-support').click();await page.getByRole('combobox',{name:'助力品牌'}).selectOption(id);
 await page.getByRole('combobox',{name:'首次建议品类'}).selectOption(b.id);
 await page.getByRole('spinbutton',{name:'助力金额'}).fill('1');await page.locator('input[name=consent]').check();
 await page.getByRole('button',{name:'确认沙箱助力',exact:true}).click();
 await expect(page.locator('.support-success')).toContainText('箱包');
 await page.getByRole('button',{name:'返回品牌总榜'}).click();
 await expect(page.locator('.podium-category')).toContainText('待核实');
 await expect(page.locator('.podium-amount strong')).toHaveText('¥1.00');
 await page.locator('.podium-card .support-button').click();
 await expect(page.getByRole('combobox',{name:'首次建议品类'})).toHaveCount(0);
 await expect(page.locator('.brand-category')).toContainText('箱包');
 await page.screenshot({path:dir+'/repeat-support-desktop.png',fullPage:true});
 await page.getByRole('button',{name:'品类有误？提交纠错'}).click();
 await page.getByRole('combobox',{name:'纠错建议品类'}).selectOption(a.id);
 await page.getByRole('textbox',{name:'纠错依据'}).fill('核实品牌官网主营腕表，应属于手表品类。');
 await page.getByRole('button',{name:'提交纠错',exact:true}).click();
 await expect(page.getByRole('dialog')).toHaveCount(0);
 assert.equal(assignment.state,'PENDING','举报不会直接变更归属');

 const adminContext=await browser.newContext({viewport:{width:1440,height:1100}});
 const admin=await adminContext.newPage();admin.on('pageerror',error=>errors.push(error.message));
 // Isolated staff UI fixture; real authorization is tested separately by API/unit checks.
 await admin.route(base+'/admin',route=>route.fulfill({contentType:'text/html',body:readFileSync('dist/web/admin.html','utf8')}));
 await routeApi(admin,true);await admin.goto(base+'/admin');
 await admin.getByRole('button',{name:'品牌归类',exact:true}).click();
 await admin.getByRole('button',{name:'审核归属品类流程验证品牌'}).click();
 await expect(admin.getByRole('dialog')).toContainText('核实品牌官网主营腕表');
 await admin.getByRole('combobox',{name:'正确主品类'}).selectOption(a.id);
 await admin.getByRole('textbox',{name:'归类审核依据'}).fill('平台核实品牌官网，以手表作为正确主品类。');
 await admin.getByRole('button',{name:'确认归属并记录审核'}).click();
 await expect(admin.getByRole('dialog')).toHaveCount(0);
 await admin.getByRole('combobox',{name:'归类状态筛选'}).selectOption('all');
 await expect(admin.locator('tbody')).toContainText('平台已确认');
 await admin.getByRole('button',{name:'审核归属品类流程验证品牌'}).click();
 await expect(admin.locator('.classification-history')).toContainText('箱包 → 手表');
 await admin.screenshot({path:dir+'/platform-correction.png',fullPage:true});
 await admin.getByRole('button',{name:'关闭归类审核'}).click();
 await page.reload();await expect(page.locator('.podium-category')).toHaveText('手表');
 await page.locator('.podium-card .support-button').click();
 await expect(page.locator('.brand-category')).toContainText('平台统一维护');
 await expect(page.getByRole('combobox',{name:'首次建议品类'})).toHaveCount(0);
 await page.getByRole('spinbutton',{name:'助力金额'}).fill('1');await page.locator('input[name=consent]').check();
 await page.getByRole('button',{name:'确认沙箱助力',exact:true}).click();
 await expect(page.locator('.support-success')).toContainText('归属品类：手表');assert.equal(createdBody.categoryId,undefined);
 await page.getByRole('button',{name:'关闭',exact:true}).click();
 for(const width of [375,390,768]){
  await page.setViewportSize({width,height:900});
  await page.locator('.header-support').click();await page.getByRole('combobox',{name:'助力品牌'}).selectOption(id);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'助力弹窗 '+width);
  await page.getByRole('button',{name:'品类有误？提交纠错'}).click();
  await expect(page.getByRole('combobox',{name:'纠错建议品类'})).toBeVisible();
  assert.ok(await page.getByRole('dialog').evaluate(element=>element.scrollWidth<=element.clientWidth+1),'纠错表单 '+width);
  await page.screenshot({path:dir+'/report-'+width+'.png',fullPage:true});
  await page.getByRole('button',{name:'关闭',exact:true}).click();
  await admin.setViewportSize({width,height:900});assert.ok(await admin.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'后台归类 '+width);
 }
 assert.deepEqual(errors,[]);
 writeFileSync(dir+'/result.json',JSON.stringify({ok:true,mockedInteractions:true,widths:[375,390,768],flows:['explicit first category choice','unpaid form does not reserve','paid provisional category immediately visible','later support fixed category','public correction report','platform review and correction','history visible','corrected category reused without payload choice'],pageErrors:errors},null,2));
 console.log('Chrome品类先展示后审核回归通过');await adminContext.close();
}finally{await context.close();await browser.close();}
