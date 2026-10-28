import {randomBytes,createHash} from 'node:crypto';
import {mkdirSync,writeFileSync,renameSync,readFileSync,unlinkSync} from 'node:fs';
import {resolve} from 'node:path';
import {check} from './funds.js';
const folder=resolve('.data/staff-entry');
export const staffRoles=['ADMIN','EDITOR','REVIEWER'];
export function mintStaffTicket(account='admin'){
 check(['admin','editor','reviewer'].includes(account),'该身份不提供后台入口');
 mkdirSync(folder,{recursive:true});
 const ticket=randomBytes(32).toString('base64url'),hash=createHash('sha256').update(ticket).digest('hex');
 writeFileSync(resolve(folder,hash+'.json'),JSON.stringify({account,expiresAt:Date.now()+60000}),{mode:0o600,flag:'wx'});
 return ticket;
}
export function consumeStaffTicket(ticket:any){
 check(process.env.APP_ENV!=='production','本机管理入口不在生产环境开放',403);
 check(typeof ticket==='string'&&/^[A-Za-z0-9_-]{43}$/.test(ticket),'管理入口无效或已过期',403);
 const hash=createHash('sha256').update(ticket).digest('hex'),path=resolve(folder,hash+'.json'),used=path+'.used';
 let entry:any;
 try{renameSync(path,used);entry=JSON.parse(readFileSync(used,'utf8'));unlinkSync(used);}catch{check(false,'管理入口无效或已使用',403);}
 check(entry.expiresAt>Date.now()&&['admin','editor','reviewer'].includes(entry.account),'管理入口已过期',403);
 return entry.account as string;
}
