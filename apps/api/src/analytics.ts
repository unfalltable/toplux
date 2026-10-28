import {secureCookieSuffix} from './runtime.js';
import {randomUUID,createHash} from 'node:crypto';
import {isIP} from 'node:net';
import type {DB} from './db.js';
import {check} from './funds.js';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function anonymousVisitor(q:any){
 if(q.anonymousVisitorKey)return q.anonymousVisitorKey;
 const old=(q.headers.cookie||'').split(';').map((v:string)=>v.trim()).find((v:string)=>v.startsWith('sb_visitor='))?.slice(11);
 const id=old&&uuid.test(old)?old:randomUUID();
 if(id!==old)q.reply.append('Set-Cookie','sb_visitor='+id+'; HttpOnly; SameSite=Lax; Path=/; Max-Age=31536000'+secureCookieSuffix());
 q.anonymousVisitorKey=createHash('sha256').update(id).digest('hex');return q.anonymousVisitorKey;
}
export function validateOutboundUrl(raw:any,type:string){
 check(typeof raw==='string'&&raw.length<=2048,'请输入有效的 HTTPS 地址');
 let url:URL;try{url=new URL(raw);}catch{check(false,'请输入有效的 HTTPS 地址');throw new Error();}
 check(url.protocol==='https:'&&!url.username&&!url.password&&!url.port,'链接须使用不含账号和端口的 HTTPS 地址');
 const host=url.hostname.toLowerCase();
 check(host.includes('.')&&!isIP(host.replace(/^\[|\]$/g,''))&&!/^(localhost|127\.)/.test(host)&&!host.endsWith('.local')&&!host.endsWith('.localhost')&&!host.endsWith('.internal'),'请使用公开的网站域名');
 if(type!=='WEBSITE')check(['www.taobao.com','item.taobao.com','www.tmall.com','www.jd.com','www.douyin.com','live.douyin.com','www.kuaishou.com','www.bilibili.com'].includes(host),'店铺、直播与视频仅支持指定平台；品牌官网请选择官网类型');
 return url.href;
}
export async function recordEvent(db:DB,event:{merchantId:string,kind:string,visitor:string,eventKey:string,source:string,linkId?:string,actorId?:string}){
 check(uuid.test(event.eventKey)&&uuid.test(event.merchantId),'统计参数无效');
 check(['IMPRESSION','VIEW','WEBSITE','STORE','LIVE','VIDEO'].includes(event.kind)&&['total','category','detail','direct'].includes(event.source),'统计类型无效');
 const m=(await db.query("SELECT id,owner_id FROM merchants WHERE id=$1 AND state='APPROVED'",[event.merchantId])).rows[0];
 check(m,'商家不可展示',404);
 if(event.actorId===m.owner_id)return {ok:true,recorded:false};
 if(event.linkId){const l=(await db.query("SELECT id FROM links WHERE id=$1 AND merchant_id=$2 AND type=$3 AND state='APPROVED'",[event.linkId,event.merchantId,event.kind])).rows[0];check(l,'链接不可用',404);}
 else check(['IMPRESSION','VIEW'].includes(event.kind),'跳转记录缺少链接');
 const count=(await db.query("SELECT count(*) AS n FROM analytics_events WHERE visitor_key=$1 AND created_at>now()-interval '1 minute'",[event.visitor])).rows[0];
 check(Number(count.n)<120,'访问过于频繁，请稍后再试',429);
 const r=await db.query('INSERT INTO analytics_events(id,event_key,merchant_id,link_id,kind,visitor_key,source) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(event_key) DO NOTHING RETURNING id',[randomUUID(),event.eventKey,event.merchantId,event.linkId||null,event.kind,event.visitor,event.source]);
 return {ok:true,recorded:r.rows.length>0};
}
const metrics=`count(*) FILTER(WHERE kind='IMPRESSION')::int AS impressions,
 count(DISTINCT visitor_key) FILTER(WHERE kind='IMPRESSION')::int AS impression_visitors,
 count(*) FILTER(WHERE kind='VIEW')::int AS views,
 count(DISTINCT visitor_key) FILTER(WHERE kind='VIEW')::int AS visitors,
 count(*) FILTER(WHERE link_id IS NOT NULL)::int AS clicks,
 count(DISTINCT visitor_key) FILTER(WHERE link_id IS NOT NULL)::int AS click_visitors,
 count(*) FILTER(WHERE kind='WEBSITE')::int AS website,
 count(*) FILTER(WHERE kind='STORE')::int AS store,
 count(*) FILTER(WHERE kind='LIVE')::int AS live,
 count(*) FILTER(WHERE kind='VIDEO')::int AS video`;
export async function analyticsReport(db:DB,{ownerId,merchantId,days=7}:{ownerId?:string,merchantId?:string,days?:number}){
 check([7,30,90].includes(days),'统计范围仅支持7、30或90天');
 if(merchantId)check(uuid.test(merchantId),'品牌参数无效');
 const merchants=(await db.query('SELECT id,name,state FROM merchants WHERE ($1::uuid IS NULL OR owner_id=$1) ORDER BY name',[ownerId||null])).rows;
 if(merchantId)check(merchants.some(m=>m.id===merchantId),'无权查看该品牌数据',403);
 const ids=merchantId?[merchantId]:merchants.map(m=>m.id);
 // UTC calendar days, including today. No synthetic or seeded traffic.
 const start=new Date();start.setUTCHours(0,0,0,0);start.setUTCDate(start.getUTCDate()-days+1);
 const where='merchant_id=ANY($1::uuid[]) AND created_at >= $2 AND created_at <= now()';
 const p=[ids,start.toISOString()];
 const summary=(await db.query('SELECT '+metrics+' FROM analytics_events WHERE '+where,p)).rows[0];
 const daily=(await db.query("SELECT to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD') AS day,"+metrics+' FROM analytics_events WHERE '+where+' GROUP BY day ORDER BY day',p)).rows;
 const series=Array.from({length:days},(_,i)=>{const d=new Date(start);d.setUTCDate(d.getUTCDate()+i);const day=d.toISOString().slice(0,10);return daily.find(x=>x.day===day)||{day,impressions:0,views:0,visitors:0,clicks:0};});
 const channels=(await db.query(`SELECT l.id,l.merchant_id,m.name AS merchant_name,l.platform,l.type,l.url,l.state,
 count(e.id)::int AS clicks,count(DISTINCT e.visitor_key)::int AS visitors
 FROM links l JOIN merchants m ON m.id=l.merchant_id LEFT JOIN analytics_events e ON e.link_id=l.id AND e.created_at >= $2 AND e.created_at <= now()
 WHERE l.merchant_id=ANY($1::uuid[]) GROUP BY l.id,m.name ORDER BY clicks DESC,l.platform`,p)).rows;
 const brands=(await db.query('SELECT merchant_id,'+metrics+' FROM analytics_events WHERE '+where+' GROUP BY merchant_id',p)).rows;
 return {days,timezone:'UTC',from:start.toISOString(),updatedAt:new Date().toISOString(),summary,series,channels,merchants,brands:merchants.filter(m=>ids.includes(m.id)).map(m=>({...m,...brands.find(b=>b.merchant_id===m.id)}))};
}
