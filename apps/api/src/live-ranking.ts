import type {DB} from './db.js';
import {board,globalBoard,check} from './funds.js';

// The singleton lock serializes changes to all scopes, including cross-category totals.
export async function lockRankings(t:DB){
 await t.query('SELECT id FROM ranking_lock WHERE id=1 FOR UPDATE');
}
export async function syncRankingHeads(t:DB){
 await t.query(`
 WITH candidates AS (
  SELECT 'global' AS scope,m.id AS merchant_id,sum(e.net_fen) AS amount,max(e.attained_at) AS achieved,m.id::text AS tie
  FROM merchants m JOIN merchant_categories e ON e.merchant_id=m.id
  WHERE m.state='APPROVED' GROUP BY m.id HAVING sum(e.net_fen)>0
  UNION ALL
  SELECT 'category:'||COALESCE(b.category_id,b.suggested_category_id)::text,m.id,sum(e.net_fen),max(e.attained_at),min(e.id::text)
  FROM merchant_categories e JOIN merchants m ON m.id=e.merchant_id
  JOIN brand_classifications b ON b.merchant_id=m.id AND b.state IN ('CONFIRMED','PENDING') JOIN categories c ON c.id=COALESCE(b.category_id,b.suggested_category_id)
  WHERE m.state='APPROVED' AND c.active GROUP BY b.category_id,b.suggested_category_id,m.id HAVING sum(e.net_fen)>0
 ), winners AS (
  SELECT DISTINCT ON(scope) scope,merchant_id FROM candidates ORDER BY scope,amount DESC,achieved,tie
 ), scopes AS (
  SELECT 'global' AS scope UNION SELECT 'category:'||id::text FROM categories
 )
 INSERT INTO ranking_heads(scope,merchant_id,since)
 SELECT s.scope,w.merchant_id,CASE WHEN w.merchant_id IS NULL THEN NULL ELSE clock_timestamp() END
 FROM scopes s LEFT JOIN winners w ON w.scope=s.scope
 ON CONFLICT(scope) DO UPDATE SET merchant_id=EXCLUDED.merchant_id,since=EXCLUDED.since
 WHERE ranking_heads.merchant_id IS DISTINCT FROM EXCLUDED.merchant_id
 `);
}
export async function recordRankingPayment(t:DB,order:any){
 const entry=(await t.query('SELECT merchant_id,category_id FROM merchant_categories WHERE id=$1',[order.entry_id])).rows[0];
 const previous=(await t.query("SELECT combo FROM ranking_payments WHERE merchant_id=$1 AND paid_at>=clock_timestamp()-interval '30 seconds' ORDER BY seq DESC LIMIT 1",[entry.merchant_id])).rows[0];
 await t.query('INSERT INTO ranking_payments(order_id,merchant_id,category_id,amount_fen,combo) VALUES($1,$2,$3,$4,$5) ON CONFLICT(order_id) DO NOTHING',[order.id,entry.merchant_id,entry.category_id,order.amount_fen,Math.min(999,(previous?.combo||0)+1)]);
}
export async function rankingSnapshot(db:DB,category?:string,after?:string){
 if(after!==undefined)check(typeof after==='string'&&/^\d{1,19}$/.test(after)&&BigInt(after)<=9223372036854775807n,'榜单游标无效');
 return db.transaction(async t=>{
  await lockRankings(t);
  await syncRankingHeads(t);
  const scope=category?'category:'+category:'global';
  const head=(await t.query('SELECT * FROM ranking_heads WHERE scope=$1',[scope])).rows[0];
  const items=category?await board(t,category):await globalBoard(t);
  const serverTime=(await t.query('SELECT clock_timestamp() AS time')).rows[0].time;
  const activityCursor=(await t.query('SELECT COALESCE(max(seq),0)::text AS cursor FROM ranking_payments')).rows[0].cursor;
  const events=after===undefined?[]:(await t.query(`SELECT * FROM (SELECT p.seq::text AS id,p.merchant_id,COALESCE(b.category_id,b.suggested_category_id) AS category_id,p.amount_fen,p.combo,p.paid_at,m.name FROM ranking_payments p JOIN merchants m ON m.id=p.merchant_id LEFT JOIN brand_classifications b ON b.merchant_id=p.merchant_id AND b.state IN ('CONFIRMED','PENDING') WHERE p.seq>$1::bigint AND ($2::uuid IS NULL OR COALESCE(b.category_id,b.suggested_category_id)=$2) AND m.state='APPROVED' ORDER BY p.seq DESC LIMIT 20) recent ORDER BY id::bigint`,[after,category||null])).rows.map(e=>({...e,amount_fen:Number(e.amount_fen)}));
  return {items,events,activityCursor,scope,leaderSince:head?.merchant_id===(items[0]?.merchant_id||items[0]?.id)?head?.since:null,trackingSince:head?.tracked_from||null,serverTime,updatedAt:serverTime,refreshIntervalMs:3000};
 });
}

export async function paymentFeedback(t:DB,orderId:string){
 const event=(await t.query(`SELECT p.seq::text AS id,p.merchant_id,COALESCE(b.category_id,b.suggested_category_id) AS category_id,p.amount_fen,p.combo,p.paid_at,m.name FROM ranking_payments p JOIN merchants m ON m.id=p.merchant_id LEFT JOIN brand_classifications b ON b.merchant_id=p.merchant_id AND b.state IN ('CONFIRMED','PENDING') WHERE p.order_id=$1`,[orderId])).rows[0];
 return event?{...event,amount_fen:Number(event.amount_fen)}:null;
}
