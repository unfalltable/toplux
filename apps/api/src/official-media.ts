import {readFileSync} from 'node:fs';
type Row=Record<string,any>;
export const officialMedia=JSON.parse(readFileSync('design/brand-media.json','utf8')) as {entries:Row[]};
const catalogue=JSON.parse(readFileSync('design/atlas-ranking.json','utf8'));
const characters=new Map<string,Row>();for(const c of catalogue.categories)for(const b of c.items)if(b.character)characters.set(b.english,b.character);
const byEnglish=new Map(officialMedia.entries.map(e=>[e.english,e]));
const byName=new Map<string,Row>();
for(const category of catalogue.categories)for(const brand of category.items){const entry=byEnglish.get(brand.english);if(entry)byName.set(brand.name,entry);}
export function withOfficialMedia<T extends Row>(row:T):T&{media?:Row}{
 if(row.demo)return row;
 const entry=row.english?byEnglish.get(row.english):undefined;
 const character=row.english?characters.get(row.english):undefined;
 if(!entry)return character?{...row,character}:row;
 // Assets are downloaded and reviewed at build time. Never fetch a caller's URL on the server.
 const products=Object.fromEntries((row.editorial?.products||[]).filter((p:Row)=>entry.products?.[p.name]).map((p:Row)=>[p.name,entry.products[p.name]]));
 const first=Object.values(products)[0];
 return {...row,...(character?{character}:{}),...(entry.logo?{logo:entry.logo.src}:{}),media:{logo:entry.logo,products,cover:first||(row.editorial?entry.brandCover:entry.cover),officialUrl:entry.officialUrl}};
}
