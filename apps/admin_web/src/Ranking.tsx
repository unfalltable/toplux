import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {Crown,ArrowUpRight,ArrowUp,ArrowDown,Plus,Heart,ChevronDown,Radio} from 'lucide-react';
import BrandSignals from './BrandSignals';
import {AnimatedAmount,LeaderReign} from './RankMotion';
type Row=Record<string,any>;
const idOf=(row:Row)=>row.merchant_id||row.id;
type Props={sandbox?:boolean,onBrowse?:()=>void,items:Row[],loading:boolean,error:string,updatedAt:string,leaderSince:string|null,serverTime:string,scopeKey:string,categories:Row[],categoryId:string,events:Row[],onCategory:(id:string)=>void,onRetry:()=>void,onOpen:(r:Row)=>void,onAtlas:(r:Row)=>void,onContribute:(r?:Row)=>void,onFollow:(r:Row)=>void,busy?:boolean};
export default function Ranking({sandbox=true,onBrowse,items,loading,error,updatedAt,leaderSince,serverTime,scopeKey,categories,categoryId,events,onCategory,onRetry,onOpen,onAtlas,onContribute,onFollow,busy=false}:Props){
 const stage=useRef<HTMLDivElement>(null),previous=useRef<{scope:string,rows:Map<string,{rank:number,amount:number}>,rects:Map<string,{left:number,top:number}>}>({scope:scopeKey,rows:new Map(),rects:new Map()});
 const [moves,setMoves]=useState<Record<string,number|null>>({}),[announcement,setAnnouncement]=useState('');
 const label=categories.find(category=>category.id===categoryId)?.name;
 useLayoutEffect(()=>{
  const before=previous.current,sameScope=before.scope===scopeKey,nextRects=new Map<string,{left:number,top:number}>(),changes:Record<string,number|null>={},messages:string[]=[];
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  for(const element of stage.current?.querySelectorAll<HTMLElement>('[data-brand-id]')||[]){
   const id=element.dataset.brandId!,rect=element.getBoundingClientRect(),position={left:rect.left+scrollX,top:rect.top+scrollY};
   nextRects.set(id,position);
   const row=items.find(item=>idOf(item)===id),old=before.rows.get(id),oldRect=before.rects.get(id);
   if(!row||!sameScope||!before.rows.size)continue;
   if(!old){changes[id]=null;messages.push(row.name+'新晋第'+row.rank+'名');if(!reduced)element.animate([{opacity:0,transform:'translateY(18px)'},{opacity:1,transform:'translateY(0)'}],{duration:650,easing:'ease-out'});}
   else if(old.rank!==row.rank){
    changes[id]=old.rank-row.rank;messages.push(row.name+(row.rank===1?'登上榜首':old.rank>row.rank?'上升至第'+row.rank+'名':'下降至第'+row.rank+'名'));
    if(oldRect&&!reduced)element.animate([{transform:'translate('+(oldRect.left-position.left)+'px,'+(oldRect.top-position.top)+'px)',zIndex:5},{transform:'translate(0,0)',zIndex:1}],{duration:950,easing:'cubic-bezier(.2,.8,.2,1)'});
   }
  }
  if(!sameScope){setMoves({});setAnnouncement('');}
  else if(Object.keys(changes).length){setMoves(changes);setAnnouncement(messages.slice(0,3).join('；'));}
  previous.current={scope:scopeKey,rows:new Map(items.map(row=>[idOf(row),{rank:row.rank,amount:Number(row.net_fen)}])),rects:nextRects};
 },[items,scopeKey]);
 useEffect(()=>{
  if(!Object.keys(moves).length)return;
  const timer=setTimeout(()=>setMoves({}),6500);return()=>clearTimeout(timer);
 },[moves]);
 const trend=(row:Row)=>{const move=moves[idOf(row)];return move===undefined?null:<span className={'rank-trend '+(move===null?'new-entry':move>0?'rank-up':'rank-down')}>{move===null?'新晋':<>{move>0?<ArrowUp size={12}/>:<ArrowDown size={12}/>} {Math.abs(move)}</>}</span>;};
 const follow=(row:Row)=><button className={'follow-button '+(row.stats?.followed?'is-followed':'')} aria-pressed={!!row.stats?.followed} aria-label={(row.stats?.followed?'取消关注':'关注')+row.name} disabled={busy} onClick={()=>onFollow(row)}><Heart size={14} fill={row.stats?.followed?'currentColor':'none'}/>{row.stats?.followed?'已关注':'关注'}</button>;
 const eventByBrand=new Map(events.map(event=>[event.merchant_id,event]));
 return <section className="global-ranking" aria-label={label?label+'品牌榜':'品牌累计总榜'}>
 <div className="ranking-hero"><div className="hero-shade"/><div className="hero-content"><p className="hero-edition">Shèbang · 贵有其位</p><h1>你所欣赏，<br className="mobile-break"/>值得高位。</h1><p className="hero-description">让每一份支持，成为品牌向上的力量。</p><button className="hero-cta" onClick={()=>sandbox?onContribute():onBrowse?.()} disabled={busy}>{sandbox?'为品牌助力':'探索奢品图鉴'}<Plus size={16}/></button></div><div className="hero-bottom"><span>品牌累计助力总榜</span><a href="#ranking-list" onClick={event=>{event.preventDefault();document.getElementById('ranking-list')?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}}>见证每一份欣赏<ChevronDown size={15}/></a><span>持续累计 · 每份支持皆有回响</span></div></div>
 <div className="ranking-body" id="ranking-list">
 <div className="ranking-section-title"><div><span className="eyebrow">{label?label+'助力榜':'品牌总榜'}</span><h2>{label?label+'，榜上有名。':'卓然，于众目之间。'}</h2></div><label className="ranking-filter"><span>查看榜单</span><select aria-label="榜单品类" value={categoryId} onChange={event=>onCategory(event.target.value)}><option value="">全品类总榜</option>{categories.map(category=><option key={category.id} value={category.id}>{category.name}</option>)}</select><ChevronDown size={15}/></label></div>
 <div className="live-ranking-bar"><span className={error?'live-state is-offline':'live-state'}><i/>{error?'更新暂缓，正在重试':'动态榜单 · 每 3 秒更新'}</span><span>{items.length} 个上榜品牌{updatedAt&&' · '+new Date(updatedAt).toLocaleTimeString('zh-CN',{hour12:false})+' 更新'}</span></div>
 {error&&<div className="ranking-error" role="alert"><span>{items.length?'正在展示上次成功更新的榜单。':'暂时无法读取榜单。'}{error}</span><button onClick={onRetry}>重新加载</button></div>}
 {loading&&!items.length?<div className="empty" role="status">正在读取品牌榜单…</div>:items.length?<div className={'podium live-stage '+(items.length===1?'podium-single':'')} ref={stage} aria-label="动态品牌榜">
 {items.map(row=>{
  const top=row.rank<=3,event=eventByBrand.get(idOf(row)),order=row.rank===1?2:row.rank===2?1:row.rank;
  return <article className={top?'podium-card place-'+row.rank:'rank-row'} style={{order:top?order:row.rank+1}} data-brand-id={idOf(row)} data-rank={row.rank} key={idOf(row)}>
  {event&&<span className={'payment-spark '+(event.combo>=3?'critical-spark':'')} key={event.id} aria-hidden="true"/>}
  {top?<><div className="podium-top"><span>{row.rank===1?<><Crown size={17} strokeWidth={1}/>榜首</>:'第 '+row.rank+' 名'}</span><div>{trend(row)}<b>{String(row.rank).padStart(2,'0')}</b></div></div>
  <button className="podium-brand" onClick={()=>onOpen(row)} aria-label={'查看'+row.name}><span className="logo-frame"><img className={row.media?.logo?.dark?'logo-on-dark':''} src={row.logo} alt={row.name+'标识'}/></span><h3>{row.name}</h3><span className="podium-category">{label||row.category_names?.join(' / ')||(row.classification?.state==='UNSET'?'待设置品类':'品类待核实')}{row.classification?.state==='PENDING'?' · 待核实':''}</span></button>
  {row.rank===1&&leaderSince&&<LeaderReign since={leaderSince} serverTime={serverTime}/>}
  <div className="podium-amount"><small>累计助力</small><AnimatedAmount value={Number(row.net_fen)}/><span>{row.stats?.supporters||0} 位助力者</span></div><BrandSignals stats={row.stats}/><div className="podium-actions">{follow(row)}<button className="support-button" disabled={busy} onClick={()=>onContribute(row)}>为它助力<Plus size={14}/></button></div><button className="atlas-card-link" onClick={()=>onAtlas(row)}>品牌故事与图鉴<ArrowUpRight size={14}/></button></>:
  <><button className="rank-row-open" onClick={()=>onOpen(row)} aria-label={'查看'+row.name}><span className="row-rank">{String(row.rank).padStart(2,'0')}{trend(row)}</span><img className={row.media?.logo?.dark?'logo-on-dark':''} src={row.logo} alt={row.name+'标识'}/><span className="row-brand"><strong>{row.name}</strong><small>{label||row.category_names?.join(' / ')||(row.classification?.state==='UNSET'?'待设置品类':'品类待确认')}</small></span></button><div className="row-stats"><BrandSignals stats={row.stats}/></div><div className="row-amount"><AnimatedAmount value={Number(row.net_fen)}/><small>累计助力</small></div><div className="row-actions">{follow(row)}<button className="support-button" aria-label={'助力'+row.name} disabled={busy} onClick={()=>onContribute(row)}>助力<ArrowUpRight size={14}/></button><button className="atlas-card-link" aria-label={'图鉴'+row.name} onClick={()=>onAtlas(row)}>品牌图鉴<ArrowUpRight size={13}/></button></div></>}
  </article>;
 })}
 {items.length>3&&<div className="ranking-list-head live-list-heading" style={{order:4}}><h2>每一份欣赏，皆有分量。</h2><span>品牌 · 关注 · 助力</span></div>}
 </div>:!error&&<div className="empty ranking-empty"><Crown size={40} strokeWidth={1}/><h2>高位，静候第一份欣赏。</h2><p>{sandbox?'选择任意品牌，无需登录即可助力。':'目前还没有实际到账记录。先从品牌图鉴，了解各品类的品牌定位。'}</p><button className="primary" disabled={busy} onClick={()=>sandbox?onContribute():onBrowse?.()}>{sandbox?'为品牌助力':'探索奢品图鉴'}<Plus size={16}/></button></div>}
 <p className="rank-announcement" role="status" aria-live="polite">{announcement}</p>
 <div className="ranking-rule"><p>{sandbox?'任何人都可以助力，款项由奢榜平台统一收取。助力不代表品牌品质、人气认证或官方授权。':'助力榜仅统计实际到账；品牌编辑定位另行展示，不代表品牌官方授权。'}</p><span>{sandbox?'本地支付沙箱 · 不发生真实扣款':'品牌助力收款尚未开放'}</span></div></div>
 </section>;
}
