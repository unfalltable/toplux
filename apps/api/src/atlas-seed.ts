import {isDeepStrictEqual} from 'node:util';
import {curatedAtlasSeed} from './atlas-curation.js';
import type {DB} from './db.js';
import {normalizeEditorial} from './atlas.js';
const demoSource='演示虚构品牌，仅用于功能验证，不构成真实品牌评价。';
export async function seedAtlas(db:DB,{includeDemos=true}={}){
 const demos=includeDemos?(await db.query("SELECT p.*,c.name AS category_name FROM profiles p JOIN categories c ON c.id=p.category_id WHERE p.demo AND p.source=$1 AND p.name IN ('序物','观序','原境') AND p.editorial='{}'::jsonb",[demoSource])).rows:[];
 for(const profile of demos){
  const editorial={story:profile.name+'是用于产品演示的虚构品牌。本篇以'+profile.category_name+'为阅读场景，示范如何从设计语言、使用方式和文化联想理解品牌；不代表真实品牌历史。',products:[{name:profile.name+' · 日常线（虚构示例）',description:'用于说明日常使用、材质与造型之间的关系，没有对应的真实商品或售价。'},{name:profile.name+' · 典藏线（虚构示例）',description:'用于比较更强的仪式感和展示属性，不表示限量、保值或投资价值。'}],valueReading:'以'+profile.category_name+'为例，可分别考察实用功能、材料、制作、设计、服务与品牌叙事。价格和累计助力不能替代品质核查，也不保证某一种社会评价。',socialSignals:[{name:'辨识度',description:'明显标识便于被注意，细节表达则更依赖对方的知识和兴趣。'}, {name:'身份与圈层',description:'物品可以表达审美、兴趣和归属感，但这种认同因场合与人群而异。'}],considerations:'先区分真正想使用的功能、自己喜欢的设计和期待别人看到的符号；不要把三者混为同一件事。',references:[]};
  await db.query("UPDATE profiles SET editorial=$1 WHERE id=$2 AND editorial='{}'::jsonb",[JSON.stringify(editorial),profile.id]);
 }
 const seed=curatedAtlasSeed();
 for(const item of seed){
  const category=(await db.query('SELECT id FROM categories WHERE slug=$1',[item.categorySlug])).rows[0];if(!category)continue;
  const exists=(await db.query('SELECT * FROM profiles WHERE category_id=$1 AND lower(trim(english))=lower(trim($2))',[category.id,item.english])).rows[0];
  if(exists){
   // Upgrade only an untouched original seed. Reviewed or manually edited content wins.
   const old=item.legacy;
   if(old&&exists.author==='atlas-seed-v1'&&exists.version===1&&exists.state==='PUBLISHED'&&!exists.editorial.positioning&&['name','english','tier','summary','recognition','occasion','source'].every(key=>exists[key]===old[key])&&isDeepStrictEqual(normalizeEditorial(exists.editorial),normalizeEditorial(old.editorial))){
    await db.query("UPDATE profiles SET tier=$1,editorial=jsonb_set(editorial,'{positioning}',$2::jsonb) WHERE id=$3 AND version=1 AND editorial=$4::jsonb AND tier=$5",[item.tier,JSON.stringify(item.editorial.positioning),exists.id,JSON.stringify(exists.editorial),old.tier]);
   }
   continue;
  }
  const editorial=normalizeEditorial(item.editorial);
  await db.query("INSERT INTO profiles(id,category_id,name,english,tier,summary,recognition,occasion,source,editorial,demo,author) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,false,$11) ON CONFLICT(id) DO NOTHING",[item.id,category.id,item.name,item.english,item.tier,item.summary,item.recognition,item.occasion,item.source,JSON.stringify(editorial),item.legacy?'atlas-seed-v1':'atlas-curation-v1']);
 }
}
