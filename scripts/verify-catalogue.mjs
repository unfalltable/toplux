const base='http://127.0.0.1:3100/api/v1';
const get=async p=>{const r=await fetch(base+p,{signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error(p+': '+r.status);return r.json();};
const [health,capabilities,board,cats]=await Promise.all(['/health','/capabilities','/merchant-board','/categories'].map(get));
const categories=await Promise.all(cats.items.map(async c=>{const b=await get('/categories/'+c.id+'/brands');return {slug:c.slug,name:c.name,count:b.items.length,real:b.items.filter(x=>x.demo===false).length,ordered:b.items.map(x=>({english:x.english,tier:x.tier,order:x.editorial?.positioning?.order,scope:x.editorial?.positioning?.scope})),brand_count:c.brand_count};}));
console.log(JSON.stringify({health,capabilities,board:board.items.map(x=>({id:x.merchant_id||x.id,net_fen:x.net_fen,rank:x.rank})),categories}));
