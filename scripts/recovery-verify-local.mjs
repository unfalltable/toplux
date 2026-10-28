import {spawn} from 'node:child_process';import fs from 'node:fs';
const base='http://127.0.0.1:3100';let api,stderr='',stdout='';
async function healthy(){try{const r=await fetch(base+'/api/v1/health',{signal:AbortSignal.timeout(1000)});return r.ok;}catch{return false;}}
function run(file,args){return new Promise((resolve,reject)=>{const child=spawn(file,args,{stdio:'inherit',env:{...process.env}});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error(file+' exit '+code)));});}
try{
 if(!await healthy()){api=spawn(process.execPath,['--import','tsx','apps/api/src/main.ts'],{stdio:['ignore','pipe','pipe'],env:{...process.env}});api.stdout.on('data',b=>{stdout+=b});api.stderr.on('data',b=>{stderr+=b});let ready=false;for(let i=0;i<50;i++){await new Promise(r=>setTimeout(r,400));if(await healthy()){ready=true;break;}if(api.exitCode!==null)break;}if(!ready)throw Error('Local API failed to start: '+stderr.slice(-3000));}
 await run(process.execPath,['--import','tsx','tests/browser.ts']);
 await run(process.execPath,['scripts/recovery-visual-check.mjs']);
}finally{if(api){api.kill();fs.writeFileSync('artifacts/recovery-local-api-error.log',stderr);fs.writeFileSync('artifacts/recovery-local-api-out.log',stdout);}}
