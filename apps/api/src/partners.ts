import {randomUUID,createHash} from 'node:crypto';
import type {DB} from './db.js';
import {check,audit} from './funds.js';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hash=(v:any)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const fields=(v:any,keys:string[])=>check(v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).every(k=>keys.includes(k)),'提交字段无效');
const text=(v:any,max:number,label:string,required=false)=>{check(typeof v==='string'&&v.length<=max,label+'格式或长度无效');const s=v.trim().normalize('NFKC');check(!required||s.length>0,'请填写'+label);return s;};
const id=(v:any)=>{check(typeof v==='string'&&uuid.test(v),'编号无效');return v;};
const phone=(v:any)=>{const s=text(v,24,'电话');check(!s||/^\+?[\d ()-]{7,24}$/.test(s)&&s.replace(/\D/g,'').length>=7,'电话号码无效');return s;};
async function staff(db:DB,actor:string){check((await db.query("SELECT id FROM users WHERE id=$1 AND role IN ('ADMIN','REVIEWER')",[actor])).rows.length,'没有审核权限',403);}
async function brandsAvailable(db:DB,ids:string[]){const rows=(await db.query("SELECT id FROM merchants WHERE id=ANY($1::uuid[]) AND state='APPROVED'",[ids])).rows;check(rows.length===ids.length,'关联品牌不存在或不可展示');}
export async function normalizePartner(db:DB,value:any){
 fields(value,['kind','name','city','address','hours','description','affiliation','brandIds','phone','wechat','consent']);
 check(['STORE','SALES'].includes(value.kind),'请选择门店或销售');
 const brandIds=value.brandIds;check(Array.isArray(brandIds)&&brandIds.length>0&&brandIds.length<=10&&new Set(brandIds).size===brandIds.length,'请选择1至10个不重复品牌');brandIds.forEach(id);await brandsAvailable(db,brandIds);
 const p={kind:value.kind,name:text(value.name,80,'展示名称',true),city:text(value.city,40,'城市',true),address:text(value.address||'',300,'门店地址'),hours:text(value.hours||'',120,'营业时间'),description:text(value.description||'',2000,'服务介绍'),affiliation:text(value.affiliation||'',120,'所属门店'),brandIds,phone:phone(value.phone||''),wechat:text(value.wechat||'',60,'微信'),consent:value.consent};
 check(p.kind!=='STORE'||p.address,'请填写门店地址');check(p.kind!=='SALES'||p.affiliation,'请填写所属门店或业务身份');
 check(!p.wechat||/^[a-zA-Z0-9_-]{5,60}$/.test(p.wechat),'微信号须为5至60位字母、数字、下划线或短横线');
 check(p.phone||p.wechat,'请至少提供电话或微信');check(p.consent===true,'请确认有权公开所填业务信息');
 return p;
}
export async function submitPartner(db:DB,owner:string,body:any,listingId?:string,key?:string){
 const payload=await normalizePartner(db,body);
 return db.transaction(async t=>{
 if(listingId){id(listingId);const row=(await t.query('SELECT * FROM partner_listings WHERE id=$1 AND owner_key=$2 FOR UPDATE',[listingId,owner])).rows[0];check(row,'资料不存在或无权修改',404);
 const pending=(await t.query("SELECT * FROM partner_revisions WHERE listing_id=$1 AND state='PENDING'",[listingId])).rows[0];if(pending){check(hash(await normalizePartner(t,pending.payload))===hash(payload),'已有修订待审核',409);return {id:listingId,revisionId:pending.id,state:'PENDING'};}
 const revision=randomUUID();await t.query('INSERT INTO partner_revisions(id,listing_id,payload,base_version) VALUES($1,$2,$3,$4)',[revision,listingId,JSON.stringify(payload),row.version]);return {id:listingId,revisionId:revision,state:'PENDING'};
 }
 id(key);const digest=hash(payload),old=(await t.query('SELECT id,body_hash,status FROM partner_listings WHERE owner_key=$1 AND request_key=$2',[owner,key])).rows[0];if(old){check(old.body_hash===digest,'同一申请编号不能用于其他资料',409);return {id:old.id,state:old.status};}
 check(Number((await t.query("SELECT count(*) AS n FROM partner_listings WHERE owner_key=$1 AND created_at>now()-interval '1 hour'",[owner])).rows[0].n)<10,'提交较频繁，请稍后再试',429);
 const newId=randomUUID();await t.query('INSERT INTO partner_listings(id,owner_key,payload,request_key,body_hash) VALUES($1,$2,$3,$4,$5) ON CONFLICT(owner_key,request_key) DO NOTHING',[newId,owner,JSON.stringify(payload),key,digest]);
 const created=(await t.query('SELECT id,body_hash,status FROM partner_listings WHERE owner_key=$1 AND request_key=$2',[owner,key])).rows[0];check(created.body_hash===digest,'同一申请编号不能用于其他资料',409);return {id:created.id,state:created.status};
 });
}
export async function partnerQueue(db:DB){return {items:(await db.query('SELECT id,status,payload,verification,verification_reason,version,review_reason,created_at FROM partner_listings ORDER BY created_at DESC LIMIT 500')).rows,revisions:(await db.query("SELECT * FROM partner_revisions WHERE state='PENDING' ORDER BY created_at")).rows};}
export async function reviewPartner(db:DB,actor:string,listingId:string,body:any){
 await staff(db,actor);id(listingId);fields(body,['version','approved','reason','verification','verificationReason','revisionId']);
 check(Number.isSafeInteger(body.version)&&typeof body.approved==='boolean','审核参数无效');const reason=text(body.reason,1000,'审核依据',true),verification=body.verification||'INDEPENDENT',evidence=text(body.verificationReason||'',1000,'身份核验依据');
 check(['INDEPENDENT','OFFICIAL','AUTHORIZED'].includes(verification),'身份标识无效');check(verification==='INDEPENDENT'||evidence,'官方或授权标识须填写核验依据');
 return db.transaction(async t=>{
 const listing=(await t.query('SELECT * FROM partner_listings WHERE id=$1 FOR UPDATE',[listingId])).rows[0];check(listing,'资料不存在',404);check(listing.version===body.version,'资料已更新，请刷新后审核',409);
 let payload=listing.payload;
 if(body.revisionId){id(body.revisionId);const revision=(await t.query("SELECT * FROM partner_revisions WHERE id=$1 AND listing_id=$2 AND state='PENDING' FOR UPDATE",[body.revisionId,listingId])).rows[0];check(revision,'修订已处理或不存在',409);if(body.approved)check(revision.base_version===listing.version,'修订版本过期，请退回后重新提交',409);payload=revision.payload;
 await t.query('UPDATE partner_revisions SET state=$1,reason=$2 WHERE id=$3',[body.approved?'APPROVED':'REJECTED',reason,revision.id]);
 }else check(['PENDING','REJECTED'].includes(listing.status),'请使用修订审核或展示状态入口',409);
 if(body.approved){await normalizePartner(t,payload);await t.query("UPDATE partner_listings SET payload=$1,status='APPROVED',verification=$2,verification_reason=$3,review_reason=$4,version=version+1,updated_at=now() WHERE id=$5",[JSON.stringify(payload),verification,evidence,reason,listingId]);}
 else if(!body.revisionId)await t.query("UPDATE partner_listings SET status='REJECTED',review_reason=$1,version=version+1,updated_at=now() WHERE id=$2",[reason,listingId]);
 await audit(t,actor,'REVIEW_PARTNER',listingId,reason);return {ok:true};
 });
}
export async function partnerVisibility(db:DB,actor:string,listingId:string,body:any){
 await staff(db,actor);id(listingId);fields(body,['visible','version','reason']);check(typeof body.visible==='boolean'&&Number.isSafeInteger(body.version),'展示参数无效');const reason=text(body.reason,1000,'处理依据',true);
 return db.transaction(async t=>{const row=(await t.query('SELECT * FROM partner_listings WHERE id=$1 FOR UPDATE',[listingId])).rows[0];check(row&&['APPROVED','HIDDEN'].includes(row.status),'尚未通过审核',409);check(row.version===body.version,'版本已更新',409);if(body.visible)await normalizePartner(t,row.payload);await t.query('UPDATE partner_listings SET status=$1,version=version+1,updated_at=now() WHERE id=$2',[body.visible?'APPROVED':'HIDDEN',listingId]);await audit(t,actor,'PARTNER_VISIBILITY',listingId,reason);return {ok:true};});
}
const safe=(r:any)=>({id:r.id,kind:r.payload.kind,name:r.payload.name,city:r.payload.city,address:r.payload.address,hours:r.payload.hours,description:r.payload.description,affiliation:r.payload.affiliation,brandIds:r.payload.brandIds,hasPhone:!!r.payload.phone,hasWechat:!!r.payload.wechat,verification:r.verification});
export async function publicPartners(db:DB,brandId:string,city=''){
 id(brandId);await brandsAvailable(db,[brandId]);city=text(city,40,'城市');
 const rows=(await db.query("SELECT * FROM partner_listings WHERE status='APPROVED' AND payload->'brandIds' @> $1::jsonb ORDER BY created_at,id",[JSON.stringify([brandId])])).rows;
 const campaigns=(await db.query("SELECT c.* FROM partner_campaigns c JOIN partner_listings l ON l.id=c.listing_id WHERE c.brand_id=$1 AND c.state='ACTIVE' AND c.ends_at>now() AND c.spent_fen+c.bid_fen<=c.budget_fen AND l.status='APPROVED' ORDER BY c.bid_fen DESC,c.created_at,c.id",[brandId])).rows;
 const matched=rows.filter(r=>!city||r.payload.city===city),ads=new Map<string,any>();
 for(const c of campaigns)if(!ads.has(c.listing_id)&&matched.some(r=>r.id===c.listing_id&&r.payload.city===c.city&&r.payload.brandIds.includes(c.brand_id))&&(!city||c.city===city))ads.set(c.listing_id,c);
 const items=matched.map(r=>({...safe(r),campaignId:ads.get(r.id)?.id||null,promoted:ads.has(r.id)}));
 items.sort((a,b)=>(ads.get(b.id)?.bid_fen||0)-(ads.get(a.id)?.bid_fen||0));
 return {items,cities:[...new Set(rows.map(r=>r.payload.city))].sort(),mode:'SANDBOX'};
}
async function visibleListing(t:DB,listingId:string,brandId:string){
 id(listingId);id(brandId);await brandsAvailable(t,[brandId]);
 const row=(await t.query("SELECT * FROM partner_listings WHERE id=$1 AND status='APPROVED' FOR UPDATE",[listingId])).rows[0];check(row&&row.payload.brandIds.includes(brandId),'合作门店不可展示',404);return row;
}
async function event(t:DB,listing:any,visitor:string,body:any,kind:string){
 id(body.eventKey);const digest=hash({listingId:listing.id,brandId:body.brandId,city:body.city||'',kind,campaignId:body.campaignId||null});
 const old=(await t.query('SELECT * FROM partner_events WHERE visitor_key=$1 AND event_key=$2',[visitor,body.eventKey])).rows[0];if(old){check(old.body_hash===digest,'同一事件编号不能重复用于其他操作',409);return {id:old.id,duplicate:true};}
 let campaignId=null;
 if(body.campaignId){id(body.campaignId);const c=(await t.query("SELECT * FROM partner_campaigns WHERE id=$1 AND listing_id=$2 AND brand_id=$3 AND city=$4 AND state='ACTIVE' AND ends_at>now()",[body.campaignId,listing.id,body.brandId,body.city])).rows[0];if(c&&c.city===listing.payload.city)campaignId=c.id;}
 const eid=randomUUID();await t.query('INSERT INTO partner_events(id,listing_id,visitor_key,kind,campaign_id,event_key,body_hash) VALUES($1,$2,$3,$4,$5,$6,$7)',[eid,listing.id,visitor,kind,campaignId,body.eventKey,digest]);return {id:eid,duplicate:false,campaignId};
}
export async function partnerInteraction(db:DB,visitor:string,listingId:string,body:any,sandbox=false){
 fields(body,['brandId','city','kind','campaignId','eventKey']);check(['IMPRESSION','VIEW','PHONE','WECHAT','MAP'].includes(body.kind),'联系事件无效');const city=text(body.city||'',40,'城市');
 return db.transaction(async t=>{
 const listing=await visibleListing(t,listingId,body.brandId);check(!city||city===listing.payload.city,'门店与所选城市不匹配');
 if(body.kind==='PHONE')check(listing.payload.phone,'未提供电话');if(body.kind==='WECHAT')check(listing.payload.wechat,'未提供微信');if(body.kind==='MAP')check(listing.payload.address,'未提供地址');
 // Lock the listing first so repeated event keys from concurrent requests remain idempotent.
 await t.query('SELECT id FROM partner_listings WHERE id=$1 FOR UPDATE',[listingId]);
 if(listing.owner_key===visitor)return {ok:true,recorded:false,value:body.kind==='PHONE'?listing.payload.phone:body.kind==='WECHAT'?listing.payload.wechat:body.kind==='MAP'?'https://uri.amap.com/search?keyword='+encodeURIComponent(listing.payload.city+' '+listing.payload.address):null};
 const e=await event(t,listing,visitor,{...body,city},body.kind);let chargedFen=0;
 if(sandbox&&!e.duplicate&&e.campaignId&&['PHONE','WECHAT'].includes(body.kind)){
 const c=(await t.query("SELECT * FROM partner_campaigns WHERE id=$1 FOR UPDATE",[e.campaignId])).rows[0];
 const prior=(await t.query("SELECT id FROM partner_spend WHERE campaign_id=$1 AND visitor_key=$2 AND billing_day=(now() AT TIME ZONE 'UTC')::date",[c.id,visitor])).rows;
 if(!prior.length&&c.state==='ACTIVE'&&new Date(c.ends_at).getTime()>Date.now()&&c.spent_fen+c.bid_fen<=c.budget_fen){chargedFen=c.bid_fen;await t.query('INSERT INTO partner_spend(id,campaign_id,event_id,visitor_key,amount_fen) VALUES($1,$2,$3,$4,$5)',[randomUUID(),c.id,e.id,visitor,chargedFen]);await t.query('UPDATE partner_campaigns SET spent_fen=spent_fen+$1 WHERE id=$2',[chargedFen,c.id]);}
 }
 const value=body.kind==='PHONE'?listing.payload.phone:body.kind==='WECHAT'?listing.payload.wechat:body.kind==='MAP'?'https://uri.amap.com/search?keyword='+encodeURIComponent(listing.payload.city+' '+listing.payload.address):null;
 return {ok:true,recorded:!e.duplicate,value,chargedFen,mode:'SANDBOX'};
 });
}
export async function createAppointment(db:DB,visitor:string,listingId:string,body:any){
 fields(body,['brandId','eventKey','name','phone','preferredAt','note','consent']);id(body.eventKey);check(body.consent===true,'请同意将预约信息提供给所选门店或销售');
 const payload={brandId:id(body.brandId),name:text(body.name,40,'称呼',true),phone:phone(body.phone),preferredAt:body.preferredAt,note:text(body.note||'',1000,'预约备注')};
 check(payload.phone,'请填写联系电话');const time=new Date(payload.preferredAt).getTime();check(Number.isFinite(time)&&time>Date.now()&&time<Date.now()+90*86400000,'请选择未来90天内的预约时间');const digest=hash({listingId,...payload});
 return db.transaction(async t=>{
 const listing=await visibleListing(t,listingId,payload.brandId);await t.query('SELECT id FROM partner_listings WHERE id=$1 FOR UPDATE',[listingId]);
 const old=(await t.query('SELECT * FROM partner_appointments WHERE visitor_key=$1 AND event_key=$2',[visitor,body.eventKey])).rows[0];if(old){check(old.body_hash===digest,'预约编号不能重复用于其他内容',409);return {id:old.id,state:old.state};}
 check(Number((await t.query("SELECT count(*) AS n FROM partner_appointments WHERE visitor_key=$1 AND created_at>now()-interval '1 hour'",[visitor])).rows[0].n)<10,'预约较频繁，请稍后再试',429);
 const aid=randomUUID();await t.query('INSERT INTO partner_appointments(id,listing_id,visitor_key,event_key,body_hash,name,phone,preferred_at,note) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[aid,listingId,visitor,body.eventKey,digest,payload.name,payload.phone,new Date(time).toISOString(),payload.note]);
 if(listing.owner_key!==visitor)await event(t,listing,visitor,{brandId:payload.brandId,eventKey:body.eventKey},'APPOINTMENT');return {id:aid,state:'NEW'};
 });
}
export async function createCampaign(db:DB,owner:string,body:any,key:string,sandbox:boolean){
 check(sandbox,'正式竞价支付尚未开通',403);fields(body,['listingId','brandId','bidFen','budgetFen','days','consent']);id(key);id(body.listingId);id(body.brandId);
 check(body.consent===true,'请确认沙箱推广预算');check(Number.isSafeInteger(body.bidFen)&&body.bidFen>=1&&body.bidFen<=10000,'联系出价须为0.01至100元');check(Number.isSafeInteger(body.budgetFen)&&body.budgetFen>=body.bidFen&&body.budgetFen<=10000000,'总预算须不少于单次出价且不超过10万元');check(Number.isInteger(body.days)&&body.days>=1&&body.days<=30,'投放周期须为1至30天');
 const digest=hash(body);
 return db.transaction(async t=>{
 const l=(await t.query("SELECT * FROM partner_listings WHERE id=$1 AND owner_key=$2 AND status='APPROVED' FOR UPDATE",[body.listingId,owner])).rows[0];check(l,'仅可推广本人已审核资料',403);check(l.payload.brandIds.includes(body.brandId),'请选择资料所关联品牌');await brandsAvailable(t,[body.brandId]);
 const old=(await t.query('SELECT * FROM partner_campaigns WHERE owner_key=$1 AND request_key=$2',[owner,key])).rows[0];if(old){check(old.body_hash===digest,'请求编号已用于不同推广',409);return old;}
 const cid=randomUUID();await t.query('INSERT INTO partner_campaigns(id,listing_id,owner_key,brand_id,city,bid_fen,budget_fen,ends_at,request_key,body_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[cid,l.id,owner,body.brandId,l.payload.city,body.bidFen,body.budgetFen,new Date(Date.now()+body.days*86400000).toISOString(),key,digest]);return (await t.query('SELECT * FROM partner_campaigns WHERE id=$1',[cid])).rows[0];
 });
}
export async function campaignState(db:DB,owner:string,cid:string,state:string){id(cid);check(['ACTIVE','PAUSED'].includes(state),'投放状态无效');return db.transaction(async t=>{
 const existing=(await t.query('SELECT * FROM partner_campaigns WHERE id=$1 AND owner_key=$2',[cid,owner])).rows[0];check(existing,'无权操作该推广',403);
 if(state==='ACTIVE'){const listing=await visibleListing(t,existing.listing_id,existing.brand_id);check(listing.payload.city===existing.city,'资料已变更');}
 const c=(await t.query('SELECT * FROM partner_campaigns WHERE id=$1 FOR UPDATE',[cid])).rows[0];if(state==='ACTIVE')check(c.spent_fen+c.bid_fen<=c.budget_fen&&new Date(c.ends_at).getTime()>Date.now(),'推广已结束或预算不足');
 await t.query('UPDATE partner_campaigns SET state=$1 WHERE id=$2',[state,cid]);return {ok:true};});
}
export async function partnerDashboard(db:DB,owner?:string){
 const listings=(await db.query('SELECT id,status,payload,verification,version,review_reason,created_at FROM partner_listings'+(owner?' WHERE owner_key=$1':'')+' ORDER BY created_at DESC',owner?[owner]:[])).rows,ids=listings.map(l=>l.id);
 const metrics=(await db.query("SELECT listing_id,kind,count(*)::int AS total,count(DISTINCT visitor_key)::int AS visitors FROM partner_events WHERE listing_id=ANY($1::uuid[]) GROUP BY listing_id,kind",[ids])).rows;
 const campaigns=(await db.query('SELECT * FROM partner_campaigns WHERE listing_id=ANY($1::uuid[]) ORDER BY created_at DESC',[ids])).rows.map(c=>{const {owner_key,request_key,body_hash,...safe}=c;return safe;});
 const appointments=(await db.query('SELECT id,listing_id,name,phone,preferred_at,note,state,created_at FROM partner_appointments WHERE listing_id=ANY($1::uuid[]) ORDER BY created_at DESC LIMIT 500',[ids])).rows;
 const revisions=(await db.query('SELECT * FROM partner_revisions WHERE listing_id=ANY($1::uuid[]) ORDER BY created_at DESC',[ids])).rows;
 return {items:listings,metrics,campaigns,appointments,revisions,mode:'SANDBOX'};
}
export async function appointmentState(db:DB,owner:string,appointmentId:string,state:string){id(appointmentId);check(['NEW','CONTACTED','CLOSED'].includes(state),'预约状态无效');check((await db.query('SELECT a.id FROM partner_appointments a JOIN partner_listings l ON l.id=a.listing_id WHERE a.id=$1 AND l.owner_key=$2',[appointmentId,owner])).rows.length,'无权处理此预约',403);await db.query('UPDATE partner_appointments SET state=$1 WHERE id=$2',[state,appointmentId]);return {ok:true};}
