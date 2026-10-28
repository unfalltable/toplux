import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
type Row=Record<string,any>;
export const atlasCuration=JSON.parse(readFileSync('design/atlas-ranking.json','utf8'));
export const atlasTiers=['殿堂级','奢华级','高端级','精品级','进阶级','不适用'];
export function categoryCuration(slug:string){
 const category=atlasCuration.categories.find((c:Row)=>c.slug===slug);
 return category?{scope:category.scope,note:category.note,method:atlasCuration.method,asOf:atlasCuration.asOf}:null;
}
export function sortAtlasProfiles<T extends Row>(rows:T[]):T[]{
 const tier=(p:T)=>{const index=atlasTiers.indexOf(p.tier);return index<0?atlasTiers.length:index;};
 const order=(p:T)=>Number.isInteger(p.editorial?.positioning?.order)&&p.editorial.positioning.order>0?p.editorial.positioning.order:10000;
 return [...rows].sort((a,b)=>Number(!!a.demo)-Number(!!b.demo)||tier(a)-tier(b)||order(a)-order(b)||String(a.name).localeCompare(String(b.name),'zh-CN')||String(a.id).localeCompare(String(b.id)));
}
export function categoryProfiles<T extends Row>(rows:T[]):T[]{
 const sourced=rows.filter(p=>p.demo===false);
 return sortAtlasProfiles(sourced.length?sourced:rows);
}
const scenes:Record<string,string>={
 watches:'正式商务、腕表交流、日常佩戴',bags:'日常穿搭、通勤、正式社交',jewelry:'礼赠、宴会、婚礼与日常珠宝搭配',clothing:'商务、正式活动与高端日常衣橱',
 shoes:'商务、晚宴与个人穿搭',accessories:'礼赠与整体穿搭',fragrance:'个人香氛、约会与礼赠',beauty:'个人护理与礼赠',cars:'商务接待、驾驶与车友交流',
 motorcycles:'骑行与摩托爱好者交流',bicycles:'公路骑行与运动交流',yachts:'海上休闲、私人会客与航海', 'wine-spirits':'品饮、宴请与礼赠',phones:'商务与个性化礼赠',
 computers:'创作、工作与高性能计算',headphones:'个人聆听与音频交流',audio:'居家聆听、影音空间与器材交流',cameras:'摄影、创作与影像交流',
 televisions:'家庭影音与室内设计',appliances:'整体厨房与住宅规划',furniture:'居家陈设、会客与空间设计',stationery:'书写、正式签字与礼赠',sports:'家庭健身与空间设计',
 outdoor:'冬季穿搭、滑雪与户外活动',eyewear:'日常佩戴与造型搭配','small-leather':'日常携带、礼赠与穿搭',scarves:'日常搭配与礼赠',hats:'正式着装与个人造型',
 'travel-goods':'旅行、商务出行与行李搭配','home-fragrance':'居家氛围与礼赠','tableware-crystal':'宴请、餐桌布置与家居展示','home-textiles':'卧室、浴室与居家织物',
 lighting:'空间设计、会客与建筑项目','art-collectibles':'家居陈设与工艺收藏','musical-instruments':'演奏、音乐交流与私人空间','tea-coffee':'品饮、礼赠与茶室体验',
 'luxury-hotels':'度假、商务与目的地体验','luxury-travel':'目的地旅行、纪念与私人行程','private-aviation':'商务与私人航空出行','fine-food':'品鉴、宴请与礼赠'
};
function stableId(slug:string,english:string){
 const hex=createHash('sha256').update('atlas-curation-v1:'+slug+':'+english.toLowerCase()).digest('hex');
 return hex.slice(0,8)+'-'+hex.slice(8,12)+'-4'+hex.slice(13,16)+'-9'+hex.slice(17,20)+'-'+hex.slice(20,32);
}
export function curatedAtlasSeed(){
 const legacy:Row[]=JSON.parse(readFileSync('design/atlas-seed.json','utf8')).brands;
 return atlasCuration.categories.flatMap((category:Row)=>category.items.map((brand:Row,index:number)=>{
  const old=legacy.find(item=>item.categorySlug===category.slug&&item.english===brand.english);
  const limited=brand.sourceReview?.status!=='REACHABLE';
  const positioning={order:index+1,scope:category.scope,reason:brand.reason,asOf:atlasCuration.asOf};
  const occasion=scenes[category.slug]||'个人使用、社交与礼赠';
  const editorial={
   story:brand.story,products:brand.products,
   valueReading:brand.reason+'\n'+category.note,
   socialSignals:[{name:'品牌与身份表达',description:brand.reason},{name:'场合与认同',description:'在'+occasion+'中，具体作品和观看者的知识共同影响辨识；拥有物品不等于获得圈层资格。'}],
   socialContext:{
    audience:'对'+occasion+'感兴趣，并希望了解'+brand.name+'设计与文化线索的人。',
    publicRecognition:/大众|公众|外显|显性|强视觉|较直接|容易被理解/.test(brand.reason)?'有较直接的品牌或造型线索；低标识款式仍可能不易识别。':'大众识别取决于具体作品；品牌名称、独特造型和使用场景提供线索，不保证人人认出。',
    circleRecognition:brand.reason,
    expressionStyle:category.scope==='SPECIALIST'?'偏向特定兴趣、设计与专业圈层表达；专业设备不等同于奢侈品身份。':'可以表达审美、品牌偏好与生活方式；外显或克制程度需结合具体系列。',
    socialScenes:occasion,
    budgetNote:'不同系列、配置、地区及服务差异较大；以官方当前报价及具体作品为准，不给出统一入门价。'
   },
   considerations:category.note+'\n先明确喜欢的是作品、使用场景还是被识别的感觉。身份与圈层解读属于编辑观点，不能保证他人的评价。',
   references:[{title:brand.name+'官方目录',url:brand.url}],positioning
  };
  return {...old,id:old?.id||stableId(category.slug,brand.english),categorySlug:category.slug,name:brand.name,english:brand.english,tier:brand.tier,summary:old?.summary||brand.reason,recognition:old?.recognition||brand.reason,occasion:old?.occasion||occasion,
   source:old?.source||'参考所列品牌官方目录；故事为资料摘要，层级、顺序与社交定位为平台编辑意见（'+atlasCuration.asOf+'）。'+(limited?'官网自动访问受限或未完整呈现，具体资料待人工复核。':'已核对官网入口及首页线索，具体款式以当前目录为准。'),
   editorial:old?{...old.editorial,positioning}:editorial,legacy:old};
 }));
}
