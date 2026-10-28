import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {connect,type DB} from '../apps/api/src/db.js';
import {settle} from '../apps/api/src/funds.js';
import {createSupportOrder,paySupportOrder} from '../apps/api/src/support.js';
import {rankingSnapshot,lockRankings,syncRankingHeads} from '../apps/api/src/live-ranking.js';
let db:DB,cats:any[],a:string,b:string;
async function makeBrand(name:string){
 const asset=randomUUID(),id=randomUUID();
 await db.query('INSERT INTO assets(id,data) VALUES($1,$2)',[asset,'logo']);
 await db.query('INSERT INTO merchants(id,name,logo_asset_id) VALUES($1,$2,$3)',[id,name,asset]);return id;
}
async function order(brand:string,category:string,amount:number){
 await db.query('INSERT INTO merchant_categories(id,merchant_id,category_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[randomUUID(),brand,category]);
 const entry=(await db.query('SELECT id FROM merchant_categories WHERE merchant_id=$1 AND category_id=$2',[brand,category])).rows[0].id,id=randomUUID();
 await db.query('INSERT INTO orders(id,entry_id,amount_fen) VALUES($1,$2,$3)',[id,entry,amount]);return id;
}
async function pay(brand:string,category:string,amount:number){
 const id=await order(brand,category,amount);await db.transaction(t=>settle(t,id,'live-'+id,amount));return id;
}
before(async()=>{db=await connect(true);cats=(await db.query('SELECT id FROM categories ORDER BY sort_order')).rows;a=await makeBrand('动态品牌甲');b=await makeBrand('动态品牌乙');});
after(async()=>{await (db as any).close?.();});
test('空榜无计时；首笔成功到账建立持久榜首，追加与重复读取不重置',async()=>{
 const empty=await rankingSnapshot(db);assert.equal(empty.leaderSince,null);assert.equal(empty.activityCursor,'0');
 await pay(a,cats[0].id,10000);
 const first=await rankingSnapshot(db);assert.equal(first.items[0].id,a);assert.ok(first.leaderSince);assert.equal(first.events.length,0);
 await db.query("UPDATE ranking_heads SET since=clock_timestamp()-interval '1 hour' WHERE scope='global'");
 const prior=(await rankingSnapshot(db)).leaderSince;
 await pay(a,cats[0].id,100);assert.equal(String((await rankingSnapshot(db)).leaderSince),String(prior));
 assert.equal(String((await rankingSnapshot(db)).leaderSince),String(prior));
});
test('金额超越切换榜首；总榜与品类分别计时，隐藏及恢复重新开始本次霸榜',async()=>{
 const catFirst=await rankingSnapshot(db,cats[0].id);
 await pay(b,cats[1].id,20000);
 const total=await rankingSnapshot(db);assert.equal(total.items[0].id,b);
 assert.equal(String((await rankingSnapshot(db,cats[0].id)).leaderSince),String(catFirst.leaderSince));
 const before=total.leaderSince;
 await db.transaction(async t=>{await lockRankings(t);await t.query("UPDATE merchants SET state='HIDDEN' WHERE id=$1",[b]);await syncRankingHeads(t);});
 assert.equal((await rankingSnapshot(db)).items[0].id,a);
 await db.transaction(async t=>{await lockRankings(t);await t.query("UPDATE merchants SET state='APPROVED' WHERE id=$1",[b]);await syncRankingHeads(t);});
 const restored=await rankingSnapshot(db);assert.equal(restored.items[0].id,b);assert.ok(new Date(restored.leaderSince).getTime()>=new Date(before).getTime());
});
test('到账事件只记录一次；按品牌累积30秒连击，未到账和回滚不播放',async()=>{
 const cursor=(await rankingSnapshot(db)).activityCursor;
 await db.query("UPDATE ranking_payments SET paid_at=clock_timestamp()-interval '31 seconds' WHERE merchant_id=$1",[a]);
 const ids=await Promise.all([order(a,cats[0].id,100),order(a,cats[0].id,200),order(a,cats[0].id,300)]);
 for(let index=0;index<ids.length;index++)await db.transaction(t=>settle(t,ids[index],'combo-'+index,(index+1)*100));
 await db.transaction(t=>settle(t,ids[0],'combo-0',100));
 const events=(await rankingSnapshot(db,undefined,cursor)).events;assert.deepEqual(events.map(event=>event.combo),[1,2,3]);
 assert.equal(new Set(events.map(event=>event.id)).size,3);assert.equal(events[2].amount_fen,300);
 assert.ok(events.every(event=>!('supporter_key' in event)&&!('actor_id' in event)));
 const next=(await rankingSnapshot(db)).activityCursor;
 const pending=await order(a,cats[0].id,100);
 await assert.rejects(()=>db.transaction(t=>settle(t,pending,'bad-amount',200)));
 await assert.rejects(()=>db.transaction(async t=>{await settle(t,pending,'rollback-event',100);throw new Error('rollback');}));
 assert.equal((await rankingSnapshot(db,undefined,next)).events.length,0);
});
test('事件按品类筛选，首次访问不回放；非法游标拒绝',async()=>{
 const initial=await rankingSnapshot(db);assert.deepEqual(initial.events,[]);
 const cursor=initial.activityCursor;
 await pay(a,cats[0].id,100);await pay(b,cats[1].id,100);
 const local=await rankingSnapshot(db,cats[0].id,cursor);assert.equal(local.events.length,1);assert.equal(local.events[0].merchant_id,a);
 assert.equal((await rankingSnapshot(db,undefined,cursor)).events.length,2);
 for(const cursor of ['-1','x','9223372036854775808'])await assert.rejects(()=>rankingSnapshot(db,undefined,cursor),/游标/);
});

test('付款回执立即返回相同到账事件，重试与轮询使用同一编号',async()=>{
 const cursor=(await rankingSnapshot(db)).activityCursor;
 const order=await createSupportOrder(db,'instant-feedback',{merchantId:a,categoryId:cats[0].id,amountFen:100},randomUUID());
 const paid=await paySupportOrder(db,'instant-feedback',order.id);
 assert.ok(paid.event);assert.equal(paid.event.merchant_id,a);
 const replay=await paySupportOrder(db,'instant-feedback',order.id);
 assert.equal(replay.event.id,paid.event.id);
 const events=(await rankingSnapshot(db,undefined,cursor)).events;
 assert.equal(events.length,1);assert.equal(events[0].id,paid.event.id);
});
