import {useEffect,useState} from 'react';
import {ArrowUpRight,BarChart3,Download,Eye,MousePointer2,Radio,RefreshCw,Settings2,Users,Globe} from 'lucide-react';
type Row=Record<string,any>;
const number=(n:any)=>Number(n||0).toLocaleString('zh-CN');
const channel:Row={WEBSITE:'品牌官网',STORE:'店铺',LIVE:'直播间',VIDEO:'视频'};
const labels:Row={impressions:'榜单曝光',views:'详情浏览',clicks:'外链点击'};
export default function Analytics({request,platform=false,onEdit,onPromotion,refreshKey=0}:{request:(p:string)=>Promise<any>,platform?:boolean,refreshKey?:number,onEdit?:(m:Row)=>void,onPromotion?:()=>void}){
 const [days,setDays]=useState(7),[merchant,setMerchant]=useState(''),[metric,setMetric]=useState('impressions'),[data,setData]=useState<Row|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[revision,setRevision]=useState(0);
 useEffect(()=>{let active=true;setLoading(true);setError('');request((platform?'/admin':'/me')+'/analytics?days='+days+(merchant?'&merchantId='+merchant:'')).then(d=>{if(active)setData(d);}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[days,merchant,platform,revision,refreshKey]);
 const exportCSV=()=>{
 if(!data)return;
 const quote=(v:any)=>'"'+String(v??'').replace(/"/g,'""')+'"';
 const rows=[['日期（UTC）','榜单曝光','详情浏览','详情访客','外链点击'],...data.series.map((r:Row)=>[r.day,r.impressions,r.views,r.visitors,r.clicks]),[],['渠道','品牌','状态','点击次数','点击访客'],...data.channels.map((r:Row)=>[channel[r.type],r.merchant_name,r.state,r.clicks,r.visitors])];
 const url=URL.createObjectURL(new Blob(['\uFEFF'+rows.map(r=>r.map(quote).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8;'}));const a=document.createElement('a');a.href=url;a.download='奢榜数据-'+days+'天.csv';a.click();URL.revokeObjectURL(url);
 };
 const s=data?.summary||{},series:Row[]=data?.series||[],max=Math.max(1,...series.map(r=>Number(r[metric]))),selected=data?.merchants.find((r:Row)=>r.id===merchant);
 return <section className="analytics-panel" aria-label={platform?'平台数据总览':'商家数据看板'}>
 <div className="analytics-toolbar"><div className="analytics-scope"><label>品牌范围<select aria-label="品牌范围" value={merchant} onChange={e=>setMerchant(e.target.value)}><option value="">{platform?'全平台品牌':'我的全部品牌'}</option>{data?.merchants.map((m:Row)=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label><div className="range-options" aria-label="统计时间">{[7,30,90].map(n=><button key={n} aria-pressed={days===n} className={days===n?'active':''} onClick={()=>setDays(n)}>近{n}天</button>)}</div></div><div className="row"><button aria-label="刷新统计" disabled={loading} onClick={()=>setRevision(n=>n+1)}><RefreshCw size={16}/></button><button className="outlined-button" disabled={!data||loading} onClick={exportCSV}><Download size={16}/>导出数据</button></div></div>
 {error&&<div role="alert" className="error">{error}<button onClick={()=>setRevision(n=>n+1)}>重新加载</button></div>}
 {loading?<div className="empty" role="status">正在汇总访问数据…</div>:data&&<><div className="analytics-metrics">{[
 ['榜单曝光',s.impressions,Eye,number(s.impression_visitors)+' 位曝光访客'],
 ['详情访客',s.visitors,Users,number(s.views)+' 次详情浏览'],
 ['官网与店铺点击',Number(s.website)+Number(s.store),Globe,'官网 '+number(s.website)+' / 店铺 '+number(s.store)],
 ['直播间点击',s.live,Radio,'视频点击 '+number(s.video)]
 ].map(([title,value,Icon,sub]:any)=><article key={title}><div><span>{title}</span><Icon size={19} strokeWidth={1.3}/></div><strong>{number(value)}</strong><small>{sub}</small></article>)}</div>
 <div className="analytics-chart"><div className="chart-heading"><div><h2>品牌关注趋势</h2><p>每日{labels[metric]}，按 UTC 日期汇总</p></div><div className="metric-options">{Object.entries(labels).map(([k,v])=><button key={k} className={metric===k?'active':''} aria-pressed={metric===k} onClick={()=>setMetric(k)}>{v}</button>)}</div></div>
 {series.every(r=>!r[metric])?<div className="chart-empty"><BarChart3 size={36} strokeWidth={1}/><h3>等待第一份关注</h3><p>真实访问发生后，趋势会在这里呈现。</p></div>:<div className="bar-chart" role="img" aria-label={'近'+days+'天'+labels[metric]+'趋势，详细数据可导出'}>{series.map((r,i)=><div className="chart-column" key={r.day} title={r.day+' '+labels[metric]+'：'+r[metric]}><span className="bar-value">{series.length<=7?number(r[metric]):''}</span><div className="chart-track"><div style={{height:(Number(r[metric])/max*100)+'%'}}/></div><small>{i===0||i===series.length-1||days===7?r.day.slice(5):''}</small></div>)}</div>}
 <div className="chart-summary"><span><MousePointer2 size={14}/>外链点击共 <b>{number(s.clicks)}</b> 次</span><span><Users size={14}/><b>{number(s.click_visitors)}</b> 位点击访客</span><span>更新于 {new Date(data.updatedAt).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}</span></div></div>
 <div className="channel-heading"><div><h2>引流渠道</h2><p>查看用户从哪里继续了解你的品牌。</p></div>{!platform&&<div className="row">{selected&&onEdit&&<button className="outlined-button" onClick={()=>onEdit(selected)}><Settings2 size={16}/>品牌资料与链接</button>}<button onClick={onPromotion}>推广与账单<ArrowUpRight size={16}/></button></div>}</div>
 <div className="catalog-table-wrap"><table className="catalog-table channel-table"><thead><tr><th>品牌 / 渠道</th><th>目标地址</th><th>审核状态</th><th>点击次数</th><th>点击访客</th></tr></thead><tbody>{data.channels.map((l:Row)=><tr key={l.id}><td><b>{l.platform||channel[l.type]}</b><small>{l.merchant_name} · {channel[l.type]}</small></td><td className="channel-url">{new URL(l.url).hostname}</td><td><span className={'status-tag '+(l.state==='APPROVED'?'status-live':'')}>{{APPROVED:'已通过',PENDING:'待审核',REJECTED:'已退回'}[l.state as string]||l.state}</span></td><td>{number(l.clicks)}</td><td>{number(l.visitors)}</td></tr>)}</tbody></table>{!data.channels.length&&<div className="empty"><h3>尚未配置引流渠道</h3><p>{platform?'商家添加官网、店铺或直播链接后可在此查看。':'先选择品牌，再添加官网、店铺或直播链接。审核通过后开放访问。'}</p></div>}</div>
 {platform&&<><div className="channel-heading"><h2>品牌表现</h2></div><div className="catalog-table-wrap"><table className="catalog-table"><thead><tr><th>品牌</th><th>曝光次数</th><th>详情访客</th><th>外链点击</th></tr></thead><tbody>{data.brands.map((b:Row)=><tr key={b.id}><td>{b.name}</td><td>{number(b.impressions)}</td><td>{number(b.visitors)}</td><td>{number(b.clicks)}</td></tr>)}</tbody></table></div></>}
 <div className="analytics-method"><ShieldIcon/><div><b>数据口径</b><p>榜单中可见超过 1 秒计一次曝光；详情访客按匿名浏览器标识去重。点击由本站跳转入口记录，不表示站外观看、下单或成交。登录商家本人的访问不计入，跨设备可能重复计为不同访客。统计从功能接入后开始累计。</p></div></div></>}
 </section>;
}
function ShieldIcon(){return <Eye size={19} strokeWidth={1.4}/>;}
