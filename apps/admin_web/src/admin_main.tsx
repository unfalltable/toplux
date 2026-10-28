import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ShieldCheck,ArrowUpRight,LogOut,X,Settings2} from 'lucide-react';
import CatalogAdmin from './CatalogAdmin';
import ClassificationAdmin from './ClassificationAdmin';
import Analytics from './Analytics';
import PartnersAdmin from './PartnersAdmin';
import {api,setPublicCsrf} from './public-api';
import './style.css';
import './luxury.css';
import './classification.css';
type Row=Record<string,any>;
const money=(n:any)=>'¥'+(Number(n)/100).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2});
function AdminApp(){
 const [user,setUser]=useState<Row|null>(null),[data,setData]=useState<Row|null>(null),[tab,setTab]=useState('overview'),[error,setError]=useState(''),[notice,setNotice]=useState(''),[editing,setEditing]=useState<Row|null>(null),[busy,setBusy]=useState(false);
 const load=async()=>{setData(await api('/admin/overview'));};
 useEffect(()=>{let active=true;api('/me').then(async u=>{if(!active)return;if(!u||!['ADMIN','EDITOR','REVIEWER'].includes(u.role))throw new Error('管理会话已结束，请重新运行本机后台入口。');setPublicCsrf(u.csrf);setUser(u);setTab(u.role==='ADMIN'?'overview':'categories');await load();}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[]);
 useEffect(()=>{if(!notice)return;const t=setTimeout(()=>setNotice(''),4000);return()=>clearTimeout(t);},[notice]);
 const act=async(fn:()=>Promise<void>)=>{setBusy(true);setError('');try{await fn();await load();setEditing(null);setNotice('操作已保存');}catch(e:any){setError(e.message);}finally{setBusy(false);}};
 const tabs=[['overview','数据总览'],['categories','品类管理'],['profiles','品牌管理'],['profile_revisions','修订审核'],['merchants','品牌展示'],['classifications','品牌归类'],['partners','门店与销售'],['links','链接审核'],['feedback','用户反馈'],['orders','助力订单'],['audit_logs','审计记录']].filter(([id])=>(id!=='partners'||data?.partnerMarketEnabled===true)&&(user?.role==='ADMIN'||(user?.role==='EDITOR'?['categories','profiles','profile_revisions'].includes(id):!['overview','orders'].includes(id))));
 return <div className="site-shell is-admin"><div className="workspace"><header className="site-header"><div className="header-context"><span>平台管理系统</span><a href="/">返回奢榜<ArrowUpRight size={14}/></a></div><a className="masthead" href="/"><span className="brand-symbol">S</span><span className="brand-chinese">奢 榜</span><span className="brand-english">Shèbang</span></a><div className="header-actions"><span>{user?.name}</span><button aria-label="退出后台" onClick={()=>void act(async()=>{await api('/auth/logout','POST',{});location.replace('/');})}><LogOut size={17}/></button></div></header><main>
 <div className="page-title"><span className="section-kicker">奢榜平台后台</span><h1>平台运营，一览有序。</h1><p>助力款统一归平台，品牌按累计助力上榜。助力不支持退款。</p></div>
 {error&&<div role="alert" className="error">{error}</div>}
 {data&&user&&<><nav className="admin-tabs" aria-label="后台管理">{tabs.map(([id,label])=><button key={id} className={tab===id?'active':''} onClick={()=>setTab(id)}>{label}{id!=='overview'&&id!=='classifications'&&id!=='partners'&&<small>{data[id]?.length||0}</small>}</button>)}</nav>
 {tab==='overview'?<Analytics request={api} platform/>:tab==='partners'?<PartnersAdmin request={api} user={user} brands={data.merchants||[]} onNotice={setNotice}/>:tab==='classifications'?<ClassificationAdmin categories={data.categories} request={api} onNotice={setNotice}/>:['categories','profiles','profile_revisions'].includes(tab)?<CatalogAdmin key={tab} tab={tab} user={user} data={data} request={api} onChanged={load} onNotice={setNotice}/>:<div className="admin-list">{(data[tab]||[]).map((r:Row)=><article key={r.id}><div><b>{r.name||r.platform||r.action||r.reason||r.id.slice(0,8)}</b><small>{r.url||r.description||r.target||''}</small><span>{r.state||r.created_at||''}</span>{tab==='orders'&&<><span>{money(r.amount_fen)} · 收款方：平台</span><small>{r.id}</small></>}</div><div className="row">{tab==='merchants'&&user.role==='ADMIN'&&<button onClick={()=>setEditing({...r,mode:'editBrand'})}><Settings2 size={14}/>资料与链接</button>}{['ADMIN','REVIEWER'].includes(user.role)&&<>{tab==='merchants'&&<button onClick={()=>setEditing({...r,mode:'visibility'})}>{r.state==='APPROVED'?'隐藏':'恢复'}</button>}{tab==='links'&&<button onClick={()=>setEditing({...r,mode:'link'})}>审核链接</button>}{tab==='feedback'&&r.state==='OPEN'&&<button onClick={()=>setEditing({...r,mode:'feedback'})}>处理反馈</button>}</>}</div></article>)}</div>}
 </>}
 {!data&&!error&&<div className="empty" role="status">正在读取平台资料…</div>}
 </main></div>{notice&&<div className="toast" role="status">{notice}</div>}
 {editing&&<div className="modal-overlay"><section className="modal" role="dialog" aria-modal="true" aria-label="平台维护"><button className="close" aria-label="关闭" disabled={busy} onClick={()=>setEditing(null)}><X size={20}/></button>{error&&<p className="error">{error}</p>}<h2>{editing.mode==='editBrand'?'品牌资料与链接':editing.mode==='link'?'审核链接':editing.mode==='feedback'?'处理反馈':'修改展示状态'}</h2><p>{editing.name||editing.url||editing.reason}</p>
 <form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void act(async()=>{
 if(editing.mode==='editBrand'){await api('/merchants/'+editing.id,'PATCH',{description:f.get('description')});if(f.get('url'))await api('/merchants/'+editing.id+'/links','POST',{type:f.get('type'),platform:f.get('platform'),url:f.get('url')});}
 if(editing.mode==='visibility')await api('/admin/merchants/'+editing.id+'/visibility','POST',{visible:editing.state!=='APPROVED',reason:f.get('reason')});
 if(editing.mode==='link')await api('/admin/links/'+editing.id+'/decision','POST',{approved:f.get('approved')==='true',reason:f.get('reason')});
 if(editing.mode==='feedback')await api('/admin/feedback/'+editing.id+'/resolve','POST',{resolution:f.get('reason')});
 });}}>
 {editing.mode==='editBrand'?<><label>品牌介绍<textarea name="description" defaultValue={editing.description} maxLength={2000}/></label><label>链接类型<select name="type"><option value="WEBSITE">品牌官网</option><option value="STORE">店铺</option><option value="LIVE">直播间</option><option value="VIDEO">视频</option></select></label><label>渠道名称<input name="platform" maxLength={30}/></label><label>公开HTTPS地址<input name="url" type="url"/></label><p className="form-note">新增链接进入待审核队列。</p></>:<>{editing.mode==='link'&&<label>审核结论<select name="approved"><option value="true">通过</option><option value="false">退回</option></select></label>}<label>处理理由<textarea name="reason" required/></label></>}
 <button className="primary full" disabled={busy}>{editing.mode==='editBrand'?'保存资料':'确认并记录审计'}</button>
 </form></section></div>}</div>;
}
createRoot(document.getElementById('root')!).render(<AdminApp/>);
