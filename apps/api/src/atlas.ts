import {withOfficialMedia} from './official-media.js';
import type {DB} from './db.js';
import {check} from './funds.js';
import {validateOutboundUrl} from './analytics.js';
import {classification} from './classification.js';
import {publicMetrics} from './support.js';
const text=(value:any,max:number,label:string)=>{check(typeof value==='string'&&value.length<=max,label+'格式或长度无效');return value.trim();};
export function normalizeEditorial(value:any){
 check(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(key=>['story','products','valueReading','socialSignals','considerations','references','socialContext','positioning'].includes(key)),'图鉴内容字段无效');
 const pairs=(rows:any,label:string)=>{check(Array.isArray(rows)&&rows.length<=6,label+'最多6项');return rows.map((row:any)=>{check(row&&Object.keys(row).every(key=>['name','description'].includes(key)),label+'字段无效');const name=text(row.name,100,label+'名称'),description=text(row.description,1500,label+'说明');check(name&&description,'请完整填写'+label);return {name,description};});};
 const input=value.positioning;
 let positioning:any=null;
 if(input!==undefined&&input!==null){
  check(input&&typeof input==='object'&&!Array.isArray(input)&&Object.keys(input).every(k=>['order','scope','reason','asOf'].includes(k)),'定位参考字段无效');
  check(Number.isInteger(input.order)&&input.order>=1&&input.order<=9999,'定位顺序须为1至9999的整数');
  check(['LUXURY','SPECIALIST'].includes(input.scope),'定位范围无效');
  const reason=text(input.reason,1500,'定位依据'),asOf=text(input.asOf,10,'定位日期');
  check(reason,'请填写定位依据');
  check(/^\d{4}-\d{2}-\d{2}$/.test(asOf)&&!Number.isNaN(Date.parse(asOf))&&new Date(asOf).toISOString().slice(0,10)===asOf,'定位日期无效');
  positioning={order:input.order,scope:input.scope,reason,asOf};
 }
 const references=value.references??[];check(Array.isArray(references)&&references.length<=10,'资料来源最多10项');
 const context=value.socialContext??{};check(context&&typeof context==='object'&&!Array.isArray(context)&&Object.keys(context).every(k=>['audience','publicRecognition','circleRecognition','expressionStyle','socialScenes','budgetNote'].includes(k)),'社交定位字段无效');
 const socialContext=Object.fromEntries(['audience','publicRecognition','circleRecognition','expressionStyle','socialScenes','budgetNote'].map(k=>[k,text(context[k]??'',1000,'社交定位')]));
 return {positioning,socialContext,story:text(value.story??'',8000,'品牌故事'),products:pairs(value.products??[],'代表产品'),valueReading:text(value.valueReading??'',8000,'价值解读'),socialSignals:pairs(value.socialSignals??[],'身份表达'),considerations:text(value.considerations??'',4000,'购前判断'),references:references.map((reference:any)=>{check(reference&&Object.keys(reference).every(key=>['title','url'].includes(key)),'来源字段无效');const title=text(reference.title,150,'来源标题');check(title,'请填写来源标题');return {title,url:validateOutboundUrl(reference.url,'WEBSITE')};})};
}
export function profileExtras(body:any,current?:any){
 const editorial=body.editorial===undefined?(current?.editorial||{}):normalizeEditorial(body.editorial);
 const demo=body.contentMode===undefined?(current?.demo??true):body.contentMode==='DEMO';
 if(process.env.APP_ENV==='production')check(!demo,'正式环境不能发布虚构演示资料');
 check(demo||editorial.references?.length>0,'真实品牌资料请附至少一项来源');
 return {editorial,demo};
}
export async function publicAtlas(db:DB,id:string,visitor?:string){
 check(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id),'品牌不存在或已下线',404);
 const merchant=(await db.query("SELECT m.id,m.name,m.description,a.data AS logo,(SELECT COALESCE(sum(net_fen),0)::text FROM merchant_categories WHERE merchant_id=m.id) AS net_fen FROM merchants m JOIN assets a ON a.id=m.logo_asset_id WHERE m.id=$1 AND m.state='APPROVED'",[id])).rows[0];
 check(merchant,'品牌不存在或已下线',404);
 const profiles=(await db.query("SELECT p.*,c.name AS category_name,c.slug AS category_slug FROM profiles p JOIN categories c ON c.id=p.category_id WHERE p.brand_id=$1 AND p.state='PUBLISHED' AND c.active ORDER BY c.sort_order,p.updated_at DESC,p.id",[id])).rows;
 return {merchant:{...merchant,...(profiles.map(withOfficialMedia).find(p=>p.media?.logo)?.media?.logo?{logo:profiles.map(withOfficialMedia).find(p=>p.media?.logo)!.media!.logo.src}:{}),net_fen:Number(merchant.net_fen),classification:await classification(db,id),stats:(await publicMetrics(db,[id],visitor)).get(id)},profiles:profiles.map(withOfficialMedia),available:profiles.length>0};
}
