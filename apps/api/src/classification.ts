import {randomUUID} from 'node:crypto';
import type {DB} from './db.js';
import {check,audit} from './funds.js';
import {lockRankings,syncRankingHeads} from './live-ranking.js';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const map=(row:any)=>row?{state:row.state,categoryId:row.category_id,categoryName:row.category_name,suggestedCategoryId:row.suggested_category_id,suggestedCategoryName:row.suggested_category_name,version:row.version,source:row.source}:({state:'UNSET',categoryId:null,categoryName:null,suggestedCategoryId:null,suggestedCategoryName:null,version:0,source:'EMPTY'});
export async function classifications(db:DB,ids:string[]){
 if(!ids.length)return new Map<string,any>();
 const rows=(await db.query('SELECT b.*,c.name AS category_name,s.name AS suggested_category_name FROM brand_classifications b LEFT JOIN categories c ON c.id=b.category_id LEFT JOIN categories s ON s.id=b.suggested_category_id WHERE b.merchant_id=ANY($1::uuid[])',[ids])).rows;
 return new Map(rows.map(row=>[row.merchant_id,map(row)]));
}
export async function classification(db:DB,id:string){return (await classifications(db,[id])).get(id)||map(null);}
export async function seedClassifications(db:DB){
 // Only one published platform category can be adopted automatically. Ambiguous and legacy entries await review.
 await db.query(`
 INSERT INTO brand_classifications(merchant_id,category_id,suggested_category_id,state,source,suggested_at,reason)
 SELECT m.id,
 CASE WHEN p.count=1 THEN p.category_id ELSE NULL END,
 CASE WHEN p.count=1 THEN p.category_id ELSE e.category_id END,
 CASE WHEN p.count=1 THEN 'CONFIRMED' WHEN e.category_id IS NOT NULL THEN 'PENDING' ELSE 'UNSET' END,
 CASE WHEN p.count=1 THEN 'CATALOG' WHEN e.category_id IS NOT NULL THEN 'LEGACY' ELSE 'EMPTY' END,
 CASE WHEN e.category_id IS NOT NULL THEN clock_timestamp() ELSE NULL END,
 CASE WHEN p.count=1 THEN '沿用已发布品牌资料的唯一品类' WHEN e.category_id IS NOT NULL THEN '历史品类待平台核实' ELSE '' END
 FROM merchants m
 LEFT JOIN LATERAL (SELECT count(DISTINCT category_id)::int AS count,min(category_id::text)::uuid AS category_id FROM profiles WHERE brand_id=m.id AND state='PUBLISHED') p ON true
 LEFT JOIN LATERAL (SELECT category_id FROM merchant_categories WHERE merchant_id=m.id AND net_fen>0 ORDER BY attained_at,id LIMIT 1) e ON true
 ON CONFLICT(merchant_id) DO NOTHING
 `);
}
export async function captureFirstCategory(t:DB,entryId:string){
 const entry=(await t.query('SELECT merchant_id,category_id FROM merchant_categories WHERE id=$1',[entryId])).rows[0];
 await t.query(`INSERT INTO brand_classifications(merchant_id,suggested_category_id,state,source,suggested_at,reason)
 VALUES($1,$2,'PENDING','FIRST_SUPPORT',clock_timestamp(),'首次成功助力提交的品类建议')
 ON CONFLICT(merchant_id) DO UPDATE SET suggested_category_id=EXCLUDED.suggested_category_id,state='PENDING',source='FIRST_SUPPORT',suggested_at=EXCLUDED.suggested_at,reason=EXCLUDED.reason,version=brand_classifications.version+1
 WHERE brand_classifications.state='UNSET'`,[entry.merchant_id,entry.category_id]);
}
export async function reportCategory(db:DB,visitor:string,id:string,body:any){
 check(uuid.test(id)&&body&&Object.keys(body).every(key=>['categoryId','reason'].includes(key))&&uuid.test(body.categoryId),'请选择建议品类');
 const reason=String(body.reason||'').trim();check(reason.length>=5&&reason.length<=1000,'请填写5至1000字纠错依据');
 return db.transaction(async t=>{
  await lockRankings(t);
  check((await t.query("SELECT id FROM merchants WHERE id=$1 AND state='APPROVED'",[id])).rows.length,'品牌不可用',404);
  check((await t.query('SELECT id FROM categories WHERE id=$1 AND active',[body.categoryId])).rows.length,'建议品类不可用');
  const prior=(await t.query("SELECT id FROM brand_category_reports WHERE merchant_id=$1 AND visitor_key=$2 AND state='OPEN'",[id,visitor])).rows[0];
  if(prior){await t.query('UPDATE brand_category_reports SET suggested_category_id=$1,reason=$2,updated_at=clock_timestamp() WHERE id=$3',[body.categoryId,reason,prior.id]);return {id:prior.id,state:'OPEN'};}
  const recent=(await t.query("SELECT count(*)::int AS n FROM brand_category_reports WHERE visitor_key=$1 AND created_at>clock_timestamp()-interval '1 hour'",[visitor])).rows[0].n;
  check(recent<10,'提交较频繁，请稍后再试',429);
  const reportId=randomUUID();await t.query('INSERT INTO brand_category_reports(id,merchant_id,visitor_key,suggested_category_id,reason) VALUES($1,$2,$3,$4,$5)',[reportId,id,visitor,body.categoryId,reason]);
  return {id:reportId,state:'OPEN'};
 });
}
export async function reviewClassification(db:DB,actorId:string,id:string,body:any){
 check(uuid.test(id)&&body&&Object.keys(body).every(key=>['categoryId','version','reason'].includes(key))&&uuid.test(body.categoryId),'归类参数无效');
 check(Number.isSafeInteger(body.version)&&body.version>=0,'请刷新归类版本');
 const reason=String(body.reason||'').trim();check(reason.length>=5&&reason.length<=1000,'请填写5至1000字审核依据');
 return db.transaction(async t=>{
  await lockRankings(t);
  const actor=(await t.query('SELECT role FROM users WHERE id=$1',[actorId])).rows[0];check(actor&&['ADMIN','REVIEWER'].includes(actor.role),'只有平台审核人员可以确认品类',403);
  check((await t.query('SELECT id FROM merchants WHERE id=$1 FOR UPDATE',[id])).rows.length,'品牌不存在',404);
  check((await t.query('SELECT id FROM categories WHERE id=$1 AND active',[body.categoryId])).rows.length,'请选择启用品类');
  const before=(await t.query('SELECT * FROM brand_classifications WHERE merchant_id=$1 FOR UPDATE',[id])).rows[0];
  check((before?.version||0)===body.version,'品类归属已更新，请刷新后重试',409);
  const version=body.version+1;
  await t.query(`INSERT INTO brand_classifications(merchant_id,category_id,state,source,version,reviewed_by,reviewed_at,reason)
   VALUES($1,$2,'CONFIRMED','PLATFORM',$3,$4,clock_timestamp(),$5)
   ON CONFLICT(merchant_id) DO UPDATE SET category_id=EXCLUDED.category_id,state='CONFIRMED',source='PLATFORM',version=EXCLUDED.version,reviewed_by=EXCLUDED.reviewed_by,reviewed_at=EXCLUDED.reviewed_at,reason=EXCLUDED.reason`,[id,body.categoryId,version,actorId,reason]);
  await t.query('INSERT INTO brand_category_history(id,merchant_id,actor_id,before_category_id,after_category_id,before_state,reason,version) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[randomUUID(),id,actorId,before?.category_id||null,body.categoryId,before?.state||'UNSET',reason,version]);
  await t.query("UPDATE brand_category_reports SET state='RESOLVED',resolution=$1,updated_at=clock_timestamp() WHERE merchant_id=$2 AND state='OPEN'",[reason,id]);
  await audit(t,actorId,'CLASSIFY_BRAND',id,JSON.stringify({from:before?.category_id||null,to:body.categoryId,reason,version}));
  await syncRankingHeads(t);
  return {ok:true,classification:await classification(t,id)};
 });
}
export async function classificationQueue(db:DB){
 const items=(await db.query(`SELECT m.id,m.name,m.state AS merchant_state,b.state AS classification_state,b.category_id,b.suggested_category_id,COALESCE(b.version,0) AS version,b.source,b.reason,c.name AS category_name,s.name AS suggested_category_name,
 (SELECT COALESCE(sum(net_fen),0)::text FROM merchant_categories WHERE merchant_id=m.id) AS net_fen,
 (SELECT count(*)::int FROM brand_category_reports WHERE merchant_id=m.id AND state='OPEN') AS reports
 FROM merchants m LEFT JOIN brand_classifications b ON b.merchant_id=m.id LEFT JOIN categories c ON c.id=b.category_id LEFT JOIN categories s ON s.id=b.suggested_category_id
 ORDER BY (SELECT count(*) FROM brand_category_reports WHERE merchant_id=m.id AND state='OPEN') DESC,(b.state='PENDING') DESC NULLS LAST,m.name`)).rows.map(row=>({...row,classification_state:row.classification_state||'UNSET',net_fen:Number(row.net_fen)}));
 const reports=(await db.query(`SELECT r.id,r.merchant_id,r.suggested_category_id,r.reason,r.state,r.resolution,r.created_at,c.name AS suggested_category_name FROM brand_category_reports r JOIN categories c ON c.id=r.suggested_category_id ORDER BY r.created_at DESC LIMIT 200`)).rows;
 const history=(await db.query('SELECT h.*,b.name AS before_name,a.name AS after_name FROM brand_category_history h LEFT JOIN categories b ON b.id=h.before_category_id JOIN categories a ON a.id=h.after_category_id ORDER BY created_at DESC LIMIT 200')).rows;
 return {items,reports,history};
}
