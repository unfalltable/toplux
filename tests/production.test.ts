import {test} from 'node:test';
import assert from 'node:assert/strict';
import {connect} from '../apps/api/src/db.js';
import {loadRuntime,secureCookieSuffix,requireContributionChannel} from '../apps/api/src/runtime.js';
import {profileExtras} from '../apps/api/src/atlas.js';
test('正式初始化仅有真实图鉴，不导入虚构品牌、用户、流量和资金',async()=>{
 const saved={APP_ENV:process.env.APP_ENV,SEED_REAL_CATALOG:process.env.SEED_REAL_CATALOG};
 process.env.APP_ENV='production';process.env.SEED_REAL_CATALOG='true';
 let db:any;
 try{
  db=await connect(true);
  const result=(await db.query("SELECT (SELECT count(*) FROM profiles WHERE demo) AS demos,(SELECT count(*) FROM profiles WHERE NOT demo) AS real,(SELECT count(*) FROM users) AS users,(SELECT count(*) FROM orders) AS orders,(SELECT count(*) FROM rank_ledger) AS ledger,(SELECT count(*) FROM analytics_events) AS traffic,(SELECT count(*) FROM brand_follows) AS follows")).rows[0];
  assert.deepEqual(Object.fromEntries(Object.entries(result).map(([k,v])=>[k,Number(v)])),{demos:0,real:180,users:0,orders:0,ledger:0,traffic:0,follows:0});
  assert.throws(()=>requireContributionChannel(),/尚未开放/);
  assert.throws(()=>profileExtras({contentMode:'DEMO',editorial:{}}),/不能发布虚构/);
 }finally{
  await db?.close?.();
  for(const [k,v] of Object.entries(saved)){if(v===undefined)delete process.env[k];else process.env[k]=v;}
 }
});
test('正式配置要求数据库和明确来源；IP临时HTTP与后续HTTPS采用正确Cookie属性',()=>{
 const keys=['APP_ENV','DATABASE_URL','DATABASE_URL_FILE','PUBLIC_ORIGIN'],saved=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 try{
  process.env.APP_ENV='production';delete process.env.DATABASE_URL;delete process.env.DATABASE_URL_FILE;
  assert.throws(loadRuntime,/PostgreSQL/);process.env.DATABASE_URL='postgres://db/example';
  process.env.PUBLIC_ORIGIN='http://149.88.67.92:8080';assert.equal(loadRuntime().production,true);assert.equal(secureCookieSuffix(),'');
  process.env.PUBLIC_ORIGIN='https://example.com';assert.equal(secureCookieSuffix(),'; Secure');
  process.env.PUBLIC_ORIGIN='https://example.com/not-an-origin';assert.throws(loadRuntime,/origin/);
 }finally{for(const k of keys){if(saved[k]===undefined)delete process.env[k];else process.env[k]=saved[k];}}
});
