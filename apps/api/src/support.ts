import {withOfficialMedia} from './official-media.js';
import {randomUUID,createHash} from 'node:crypto';
import type {DB} from './db.js';
import {check,money,settle} from './funds.js';
import {lockRankings,paymentFeedback} from './live-ranking.js';
import {classification,classifications,seedClassifications} from './classification.js';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const brandMark='data:image/svg+xml;base64,'+Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><rect width="256" height="256" fill="#1a1b18"/><circle cx="128" cy="128" r="95" fill="none" stroke="#b7a87d" stroke-width="1"/><text x="128" y="157" text-anchor="middle" font-family="Georgia,serif" font-size="88" fill="#d5c79e">S</text></svg>').toString('base64');
export async function syncCatalogueBrands(db:DB){
 // A published brand shared by categories has one stable funding identity.
 await db.transaction(async t=>{
 const profiles=(await t.query("SELECT * FROM profiles WHERE state='PUBLISHED' ORDER BY updated_at,id")).rows;
 for(const p of profiles){
  if(p.brand_id)continue;
  const key='catalog:'+String(p.name).trim().toLowerCase()+':'+String(p.english).trim().toLowerCase();
  let brand=(await t.query('SELECT id FROM merchants WHERE catalog_key=$1',[key])).rows[0];
  if(!brand){const aid=randomUUID(),id=randomUUID();await t.query('INSERT INTO assets(id,owner_id,data) VALUES($1,NULL,$2)',[aid,brandMark]);
   await t.query("INSERT INTO merchants(id,owner_id,name,logo_asset_id,description,state,catalog_key) VALUES($1,NULL,$2,$3,$4,'APPROVED',$5) ON CONFLICT(catalog_key) DO NOTHING",[id,p.name,aid,p.summary,key]);
   brand=(await t.query('SELECT id FROM merchants WHERE catalog_key=$1',[key])).rows[0];
  }
  await t.query('UPDATE profiles SET brand_id=$1 WHERE id=$2',[brand.id,p.id]);
 }
 });
 await seedClassifications(db);
}
export async function publicMetrics(db:DB,ids:string[],visitor?:string){
 if(!ids.length)return new Map<string,any>();
 const rows=(await db.query(`SELECT m.id,
 (SELECT count(*)::int FROM analytics_events a WHERE a.merchant_id=m.id AND a.kind='VIEW') AS heat,
 (SELECT count(DISTINCT visitor_key)::int FROM analytics_events a WHERE a.merchant_id=m.id AND a.kind='VIEW') AS viewers,
 (SELECT count(*)::int FROM analytics_events a WHERE a.merchant_id=m.id AND a.kind='IMPRESSION') AS impressions,
 (SELECT count(*)::int FROM analytics_events a WHERE a.merchant_id=m.id AND a.kind='WEBSITE') AS website_clicks,
 (SELECT count(*)::int FROM analytics_events a WHERE a.merchant_id=m.id AND a.kind='STORE') AS store_clicks,
 (SELECT count(*)::int FROM analytics_events a WHERE a.merchant_id=m.id AND a.kind='LIVE') AS live_clicks,
 (SELECT count(*)::int FROM brand_follows f WHERE f.merchant_id=m.id) AS followers,
 EXISTS(SELECT 1 FROM brand_follows f WHERE f.merchant_id=m.id AND f.visitor_key=$2) AS followed,
 (SELECT count(DISTINCT COALESCE(o.supporter_key,o.actor_id::text))::int FROM orders o JOIN merchant_categories e ON e.id=o.entry_id WHERE e.merchant_id=m.id AND o.state='PAID') AS supporters
 FROM merchants m WHERE m.id=ANY($1::uuid[])`,[ids,visitor||''])).rows;
 return new Map(rows.map(r=>[r.id,r]));
}
export async function enrichBrands(db:DB,rows:any[],visitor?:string){
 const ids=[...new Set(rows.map(r=>r.brand_id||r.merchant_id||r.id))] as string[];
 const [metrics,classes,identities]=await Promise.all([publicMetrics(db,ids,visitor),classifications(db,ids),db.query("SELECT DISTINCT ON (p.brand_id) p.brand_id,p.english FROM profiles p JOIN categories c ON c.id=p.category_id WHERE p.brand_id=ANY($1::uuid[]) AND p.state='PUBLISHED' AND NOT p.demo AND c.active ORDER BY p.brand_id,c.sort_order,p.id",[ids])]);
 const identity=new Map(identities.rows.map(r=>[r.brand_id,r.english]));
 return rows.map(r=>({...withOfficialMedia({...r,english:r.english||identity.get(r.brand_id||r.merchant_id||r.id)}),classification:classes.get(r.brand_id||r.merchant_id||r.id)||{state:'UNSET',version:0},category_names:classes.get(r.brand_id||r.merchant_id||r.id)?.categoryName?[classes.get(r.brand_id||r.merchant_id||r.id).categoryName]:classes.get(r.brand_id||r.merchant_id||r.id)?.suggestedCategoryName?[classes.get(r.brand_id||r.merchant_id||r.id).suggestedCategoryName]:[],stats:metrics.get(r.brand_id||r.merchant_id||r.id)||{heat:0,viewers:0,followers:0,followed:false,supporters:0}}));
}
export async function supportBrands(db:DB,visitor?:string){
 const rows=(await db.query(`SELECT m.id,m.id AS merchant_id,m.name,m.description,a.data AS logo,
 COALESCE((SELECT sum(net_fen)::bigint FROM merchant_categories WHERE merchant_id=m.id),0) AS net_fen,
 COALESCE((SELECT jsonb_agg(x ORDER BY x.sort_order) FROM
 (SELECT DISTINCT c.id,c.name,c.sort_order FROM categories c
 WHERE c.active AND (EXISTS(SELECT 1 FROM profiles p WHERE p.brand_id=m.id AND p.category_id=c.id AND p.state='PUBLISHED')
 OR EXISTS(SELECT 1 FROM merchant_categories e WHERE e.merchant_id=m.id AND e.category_id=c.id))) x),'[]'::jsonb) AS categories
 FROM merchants m JOIN assets a ON a.id=m.logo_asset_id WHERE m.state='APPROVED'
 AND (m.catalog_key IS NULL OR EXISTS(SELECT 1 FROM profiles p JOIN categories c ON c.id=p.category_id WHERE p.brand_id=m.id AND p.state='PUBLISHED' AND c.active))
 ORDER BY m.name,m.id`)).rows;
 return enrichBrands(db,rows.map(r=>({...r,net_fen:Number(r.net_fen)})),visitor);
}
export async function followBrand(db:DB,brandId:string,visitor:string,followed:boolean){
 check(uuid.test(brandId)&&typeof followed==='boolean','关注参数无效');
 check((await db.query("SELECT id FROM merchants WHERE id=$1 AND state='APPROVED'",[brandId])).rows.length,'品牌不可用',404);
 if(followed)await db.query('INSERT INTO brand_follows(merchant_id,visitor_key) VALUES($1,$2) ON CONFLICT DO NOTHING',[brandId,visitor]);
 else await db.query('DELETE FROM brand_follows WHERE merchant_id=$1 AND visitor_key=$2',[brandId,visitor]);
 return {ok:true,stats:(await publicMetrics(db,[brandId],visitor)).get(brandId)};
}
export async function createSupportOrder(db:DB,visitor:string,body:any,key:string,actorId?:string){
 check(body&&Object.keys(body).every(k=>['merchantId','categoryId','amountFen'].includes(k)),'助力参数无效');
 check(uuid.test(body.merchantId)&&(body.categoryId===undefined||uuid.test(body.categoryId)),'请选择有效品牌与品类');money(body.amountFen);
 check(typeof key==='string'&&uuid.test(key),'缺少有效助力请求编号');
 const hash=createHash('sha256').update(JSON.stringify({merchantId:body.merchantId,categoryId:body.categoryId||null,amountFen:body.amountFen})).digest('hex');
 return db.transaction(async t=>{
  await lockRankings(t);
  await t.query('INSERT INTO public_visitors VALUES($1) ON CONFLICT DO NOTHING',[visitor]);
  await t.query('SELECT visitor_key FROM public_visitors WHERE visitor_key=$1 FOR UPDATE',[visitor]);
  const old=(await t.query('SELECT * FROM support_requests WHERE visitor_key=$1 AND key=$2',[visitor,key])).rows[0];
  if(old){check(old.body_hash===hash,'同一请求编号不能用于不同的助力',409);return old.response;}
  const brand=(await t.query("SELECT * FROM merchants WHERE id=$1 AND state='APPROVED' FOR UPDATE",[body.merchantId])).rows[0];check(brand,'品牌不可用',404);
  const assignment=await classification(t,brand.id),fixed=assignment.categoryId||assignment.suggestedCategoryId;
  if(fixed&&body.categoryId!==undefined)check(body.categoryId===fixed,'该品牌的品类已固定；如有错误请提交品类纠错',409);
  const categoryId=fixed||body.categoryId;check(categoryId,'首次助力请提交建议品类');
  check((await t.query('SELECT id FROM categories WHERE id=$1 AND active',[categoryId])).rows.length,'品类不可用，请联系平台核实');
  if(!fixed&&brand.catalog_key)check((await t.query("SELECT id FROM profiles WHERE brand_id=$1 AND category_id=$2 AND state='PUBLISHED'",[brand.id,categoryId])).rows.length,'该品牌不属于所选品类');
  await t.query('INSERT INTO merchant_categories(id,merchant_id,category_id) VALUES($1,$2,$3) ON CONFLICT(merchant_id,category_id) DO NOTHING',[randomUUID(),brand.id,categoryId]);
  const entry=(await t.query('SELECT id FROM merchant_categories WHERE merchant_id=$1 AND category_id=$2',[brand.id,categoryId])).rows[0];
  const id=randomUUID();await t.query("INSERT INTO orders(id,actor_id,entry_id,amount_fen,supporter_key,recipient) VALUES($1,$2,$3,$4,$5,'PLATFORM')",[id,actorId||null,entry.id,body.amountFen,visitor]);
  const response={id,state:'PENDING',amountFen:body.amountFen,brandId:brand.id,brandName:brand.name,recipient:'PLATFORM',refundSupported:false};
  await t.query('INSERT INTO support_requests VALUES($1,$2,$3,$4)',[visitor,key,hash,JSON.stringify(response)]);
  return response;
 });
}
export async function paySupportOrder(db:DB,visitor:string,id:string){
 check(uuid.test(id),'订单编号无效');
 return db.transaction(async t=>{
  await lockRankings(t);
  const o=(await t.query('SELECT * FROM orders WHERE id=$1 AND supporter_key=$2 FOR UPDATE',[id,visitor])).rows[0];check(o,'订单不存在或不属于当前访客',404);
  const b=(await t.query("SELECT m.id AS merchant_id,m.state,c.active FROM merchant_categories e JOIN merchants m ON m.id=e.merchant_id LEFT JOIN brand_classifications b ON b.merchant_id=m.id JOIN categories c ON c.id=COALESCE(b.category_id,b.suggested_category_id,e.category_id) WHERE e.id=$1",[o.entry_id])).rows[0];check(b?.state==='APPROVED'&&b.active,'品牌或品类当前不可助力');
  const paid=await settle(t,o.id,'sandbox-'+o.id,Number(o.amount_fen));
  return {id:paid.id,state:paid.state,amountFen:Number(paid.amount_fen),recipient:'PLATFORM',refundSupported:false,classification:await classification(t,b.merchant_id),event:await paymentFeedback(t,paid.id)};
 });
}
export async function visitorOrders(db:DB,visitor:string){
 return (await db.query(`SELECT o.id,o.amount_fen,o.state,o.created_at,o.recipient,m.name,e.category_id,c.name AS category_name
 FROM orders o JOIN merchant_categories e ON e.id=o.entry_id JOIN merchants m ON m.id=e.merchant_id JOIN categories c ON c.id=e.category_id
 WHERE o.supporter_key=$1 ORDER BY o.created_at DESC LIMIT 100`,[visitor])).rows;
}
