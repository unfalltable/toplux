
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {connect,type DB} from '../apps/api/src/db.js';
import {globalBoard,board,settle,refund} from '../apps/api/src/funds.js';
import {saveCategory,reviseProfile,decideRevision} from '../apps/api/src/catalog.js';
let db:DB;let editor:string,reviewer:string;let cats:any[];
before(async()=>{db=await connect(true);const u=(await db.query('SELECT * FROM users')).rows;editor=u.find(x=>x.role==='EDITOR').id;reviewer=u.find(x=>x.role==='REVIEWER').id;cats=(await db.query('SELECT * FROM categories ORDER BY sort_order')).rows;});
after(async()=>{await (db as any).close?.();});
async function merchant(name:string,owner=editor){const aid=randomUUID(),mid=randomUUID();await db.query('INSERT INTO assets VALUES($1,$2,$3)',[aid,owner,'logo']);await db.query('INSERT INTO merchants(id,owner_id,name,logo_asset_id) VALUES($1,$2,$3,$4)',[mid,owner,name,aid]);return mid;}
async function pay(mid:string,cid:string,amount:number){const eid=randomUUID();await db.query('INSERT INTO merchant_categories(id,merchant_id,category_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[eid,mid,cid]);const e=(await db.query('SELECT id FROM merchant_categories WHERE merchant_id=$1 AND category_id=$2',[mid,cid])).rows[0];const oid=randomUUID();await db.query('INSERT INTO orders(id,actor_id,entry_id,amount_fen) VALUES($1,$2,$3,$4)',[oid,editor,e.id,amount]);await db.transaction(t=>settle(t,oid,'ref-'+oid,amount));return oid;}
test('总榜按品牌合并各品类、不重复计入，退款被拒绝，隐藏实时反映',async()=>{
 const a=await merchant('合并测试'),b=await merchant('同名商家',reviewer),c=await merchant('同名商家');
 const o1=await pay(a,cats[0].id,20000);await pay(a,cats[1].id,10000);await pay(b,cats[0].id,25000);await pay(c,cats[2].id,10000);
 let g=await globalBoard(db);assert.equal(g.length,3);assert.equal(g[0].id,a);assert.equal(g[0].net_fen,30000);assert.equal(g[0].gross_fen,30000);assert.deepEqual(g[0].category_names.sort(),[cats[0].name,cats[1].name].sort());
 assert.equal((await board(db,cats[0].id)).find(x=>x.merchant_id===a).net_fen,30000);
 await assert.rejects(()=>db.transaction(t=>refund(t,o1,10000)),/不支持退款/);g=await globalBoard(db);assert.equal(g[0].id,a);assert.equal(g.find(x=>x.id===a).net_fen,30000);assert.equal(g.find(x=>x.id===a).refunded_fen,0);
 await db.query("UPDATE merchants SET state='HIDDEN' WHERE id=$1",[b]);assert.equal((await globalBoard(db)).length,2);
 await db.query("UPDATE merchants SET state='APPROVED' WHERE id=$1",[b]);assert.equal((await globalBoard(db))[0].id,a);
});
test('品类新增、改名、排序和停用可维护；拒绝重复标识与子品类字段',async()=>{
 const body={name:'维护测试',slug:'catalog-test',sortOrder:5,active:true};
 const c=await saveCategory(db,editor,body);
 await saveCategory(db,editor,{...body,name:'维护测试改名',sortOrder:2,active:false},c.id);
 const r=(await db.query('SELECT * FROM categories WHERE id=$1',[c.id])).rows[0];assert.equal(r.name,'维护测试改名');assert.equal(r.active,false);assert.equal(r.sort_order,2);
 await assert.rejects(()=>saveCategory(db,editor,{...body,name:'另一品类'}));
 await assert.rejects(()=>saveCategory(db,editor,{...body,parentId:cats[0].id}));
});
test('品牌修订保留线上旧版；拒绝自审、重复审批和过期版本覆盖',async()=>{
 const p=(await db.query('SELECT * FROM profiles LIMIT 1')).rows[0];
 const b={categoryId:p.category_id,name:'修订品牌',english:'REVISED',tier:'奢华级',summary:'修订定位说明',recognition:'资料不足',occasion:'正式场合',source:'内部演示测试'};
 const r=await reviseProfile(db,editor,p.id,b);
 assert.equal((await db.query('SELECT name FROM profiles WHERE id=$1',[p.id])).rows[0].name,p.name);
 await assert.rejects(()=>decideRevision(db,editor,r.id,true,'自审'));
 await decideRevision(db,reviewer,r.id,true,'第二人复核');
 assert.equal((await db.query('SELECT name FROM profiles WHERE id=$1',[p.id])).rows[0].name,b.name);
 await assert.rejects(()=>decideRevision(db,reviewer,r.id,true,'再次审批'));
 const r1=await reviseProfile(db,editor,p.id,{...b,name:'版本一'}),r2=await reviseProfile(db,editor,p.id,{...b,name:'过期修改'});
 await decideRevision(db,reviewer,r1.id,true,'新版本');
 await assert.rejects(()=>decideRevision(db,reviewer,r2.id,true,'过期覆盖'));
 assert.equal((await db.query('SELECT name FROM profiles WHERE id=$1',[p.id])).rows[0].name,'版本一');
});
