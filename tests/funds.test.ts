
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {connect,type DB} from '../apps/api/src/db.js';
import {board,settle,refund,idem,money} from '../apps/api/src/funds.js';
let db:DB;const user='10000000-0000-4000-8000-000000000001';
const cases=JSON.parse(readFileSync('design/contracts/ranking-cases.json','utf8')).cases.filter((c:any)=>!c.events.some((e:any)=>e.kind==='REFUND'));
const cats=JSON.parse(readFileSync('design/contracts/categories.json','utf8')).categories;
before(async()=>{db=await connect(true);await db.query("INSERT INTO users VALUES($1,'test-funds','USER')",[user]);});
after(async()=>{await (db as any).close?.();});
async function reset(){await db.exec('TRUNCATE rank_ledger,receipts,refunds,orders,merchant_categories,merchants,assets,idempotency,outbox CASCADE');}
async function fixture(name='A',category=cats[0].id,entryId:string=randomUUID()){
 const aid=randomUUID(),mid=randomUUID();await db.query('INSERT INTO assets VALUES($1,$2,$3)',[aid,user,'demo']);
 await db.query('INSERT INTO merchants(id,owner_id,name,logo_asset_id) VALUES($1,$2,$3,$4)',[mid,user,name,aid]);
 await db.query('INSERT INTO merchant_categories(id,merchant_id,category_id) VALUES($1,$2,$3)',[entryId,mid,category]);return entryId;
}
async function order(entry:string,amount=20000){const id=randomUUID();await db.query('INSERT INTO orders(id,actor_id,entry_id,amount_fen) VALUES($1,$2,$3,$4)',[id,user,entry,amount]);return id;}
for(const c of cases)test('设计向量：'+c.id,async()=>{
 await reset();const entries=new Map<string,string>(),payments=new Map<string,string>(),seen=new Set<string>(),rejected:string[]=[];
 for(const e of c.events){
 if(e.status!=='SUCCEEDED'||!e.verified)continue;
 if(seen.has(e.kind+e.reference))continue;
 const key=e.merchant+'|'+e.category;
 if(!entries.has(key)){
 const cid=cats.find((x:any)=>x.slug===e.category).id;
 const eid='20000000-0000-4000-8000-'+String(e.merchant.charCodeAt(0)*100+cats.findIndex((x:any)=>x.slug===e.category)).padStart(12,'0');
 entries.set(key,await fixture(key,cid,eid));
 }
 const entry=entries.get(key)!;
 try{
 if(e.kind==='PAYMENT'){const oid=await order(entry,e.amountFen);await db.transaction(t=>settle(t,oid,e.reference,e.amountFen));payments.set(e.reference,oid);}
 else {const oid=payments.get(e.paymentRef);assert.ok(oid);const orig=(await db.query('SELECT entry_id FROM orders WHERE id=$1',[oid])).rows[0];if(orig.entry_id!==entry)throw new Error('wrong category');await db.transaction(t=>refund(t,oid,e.amountFen));}
 await db.query('UPDATE merchant_categories SET attained_at=$1 WHERE id=$2',[e.committedAt,entry]);seen.add(e.kind+e.reference);
 }catch{rejected.push(e.eventId);}
 }
 for(const [slug,names]of Object.entries(c.expected.boards)){const b=await board(db,cats.find((x:any)=>x.slug===slug).id);assert.deepEqual(b.map(r=>r.name.split('|')[0]),names);}
 for(const [key,b]of Object.entries(c.expected.balances) as any){const r=(await db.query('SELECT * FROM merchant_categories WHERE id=$1',[entries.get(key)])).rows[0];assert.equal(Number(r.gross_fen),b.grossFen);assert.equal(Number(r.refunded_fen),b.refundedFen);assert.equal(Number(r.net_fen),b.netFen);}
 assert.deepEqual(rejected,c.expected.rejected||[]);
});
test('并发重放10次只入账一次；流水不可更改；所有退款均被拒绝',async()=>{
 await reset();const entry=await fixture(),oid=await order(entry);
 await Promise.all(Array.from({length:10},()=>db.transaction(t=>settle(t,oid,'same-receipt',20000))));
 assert.equal(Number((await db.query('SELECT count(*) AS n FROM rank_ledger')).rows[0].n),1);
 await assert.rejects(()=>db.query('UPDATE rank_ledger SET delta_fen=30000'));
 const result=await Promise.allSettled([db.transaction(t=>refund(t,oid,15000)),db.transaction(t=>refund(t,oid,15000))]);
 assert.equal(result.filter(r=>r.status==='fulfilled').length,0);
 assert.equal(Number((await db.query('SELECT net_fen FROM merchant_categories WHERE id=$1',[entry])).rows[0].net_fen),20000);
});
test('金额错误不入账，事务失败全部回滚，幂等键拒绝参数变更',async()=>{
 await reset();const entry=await fixture(),oid=await order(entry);
 await assert.rejects(()=>db.transaction(t=>settle(t,oid,'bad',10000)));
 await assert.rejects(()=>db.transaction(async t=>{await settle(t,oid,'rollback',20000);throw new Error('simulated failure');}));
 assert.equal(Number((await db.query('SELECT net_fen FROM merchant_categories WHERE id=$1',[entry])).rows[0].net_fen),0);
 const run=(body:any)=>db.transaction(t=>idem(t,user,'test','key',body,async()=>({id:'same'})));
 assert.deepEqual(await run({amount:100}),await run({amount:100}));await assert.rejects(()=>run({amount:200}));
 for(const n of [0,-1,10001,NaN,1e20,10000001])assert.throws(()=>money(n));
});
