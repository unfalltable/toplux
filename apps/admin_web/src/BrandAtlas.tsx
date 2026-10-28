import {clientUuid} from './client-uuid';
import {useEffect,useState} from 'react';
import {ArrowLeft,ArrowUpRight,BookOpen,Heart,Plus,ExternalLink} from 'lucide-react';
import {api} from './public-api';
import BrandSignals from './BrandSignals';
import BrandLogo from './BrandLogo';
import PartnerDirectory from './PartnerDirectory';
import {PositionDetail} from './EditorialPosition';
type Row=Record<string,any>;
type Props={brandId:string,categoryId:string,ready:boolean,onBack:()=>void,onBrowse:()=>void,onSupport:(brand:Row)=>void,onStats:(id:string,stats:Row)=>void,onNotice:(text:string)=>void,showPartners?:boolean};
export default function BrandAtlas({brandId,categoryId,ready,onBack,onBrowse,onSupport,onStats,onNotice,showPartners=false}:Props){
 const [data,setData]=useState<Row|null>(null),[error,setError]=useState(''),[pending,setPending]=useState(true),[retry,setRetry]=useState(0),[selected,setSelected]=useState(categoryId),[following,setFollowing]=useState(false);
 useEffect(()=>{setSelected(categoryId);},[brandId,categoryId]);
 useEffect(()=>{
  if(!ready)return;
  let active=true;setPending(true);setError('');setData(null);
  (async()=>{try{
   await api('/analytics/events','POST',{merchantId:brandId,kind:'VIEW',source:'detail',eventKey:clientUuid()}).catch(()=>{});
   const result=await api('/merchants/'+encodeURIComponent(brandId)+'/atlas');
   if(active){setData(result);onStats(brandId,result.merchant.stats);}
  }catch(e:any){if(active)setError(e.message);}finally{if(active)setPending(false);}})();
  return()=>{active=false;};
 },[brandId,ready,retry]);
 const brand=data?.merchant,profiles:Row[]=data?.profiles||[],profile=profiles.find(p=>p.category_id===selected)||profiles[0],editorial=profile?.editorial||{};
 const follow=async()=>{if(!brand)return;setError('');setFollowing(true);try{const result=await api('/public/brands/'+brand.id+'/follow','PUT',{followed:!brand.stats?.followed});setData(value=>value?{...value,merchant:{...value.merchant,stats:result.stats}}:value);onStats(brand.id,result.stats);onNotice(result.stats.followed?'已关注，保存在当前浏览器':'已取消关注');}catch(e:any){setError(e.message);}finally{setFollowing(false);}};
 const section=(id:string,title:string,body:React.ReactNode)=> <section className="atlas-section" id={'atlas-'+id}><h2>{title}</h2>{body}</section>;
 return <div className="brand-atlas">
  <div className="atlas-breadcrumb"><button onClick={onBack}><ArrowLeft size={16}/>返回上一页</button><button onClick={onBrowse}>奢品图鉴</button><span>{brand?.name||'品牌档案'}</span></div>
  {pending?<div className="empty" role="status">正在打开品牌图鉴…</div>:!data?<div className="empty" role="alert"><BookOpen size={34}/><h1>暂时无法打开品牌图鉴</h1><p>{error}</p><button className="primary" onClick={()=>setRetry(v=>v+1)}>重新加载</button><button onClick={onBrowse}>浏览其他品牌</button></div>:<>
   <header className="atlas-brand-heading atlas-brand-hero">
    <div className="atlas-hero-copy"><BrandLogo media={profile?.media} name={profile?.name||brand.name} english={profile?.english}/>
     <div className="atlas-brand-title"><span className="atlas-kind">{profile?.category_name}{profile?.tier&&profile.tier!=='不适用'?' / '+profile.tier:''}</span><h1>{profile?.name||brand.name}</h1><p className="atlas-english-name">{profile?.english}</p><p>{profile?.summary||brand.description||'从品牌故事与作品，理解它的独特之处。'}</p></div>
     <div className="atlas-brand-actions"><button className="follow-button" aria-pressed={!!brand.stats?.followed} disabled={following} onClick={()=>void follow()}><Heart size={15} fill={brand.stats?.followed?'currentColor':'none'}/>{brand.stats?.followed?'已关注':'关注品牌'}</button><button className="primary" onClick={()=>onSupport(brand)}>为它助力<Plus size={15}/></button></div>
    </div>
    {profile?.media?.cover?<figure className="atlas-hero-image"><img src={profile.media.cover.src} alt={profile.media.cover.caption||profile.name+'官方作品'}/><figcaption><span>{profile.english}</span><a href={profile.media.cover.sourcePage} target="_blank" rel="noopener noreferrer">品牌官方影像<ExternalLink size={12}/></a></figcaption></figure>:<div className="atlas-hero-type" aria-hidden="true">{profile?.english||brand.name}</div>}
   </header>
   {error&&<p className="error" role="alert">{error}</p>}
   <div className="atlas-signals"><BrandSignals stats={brand.stats}/><p>助力推广与图鉴编辑独立；以下为品牌资料与编辑解读。</p></div>
   {profile&&<section className="atlas-brand-character" aria-label="品牌魅力"><div><span>品牌气场</span><h2>{profile.character?.headline||profile.editorial?.positioning?.reason||profile.recognition||profile.summary}</h2></div><div className="atlas-character-details"><article><h3>标志性语言</h3><p>{profile.character?.signature||editorial.socialContext?.publicRecognition||profile.recognition}</p></article><article><h3>身份与气场</h3><p>{profile.character?.expression||editorial.socialContext?.circleRecognition||editorial.valueReading||profile.summary}</p></article></div></section>}
   {profiles.length>1&&<div className="atlas-profile-tabs" aria-label="图鉴品类">{profiles.map(p=><button key={p.id} aria-pressed={profile.id===p.id} onClick={()=>setSelected(p.category_id)}>{p.category_name}</button>)}</div>}
   {!profile?<div className="atlas-unpublished"><BookOpen size={36} strokeWidth={1}/><h2>这个品牌的故事，正在整理。</h2><p>目前尚无已发布图鉴。平台补充并审核后，这里将展示品牌故事、代表产品、价值与身份表达。</p><button onClick={onBrowse}>探索其他品牌<ArrowUpRight size={16}/></button></div>:<div className="atlas-reading-layout">
    <nav className="atlas-toc" aria-label="图鉴章节"><span>{profile.category_name}</span>{[['story','品牌故事'],['products','代表作品'],['value','价值解读'],['social','身份与认同'],['considerations','购前判断'],['references','资料来源']].map(([id,label])=><a key={id} href={'#atlas-'+id} onClick={event=>{event.preventDefault();document.getElementById('atlas-'+id)?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}}>{label}</a>)}</nav>
    <div className="atlas-reading">
     {profile.demo&&<p className="atlas-demo-note">本篇为虚构品牌演示资料，用于展示阅读功能。</p>}
     {section('story','品牌故事',<p>{editorial.story||profile.summary||'品牌故事待补充。'}</p>)}
     {section('products','代表作品',editorial.products?.length?<div className="atlas-products">{editorial.products.map((item:Row)=>{const photo=profile.media?.products?.[item.name];return <article key={item.name}>{photo?<figure><img src={photo.src} alt={photo.caption||item.name} loading="lazy" decoding="async"/><figcaption><a href={photo.sourcePage} target="_blank" rel="noopener noreferrer">官方作品图<ExternalLink size={12}/></a></figcaption></figure>:<div className="atlas-product-unavailable"><span>{item.name}</span><small>官方作品图片待补充</small></div>}<h3>{item.name}</h3><p>{item.description}</p></article>;})}</div>:<p className="atlas-missing">代表作品资料待补充。</p>)}
     {section('value','价值解读',<><PositionDetail profile={profile}/><p>{editorial.valueReading||'价值解读待补充。'}</p><dl className="atlas-context"><dt>编辑定位</dt><dd>{profile.tier}</dd><dt>适用场合</dt><dd>{profile.occasion}</dd></dl></>)}
     {section('social','身份与认同',<>{profile.character?.audience&&<div className="atlas-audience"><h3>谁，会为它心动</h3><p>{profile.character.audience}</p></div>}{editorial.socialContext&&<dl className="partner-social-context">{[['audience','典型受众'],['publicRecognition','大众辨识度'],['circleRecognition','圈内辨识度'],['expressionStyle','表达风格'],['socialScenes','社交场景'],['budgetNote','系列与身份表达']].filter(([key])=>editorial.socialContext[key]).map(([key,label])=><div key={key}><dt>{label}</dt><dd>{editorial.socialContext[key]}</dd></div>)}</dl>}<p className="atlas-section-intro">被认出、被欣赏、融入圈层，或表达独立审美。品牌能提供哪些心理满足，取决于产品、场合与观看它的人。</p>{editorial.socialSignals?.length?<div className="atlas-social">{editorial.socialSignals.map((item:Row)=><article key={item.name}><h3>{item.name}</h3><p>{item.description}</p></article>)}</div>:<p>{profile.recognition||'身份表达解读待补充。'}</p>}</>)}
     {section('considerations','购前判断',<p>{editorial.considerations||'先从实际使用、个人审美与预算判断是否适合自己。'}</p>)}
     {section('references','资料来源',<><p>{profile.source}</p>{profile.media?.logo&&<p className="atlas-media-source"><a href={profile.media.logo.sourcePage} target="_blank" rel="noopener noreferrer">品牌标识来源：品牌／集团官方资料<ExternalLink size={12}/></a><small>图像及商标归各品牌所有，用于品牌资料识别。</small></p>}{editorial.references?.length>0&&<ul className="atlas-references">{editorial.references.map((reference:Row)=><li key={reference.url}><a href={reference.url} target="_blank" rel="noopener noreferrer">{reference.title}<ExternalLink size={14}/></a><small>{new URL(reference.url).hostname}</small></li>)}</ul>}<p className="atlas-editor-note">品牌事实参考所列资料；价值与身份表达为平台编辑观点。它们会因产品、文化和个人体验而变化。</p></>)}
    </div>
   </div>}
   {showPartners&&<PartnerDirectory brandId={brandId} brandName={brand.name}/>}
  </>}
 </div>;
}
