
import {randomUUID,createHash} from 'node:crypto';
import type {DB} from './db.js';
import {captureFirstCategory} from './classification.js';
import {lockRankings,syncRankingHeads,recordRankingPayment} from './live-ranking.js';
export class DomainError extends Error{constructor(public status:number,message:string){super(message)}}
export const check=(condition:any,message:string,status=400)=>{if(!condition)throw new DomainError(status,message)};
export const money=(n:any)=>check(Number.isSafeInteger(n)&&n>=100&&n<=10000000&&n%100===0,'金额须为1至100000元的整数元');
export async function idem(t:DB,actor:string,op:string,key:string,body:any,fn:()=>Promise<any>){
 check(key&&key.length<=100,'缺少有效 Idempotency-Key');
 await t.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[actor]);
 const hash=createHash('sha256').update(JSON.stringify(body)).digest('hex');
 const old=(await t.query('SELECT * FROM idempotency WHERE actor_id=$1 AND operation=$2 AND key=$3',[actor,op,key])).rows[0];
 if(old){check(old.body_hash===hash,'同一幂等键不能用于不同参数',409);return old.response;}
 const response=await fn();await t.query('INSERT INTO idempotency VALUES($1,$2,$3,$4,$5)',[actor,op,key,hash,JSON.stringify(response)]);return response;
}
export async function audit(t:DB,actor:string,action:string,target:string,reason=''){await t.query('INSERT INTO audit_logs VALUES($1,$2,$3,$4,$5,now())',[randomUUID(),actor,action,target,reason]);}
export async function settle(t:DB,orderId:string,reference:string,amount:number){
 await lockRankings(t);
 const o=(await t.query('SELECT * FROM orders WHERE id=$1 FOR UPDATE',[orderId])).rows[0];check(o,'订单不存在',404);check(Number(o.amount_fen)===amount,'渠道金额不匹配');
 const prior=(await t.query('SELECT * FROM receipts WHERE provider_ref=$1',[reference])).rows[0];
 if(prior){check(prior.order_id===orderId,'渠道交易已关联其他订单',409);return o;}
 if(o.state==='PAID')return o;
 check(o.state==='PENDING','订单状态不可收款');
 await t.query('SELECT id FROM merchant_categories WHERE id=$1 FOR UPDATE',[o.entry_id]);
 await t.query('INSERT INTO receipts VALUES($1,$2,$3,$4,true)',[randomUUID(),o.id,reference,amount]);
 await t.query("INSERT INTO rank_ledger VALUES($1,$2,$3,NULL,'CREDIT',$4,now())",[randomUUID(),o.entry_id,o.id,amount]);
 await t.query('UPDATE merchant_categories SET gross_fen=gross_fen+$1,net_fen=net_fen+$1,attained_at=now() WHERE id=$2',[amount,o.entry_id]);
 await captureFirstCategory(t,o.entry_id);
 await t.query("UPDATE orders SET state='PAID' WHERE id=$1",[o.id]);
 await t.query('INSERT INTO outbox VALUES($1,$2,$3,now())',[randomUUID(),'PaymentAccepted',JSON.stringify({orderId:o.id})]);
 await recordRankingPayment(t,o);
 await syncRankingHeads(t);
 return {...o,state:'PAID'};
}
export async function refund(_t:DB,_orderId:string,_amount:number):Promise<any>{check(false,'助力款不支持退款',405);}
export async function board(db:DB,category:string){
 const rows=(await db.query(`
 SELECT m.id,m.id AS merchant_id,m.name,m.description,a.data AS logo,COALESCE(b.category_id,b.suggested_category_id) AS category_id,c.name AS category_name,ARRAY[c.name] AS category_names,
 sum(e.gross_fen) AS gross_fen,sum(e.refunded_fen) AS refunded_fen,sum(e.net_fen) AS net_fen,max(e.attained_at) AS attained_at
 FROM merchants m JOIN assets a ON a.id=m.logo_asset_id JOIN merchant_categories e ON e.merchant_id=m.id
 JOIN brand_classifications b ON b.merchant_id=m.id AND b.state IN ('CONFIRMED','PENDING')
 JOIN categories c ON c.id=COALESCE(b.category_id,b.suggested_category_id)
 WHERE COALESCE(b.category_id,b.suggested_category_id)=$1 AND c.active AND m.state='APPROVED'
 GROUP BY m.id,m.name,m.description,a.data,b.category_id,b.suggested_category_id,c.name
 HAVING sum(e.net_fen)>0 ORDER BY sum(e.net_fen) DESC,max(e.attained_at),min(e.id::text)
 `,[category])).rows;
 return rows.map((row,index)=>({...row,rank:index+1,gross_fen:Number(row.gross_fen),refunded_fen:Number(row.refunded_fen),net_fen:Number(row.net_fen)}));
}

export async function globalBoard(db:DB){
 const rows=(await db.query(`
 SELECT m.id,m.id AS merchant_id,m.name,m.description,a.data AS logo,
 sum(e.gross_fen) AS gross_fen,sum(e.refunded_fen) AS refunded_fen,
 sum(e.net_fen) AS net_fen,max(e.attained_at) AS attained_at,
 array_agg(DISTINCT c.name ORDER BY c.name) FILTER (WHERE e.net_fen>0) AS category_names
 FROM merchants m JOIN assets a ON a.id=m.logo_asset_id
 JOIN merchant_categories e ON e.merchant_id=m.id
 JOIN categories c ON c.id=e.category_id
 WHERE m.state='APPROVED'
 GROUP BY m.id,m.name,m.description,a.data
 HAVING sum(e.net_fen)>0
 ORDER BY sum(e.net_fen) DESC,max(e.attained_at),m.id
 `)).rows;
 return rows.map((r,i)=>({...r,rank:i+1,scope:'GLOBAL',gross_fen:Number(r.gross_fen),refunded_fen:Number(r.refunded_fen),net_fen:Number(r.net_fen)}));
}
