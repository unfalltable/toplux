import {readFileSync} from 'node:fs';
const catalog=JSON.parse(readFileSync('design/atlas-ranking.json','utf8'));
const sources=[...new Map(catalog.categories.flatMap(c=>c.items.map(b=>[b.url,b]))).values()];
let next=0;const results=[];
await Promise.all(Array.from({length:6},async()=>{
 while(next<sources.length){
  const brand=sources[next++],started=Date.now();
  try{
   const response=await fetch(brand.url,{signal:AbortSignal.timeout(10000),headers:{'User-Agent':'Mozilla/5.0'}});
   const reader=response.body?.getReader();let html='',length=0;
   if(reader){const decoder=new TextDecoder();while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;html+=decoder.decode(value,{stream:true});if(length>1500000){await reader.cancel();break;}}}
   const title=(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0,180);
   const text=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');
   const terms=brand.products.map(p=>p.name.split(' ')[0]).filter(p=>p.length>2);
   results.push({brand:brand.english,url:brand.url,finalUrl:response.url,status:response.status,title,productMentions:terms.filter(term=>text.toLowerCase().includes(term.toLowerCase())),elapsedMs:Date.now()-started});
  }catch(e){results.push({brand:brand.english,url:brand.url,error:e.message,elapsedMs:Date.now()-started});}
 }
}));
console.log(JSON.stringify({checkedAt:new Date().toISOString(),note:'官网连通性及首页线索核对；成功响应不等于逐项事实核验，编辑层级不由官网背书。',results},null,2));
