import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {connect,type DB} from '../apps/api/src/db.js';
import {recordEvent,analyticsReport,validateOutboundUrl,anonymousVisitor} from '../apps/api/src/analytics.js';
let db:DB,owner:string,other:string,mid:string,foreign:string,website:string,live:string,pending:string;
before(async()=>{
 db=await connect(true);const users=(await db.query('SELECT * FROM users')).rows;owner=users[0].id;other=users[1].id;
 async function merchant(actor:string,name:string){const aid=randomUUID(),id=randomUUID();await db.query('INSERT INTO assets VALUES($1,$2,$3)',[aid,actor,'logo']);await db.query('INSERT INTO merchants(id,owner_id,name,logo_asset_id) VALUES($1,$2,$3,$4)',[id,actor,name,aid]);return id;}
 mid=await merchant(owner,'统计测试品牌');foreign=await merchant(other,'别人的品牌');website=randomUUID();live=randomUUID();pending=randomUUID();
 for(const [id,type,state]of[[website,'WEBSITE','APPROVED'],[live,'LIVE','APPROVED'],[pending,'LIVE','PENDING']])await db.query('INSERT INTO links(id,merchant_id,type,platform,url,state) VALUES($1,$2,$3,$4,$5,$6)',[id,mid,type,'测试','https://www.example.com/',state]);
});
after(async()=>{await (db as any).close?.();});
test('匿名访客标识稳定，不存IP或原始标识',()=>{
 let cookie='';const q:any={headers:{},reply:{append:(_k:string,v:string)=>cookie=v}};
 const a=anonymousVisitor(q);assert.equal(a.length,64);assert.match(cookie,/HttpOnly/);
 q.headers.cookie=cookie.split(';')[0];assert.equal(anonymousVisitor(q),a);
});
test('曝光、详情PV/UV、官网与直播引流分别累计，并按事件键幂等',async()=>{
 const key=randomUUID(),visitor='visitor-a';
 const e={merchantId:mid,kind:'IMPRESSION',source:'total',visitor,eventKey:key};
 assert.equal((await recordEvent(db,e)).recorded,true);assert.equal((await recordEvent(db,e)).recorded,false);
 for(const v of ['visitor-a','visitor-a','visitor-b'])await recordEvent(db,{...e,kind:'VIEW',visitor:v,eventKey:randomUUID()});
 for(const [linkId,kind]of[[website,'WEBSITE'],[website,'WEBSITE'],[live,'LIVE']])await recordEvent(db,{...e,kind,linkId,eventKey:randomUUID(),source:'detail'});
 await recordEvent(db,{...e,merchantId:foreign,eventKey:randomUUID()});
 const r=await analyticsReport(db,{ownerId:owner});
 assert.equal(r.summary.impressions,1);assert.equal(r.summary.views,3);assert.equal(r.summary.visitors,2);assert.equal(r.summary.website,2);assert.equal(r.summary.live,1);assert.equal(r.summary.clicks,3);assert.equal(r.summary.click_visitors,1);
 assert.equal(r.series.length,7);assert.equal(r.series.reduce((n,d)=>n+d.views,0),3);assert.equal(r.channels.find(l=>l.id===website).clicks,2);assert.equal(r.channels.find(l=>l.id===pending).clicks,0);assert.equal(r.merchants.length,1);
});
test('商家数据隔离；本人预览不计数；链接须通过审核且属于该商家',async()=>{
 const e={merchantId:mid,kind:'VIEW',source:'detail',visitor:'visitor-c',eventKey:randomUUID(),actorId:owner};
 assert.equal((await recordEvent(db,e)).recorded,false);
 await assert.rejects(()=>analyticsReport(db,{ownerId:other,merchantId:mid}));
 await assert.rejects(()=>recordEvent(db,{...e,actorId:undefined,kind:'LIVE',linkId:pending}));
 await assert.rejects(()=>recordEvent(db,{...e,actorId:undefined,merchantId:foreign,kind:'WEBSITE',linkId:website}));
 await assert.rejects(()=>analyticsReport(db,{days:365}));
 await assert.rejects(()=>recordEvent(db,{...e,eventKey:'invalid'}));
});
test('时间筛选排除过去事件，隐藏品牌停止收集且历史报表保留',async()=>{
 const e={merchantId:mid,kind:'VIEW',source:'detail',visitor:'old-visitor',eventKey:randomUUID()};
 await recordEvent(db,e);await db.query("UPDATE analytics_events SET created_at=now()-interval '15 days' WHERE event_key=$1",[e.eventKey]);
 assert.equal((await analyticsReport(db,{ownerId:owner,days:7})).summary.views,3);
 assert.equal((await analyticsReport(db,{ownerId:owner,days:30})).summary.views,4);
 assert.equal((await analyticsReport(db,{ownerId:owner,days:90})).series.length,90);
 await db.query("UPDATE merchants SET state='HIDDEN' WHERE id=$1",[mid]);
 await assert.rejects(()=>recordEvent(db,{...e,eventKey:randomUUID()}));
 assert.equal((await analyticsReport(db,{ownerId:owner})).summary.clicks,3);
});
test('官网允许公开域名，阻止脚本、私网地址和未许可直播域名',()=>{
 assert.equal(validateOutboundUrl('https://www.rolex.com/zh-hans','WEBSITE'),'https://www.rolex.com/zh-hans');
 for(const url of ['javascript:alert(1)','http://www.example.com','https://127.0.0.1/','https://192.168.1.1/','https://foo.local/','https://[::1]/','https://user:pw@www.example.com/'])assert.throws(()=>validateOutboundUrl(url,'WEBSITE'));
 assert.throws(()=>validateOutboundUrl('https://www.example.com/','LIVE'));
 assert.equal(validateOutboundUrl('https://live.douyin.com/123','LIVE'),'https://live.douyin.com/123');
});
