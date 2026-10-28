
import {randomUUID} from 'node:crypto';
import type {DB} from './db.js';
import {check,audit} from './funds.js';
import {lockRankings,syncRankingHeads} from './live-ranking.js';
import {normalizeEditorial,profileExtras} from './atlas.js';
const requiredProfileKeys=['categoryId','name','english','tier','summary','recognition','occasion','source'];
export const catalogKeys=[...requiredProfileKeys,'editorial','contentMode','brandId'];
export function validateProfile(body:any){
 check(body&&Object.keys(body).every(k=>catalogKeys.includes(k)),'品牌资料字段无效');
 for(const key of requiredProfileKeys)check(typeof body[key]==='string'&&body[key].trim().length>0&&body[key].length<=3000,'请完整填写品牌名称、品类、定位、场合及来源');
 if(body.editorial!==undefined)normalizeEditorial(body.editorial);
 if(body.contentMode!==undefined)check(['DEMO','SOURCED'].includes(body.contentMode),'请选择演示资料或附来源资料');
 if(body.contentMode==='SOURCED')check(body.editorial?.references?.length>0,'真实品牌资料请附至少一项来源');
 if(body.brandId!==undefined)check(typeof body.brandId==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.brandId),'关联品牌编号无效');
 check(body.name.trim().length<=60&&body.english.trim().length<=100,'品牌名称过长');
 check(['殿堂级','奢华级','高端级','精品级','进阶级','不适用'].includes(body.tier),'请选择有效定位');
}
export async function saveCategory(db:DB,actor:string,body:any,id?:string){
 check(body&&Object.keys(body).every(k=>['name','slug','sortOrder','active'].includes(k)),'品类字段无效');
 check(typeof body.name==='string'&&body.name.trim().length>=1&&body.name.trim().length<=30,'品类名称须为1至30字');
 check(typeof body.slug==='string'&&/^[a-z][a-z0-9-]{0,49}$/.test(body.slug),'品类标识须为英文小写、数字或短横线');
 check(Number.isSafeInteger(body.sortOrder)&&body.sortOrder>=0&&body.sortOrder<=100000,'排序值须为0至100000整数');
 check(typeof body.active==='boolean','请选择启用状态');
 return db.transaction(async t=>{
 await lockRankings(t);
 const duplicate=(await t.query('SELECT id FROM categories WHERE (slug=$1 OR name=$2) AND id<>$3',[body.slug,body.name.trim(),id||'00000000-0000-0000-0000-000000000000'])).rows;
 check(!duplicate.length,'品类名称或标识已存在',409);
 if(id)check((await t.query('SELECT id FROM categories WHERE id=$1 FOR UPDATE',[id])).rows.length,'品类不存在',404);
 const target=id||randomUUID();
 if(id)await t.query('UPDATE categories SET name=$1,slug=$2,sort_order=$3,active=$4 WHERE id=$5',[body.name.trim(),body.slug,body.sortOrder,body.active,target]);
 else await t.query('INSERT INTO categories VALUES($1,$2,$3,$4,$5)',[target,body.slug,body.name.trim(),body.active,body.sortOrder]);
 await syncRankingHeads(t);
 await audit(t,actor,id?'UPDATE_CATEGORY':'CREATE_CATEGORY',target,body.active?'启用':'停用，保留历史资料与资金');
 return {id:target};
 });
}
export async function reviseProfile(db:DB,actor:string,id:string,body:any){
 validateProfile(body);
 return db.transaction(async t=>{
 const p=(await t.query('SELECT * FROM profiles WHERE id=$1 FOR UPDATE',[id])).rows[0];check(p,'品牌不存在',404);
 if(body.brandId!==undefined)check(body.brandId===p.brand_id,'已有资料不能重新绑定其他品牌',409);
 check((await t.query('SELECT id FROM categories WHERE id=$1 AND active',[body.categoryId])).rows.length,'请选择启用品类');
 const rid=randomUUID();
 await t.query('INSERT INTO profile_revisions(id,profile_id,payload,base_version,author_id) VALUES($1,$2,$3,$4,$5)',[rid,id,JSON.stringify(body),p.version,actor]);
 await audit(t,actor,'REVISE_PROFILE',id,'修订待审核，原公开版本保留');
 return {id:rid,state:'DRAFT'};
 });
}
export async function decideRevision(db:DB,actor:string,id:string,approved:boolean,reason:string){
 check(typeof approved==='boolean'&&typeof reason==='string'&&reason.trim().length>0,'请提供审核结论与理由');
 return db.transaction(async t=>{
 const r=(await t.query('SELECT * FROM profile_revisions WHERE id=$1 FOR UPDATE',[id])).rows[0];check(r,'修订不存在',404);
 check(r.state==='DRAFT','该修订已处理',409);check(r.author_id!==actor,'不能审核自己的修订',403);
 const p=(await t.query('SELECT * FROM profiles WHERE id=$1 FOR UPDATE',[r.profile_id])).rows[0];
 if(approved){
 check(p.version===r.base_version,'品牌已更新，请重新编辑后提交审核',409);
 const b=r.payload;validateProfile(b);const extras=profileExtras(b,p);
 if(b.brandId!==undefined)check(b.brandId===p.brand_id,'已有资料不能重新绑定其他品牌',409);
 check((await t.query('SELECT id FROM categories WHERE id=$1 AND active',[b.categoryId])).rows.length,'目标品类已停用');
 await t.query("UPDATE profiles SET category_id=$1,name=$2,english=$3,tier=$4,summary=$5,recognition=$6,occasion=$7,source=$8,state='PUBLISHED',reviewer=$9,editorial=$10,demo=$11,version=version+1,updated_at=now() WHERE id=$12",[b.categoryId,b.name,b.english,b.tier,b.summary,b.recognition,b.occasion,b.source,actor,JSON.stringify(extras.editorial),extras.demo,p.id]);
 }
 await t.query('UPDATE profile_revisions SET state=$1,reviewer_id=$2,reason=$3 WHERE id=$4',[approved?'APPROVED':'REJECTED',actor,reason,id]);
 await audit(t,actor,'REVIEW_REVISION',r.profile_id,reason);
 return {ok:true};
 });
}
