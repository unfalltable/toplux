import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {connect,type DB} from '../apps/api/src/db.js';
import {submitPartner,publicPartners,reviewPartner,partnerQueue,partnerDashboard,partnerInteraction,createAppointment,appointmentState,createCampaign,campaignState,partnerVisibility,normalizePartner} from '../apps/api/src/partners.js';
let db:DB,brand:string,otherBrand:string,reviewer:string,editor:string;
before(async()=>{db=await connect(true);const profiles=(await db.query("SELECT * FROM profiles WHERE NOT demo ORDER BY name")).rows;brand=profiles[0].brand_id;otherBrand=profiles[1].brand_id;const users=(await db.query('SELECT * FROM users')).rows;reviewer=users.find(u=>u.role==='REVIEWER').id;editor=users.find(u=>u.role==='EDITOR').id;});
after(async()=>{await (db as any).close?.();});
const body=(extra:any={})=>({kind:'STORE',name:'功能验证门店（虚构）',city:'上海市',address:'功能测试地址，不对应真实门店',hours:'需预约',description:'内存数据库验证',affiliation:'测试商家',brandIds:[brand],phone:'+1 202-555-0100',wechat:'demo_test_store',consent:true,...extra});
async function listing(extra:any={}){const owner='owner-'+randomUUID(),result=await submitPartner(db,owner,body(extra),undefined,randomUUID());return {owner,id:result.id};}
async function approve(id:string){const row=(await db.query('SELECT * FROM partner_listings WHERE id=$1',[id])).rows[0];await reviewPartner(db,reviewer,id,{version:row.version,approved:true,reason:'已核实测试资料',verification:'INDEPENDENT'});}
const interact=(listing:string,visitor:string,extra:any={})=>partnerInteraction(db,visitor,listing,{brandId:brand,city:'上海市',kind:'PHONE',eventKey:randomUUID(),...extra},true);
test('门店申请经过审核才公开，入驻不能自行指定官方身份，申请重试不重复创建',async()=>{
 const owner='owner-'+randomUUID(),key=randomUUID(),payload=body(),results=await Promise.all(Array.from({length:5},()=>submitPartner(db,owner,payload,undefined,key))),first=results[0],again=results[4];assert.equal(new Set(results.map(r=>r.id)).size,1);
 assert.equal(first.id,again.id);assert.ok(!(await publicPartners(db,brand)).items.some(l=>l.id===first.id));
 await assert.rejects(()=>normalizePartner(db,{...payload,verification:'OFFICIAL'}),/字段无效/);
 await assert.rejects(()=>normalizePartner(db,{...payload,consent:false}),/有权公开/);
 await assert.rejects(()=>normalizePartner(db,{...payload,phone:'',wechat:''}),/电话或微信/);
 await assert.rejects(()=>normalizePartner(db,{...payload,kind:'SALES',affiliation:''}),/所属门店/);
 await assert.rejects(()=>reviewPartner(db,editor,first.id,{version:1,approved:true,reason:'越权'}),/权限/);
 await assert.rejects(()=>reviewPartner(db,reviewer,first.id,{version:1,approved:true,reason:'核验',verification:'OFFICIAL'}),/核验依据/);
 await approve(first.id);
 const publicRow=(await publicPartners(db,brand)).items.find(l=>l.id===first.id)!;
 assert.ok(publicRow);assert.equal(publicRow.verification,'INDEPENDENT');assert.equal((publicRow as any).phone,undefined);assert.equal((publicRow as any).owner_key,undefined);
 await assert.rejects(()=>submitPartner(db,owner,body({name:'不同内容'}),undefined,key),/同一申请编号/);
});
test('门店修订保留线上旧版，审核版本冲突被拒绝，授权标识需要依据',async()=>{
 const l=await listing();await approve(l.id);const revision=await submitPartner(db,l.owner,body({phone:'+1 202-555-0199'}),l.id);
 const retry=await submitPartner(db,l.owner,body({phone:'+1 202-555-0199'}),l.id);assert.equal(retry.revisionId,revision.revisionId);
 assert.equal((await interact(l.id,l.owner)).value,'+1 202-555-0100');
 await assert.rejects(()=>submitPartner(db,'stranger',body(),l.id),/无权修改/);
 await assert.rejects(()=>reviewPartner(db,reviewer,l.id,{version:1,revisionId:revision.revisionId,approved:true,reason:'旧版本'}),/已更新/);
 await reviewPartner(db,reviewer,l.id,{version:2,revisionId:revision.revisionId,approved:true,reason:'核实修订资料',verification:'AUTHORIZED',verificationReason:'测试授权材料，仅内存验证'});
 assert.equal((await interact(l.id,l.owner)).value,'+1 202-555-0199');
 assert.equal((await publicPartners(db,brand)).items.find(p=>p.id===l.id)?.verification,'AUTHORIZED');
 assert.equal((await partnerQueue(db)).revisions.filter(r=>r.id===revision.revisionId).length,0);
});
test('品牌与城市筛选、隐藏审核和联系入口均受同一展示规则约束',async()=>{
 const l=await listing({city:'北京市'});await approve(l.id);
 assert.ok((await publicPartners(db,brand,'北京市')).items.some(r=>r.id===l.id));
 assert.ok(!(await publicPartners(db,brand,'上海市')).items.some(r=>r.id===l.id));
 assert.ok(!(await publicPartners(db,otherBrand)).items.some(r=>r.id===l.id));
 await assert.rejects(()=>interact(l.id,'visitor',{brandId:otherBrand,city:'北京市'}),/不可展示/);
 await partnerVisibility(db,reviewer,l.id,{version:2,visible:false,reason:'暂时下线测试'});
 assert.ok(!(await publicPartners(db,brand)).items.some(r=>r.id===l.id));
 await assert.rejects(()=>interact(l.id,'visitor',{city:'北京市'}),/不可展示/);
 await partnerVisibility(db,reviewer,l.id,{version:3,visible:true,reason:'恢复测试'});
 assert.ok((await publicPartners(db,brand)).items.some(r=>r.id===l.id));
});
test('联系事件幂等、本人预览排除、地图固定域名，公开端不能伪造预约事件',async()=>{
 const l=await listing();await approve(l.id);const eventKey=randomUUID();
 await interact(l.id,'visitor',{eventKey});await interact(l.id,'visitor',{eventKey});
 await interact(l.id,l.owner);
 const dashboard=await partnerDashboard(db,l.owner);assert.equal(dashboard.metrics.find(m=>m.kind==='PHONE')?.total,1);
 await assert.rejects(()=>interact(l.id,'visitor',{kind:'WECHAT',eventKey}),/同一事件编号/);
 await assert.rejects(()=>interact(l.id,'visitor',{kind:'APPOINTMENT'}),/事件无效/);
 const map=await interact(l.id,l.owner,{kind:'MAP'});assert.ok(map.value.startsWith('https://uri.amap.com/search?'));
 assert.equal((await partnerDashboard(db,'other-owner')).items.length,0);
});
test('沙箱竞价按出价排序并精确匹配品牌城市，创建幂等且跨用户不可投放',async()=>{
 const l=await listing();await approve(l.id);const owner=l.owner,key=randomUUID(),campaignBody={listingId:l.id,brandId:brand,bidFen:500,budgetFen:2000,days:7,consent:true};
 await assert.rejects(()=>createCampaign(db,owner,campaignBody,key,false),/尚未开通/);
 await assert.rejects(()=>createCampaign(db,'other',campaignBody,key,true),/本人/);
 const c=await createCampaign(db,owner,campaignBody,key,true),same=await createCampaign(db,owner,campaignBody,key,true);assert.equal(c.id,same.id);
 const result=await publicPartners(db,brand,'上海市');assert.equal(result.items[0].id,l.id);assert.equal(result.items[0].campaignId,c.id);
 assert.ok(!(await publicPartners(db,brand,'北京市')).items.some(r=>r.campaignId===c.id));
 await assert.rejects(()=>createCampaign(db,owner,{...campaignBody,bidFen:501},key,true),/请求编号/);
 await assert.rejects(()=>campaignState(db,'other',c.id,'PAUSED'),/无权/);
 await campaignState(db,owner,c.id,'PAUSED');assert.equal((await publicPartners(db,brand)).items.find(r=>r.id===l.id)?.promoted,false);
 await campaignState(db,owner,c.id,'ACTIVE');
 await partnerVisibility(db,reviewer,l.id,{version:2,visible:false,reason:'测试隐藏停止展示'});
 assert.ok(!(await publicPartners(db,brand)).items.some(r=>r.id===l.id));
});
test('同访客跨电话与微信每日仅模拟扣费一次，重试不重复记账，本人不计费',async()=>{
 const l=await listing();await approve(l.id);const c=await createCampaign(db,l.owner,{listingId:l.id,brandId:brand,bidFen:100,budgetFen:1000,days:1,consent:true},randomUUID(),true),eventKey=randomUUID();
 const a=await interact(l.id,'same-visitor',{campaignId:c.id,eventKey});assert.equal(a.chargedFen,100);
 await interact(l.id,'same-visitor',{campaignId:c.id,eventKey});await interact(l.id,'same-visitor',{campaignId:c.id,kind:'WECHAT'});await interact(l.id,l.owner,{campaignId:c.id});
 const report=await partnerDashboard(db,l.owner);assert.equal(report.campaigns[0].spent_fen,100);
 assert.equal(Number((await db.query('SELECT count(*) AS n FROM partner_spend WHERE campaign_id=$1',[c.id])).rows[0].n),1);
 assert.equal(Number((await db.query('SELECT count(*) AS n FROM rank_ledger')).rows[0].n),0);
 await assert.rejects(()=>db.query('DELETE FROM partner_spend WHERE campaign_id=$1',[c.id]),/不可修改/);
});
test('多访客并发联系不会超预算，耗尽停止推广，冒用其他商家竞价编号不会扣费',async()=>{
 const l=await listing();await approve(l.id);const c=await createCampaign(db,l.owner,{listingId:l.id,brandId:brand,bidFen:60,budgetFen:100,days:1,consent:true},randomUUID(),true);
 await Promise.all(Array.from({length:8},(_,i)=>interact(l.id,'budget-'+i,{campaignId:c.id})));
 const spent=(await partnerDashboard(db,l.owner)).campaigns.find(x=>x.id===c.id)!.spent_fen;assert.equal(spent,60);
 assert.equal((await publicPartners(db,brand)).items.find(p=>p.id===l.id)?.promoted,false);
 await assert.rejects(()=>campaignState(db,l.owner,c.id,'ACTIVE'),/预算不足/);
 const other=await listing();await approve(other.id);const before=(await partnerDashboard(db,l.owner)).campaigns[0].spent_fen;
 const result=await interact(other.id,'outsider',{campaignId:c.id});assert.equal(result.chargedFen,0);
 assert.equal((await partnerDashboard(db,l.owner)).campaigns[0].spent_fen,before);
});
test('预约明确同意后提交，重试只保存一份，仅所属商家可读及跟进',async()=>{
 const l=await listing();await approve(l.id);const appointment={brandId:brand,eventKey:randomUUID(),name:'测试访客',phone:'+1 202-555-0101',preferredAt:new Date(Date.now()+86400000).toISOString(),note:'内存验证预约，不联系真实用户',consent:true};
 await assert.rejects(()=>createAppointment(db,'visitor',l.id,{...appointment,consent:false}),/同意/);
 await assert.rejects(()=>createAppointment(db,'visitor',l.id,{...appointment,preferredAt:'2000-01-01'}),/未来90天/);
 const a=await createAppointment(db,'visitor',l.id,appointment),retry=await createAppointment(db,'visitor',l.id,appointment);assert.equal(a.id,retry.id);
 assert.equal((await partnerDashboard(db,l.owner)).appointments.length,1);assert.equal((await partnerDashboard(db,'stranger')).appointments.length,0);
 await assert.rejects(()=>appointmentState(db,'stranger',a.id,'CONTACTED'),/无权/);
 await appointmentState(db,l.owner,a.id,'CONTACTED');assert.equal((await partnerDashboard(db,l.owner)).appointments[0].state,'CONTACTED');
 assert.equal((await partnerDashboard(db,l.owner)).metrics.find(m=>m.kind==='APPOINTMENT')?.total,1);
});

test('展示状态变更造成修订过期后可退回再提交，不会锁死资料',async()=>{
 const l=await listing();await approve(l.id);
 const revision=await submitPartner(db,l.owner,body({description:'待审核的新介绍'}),l.id);
 await partnerVisibility(db,reviewer,l.id,{version:2,visible:false,reason:'暂停展示'});
 await assert.rejects(()=>reviewPartner(db,reviewer,l.id,{version:3,revisionId:revision.revisionId,approved:true,reason:'过期发布'}),/版本过期/);
 await reviewPartner(db,reviewer,l.id,{version:3,revisionId:revision.revisionId,approved:false,reason:'退回过期修订，重新提交'});
 const fresh=await submitPartner(db,l.owner,body({description:'重新核对后的介绍'}),l.id);assert.notEqual(fresh.revisionId,revision.revisionId);
});
