import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {connect,type DB} from '../apps/api/src/db.js';
import {normalizeEditorial,profileExtras,publicAtlas} from '../apps/api/src/atlas.js';
import {reviseProfile,decideRevision} from '../apps/api/src/catalog.js';
import {seedAtlas} from '../apps/api/src/atlas-seed.js';
import {categoryProfiles,categoryCuration} from '../apps/api/src/atlas-curation.js';
import {readFileSync} from 'node:fs';
let db:DB,profile:any,editor:string,reviewer:string;
before(async()=>{db=await connect(true);profile=(await db.query("SELECT * FROM profiles WHERE english='Hermès' AND category_id=(SELECT id FROM categories WHERE slug='bags')")).rows[0];const users=(await db.query('SELECT * FROM users')).rows;editor=users.find(u=>u.role==='EDITOR').id;reviewer=users.find(u=>u.role==='REVIEWER').id;});
after(async()=>{await (db as any).close?.();});
test('40个品类与真实品牌资料可读取，重复种子不会覆盖平台修改',async()=>{
 assert.equal(Number((await db.query('SELECT count(*) AS n FROM categories')).rows[0].n),40);
 const real=(await db.query('SELECT * FROM profiles WHERE NOT demo')).rows;
 assert.equal(real.length,180);
 const categories=(await db.query('SELECT * FROM categories')).rows;
 for(const category of categories){
  const items=real.filter(p=>p.category_id===category.id);
  assert.ok(items.length>=3,category.slug+'缺少真实品牌');
  assert.equal(new Set(items.map(p=>p.editorial.positioning.order)).size,items.length,category.slug+'定位顺序重复');
  assert.ok(items.every(p=>p.editorial.products.length>=2&&p.editorial.references.length&&p.editorial.positioning.reason));
 }
 assert.equal(new Set(real.map(p=>p.brand_id)).size,164);
 assert.equal(new Set(real.filter(p=>p.english==='Hermès').map(p=>p.brand_id)).size,1);
 assert.ok(profile.brand_id);assert.ok(profile.editorial.references.length);assert.ok(profile.editorial.socialSignals.length);
 const before=Number((await db.query('SELECT count(*) AS n FROM profiles')).rows[0].n);
 await db.query("UPDATE profiles SET editorial=jsonb_set(editorial,'{story}','\"平台已编辑的品牌故事\"') WHERE id=$1",[profile.id]);
 await seedAtlas(db);
 assert.equal(Number((await db.query('SELECT count(*) AS n FROM profiles')).rows[0].n),before);
 assert.equal((await db.query('SELECT editorial FROM profiles WHERE id=$1',[profile.id])).rows[0].editorial.story,'平台已编辑的品牌故事');
});
test('图鉴拒绝超限、残缺和危险来源；真实资料不能通过省略资料类型清空来源',()=>{
 const data=profile.editorial;
 assert.throws(()=>normalizeEditorial({...data,references:[{title:'危险链接',url:'javascript:alert(1)'}]}));
 assert.throws(()=>normalizeEditorial({...data,products:[{name:'只有名称'}]}));
 assert.throws(()=>normalizeEditorial({...data,socialSignals:Array(7).fill({name:'属性',description:'说明'})}));
 assert.throws(()=>normalizeEditorial({...data,story:'x'.repeat(8001)}));
 assert.throws(()=>normalizeEditorial({...data,socialContext:{audience:'x'.repeat(1001)}}));
 assert.throws(()=>normalizeEditorial({...data,socialContext:{paidTier:'殿堂级'}}));
 assert.throws(()=>profileExtras({editorial:{...data,references:[]}},profile),/至少一项来源/);
 assert.deepEqual(profileExtras({},profile).editorial,data);
});
test('图鉴修订经第二人审核再公开，保留原版本并关联原助力身份',async()=>{
 const body={categoryId:profile.category_id,name:profile.name,english:profile.english,tier:profile.tier,summary:profile.summary,recognition:profile.recognition,occasion:profile.occasion,source:profile.source,contentMode:'SOURCED',brandId:profile.brand_id,editorial:{...profile.editorial,story:'审核通过后公开的新故事'}};
 const original=await publicAtlas(db,profile.brand_id);
 const revision=await reviseProfile(db,editor,profile.id,body);
 assert.equal((await publicAtlas(db,profile.brand_id)).profiles[0].editorial.story,original.profiles[0].editorial.story);
 await assert.rejects(()=>decideRevision(db,editor,revision.id,true,'自审'),/不能审核自己的/);
 await decideRevision(db,reviewer,revision.id,true,'已核对故事、产品、价值与来源');
 const result=await publicAtlas(db,profile.brand_id);
 assert.equal(result.profiles[0].editorial.story,body.editorial.story);assert.equal(result.merchant.id,profile.brand_id);assert.equal(result.profiles[0].demo,false);
});
test('图鉴只公开已发布且启用品类的资料；隐藏品牌不可读',async()=>{
 await db.query("UPDATE profiles SET state='DRAFT' WHERE id=$1",[profile.id]);
 assert.ok(!(await publicAtlas(db,profile.brand_id)).profiles.some(p=>p.id===profile.id));
 await db.query("UPDATE profiles SET state='PUBLISHED' WHERE id=$1",[profile.id]);
 await db.query('UPDATE categories SET active=false WHERE id=$1',[profile.category_id]);
 assert.ok(!(await publicAtlas(db,profile.brand_id)).profiles.some(p=>p.id===profile.id));
 await db.query('UPDATE categories SET active=true WHERE id=$1',[profile.category_id]);
 await db.query("UPDATE merchants SET state='HIDDEN' WHERE id=$1",[profile.brand_id]);
 await assert.rejects(()=>publicAtlas(db,profile.brand_id),/不存在或已下线/);
 await assert.rejects(()=>publicAtlas(db,'invalid'),/不存在或已下线/);
});

