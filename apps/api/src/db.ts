
import {PGlite} from '@electric-sql/pglite';
import pg from 'pg';
import {readFileSync,mkdirSync} from 'node:fs';
import {syncCatalogueBrands} from './support.js';
import {seedAtlas} from './atlas-seed.js';
import {randomUUID} from 'node:crypto';
export type DB={query:(s:string,p?:any[])=>Promise<{rows:any[]}>,exec:(s:string)=>Promise<any>,transaction:<T>(fn:(t:DB)=>Promise<T>)=>Promise<T>};
export async function connect(memory=false):Promise<DB>{
 let db:DB;
 if(process.env.DATABASE_URL&&!memory){
  const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
  const wrap=(client:any):DB=>({query:(s,p)=>client.query(s,p),exec:s=>client.query(s),transaction:async fn=>{const c=await pool.connect();try{await c.query('BEGIN');const r=await fn(wrap(c));await c.query('COMMIT');return r;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}});
  db=wrap(pool);
 }else {if(!memory)mkdirSync('.data',{recursive:true}); db=new PGlite(memory?'memory://':'.data/postgres') as unknown as DB;}
 await db.exec(readFileSync('apps/api/migrations/001_initial.sql','utf8'));
 await db.exec(readFileSync('apps/api/migrations/002_catalog.sql','utf8'));
 await db.exec(readFileSync('apps/api/migrations/003_analytics.sql','utf8'));
 await db.exec(readFileSync('apps/api/migrations/004_public_support.sql','utf8'));
 await db.exec(readFileSync('apps/api/migrations/005_live_rankings.sql','utf8'));
 await db.exec(readFileSync('apps/api/migrations/006_brand_classification.sql','utf8'));
 await db.exec(readFileSync('apps/api/migrations/007_brand_atlas.sql','utf8'));
 await db.exec(readFileSync('apps/api/migrations/008_partner_market.sql','utf8'));
 const cats=JSON.parse(readFileSync('design/contracts/categories.json','utf8')).categories;
 for(const c of cats)await db.query('INSERT INTO categories VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',[c.id,c.slug,c.name,c.active,c.sortOrder]);
 if(process.env.APP_ENV!=='production'){
 for(const role of ['USER','EDITOR','REVIEWER','FINANCE','ADMIN'])await db.query('INSERT INTO users VALUES($1,$2,$3) ON CONFLICT(name) DO NOTHING',[randomUUID(),role.toLowerCase(),role]);
 const n=await db.query('SELECT count(*) AS n FROM profiles');
 if(Number(n.rows[0].n)===0)for(const c of cats)for(let i=0;i<3;i++)await db.query('INSERT INTO profiles(id,category_id,name,english,tier,summary,recognition,occasion,source) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[randomUUID(),c.id,['序物','观序','原境'][i],['FORME','ORDRE','ORIGIN'][i],['高端级','精品级','进阶级'][i],['以克制的设计语言，表达日常中的独立审美。','关注细节与场合之间的平衡，偏向安静的表达。','从实用出发，建立轻松而清晰的个人风格。'][i],'资料不足',['商务 · 正式场合','日常 · 城市出行','休闲 · 自我表达'][i],'演示虚构品牌，仅用于功能验证，不构成真实品牌评价。']);
 }
 if(process.env.APP_ENV!=='production')await seedAtlas(db);
 else {
  if(process.env.SEED_REAL_CATALOG==='true')await seedAtlas(db,{includeDemos:false});
  const invalid=(await db.query("SELECT count(*)::int AS n FROM profiles WHERE state='PUBLISHED' AND (demo OR NOT (editorial ? 'references') OR jsonb_array_length(editorial->'references')=0)")).rows[0];
  if(Number(invalid.n)>0)throw new Error('Production refuses demo or unsourced published profiles');
 }
 await syncCatalogueBrands(db);
 return db;
}
