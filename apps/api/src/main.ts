import {loadRuntime,secureCookieSuffix,requireContributionChannel} from './runtime.js';
import {categoryCuration,categoryProfiles} from './atlas-curation.js';

import 'reflect-metadata';
import {Module} from '@nestjs/common';
import {NestFactory} from '@nestjs/core';
import express,{type Request,type Response,type NextFunction} from 'express';
import {randomUUID,randomBytes,createHmac} from 'node:crypto';
import {resolve} from 'node:path';
import sharp from 'sharp';
import {connect} from './db.js';
import {check,DomainError,money,idem,settle,refund,board,globalBoard,audit} from './funds.js';
import {anonymousVisitor,recordEvent,analyticsReport,validateOutboundUrl} from './analytics.js';
import {createSupportOrder,paySupportOrder,visitorOrders,supportBrands,enrichBrands,publicMetrics,followBrand,syncCatalogueBrands} from './support.js';
import {consumeStaffTicket,staffRoles} from './staff-access.js';
import {rankingSnapshot,lockRankings,syncRankingHeads} from './live-ranking.js';
import {classification,reportCategory,reviewClassification,classificationQueue} from './classification.js';
import {publicAtlas,profileExtras} from './atlas.js';
import {submitPartner,publicPartners,partnerInteraction,createAppointment,createCampaign,campaignState,partnerDashboard,partnerQueue,reviewPartner,partnerVisibility,appointmentState} from './partners.js';
import {saveCategory,validateProfile,reviseProfile,decideRevision} from './catalog.js';
@Module({}) class AppModule{}
const {production}=loadRuntime();
const partnerMarketEnabled=process.env.ENABLE_PARTNER_MARKET==='true';
const requirePartnerMarket=()=>check(partnerMarketEnabled,'门店合作功能暂未开放',404);
if(production&&!process.env.DATABASE_URL)throw new Error('生产模式要求 DATABASE_URL；开发登录与沙箱均禁用');
const db=await connect();
const app=await NestFactory.create(AppModule,{logger:['error','warn']});
const http=app.getHttpAdapter().getInstance();
http.disable('x-powered-by');http.use(express.json({limit:'8mb'}));
if(production)http.use((q:Request,r:Response,n:NextFunction)=>{if(q.path.startsWith('/api/v1/sandbox/')||q.path==='/api/v1/auth/local'||q.path==='/api/v1/auth/staff-ticket'||q.path.startsWith('/flutter')){r.status(404).json({message:'页面不存在'});return;}n();});
http.use((_q:Request,r:Response,n:NextFunction)=>{r.setHeader('X-Content-Type-Options','nosniff');r.setHeader('Referrer-Policy','same-origin');n();});
const router=express.Router();
type Actor={id:string,name:string,role:string,csrf:string};
const visitorCsrfSecret=randomBytes(32);
const visitorCsrf=(q:any)=>createHmac('sha256',visitorCsrfSecret).update(anonymousVisitor(q)).digest('hex');
const readActor=async(q:any)=>{
 const token=(q.headers.cookie||'').split(';').map((x:string)=>x.trim()).find((x:string)=>x.startsWith('pinjie='))?.slice(7);
 return token?(await db.query("SELECT u.*,s.csrf,s.staff_verified FROM sessions s JOIN users u ON s.user_id=u.id WHERE s.id=$1 AND s.expires_at>now() AND (u.role IN ('USER','MERCHANT') OR s.staff_verified)",[token])).rows[0]:undefined;
};
const issueStaffSession=async(reply:any,account:string)=>{
 const u=(await db.query('SELECT * FROM users WHERE name=$1',[account])).rows[0];check(u&&staffRoles.includes(u.role),'该身份不能进入平台',403);
 const token=randomBytes(32).toString('hex'),csrf=randomBytes(24).toString('hex');
 await db.query("INSERT INTO sessions(id,user_id,csrf,expires_at,staff_verified) VALUES($1,$2,$3,now()+interval '8 hours',true)",[token,u.id,csrf]);
 reply.append('Set-Cookie','pinjie='+token+'; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800'+secureCookieSuffix());
 return {...u,csrf};
};
const requireVisitorCsrf=(q:any,u?:Actor)=>{if(!u)check(q.headers['x-csrf-token']===visitorCsrf(q),'页面已过期，请刷新后重试',403);};
const route=(method:string,path:string,fn:(q:any,u:Actor|undefined)=>Promise<any>,roles?:string[])=>{
 (router as any)[method](path,async(q:Request,r:Response)=>{const requestId=randomUUID();try{
  const u=await readActor(q);
  if(roles){check(u,'请先登录',401);check(roles.includes(u.role),'没有操作权限',403);}
  if(!['GET','HEAD'].includes(q.method)&&u)check(q.headers['x-csrf-token']===u.csrf,'会话校验失败，请刷新页面',403);
  const result=await fn(Object.assign(q,{reply:r}),u);if(!r.headersSent)r.json(result);
 }catch(e:any){const status=e instanceof DomainError?e.status:400;r.status(status).json({code:status===401?'UNAUTHENTICATED':'REQUEST_REJECTED',message:e instanceof DomainError?e.message:'请求无效或数据库约束不满足',requestId,retryable:false});}});
};
const member=['USER','EDITOR','REVIEWER','FINANCE','ADMIN'];
const own=async(id:string,u:Actor)=>{const m=(await db.query('SELECT * FROM merchants WHERE id=$1 AND owner_id=$2',[id,u.id])).rows[0];check(m,'推广品牌不存在或无权访问',403);return m;};
const fields=(b:any,keys:string[])=>check(b&&Object.keys(b).every(k=>keys.includes(k)),'请求含有不允许的字段');
route('get','/health',async()=>{await db.query('SELECT 1');return {ok:true,database:'PostgreSQL',mode:production?'production':'local-sandbox'};});
route('get','/capabilities',async()=>({sandbox:!production,contributionMessage:production?'品牌助力收款尚未开放':'',partnerMarketEnabled,canManageMerchant:false,canPurchasePromotion:!production,loginRequired:false,refundSupported:false,recipient:'PLATFORM',paymentChannels:production?[]:['local-sandbox'],realPaymentEnabled:false}));
route('get','/merchant-board',async q=>{q.reply.setHeader('Cache-Control','no-store');const snapshot=await rankingSnapshot(db,undefined,q.query.after);return {...snapshot,items:await enrichBrands(db,snapshot.items,anonymousVisitor(q))};});
route('get','/categories',async()=>({items:(await db.query("SELECT c.*,(SELECT count(*)::int FROM profiles p LEFT JOIN merchants m ON m.id=p.brand_id WHERE p.category_id=c.id AND p.state='PUBLISHED' AND NOT p.demo AND (m.id IS NULL OR m.state='APPROVED')) AS brand_count FROM categories c WHERE c.active ORDER BY c.sort_order")).rows.map(c=>({...c,curation:categoryCuration(c.slug)}))}));
route('get','/categories/:id/brands',async q=>({items:await enrichBrands(db,categoryProfiles((await db.query("SELECT p.*,c.name AS category_name,c.slug AS category_slug FROM profiles p JOIN categories c ON c.id=p.category_id LEFT JOIN merchants m ON m.id=p.brand_id WHERE p.category_id=$1 AND p.state='PUBLISHED' AND c.active AND (m.id IS NULL OR m.state='APPROVED')",[q.params.id])).rows),anonymousVisitor(q)),rankingKind:'EDITORIAL',boardState:'INCOMPLETE'}));
route('get','/merchants/:id/atlas',async q=>publicAtlas(db,q.params.id,anonymousVisitor(q)));
route('get','/admin/brand-options',async()=>({items:(await db.query('SELECT id,name,state FROM merchants ORDER BY name')).rows}),['EDITOR','REVIEWER','ADMIN']);
route('get','/brands/:id',async q=>{const p=(await db.query("SELECT * FROM profiles WHERE id=$1 AND state='PUBLISHED'",[q.params.id])).rows[0];check(p,'资料不存在',404);return (await enrichBrands(db,[p],anonymousVisitor(q)))[0];});
route('get','/search',async q=>({items:await enrichBrands(db,(await db.query("SELECT p.*,c.name AS category_name,c.slug AS category_slug FROM profiles p JOIN categories c ON c.id=p.category_id LEFT JOIN merchants m ON m.id=p.brand_id WHERE p.state='PUBLISHED' AND NOT p.demo AND c.active AND (m.id IS NULL OR m.state='APPROVED') AND (p.name ILIKE $1 OR p.english ILIKE $1) ORDER BY c.sort_order,p.name,p.id LIMIT 50",['%'+String(q.query.q||'')+'%'])).rows,anonymousVisitor(q))}));
route('get','/compare',async q=>{const ids=String(q.query.ids||'').split(',');check(ids.length>=1&&ids.length<=3,'最多对比三个品牌');const rows=(await db.query("SELECT * FROM profiles WHERE id=ANY($1::uuid[]) AND state='PUBLISHED'",[ids])).rows;check(rows.length===ids.length&&new Set(rows.map(r=>r.category_id)).size===1,'只能比较同品类已发布品牌');return {items:rows};});
route('get','/categories/:id/merchant-board',async q=>{q.reply.setHeader('Cache-Control','no-store');const snapshot=await rankingSnapshot(db,q.params.id,q.query.after);return {...snapshot,items:await enrichBrands(db,snapshot.items,anonymousVisitor(q))};});
route('post','/auth/local',async()=>{check(false,'公开演示身份切换已关闭',403);});
route('post','/auth/staff-ticket',async q=>{fields(q.body,['ticket']);const account=consumeStaffTicket(q.body.ticket);return issueStaffSession(q.reply,account);});
route('get','/public/session',async(q,u)=>{anonymousVisitor(q);return {csrf:u?.csrf||visitorCsrf(q),loginRequired:false,refundSupported:false};});
route('get','/public/brands',async q=>({items:await supportBrands(db,anonymousVisitor(q))}));
route('post','/public/brands/:id/category-report',async(q,u)=>{requireVisitorCsrf(q,u);return reportCategory(db,anonymousVisitor(q),q.params.id,q.body);});
route('get','/admin/brand-categories',async()=>classificationQueue(db),['ADMIN','REVIEWER']);
route('post','/admin/brand-categories/:id',async(q,u)=>reviewClassification(db,u!.id,q.params.id,q.body),['ADMIN','REVIEWER']);
route('get','/public/follows',async q=>{const v=anonymousVisitor(q);const all=await supportBrands(db,v);return {items:all.filter(b=>b.stats.followed)};});
route('put','/public/brands/:id/follow',async(q,u)=>{requireVisitorCsrf(q,u);fields(q.body,['followed']);return followBrand(db,q.params.id,anonymousVisitor(q),q.body.followed);});
route('get','/support/orders',async q=>({items:await visitorOrders(db,anonymousVisitor(q))}));