test('定位参考分层与金额独立，公开图鉴优先真实资料，专业设备不冒充奢侈阶序',async()=>{
 const watch=(await db.query("SELECT p.* FROM profiles p JOIN categories c ON c.id=p.category_id WHERE c.slug='watches'")).rows;
 const ranked=categoryProfiles(watch.map(p=>({...p,net_fen:p.english==='Rolex'?999999999:0})));
 assert.equal(ranked[0].english,'Patek Philippe');assert.ok(ranked.findIndex(p=>p.english==='Rolex')>0);assert.equal(ranked.at(-1)?.english,'Tudor');
 assert.ok(ranked.every(p=>!p.demo));
 const computers=(await db.query("SELECT p.* FROM profiles p JOIN categories c ON c.id=p.category_id WHERE c.slug='computers' AND NOT p.demo")).rows;
 assert.ok(computers.every(p=>p.tier==='不适用'&&p.editorial.positioning.scope==='SPECIALIST'));
 assert.equal(categoryCuration('computers')?.scope,'SPECIALIST');assert.equal(categoryCuration('custom-new-category'),null);
});
test('旧种子只补充未改动资料，重复启动不造订单、流水或推广金额',async()=>{
 const baseline=(await db.query("SELECT (SELECT count(*) FROM orders) AS orders,(SELECT count(*) FROM rank_ledger) AS ledger,(SELECT COALESCE(sum(net_fen),0) FROM merchant_categories) AS total")).rows[0];
 const old=JSON.parse(readFileSync('design/atlas-seed.json','utf8')).brands.find((b:any)=>b.english==='Aman');
 const current=(await db.query('SELECT * FROM profiles WHERE id=$1',[old.id])).rows[0];
 await db.query('UPDATE profiles SET tier=$1,editorial=$2 WHERE id=$3',[old.tier,JSON.stringify(old.editorial),old.id]);
 await seedAtlas(db);
 let upgraded=(await db.query('SELECT * FROM profiles WHERE id=$1',[old.id])).rows[0];
 assert.equal(upgraded.tier,'殿堂级');assert.equal(upgraded.editorial.positioning.order,1);
 assert.equal(upgraded.editorial.story,old.editorial.story);
 await db.query("UPDATE profiles SET tier=$1,editorial=$2 WHERE id=$3",['精品级',JSON.stringify({...old.editorial,story:'平台自行改过的介绍'}),old.id]);
 await seedAtlas(db);
 upgraded=(await db.query('SELECT * FROM profiles WHERE id=$1',[old.id])).rows[0];
 assert.equal(upgraded.tier,'精品级');assert.equal(upgraded.editorial.story,'平台自行改过的介绍');assert.equal(upgraded.editorial.positioning,undefined);
 await db.query('UPDATE profiles SET tier=$1,editorial=$2 WHERE id=$3',[current.tier,JSON.stringify(current.editorial),old.id]);
 assert.deepEqual((await db.query("SELECT (SELECT count(*) FROM orders) AS orders,(SELECT count(*) FROM rank_ledger) AS ledger,(SELECT COALESCE(sum(net_fen),0) FROM merchant_categories) AS total")).rows[0],baseline);
});
test('定位修订拒绝金额、非法顺序和日期，可随图鉴经第二人复核',()=>{
 const value=profile.editorial,positioning=value.positioning;
 assert.throws(()=>normalizeEditorial({...value,positioning:{...positioning,order:0}}),/顺序/);
 assert.throws(()=>normalizeEditorial({...value,positioning:{...positioning,order:1.5}}),/顺序/);
 assert.throws(()=>normalizeEditorial({...value,positioning:{...positioning,scope:'PAID'}}),/范围/);
 assert.throws(()=>normalizeEditorial({...value,positioning:{...positioning,amountFen:10000}}),/字段/);
 assert.throws(()=>normalizeEditorial({...value,positioning:{...positioning,asOf:'2026-02-30'}}),/日期/);
 assert.throws(()=>normalizeEditorial({...value,positioning:{...positioning,reason:''}}),/依据/);
 assert.equal(normalizeEditorial({...value,positioning:null}).positioning,null);
});
