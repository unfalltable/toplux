import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync,existsSync} from 'node:fs';
import {withOfficialMedia,officialMedia} from '../apps/api/src/official-media.js';
test('官方素材只引用已保存的站内文件，保留官网页面和原图出处',()=>{
 const refs=officialMedia.entries.flatMap(e=>[e.logo,e.cover,...Object.values(e.products||{})]).filter(Boolean) as any[];
 assert.ok(refs.length>100);
 for(const ref of refs){assert.match(ref.src,/^\/media\/brands\/[a-z0-9-]+\.(png|webp)$/);assert.ok(existsSync('apps/admin_web/public'+ref.src));assert.equal(new URL(ref.sourcePage).protocol,'https:');assert.equal(new URL(ref.sourceUrl).protocol,'https:');assert.equal(ref.checkedAt,'2026-10-28');}
});
test('品牌素材保持英文身份大小写边界、作品名称精确关联，虚构和未知品牌不套图',()=>{
 const row={english:'Apple',name:'苹果',editorial:{products:[{name:'不存在的型号'}]}};
 const result=withOfficialMedia(row);assert.deepEqual(result.media?.products,{});
 assert.equal(withOfficialMedia({english:'unknown',name:'unknown'}).media,undefined);
 assert.equal(withOfficialMedia({...row,demo:true}).media,undefined);
 const fashion=withOfficialMedia({english:'LOEWE'}),tv=withOfficialMedia({english:'Loewe'});
 if(fashion.media&&tv.media)assert.notEqual(fashion.media.officialUrl,tv.media.officialUrl);
});
test('品类分组覆盖完整且无重复，保留新增品类兜底组',()=>{
 const src=readFileSync('apps/admin_web/src/CategoryNavigator.tsx','utf8');assert.match(src,/更多品类/);
 const groups=src.match(/slugs:\[([^\]]*)\]/g)||[],slugs=groups.flatMap(g=>[...g.matchAll(/'([^']+)'/g)].map(m=>m[1]));
 const cats=JSON.parse(readFileSync('design/contracts/categories.json','utf8')).categories;
 assert.equal(new Set(slugs).size,40);assert.equal(slugs.length,40);assert.ok(cats.every((c:any)=>slugs.includes(c.slug)));
});
