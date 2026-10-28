import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {connect,type DB} from '../apps/api/src/db.js';
import {createSupportOrder,paySupportOrder,visitorOrders,supportBrands,followBrand,publicMetrics,syncCatalogueBrands} from '../apps/api/src/support.js';
import {refund,globalBoard} from '../apps/api/src/funds.js';
import {recordEvent} from '../apps/api/src/analytics.js';
import {mintStaffTicket,consumeStaffTicket} from '../apps/api/src/staff-access.js';
let db:DB,cats:any[],brand:string,owner:string;
before(async()=>{db=await connect(true);cats=(await db.query('SELECT * FROM categories ORDER BY sort_order')).rows;owner=(await db.query("SELECT id FROM users WHERE role='USER'")).rows[0].id;const aid=randomUUID();brand=randomUUID();await db.query('INSERT INTO assets VALUES($1,$2,$3)',[aid,owner,'logo']);await db.query('INSERT INTO merchants(id,owner_id,name,logo_asset_id) VALUES($1,$2,$3,$4)',[brand,owner,'任意访客可助力',aid]);});
after(async()=>{await (db as any).close?.();});
test('已发布图鉴的同名中英文品牌跨品类使用一个身份，重复同步不产生新实体',async()=>{
 const profiles=(await db.query("SELECT * FROM profiles WHERE name='序物'")).rows;assert.ok(profiles.length>1);assert.equal(new Set(profiles.map(p=>p.brand_id)).size,1);
 const first=(await supportBrands(db)).length;await syncCatalogueBrands(db);assert.equal((await supportBrands(db)).length,first);
});
test('游客无需拥有品牌即可创建助力，收款方固定为平台；并发重试只创建一单',async()=>{
 const body={merchantId:brand,categoryId:cats[0].id,amountFen:100},key=randomUUID();
 const orders=await Promise.all(Array.from({length:8},()=>createSupportOrder(db,'visitor-a',body,key)));
 assert.equal(new Set(orders.map(o=>o.id)).size,1);assert.equal(orders[0].recipient,'PLATFORM');assert.equal(orders[0].refundSupported,false);
 await Promise.all(Array.from({length:8},()=>paySupportOrder(db,'visitor-a',orders[0].id)));
 assert.equal(Number((await db.query('SELECT count(*) AS n FROM rank_ledger WHERE order_id=$1',[orders[0].id])).rows[0].n),1);
 assert.equal((await globalBoard(db)).find(b=>b.id===brand).net_fen,100);
 await assert.rejects(()=>createSupportOrder(db,'visitor-a',{...body,amountFen:200},key),/同一请求/);
 await assert.rejects(()=>createSupportOrder(db,'visitor-a',{...body,recipient:'MERCHANT'},randomUUID()));
});
test('不同访客后续助力自动沿用品类，不能改品类或读取别人的订单',async()=>{
 const a=await createSupportOrder(db,'visitor-a',{merchantId:brand,categoryId:cats[0].id,amountFen:5000},randomUUID());
 await assert.rejects(()=>createSupportOrder(db,'visitor-b',{merchantId:brand,categoryId:cats[1].id,amountFen:10000},randomUUID()),/品类已固定/);
 const b=await createSupportOrder(db,'visitor-b',{merchantId:brand,amountFen:10000},randomUUID());
 await assert.rejects(()=>paySupportOrder(db,'visitor-a',b.id),/不属于当前访客/);
 await paySupportOrder(db,'visitor-a',a.id);await paySupportOrder(db,'visitor-b',b.id);
 const all=await globalBoard(db),r=all.find(b=>b.id===brand);assert.equal(r.net_fen,15100);assert.equal(r.category_names.length,1);assert.equal(all.filter(b=>b.id===brand).length,1);
 assert.ok(!(await visitorOrders(db,'visitor-a')).some(o=>o.id===b.id));
 assert.equal((await publicMetrics(db,[brand],'visitor-a')).get(brand).supporters,2);
});
test('退款函数与数据库退款写入都拒绝，付款余额保持不变',async()=>{
 const o=(await visitorOrders(db,'visitor-a')).find(o=>o.state==='PAID');
 await assert.rejects(()=>db.transaction(t=>refund(t,o.id,100)),/不支持退款/);
 await assert.rejects(()=>db.query("INSERT INTO refunds(id,order_id,amount_fen,state) VALUES($1,$2,100,'SUCCEEDED')",[randomUUID(),o.id]),/Refunds are not supported/);
 const e=(await db.query('SELECT entry_id FROM orders WHERE id=$1',[o.id])).rows[0];
 await assert.rejects(()=>db.query("INSERT INTO rank_ledger(id,entry_id,order_id,refund_id,kind,delta_fen) VALUES($1,$2,$3,NULL,'REFUND',-100)",[randomUUID(),e.entry_id,o.id]));
 assert.equal((await globalBoard(db)).find(b=>b.id===brand).net_fen,15100);
});
test('关注幂等且按访客隔离，热度取实际详情浏览并区分官网直播点击',async()=>{
 await followBrand(db,brand,'visitor-a',true);await followBrand(db,brand,'visitor-a',true);await followBrand(db,brand,'visitor-b',true);
 assert.equal((await publicMetrics(db,[brand],'visitor-a')).get(brand).followers,2);
 await followBrand(db,brand,'visitor-a',false);let metrics=(await publicMetrics(db,[brand],'visitor-a')).get(brand);assert.equal(metrics.followers,1);assert.equal(metrics.followed,false);
 assert.equal((await publicMetrics(db,[brand],'visitor-b')).get(brand).followed,true);
 for(let i=0;i<2;i++)await recordEvent(db,{merchantId:brand,kind:'VIEW',source:'detail',visitor:'viewer-a',eventKey:randomUUID()});
 metrics=(await publicMetrics(db,[brand])).get(brand);assert.equal(metrics.heat,2);assert.equal(metrics.viewers,1);assert.equal(metrics.website_clicks,0);assert.equal(metrics.live_clicks,0);
});
test('隐藏品牌、停用品类及图鉴错误品类不能新助力，最低1元',async()=>{
 const body={merchantId:brand,categoryId:cats[0].id,amountFen:100};
 for(const n of [0,-100,1,101,10000001])await assert.rejects(()=>createSupportOrder(db,'invalid',{...body,amountFen:n},randomUUID()));
 await db.query("UPDATE merchants SET state='HIDDEN' WHERE id=$1",[brand]);await assert.rejects(()=>createSupportOrder(db,'invalid',body,randomUUID()));await db.query("UPDATE merchants SET state='APPROVED' WHERE id=$1",[brand]);
 await db.query('UPDATE categories SET active=false WHERE id=$1',[cats[0].id]);await assert.rejects(()=>createSupportOrder(db,'invalid',body,randomUUID()));await db.query('UPDATE categories SET active=true WHERE id=$1',[cats[0].id]);
 const one=(await supportBrands(db)).find(b=>b.id!==brand);await assert.rejects(()=>createSupportOrder(db,'invalid',{merchantId:one.id,categoryId:randomUUID(),amountFen:100},randomUUID()));
});
test('本机后台凭据一次性使用，公开身份不能生成管理凭据',()=>{
 const ticket=mintStaffTicket('admin');assert.equal(consumeStaffTicket(ticket),'admin');assert.throws(()=>consumeStaffTicket(ticket));assert.throws(()=>mintStaffTicket('user'));assert.throws(()=>mintStaffTicket('finance'));assert.throws(()=>consumeStaffTicket('invalid'));
});