route('get','/me',async(q,u)=>{anonymousVisitor(q);return u||null;});
route('post','/auth/logout',async q=>{q.reply.setHeader('Set-Cookie','pinjie=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');const token=(q.headers.cookie||'').match(/pinjie=([^;]+)/)?.[1];if(token)await db.query('DELETE FROM sessions WHERE id=$1',[token]);return {ok:true};},member);
route('post','/assets',async(q,u)=>{
 fields(q.body,['data']);check(typeof q.body.data==='string'&&/^data:image\/(png|jpeg|webp);base64,/.test(q.body.data),'请上传 PNG、JPEG 或 WebP');
 const buf=Buffer.from(q.body.data.split(',')[1],'base64');check(buf.length<=5*1024*1024,'图片不能超过5MB');
 const output=await sharp(buf,{limitInputPixels:25000000}).resize(256,256,{fit:'cover'}).png().toBuffer();
 const id=randomUUID();await db.query('INSERT INTO assets VALUES($1,$2,$3)',[id,u!.id,'data:image/png;base64,'+output.toString('base64')]);return {id};
},member);
route('post','/merchants',async(q,u)=>{
 fields(q.body,['displayName','logoAssetId']);const name=String(q.body.displayName||'').trim();check(name.length>=2&&name.length<=40,'品牌名须为2至40个字符');
 check((await db.query('SELECT id FROM assets WHERE id=$1 AND owner_id=$2',[q.body.logoAssetId,u!.id])).rows.length,'Logo无效');
 const old=(await db.query('SELECT * FROM merchants WHERE owner_id=$1 AND name=$2',[u!.id,name])).rows[0];if(old)return old;
 const id=randomUUID();await db.query("INSERT INTO merchants(id,owner_id,name,logo_asset_id,state) VALUES($1,$2,$3,$4,$5)",[id,u!.id,name,q.body.logoAssetId,production?'PENDING':'APPROVED']);return {id,name};
},member);
route('get','/me/merchants',async(_q,u)=>({items:(await db.query('SELECT m.*,a.data AS logo FROM merchants m JOIN assets a ON a.id=m.logo_asset_id WHERE m.owner_id=$1',[u!.id])).rows}),member);
route('patch','/merchants/:id',async(q,u)=>{if(u!.role!=='ADMIN')await own(q.params.id,u!);fields(q.body,['description']);check(String(q.body.description).length<=2000,'介绍过长');await db.query('UPDATE merchants SET description=$1 WHERE id=$2',[q.body.description,q.params.id]);return {ok:true};},member);
route('get','/merchants/:id',async q=>{const m=(await db.query("SELECT m.id,m.name,m.description,a.data AS logo FROM merchants m JOIN assets a ON a.id=m.logo_asset_id WHERE m.id=$1 AND m.state='APPROVED'",[q.params.id])).rows[0];check(m,'商家已下线',404);const entries=(await db.query('SELECT e.*,c.name AS category_name FROM merchant_categories e JOIN categories c ON c.id=e.category_id WHERE e.merchant_id=$1 ORDER BY c.sort_order',[m.id])).rows.map(e=>({...e,net_fen:Number(e.net_fen),gross_fen:Number(e.gross_fen),refunded_fen:Number(e.refunded_fen)}));return {...(await enrichBrands(db,[m],anonymousVisitor(q)))[0],classification:await classification(db,m.id),stats:(await publicMetrics(db,[m.id],anonymousVisitor(q))).get(m.id),entries,links:(await db.query("SELECT * FROM links WHERE merchant_id=$1 AND state='APPROVED'",[m.id])).rows};});
route('post','/contributions/orders',async(q,u)=>{requireContributionChannel();requireVisitorCsrf(q,u);return createSupportOrder(db,anonymousVisitor(q),q.body,q.headers['idempotency-key'],u?.id);});
route('post','/support/orders',async(q,u)=>{requireContributionChannel();requireVisitorCsrf(q,u);return createSupportOrder(db,anonymousVisitor(q),q.body,q.headers['idempotency-key'],u?.id);});
route('post','/sandbox/orders/:id/pay',async(q,u)=>{check(!production,'真实支付尚未接入',403);requireVisitorCsrf(q,u);fields(q.body,[]);return paySupportOrder(db,anonymousVisitor(q),q.params.id);});
route('get','/me/orders',async q=>({items:await visitorOrders(db,anonymousVisitor(q))}));
route('post','/sandbox/orders/:id/refund',async()=>{check(false,'助力款不支持退款',405);});
route('post','/support/orders/:id/refund',async()=>{check(false,'助力款不支持退款',405);});

