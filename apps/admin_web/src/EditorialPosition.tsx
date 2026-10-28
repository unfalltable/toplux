type Row=Record<string,any>;
export function PositionLabel({profile}:{profile:Row}){
 const p=profile.editorial?.positioning;
 if(!p)return null;
 return <div className="catalog-position"><span>{p.scope==='SPECIALIST'?'高端专业参考':'品类定位参考'}</span><b><small>顺序</small>{String(p.order).padStart(2,'0')}</b></div>;
}
export function PositionDetail({profile}:{profile:Row}){
 const p=profile.editorial?.positioning;
 if(!p)return null;
 return <aside className="atlas-position-detail"><PositionLabel profile={profile}/><p>{p.reason}</p><small>{p.asOf} 整理。同层顺序为阅读建议；定位与助力金额独立。</small></aside>;
}
export default function CategoryPositioning({category}:{category?:Row}){
 const c=category?.curation;
 if(!c)return null;
 return <section className="curation-summary" aria-label="品类定位说明"><div><span className="curation-scope">{c.scope==='SPECIALIST'?'高端专业参考':'奢侈品牌定位'}</span><h2>{category?.name}，先读懂位置。</h2><p>{c.note}</p></div><details><summary>定位如何划分？</summary><p>{c.method}</p><dl><div><dt>殿堂级</dt><dd>本品类的顶端代表，强调传统、代表作品与稀缺制作。</dd></div><div><dt>奢华级</dt><dd>奢华文化与经典作品鲜明，兼具品牌和社交表达。</dd></div><div><dt>高端级</dt><dd>精品制作、设计或专业能力突出，不自动等同于传统奢侈品。</dd></div><div><dt>精品级 / 进阶级</dt><dd>偏设计、品类特色或入门体验，由编辑按作品补充。</dd></div><div><dt>不适用</dt><dd>专业设备等缺乏稳定奢侈阶序的领域，仅提供阅读顺序。</dd></div></dl><small>本页是代表性初始样本，非完整行业名录。{c.asOf} 整理；同层无公认先后，跨品类不作比较。</small></details></section>;
}
