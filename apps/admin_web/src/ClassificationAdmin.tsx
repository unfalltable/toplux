import {useEffect,useRef,useState} from 'react';
import {FolderCheck,Search,X,ShieldCheck} from 'lucide-react';
import {useDialogFocus} from './useDialogFocus';
type Row=Record<string,any>;
type Requester=(path:string,method?:string,body?:any)=>Promise<any>;
export default function ClassificationAdmin({categories,request,onNotice}:{categories:Row[],request:Requester,onNotice:(notice:string)=>void}){
 const [data,setData]=useState<Row>({items:[],reports:[],history:[]}),[loading,setLoading]=useState(true),[error,setError]=useState(''),[query,setQuery]=useState(''),[filter,setFilter]=useState('pending'),[editing,setEditing]=useState<Row|null>(null),[busy,setBusy]=useState(false);
 const dialog=useRef<HTMLElement>(null);useDialogFocus(dialog,!!editing);
 const load=async()=>{setData(await request('/admin/brand-categories'));};
 useEffect(()=>{let active=true;request('/admin/brand-categories').then(value=>{if(active)setData(value);}).catch(err=>{if(active)setError(err.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[]);
 const rows:Row[]=data.items.filter((row:Row)=>row.name.includes(query)&&(filter==='all'||filter==='reports'?filter==='all'||row.reports>0:row.classification_state!=='CONFIRMED'));
 const labels:Row={UNSET:'尚未设置',PENDING:'建议待确认',CONFIRMED:'平台已确认'};
 return <div className="classification-review">
 <div className="catalog-toolbar"><div><h2><FolderCheck size={20}/>品牌归类审核</h2><p>首次建议由平台核实。纠正品类后累计助力进入正确品类，总榜金额不变。</p></div></div>
 {error&&!editing&&<div className="error" role="alert">{error}<button onClick={()=>void load().catch(err=>setError(err.message))}>重新加载</button></div>}
 <div className="catalog-filters"><label><Search size={16}/><input aria-label="搜索归类品牌" value={query} onChange={event=>setQuery(event.target.value)} placeholder="搜索品牌"/></label><select aria-label="归类状态筛选" value={filter} onChange={event=>setFilter(event.target.value)}><option value="pending">待确认 / 未设置</option><option value="reports">有待处理纠错</option><option value="all">全部品牌</option></select><span>{rows.length} 个品牌</span></div>
 {loading?<div className="empty" role="status">正在读取归类建议…</div>:<div className="catalog-table-wrap"><table className="catalog-table"><thead><tr><th>品牌</th><th>当前主品类</th><th>首次建议</th><th>状态</th><th>纠错</th><th>操作</th></tr></thead><tbody>{rows.map(row=><tr key={row.id}><td><b>{row.name}</b></td><td>{row.category_name||'未确认'}</td><td>{row.suggested_category_name||'尚无建议'}</td><td><span className="status-tag">{labels[row.classification_state]}</span></td><td>{row.reports} 条待处理</td><td><button aria-label={'审核归属'+row.name} onClick={()=>{setError('');setEditing(row);}}><ShieldCheck size={14}/>确认 / 纠正</button></td></tr>)}</tbody></table>{!rows.length&&<div className="empty">暂无符合条件的品牌。</div>}</div>}
 {editing&&<div className="modal-overlay"><section ref={dialog} tabIndex={-1} className="modal" role="dialog" aria-modal="true" aria-label="品牌归类审核"><button className="close" aria-label="关闭归类审核" disabled={busy} onClick={()=>setEditing(null)}><X size={20}/></button><h2>确认品牌主品类</h2><p>{editing.name}</p>{error&&<p className="error" role="alert">{error}</p>}
 <div className="classification-reports">{data.reports.filter((report:Row)=>report.merchant_id===editing.id&&report.state==='OPEN').map((report:Row)=><article key={report.id}><b>纠错建议：{report.suggested_category_name}</b><p>{report.reason}</p></article>)}</div>
 <form onSubmit={event=>{event.preventDefault();const form=new FormData(event.currentTarget);setBusy(true);setError('');void (async()=>{try{await request('/admin/brand-categories/'+editing.id,'POST',{categoryId:form.get('categoryId'),reason:form.get('reason'),version:editing.version});await load();setEditing(null);onNotice('品牌归属已确认，相关纠错已记录处理');}catch(err:any){setError(err.message);}finally{setBusy(false);}})();}}><label>正确主品类<select name="categoryId" aria-label="正确主品类" required defaultValue={editing.category_id||editing.suggested_category_id||''}><option value="">请选择正确品类</option>{categories.filter(category=>category.active).map(category=><option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label>审核依据<textarea name="reason" aria-label="归类审核依据" required minLength={5} maxLength={1000} placeholder="核实品牌主营业务、官网资料，并说明纠错结论"/></label><p className="classification-note">保存后统一更新该品牌的品类榜归属，已付款金额与总榜不变。归类修改保留审核记录。</p><button className="primary full" disabled={busy}>{busy?'正在保存…':'确认归属并记录审核'}</button></form>
 <div className="classification-history"><h3>归类修改记录</h3><ul>{data.history.filter((history:Row)=>history.merchant_id===editing.id).map((history:Row)=><li key={history.id}>{history.before_name||'未确认'} → {history.after_name}<p>{history.reason}</p><small>{new Date(history.created_at).toLocaleString('zh-CN')}</small></li>)}</ul></div>
 </section></div>}
 </div>;
}