route('get','/me/favorites',async(_q,u)=>({items:(await db.query('SELECT p.*,f.id AS favorite_id FROM favorites f JOIN profiles p ON p.id=f.profile_id WHERE f.user_id=$1',[u!.id])).rows}),member);
route('post','/me/favorites',async(q,u)=>{fields(q.body,['profileId']);await db.query('INSERT INTO favorites VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[randomUUID(),u!.id,q.body.profileId]);return {ok:true};},member);
route('delete','/me/favorites/:id',async(q,u)=>{await db.query('DELETE FROM favorites WHERE id=$1 AND user_id=$2',[q.params.id,u!.id]);return {ok:true};},member);
route('post','/feedback',async(q,u)=>{fields(q.body,['target','reason']);check(typeof q.body.reason==='string'&&q.body.reason.trim().length>=5&&q.body.reason.length<=2000,'请填写5至2000字反馈');const id=randomUUID();await db.query('INSERT INTO feedback(id,user_id,target,reason) VALUES($1,$2,$3,$4)',[id,u?.id||null,q.body.target||'',q.body.reason]);return {id};});
route('post','/merchants/:id/links',async(q,u)=>{if(u!.role!=='ADMIN')await own(q.params.id,u!);fields(q.body,['type','platform','url']);check(['WEBSITE','STORE','LIVE','VIDEO'].includes(q.body.type),'链接类型无效');const url=validateOutboundUrl(q.body.url,q.body.type);const id=randomUUID();await db.query('INSERT INTO links(id,merchant_id,type,platform,url) VALUES($1,$2,$3,$4,$5)',[id,q.params.id,q.body.type,String(q.body.platform||'品牌官网').slice(0,30),url]);return {id,state:'PENDING'};},member);
route('get','/links/:id/resolve',async q=>{const l=(await db.query("SELECT l.* FROM links l JOIN merchants m ON m.id=l.merchant_id WHERE l.id=$1 AND l.state='APPROVED' AND m.state='APPROVED'",[q.params.id])).rows[0];check(l,'链接不可用',404);return l;});
route('post','/analytics/events',async(q,u)=>{fields(q.body,['merchantId','kind','eventKey','source']);check(['IMPRESSION','VIEW'].includes(q.body.kind),'统计类型无效');return recordEvent(db,{...q.body,visitor:anonymousVisitor(q),actorId:u?.id});});
route('get','/me/analytics',async()=>{check(false,'品牌热度与关注已展示在品牌卡片',404);});
route('get','/admin/analytics',async q=>analyticsReport(db,{merchantId:q.query.merchantId||undefined,days:Number(q.query.days||7)}),['ADMIN']);
route('get','/links/:id/go',async(q,u)=>{
 const l=(await db.query("SELECT l.* FROM links l JOIN merchants m ON m.id=l.merchant_id WHERE l.id=$1 AND l.state='APPROVED' AND m.state='APPROVED'",[q.params.id])).rows[0];check(l,'链接不可用',404);
 const target=validateOutboundUrl(l.url,l.type);
 await recordEvent(db,{merchantId:l.merchant_id,kind:l.type,linkId:l.id,visitor:anonymousVisitor(q),eventKey:q.query.eventKey||randomUUID(),source:'detail',actorId:u?.id});
 q.reply.setHeader('Cache-Control','no-store');q.reply.redirect(302,target);
});
route('post','/outbound-events',async()=>{check(false,'请通过已审核链接的跳转入口访问');});

route('get','/admin/overview',async(_q,u)=>{const result:any={partnerMarketEnabled};const allowed:Record<string,string[]>={EDITOR:['profiles','profile_revisions','categories'],REVIEWER:['profiles','profile_revisions','categories','merchants','links','feedback','audit_logs'],FINANCE:['orders','audit_logs'],ADMIN:['profiles','profile_revisions','categories','merchants','links','feedback','orders','audit_logs']};for(const table of ['categories','profiles','profile_revisions','merchants','orders','links','feedback','audit_logs'])result[table]=allowed[u!.role].includes(table)?(await db.query('SELECT * FROM '+table+(table==='audit_logs'?' ORDER BY created_at DESC LIMIT 100':''))).rows:[];return result;},['EDITOR','REVIEWER','ADMIN']);
route('post','/admin/profiles',async(q,u)=>{validateProfile(q.body);check((await db.query('SELECT id FROM categories WHERE id=$1 AND active',[q.body.categoryId])).rows.length,'请选择启用品类');const id=randomUUID(),extras=profileExtras(q.body);await db.transaction(async t=>{if(q.body.brandId)check((await t.query('SELECT id FROM merchants WHERE id=$1',[q.body.brandId])).rows.length,'关联品牌不存在',404);await t.query("INSERT INTO profiles(id,category_id,name,english,tier,summary,recognition,occasion,source,state,author,editorial,demo,brand_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'DRAFT',$10,$11,$12,$13)",[id,q.body.categoryId,q.body.name,q.body.english,q.body.tier,q.body.summary,q.body.recognition,q.body.occasion,q.body.source,u!.id,JSON.stringify(extras.editorial),extras.demo,q.body.brandId||null]);await audit(t,u!.id,'CREATE_DRAFT',id);});return {id};},['EDITOR','ADMIN']);
route('post','/admin/profiles/:id/decision',async(q,u)=>{fields(q.body,['approved','reason']);check(q.body.reason?.trim(),'请填写审核理由');const p=(await db.query('SELECT * FROM profiles WHERE id=$1',[q.params.id])).rows[0];check(p,'品牌不存在',404);check(p.author!==u!.id,'不能审核自己的草稿',403);check(p.state==='DRAFT','仅可审核待发布草稿',409);await db.transaction(async t=>{await t.query("UPDATE profiles SET state=$1,reviewer=$2,version=version+1,updated_at=now() WHERE id=$3",[q.body.approved?'PUBLISHED':'REJECTED',u!.id,p.id]);await audit(t,u!.id,'REVIEW_PROFILE',p.id,q.body.reason);});await syncCatalogueBrands(db);return {ok:true};},['REVIEWER','ADMIN']);
route('post','/admin/links/:id/decision',async(q,u)=>{fields(q.body,['approved','reason']);check(q.body.reason?.trim(),'请填写审核理由');await db.transaction(async t=>{await t.query('UPDATE links SET state=$1 WHERE id=$2',[q.body.approved?'APPROVED':'REJECTED',q.params.id]);await audit(t,u!.id,'REVIEW_LINK',q.params.id,q.body.reason);});return {ok:true};},['REVIEWER','ADMIN']);
route('post','/admin/merchants/:id/visibility',async(q,u)=>{fields(q.body,['visible','reason']);check(q.body.reason?.trim(),'请填写理由');await db.transaction(async t=>{await lockRankings(t);await t.query('UPDATE merchants SET state=$1 WHERE id=$2',[q.body.visible?'APPROVED':'HIDDEN',q.params.id]);await syncRankingHeads(t);await audit(t,u!.id,'VISIBILITY',q.params.id,q.body.reason);});return {ok:true};},['REVIEWER','ADMIN']);
route('post','/admin/feedback/:id/resolve',async(q,u)=>{fields(q.body,['resolution']);check(q.body.resolution?.trim(),'请填写处理结果');await db.query("UPDATE feedback SET state='RESOLVED',resolution=$1 WHERE id=$2",[q.body.resolution,q.params.id]);await audit(db,u!.id,'RESOLVE_FEEDBACK',q.params.id,q.body.resolution);return {ok:true};},['REVIEWER','ADMIN']);

route('get','/admin/categories',async()=>({items:(await db.query('SELECT * FROM categories ORDER BY sort_order,name')).rows}),['EDITOR','REVIEWER','ADMIN']);
route('post','/admin/categories',async(q,u)=>saveCategory(db,u!.id,q.body),['EDITOR','ADMIN']);
route('patch','/admin/categories/:id',async(q,u)=>saveCategory(db,u!.id,q.body,q.params.id),['EDITOR','ADMIN']);
route('post','/admin/profiles/:id/revisions',async(q,u)=>reviseProfile(db,u!.id,q.params.id,q.body),['EDITOR','ADMIN']);
route('post','/admin/revisions/:id/decision',async(q,u)=>{const result=await decideRevision(db,u!.id,q.params.id,q.body.approved,q.body.reason);await syncCatalogueBrands(db);return result;},['REVIEWER','ADMIN']);
route('post','/admin/profiles/:id/archive',async(q,u)=>{fields(q.body,['reason']);check(q.body.reason?.trim(),'请填写下线理由');await db.transaction(async t=>{check((await t.query('SELECT id FROM profiles WHERE id=$1 FOR UPDATE',[q.params.id])).rows.length,'品牌不存在',404);await t.query("UPDATE profiles SET state='ARCHIVED',version=version+1,updated_at=now() WHERE id=$1",[q.params.id]);await audit(t,u!.id,'ARCHIVE_PROFILE',q.params.id,q.body.reason);});return {ok:true};},['REVIEWER','ADMIN']);

route('get','/partners/brand/:id',async q=>{requirePartnerMarket();return publicPartners(db,q.params.id,String(q.query.city||''));});
route('get','/partners/mine',async q=>{requirePartnerMarket();q.reply.setHeader('Cache-Control','no-store');return partnerDashboard(db,anonymousVisitor(q));});
route('post','/partners/apply',async(q,u)=>{requirePartnerMarket();requireVisitorCsrf(q,u);return submitPartner(db,anonymousVisitor(q),q.body,undefined,q.headers['idempotency-key']);});
route('post','/partners/:id/revisions',async(q,u)=>{requirePartnerMarket();requireVisitorCsrf(q,u);return submitPartner(db,anonymousVisitor(q),q.body,q.params.id);});
route('post','/partners/:id/events',async(q,u)=>{requirePartnerMarket();requireVisitorCsrf(q,u);return partnerInteraction(db,anonymousVisitor(q),q.params.id,q.body,!production);});
route('post','/partners/:id/appointments',async(q,u)=>{requirePartnerMarket();requireVisitorCsrf(q,u);return createAppointment(db,anonymousVisitor(q),q.params.id,q.body);});
route('post','/partners/appointments/:id/state',async(q,u)=>{requirePartnerMarket();requireVisitorCsrf(q,u);fields(q.body,['state']);return appointmentState(db,anonymousVisitor(q),q.params.id,q.body.state);});
route('post','/partners/campaigns',async(q,u)=>{requirePartnerMarket();requireVisitorCsrf(q,u);return createCampaign(db,anonymousVisitor(q),q.body,q.headers['idempotency-key'],!production);});
route('post','/partners/campaigns/:id/state',async(q,u)=>{requirePartnerMarket();requireVisitorCsrf(q,u);fields(q.body,['state']);return campaignState(db,anonymousVisitor(q),q.params.id,q.body.state);});
route('get','/admin/partners',async q=>{requirePartnerMarket();q.reply.setHeader('Cache-Control','no-store');return partnerQueue(db);},['ADMIN','REVIEWER']);
route('get','/admin/partner-analytics',async q=>{requirePartnerMarket();q.reply.setHeader('Cache-Control','no-store');return partnerDashboard(db);},['ADMIN']);
route('post','/admin/partners/:id/review',async(q,u)=>{requirePartnerMarket();return reviewPartner(db,u!.id,q.params.id,q.body);},['ADMIN','REVIEWER']);
route('post','/admin/partners/:id/visibility',async(q,u)=>{requirePartnerMarket();return partnerVisibility(db,u!.id,q.params.id,q.body);},['ADMIN','REVIEWER']);

router.use((_q,r)=>r.status(404).json({message:'接口不存在'}));http.use('/api/v1',router);
http.get('/admin/enter',async(q:Request,r:Response)=>{
 try{const account=consumeStaffTicket(q.query.ticket);await issueStaffSession(r,account);r.setHeader('Referrer-Policy','no-referrer');r.setHeader('Cache-Control','no-store');r.redirect(303,'/admin');}catch{r.status(404).send('页面不存在');}
});
http.get('/admin',async(q:Request,r:Response)=>{
 const actor=await readActor(q);r.setHeader('Cache-Control','no-store');if(!actor||!staffRoles.includes(actor.role)){r.status(404).send('页面不存在');return;}r.sendFile(resolve('dist/web/admin.html'));
});
http.use(['/admin.html','/admin/'],(_q:Request,r:Response)=>{r.status(404).send('页面不存在');});
http.use('/flutter',express.static(resolve('apps/client_flutter/build/web')));
http.use(express.static(resolve('dist/web')));
http.use((q:Request,r:Response)=>{if(q.method==='GET')r.sendFile(resolve('dist/web/index.html'));else r.status(404).end();});
await app.listen(Number(process.env.PORT||3100),process.env.HOST||(production?'0.0.0.0':'127.0.0.1'));
console.log('奢榜 http://127.0.0.1:'+Number(process.env.PORT||3100));
