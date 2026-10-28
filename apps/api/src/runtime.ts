import {readFileSync} from 'node:fs';
import {check} from './funds.js';
export function loadRuntime(){
 const production=process.env.APP_ENV==='production';
 if(process.env.DATABASE_URL_FILE){
  if(process.env.DATABASE_URL)throw new Error('Configure only DATABASE_URL or DATABASE_URL_FILE');
  process.env.DATABASE_URL=readFileSync(process.env.DATABASE_URL_FILE,'utf8').trim();
 }
 if(production){
  if(!process.env.DATABASE_URL)throw new Error('Production requires PostgreSQL');
  const origin=new URL(process.env.PUBLIC_ORIGIN||'');
  if(!['http:','https:'].includes(origin.protocol)||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash)throw new Error('PUBLIC_ORIGIN must be an HTTP(S) origin');
 }
 return {production};
}
export function secureCookieSuffix(){
 return process.env.APP_ENV==='production'&&process.env.PUBLIC_ORIGIN?.startsWith('https://')?'; Secure':'';
}
export function requireContributionChannel(){
 check(process.env.APP_ENV!=='production','品牌助力收款尚未开放，请先浏览品牌图鉴',503);
}
