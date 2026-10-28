import {chromium,expect} from 'playwright/test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
const base='http://127.0.0.1:3100',dir='artifacts/atlas';
mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true}),errors:string[]=[];
const context=await browser.newContext({viewport:{width:1440,height:1100}}),page=await context.newPage();
page.on('pageerror',e=>errors.push(e.message));
const overflow=async()=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'图鉴页面溢出');
try{
 await page.route('**/api/v1/analytics/events',route=>route.fulfill({json:{ok:true}}));
 const cats=(await (await page.request.get(base+'/api/v1/categories')).json()).items;
 assert.equal(cats.length,40);assert.ok(cats.every((c:any)=>c.brand_count>=3));
 const search=(await (await page.request.get(base+'/api/v1/search?q=Herm')).json()).items[0];
 const atlas=(await (await page.request.get(base+'/api/v1/merchants/'+search.brand_id+'/atlas')).json());
 assert.equal(atlas.profiles[0].demo,false);assert.ok(atlas.profiles[0].editorial.references.length);
 const deepLink=base+'/#atlas/'+search.brand_id+'?category='+search.category_id;
 await page.goto(base);await expect(page.locator('.header-support')).toBeEnabled();
 await page.locator('.place-1 .atlas-card-link').click();
 await expect(page.locator('.atlas-unpublished')).toBeVisible();
 await page.getByRole('button',{name:'返回上一页'}).click();await expect(page.locator('.place-1')).toBeVisible();
 await page.locator('.place-1 .podium-brand').click();
 await page.getByRole('button',{name:'走进奢品图鉴'}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
 await expect(page.locator('.brand-atlas')).toBeVisible();
 await page.goto(deepLink);
 await expect(page.locator('.atlas-brand-title h1')).toHaveText('爱马仕');
 await expect(page.locator('.atlas-section')).toHaveCount(6);
 await expect(page.locator('.atlas-products article')).toHaveCount(2);
 await expect(page.locator('.atlas-social')).toContainText('低调身份表达');
 await expect(page.locator('.atlas-references a').first()).toHaveAttribute('href','https://www.hermes.com/us/en/');
 await expect(page.locator('.atlas-demo-note')).toHaveCount(0);
 await expect(page.locator('.atlas-position-detail')).toContainText('品类定位参考');
 await page.screenshot({path:dir+'/hermes-desktop.png',fullPage:true});
 await page.reload();await expect(page.locator('.atlas-brand-title h1')).toHaveText('爱马仕');
 await page.getByRole('button',{name:'为它助力',exact:true}).click();
 await expect(page.getByRole('combobox',{name:'助力品牌'})).toHaveValue(search.brand_id);
 await page.getByRole('button',{name:'关闭',exact:true}).click();
 for(const width of [375,390,430,768,1280]){
  await page.setViewportSize({width,height:900});await overflow();
  await page.getByRole('navigation',{name:'图鉴章节'}).getByRole('link',{name:'身份与认同'}).click();
  await expect(page.locator('#atlas-social h2')).toBeInViewport();
  await page.screenshot({path:dir+'/hermes-'+width+'.png',fullPage:true});
 }
 await page.setViewportSize({width:1440,height:1100});
 await page.getByRole('button',{name:'奢品图鉴',exact:true}).last().click();
 await expect(page.locator('.category-tile')).toHaveCount(40);
 await page.getByRole('button',{name:/^箱包 /}).click();
 await expect(page.locator('.catalog-card')).toHaveCount(cats.find((c:any)=>c.slug==='bags').brand_count);
 await expect(page.locator('.catalog-title h2').first()).toHaveText('爱马仕');
 await expect(page.locator('.catalog-position').first()).toContainText('01');
 await expect(page.getByRole('region',{name:'品类定位说明'})).toContainText('皮具工艺');
 await page.getByText('定位如何划分？',{exact:true}).click();
 await expect(page.getByRole('region',{name:'品类定位说明'})).toContainText('同层顺序为编辑阅读建议');
 await page.screenshot({path:dir+'/bags-positioning.png',fullPage:true});
 await page.getByRole('combobox',{name:'选择图鉴品类'}).selectOption(cats.find((c:any)=>c.slug==='computers').id);
 await expect(page.locator('.catalog-card')).toHaveCount(3);
 await expect(page.getByRole('region',{name:'品类定位说明'})).toContainText('没有稳定公认');
 await expect(page.locator('.catalog-title').first()).toContainText('专业设备');
 await expect(page.locator('.catalog-position').first()).toContainText('高端专业参考');
 await page.getByRole('combobox',{name:'选择图鉴品类'}).selectOption(cats.find((c:any)=>c.slug==='bags').id);
 const card=page.locator('.catalog-card').filter({hasText:'爱马仕'});
 await expect(card.locator('.official-brand-logo')).toBeVisible();
 await card.getByRole('button',{name:'品牌故事与价值解读'}).click();
 await expect(page.locator('.atlas-brand-title h1')).toHaveText('爱马仕');
 // Retry uses an isolated endpoint; no shared order or editorial data is changed.
 let fail=true;
 await page.route('**/api/v1/merchants/'+search.brand_id+'/atlas',route=>fail?route.fulfill({status:503,json:{message:'图鉴暂不可用'}}):route.fulfill({json:atlas}));
 await page.reload();await expect(page.getByRole('alert')).toContainText('图鉴暂不可用');
 fail=false;await page.getByRole('button',{name:'重新加载',exact:true}).click();await expect(page.locator('.atlas-brand-title h1')).toHaveText('爱马仕');
 // Every real category at phone width: catches long names and content-specific overflow.
 await page.setViewportSize({width:375,height:900});
 await page.goto(base+'/#categories');await expect(page.locator('.category-tile')).toHaveCount(40);
 await page.locator('.category-tile').first().click();
 for(const category of cats){
  await page.getByRole('combobox',{name:'选择图鉴品类'}).selectOption(category.id);
  await expect(page.locator('.catalog-card')).toHaveCount(category.brand_count);
  await expect(page.locator('.official-brand-logo').first()).toBeVisible();
  await overflow();
 }
 await page.getByRole('combobox',{name:'选择图鉴品类'}).selectOption(cats.find((c:any)=>c.slug==='watches').id);
 await page.getByRole('combobox',{name:'图鉴编辑定位'}).selectOption('殿堂级');
 await expect(page.locator('.catalog-card')).toHaveCount(4);
 await page.getByRole('combobox',{name:'选择图鉴品类'}).selectOption(cats.find((c:any)=>c.slug==='computers').id);
 await expect(page.getByRole('combobox',{name:'图鉴编辑定位'})).toHaveValue('');
 await expect(page.locator('.catalog-card')).toHaveCount(3);
 await page.screenshot({path:dir+'/computers-375.png',fullPage:true});
 await page.getByRole('combobox',{name:'选择图鉴品类'}).selectOption(cats.find((c:any)=>c.slug==='watches').id);
 await expect(page.locator('.catalog-card')).toHaveCount(cats.find((c:any)=>c.slug==='watches').brand_count);
 await expect(page.locator('.catalog-title h2').first()).toHaveText('百达翡丽');
 for(const width of [375,390,430,768,1280]){
  await page.setViewportSize({width,height:900});await overflow();
  await page.screenshot({path:dir+'/watch-positioning-'+width+'.png',fullPage:true});
 }
 await page.setViewportSize({width:1440,height:1100});
 const admin=await context.newPage();admin.on('pageerror',e=>errors.push(e.message));
 const profile={...atlas.profiles[0],state:'PUBLISHED',version:1},user={id:'editor',name:'editor',role:'EDITOR',csrf:'isolated'},revisions:any[]=[];
 let submitted:any;
 await admin.route(base+'/admin',route=>route.fulfill({contentType:'text/html',body:readFileSync('dist/web/admin.html','utf8')}));
 await admin.route('**/api/v1/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname.slice('/api/v1'.length);let data:any;
  if(path==='/me')data=user;
  else if(path==='/admin/overview')data={categories:cats,profiles:[profile],profile_revisions:revisions,merchants:[],links:[],feedback:[],orders:[],audit_logs:[]};
  else if(path==='/admin/profiles/'+profile.id+'/revisions'){submitted=req.postDataJSON();revisions.push({id:'revision',profile_id:profile.id,payload:submitted,state:'DRAFT',base_version:1,created_at:new Date().toISOString()});data={id:'revision'};}
  else if(path==='/admin/revisions/revision/decision'){assert.equal(req.postDataJSON().approved,true);revisions[0].state='APPROVED';data={ok:true};}
  else throw new Error('Unexpected admin atlas request '+path);
  await route.fulfill({json:data});
 });
 await admin.goto(base+'/admin');
 await admin.getByRole('button',{name:/^品牌管理/}).click();
 await admin.getByRole('button',{name:'编辑',exact:true}).click();
 const story=admin.getByRole('textbox',{name:'品牌故事',exact:true});
 await expect(story).toHaveValue(profile.editorial.story);
 await story.fill('修订后的品牌故事，等待另一位审核员复核。');
 await admin.getByRole('spinbutton',{name:'同品类参考顺序'}).fill('2');
 await admin.getByRole('textbox',{name:'划分理由',exact:true}).fill('已复核皮具工艺与代表作品，调整同层阅读顺序。');
 await admin.getByRole('button',{name:'添加身份与认同'}).click();
 await admin.getByRole('textbox',{name:'表达属性 3',exact:true}).fill('个人表达');
 await admin.getByRole('textbox',{name:'满足感与适用场景 3',exact:true}).fill('通过喜欢的设计表达自己的审美。');
 await admin.screenshot({path:dir+'/admin-edit.png',fullPage:true});
 await admin.getByRole('button',{name:'保存并提交审核'}).click();await expect(admin.getByRole('dialog')).toHaveCount(0);
 assert.equal(submitted.contentMode,'SOURCED');assert.equal(submitted.editorial.story,'修订后的品牌故事，等待另一位审核员复核。');
 assert.equal(submitted.editorial.positioning.order,2);assert.equal(submitted.editorial.positioning.reason,'已复核皮具工艺与代表作品，调整同层阅读顺序。');
 assert.equal(submitted.editorial.socialSignals.length,3);assert.deepEqual(submitted.editorial.references,profile.editorial.references);
 assert.equal(profile.editorial.story,atlas.profiles[0].editorial.story);
 user.role='REVIEWER';user.id='reviewer';await admin.reload();
 await admin.getByRole('button',{name:/^修订审核/}).click();
 await admin.getByRole('button',{name:'查看并复核'}).click();
 await expect(admin.locator('.atlas-review')).toContainText(submitted.editorial.story);
 await expect(admin.locator('.atlas-review')).toContainText('个人表达');
 await expect(admin.locator('.atlas-review')).toContainText('顺序 2');
 await expect(admin.locator('.atlas-review a')).toHaveCount(profile.editorial.references.length);
 await admin.screenshot({path:dir+'/admin-review.png',fullPage:true});
 await admin.getByRole('textbox',{name:'处理理由'}).fill('已核实品牌故事及全部来源。');
 await admin.getByRole('button',{name:'确认并记录审计'}).click();await expect(admin.getByRole('dialog')).toHaveCount(0);
 assert.equal(revisions[0].state,'APPROVED');
 assert.deepEqual(errors,[]);
 writeFileSync(dir+'/result.json',JSON.stringify({ok:true,widths:[375,390,430,768,1280],realAtlasRead:true,isolatedAdminInteractions:true,flows:['ranking card and detail entry','unpublished empty state','deep-link refresh','all six reading sections','40 categories','sourced card label','retry','support brand identity','editorial form serialization','second-person review preview','40 populated categories at phone width','editorial tier filter and category reset','positioning order review'],pageErrors:errors},null,2));
 console.log('Chrome图鉴与后台内容维护回归通过');
}finally{await context.close();await browser.close();}
