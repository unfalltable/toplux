import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {connect,type DB} from '../apps/api/src/db.js';
import {createSupportOrder,paySupportOrder,syncCatalogueBrands} from '../apps/api/src/support.js';
import {classification,reviewClassification,reportCategory,classificationQueue,seedClassifications} from '../apps/api/src/classification.js';
import {board,globalBoard} from '../apps/api/src/funds.js';
import {rankingSnapshot} from '../apps/api/src/live-ranking.js';
let db:DB,cats:any[],reviewer:string,user:string,brand:string,editor:string;
async function makeBrand(name:string){const asset=randomUUID(),id=randomUUID();await db.query('INSERT INTO assets(id,data) VALUES($1,$2)',[asset,'logo']);await db.query('INSERT INTO merchants(id,name,logo_asset_id) VALUES($1,$2,$3)',[id,name,asset]);return id;}
before(async()=>{db=await connect(true);cats=(await db.query('SELECT * FROM categories ORDER BY sort_order')).rows;const users=(await db.query('SELECT * FROM users')).rows;reviewer=users.find(row=>row.role==='REVIEWER').id;editor=users.find(row=>row.role==='EDITOR').id;user=users.find(row=>row.role==='USER').id;brand=await makeBrand('首次归类测试');});
after(async()=>{await (db as any).close?.();});
test('未付款不占品类；首次成功即暂定上榜，后续无需选择且不能改类',async()=>{
 const first=await createSupportOrder(db,'first',{merchantId:brand,categoryId:cats[0].id,amountFen:100},randomUUID());
 const competing=await createSupportOrder(db,'other',{merchantId:brand,categoryId:cats[1].id,amountFen:200},randomUUID());
 assert.equal((await classification(db,brand)).state,'UNSET');assert.equal((await board(db,cats[0].id)).length,0);
 const paid=await paySupportOrder(db,'first',first.id);assert.equal(paid.classification.state,'PENDING');assert.equal(paid.classification.suggestedCategoryId,cats[0].id);
 assert.equal((await board(db,cats[0].id))[0].net_fen,100);assert.equal((await globalBoard(db))[0].net_fen,100);
 await paySupportOrder(db,'other',competing.id);
 assert.equal((await classification(db,brand)).suggestedCategoryId,cats[0].id);
 assert.equal((await board(db,cats[0].id))[0].net_fen,300);assert.equal((await board(db,cats[1].id)).length,0);
 await assert.rejects(()=>createSupportOrder(db,'malicious',{merchantId:brand,categoryId:cats[1].id,amountFen:100},randomUUID()),/品类已固定/);
 const next=await createSupportOrder(db,'next',{merchantId:brand,amountFen:100},randomUUID());await paySupportOrder(db,'next',next.id);
 assert.equal((await board(db,cats[0].id))[0].net_fen,400);
});
test('平台纠错迁移整品牌的品类榜金额，账本与订单不变，总榜计时不重置',async()=>{
 const before=(await db.query('SELECT * FROM rank_ledger ORDER BY id')).rows,orders=(await db.query('SELECT * FROM orders ORDER BY id')).rows,total=(await globalBoard(db))[0].net_fen,leader=(await rankingSnapshot(db)).leaderSince;
 const assignment=await classification(db,brand);
 await reviewClassification(db,reviewer,brand,{categoryId:cats[1].id,version:assignment.version,reason:'核实品牌官网，应归入箱包品类'});
 assert.equal((await classification(db,brand)).state,'CONFIRMED');
 assert.equal((await board(db,cats[0].id)).length,0);assert.equal((await board(db,cats[1].id))[0].net_fen,total);
 assert.deepEqual((await db.query('SELECT * FROM rank_ledger ORDER BY id')).rows,before);
 assert.deepEqual((await db.query('SELECT * FROM orders ORDER BY id')).rows,orders);
 assert.equal((await globalBoard(db))[0].net_fen,total);assert.equal(String((await rankingSnapshot(db)).leaderSince),String(leader));
 assert.equal((await rankingSnapshot(db,cats[0].id)).leaderSince,null);
 const next=await createSupportOrder(db,'next-fixed',{merchantId:brand,amountFen:100},randomUUID());await paySupportOrder(db,'next-fixed',next.id);
 assert.equal((await board(db,cats[1].id))[0].net_fen,total+100);
});
test('纠错仅创建建议，去重且不直接改归属；平台处理后保留历史',async()=>{
 const fixed=await classification(db,brand);
 const report=await reportCategory(db,'reporter',brand,{categoryId:cats[2].id,reason:'核实官网产品范围，建议进一步确认'});
 const again=await reportCategory(db,'reporter',brand,{categoryId:cats[0].id,reason:'补充官网证据，建议平台核实主品类'});
 assert.equal(report.id,again.id);assert.equal((await classification(db,brand)).categoryId,fixed.categoryId);
 let queue=await classificationQueue(db);assert.equal(queue.reports.filter(row=>row.merchant_id===brand&&row.state==='OPEN').length,1);
 assert.ok(queue.reports.every(row=>!('visitor_key' in row)));
 await reviewClassification(db,reviewer,brand,{categoryId:cats[1].id,version:fixed.version,reason:'复核纠错，现有箱包归属正确，保留原类'});
 queue=await classificationQueue(db);assert.equal(queue.reports.find(row=>row.id===report.id).state,'RESOLVED');
 assert.ok(queue.history.filter(row=>row.merchant_id===brand).length>=2);
});
test('用户与编辑不能审核，过期版本与无效品类不能覆盖，拒绝额外字段',async()=>{
 const current=await classification(db,brand),body={categoryId:cats[0].id,version:current.version,reason:'请求平台进行归属纠正'};
 for(const actor of [user,editor])await assert.rejects(()=>reviewClassification(db,actor,brand,body),/只有平台审核/);
 await assert.rejects(()=>reviewClassification(db,reviewer,brand,{...body,version:0}),/已更新/);
 await assert.rejects(()=>reviewClassification(db,reviewer,brand,{...body,categoryId:randomUUID()}),/启用品类/);
 await assert.rejects(()=>reviewClassification(db,reviewer,brand,{...body,amountFen:999999}),/归类参数/);
 assert.equal((await classification(db,brand)).categoryId,current.categoryId);
});
test('仅唯一已发布平台品类可自动沿用，跨类资料不擅自选定',async()=>{
 const category=cats[2].id,name='唯一资料归类'+randomUUID().slice(0,6);
 await db.query("INSERT INTO profiles(id,category_id,name,english,tier,summary,recognition,occasion,source) VALUES($1,$2,$3,'ONE','高端级','演示','资料不足','日常','内部验证')",[randomUUID(),category,name]);
 await syncCatalogueBrands(db);
 const single=(await db.query('SELECT brand_id FROM profiles WHERE name=$1',[name])).rows[0].brand_id;
 assert.equal((await classification(db,single)).categoryId,category);
 const pending=await createSupportOrder(db,'known-catalog',{merchantId:single,amountFen:100},randomUUID());assert.ok(pending.id);
 const multi=(await db.query("SELECT brand_id FROM profiles WHERE name='序物' LIMIT 1")).rows[0].brand_id;
 assert.equal((await classification(db,multi)).state,'UNSET');
 await seedClassifications(db);assert.equal((await classification(db,brand)).state,'CONFIRMED');
});
test('并发首次付款只保留一项初始建议；举报基础限频',async()=>{
 const id=await makeBrand('并发首次归类');
 const orders=await Promise.all([0,1].map(index=>createSupportOrder(db,'race-'+index,{merchantId:id,categoryId:cats[index].id,amountFen:100},randomUUID())));
 await Promise.all(orders.map((order,index)=>paySupportOrder(db,'race-'+index,order.id)));
 const fixed=await classification(db,id);assert.equal(fixed.state,'PENDING');
 const boards=await Promise.all([board(db,cats[0].id),board(db,cats[1].id)]);
 assert.equal(boards.flat().filter(row=>row.merchant_id===id).length,1);
 assert.equal(boards.flat().find(row=>row.merchant_id===id).net_fen,200);
 for(let index=0;index<10;index++){const target=await makeBrand('举报限频'+index);await reportCategory(db,'rate-visitor',target,{categoryId:cats[0].id,reason:'这是用于验证限频的分类依据'});}
 await assert.rejects(()=>reportCategory(db,'rate-visitor',id,{categoryId:cats[0].id,reason:'这是超限的一条归类建议'}),/较频繁/);
});
