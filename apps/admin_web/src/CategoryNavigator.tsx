import {ChevronDown} from 'lucide-react';
type Row=Record<string,any>;
export const categoryGroups=[
 {name:'腕表与珠宝',slugs:['watches','jewelry']},
 {name:'时装与皮具',slugs:['bags','clothing','shoes','accessories','eyewear','small-leather','scarves','hats','travel-goods']},
 {name:'香氛与美妆',slugs:['fragrance','beauty','home-fragrance']},
 {name:'座驾与远行',slugs:['cars','motorcycles','yachts','private-aviation','luxury-hotels','luxury-travel']},
 {name:'居家与艺术',slugs:['furniture','lighting','tableware-crystal','home-textiles','art-collectibles','stationery','musical-instruments']},
 {name:'科技与运动',slugs:['phones','computers','headphones','audio','cameras','televisions','appliances','bicycles','sports','outdoor']},
 {name:'珍味与佳酿',slugs:['wine-spirits','tea-coffee','fine-food']}
];
export function groupedCategories(categories:Row[]){const known=new Set(categoryGroups.flatMap(g=>g.slugs));return [...categoryGroups.map(g=>({...g,items:categories.filter(c=>g.slugs.includes(c.slug))})),{name:'更多品类',slugs:[],items:categories.filter(c=>!known.has(c.slug))}].filter(g=>g.items.length);}
export default function CategoryNavigator({categories,value,onChange}:{categories:Row[],value:string,onChange:(id:string)=>void}){
 const groups=groupedCategories(categories),current=groups.find(g=>g.items.some(c=>c.id===value))||groups[0];
 return <div className="category-navigator"><div className="category-family-tabs" aria-label="品类分组">{groups.map(g=><button key={g.name} aria-pressed={g.name===current?.name} onClick={()=>onChange(g.items[0].id)}>{g.name}</button>)}</div><div className="category-selection"><div className="category-subcategories" aria-label="当前分组品类">{current?.items.map(c=><button key={c.id} aria-pressed={c.id===value} onClick={()=>onChange(c.id)}>{c.name}<small>{c.brand_count||''}</small></button>)}</div><label className="category-all-select"><span>全部品类</span><select aria-label="选择图鉴品类" value={value} onChange={e=>onChange(e.target.value)}>{groups.map(g=><optgroup key={g.name} label={g.name}>{g.items.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>)}</select><ChevronDown size={14}/></label></div></div>;
}
export function CategoryDirectory({categories,onChange}:{categories:Row[],onChange:(id:string)=>void}){return <div className="category-directory">{groupedCategories(categories).map(g=><section key={g.name}><h2>{g.name}</h2><div>{g.items.map(c=><button className="category-tile" key={c.id} onClick={()=>onChange(c.id)}><span>{c.name}</span><small>{c.brand_count||0} 个品牌</small><span aria-hidden="true">↗</span></button>)}</div></section>)}</div>;}
