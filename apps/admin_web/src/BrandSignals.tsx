import {Flame,Heart,Globe,Radio} from 'lucide-react';
type Row=Record<string,any>;
const count=(n:any)=>Number(n||0).toLocaleString('zh-CN');
export default function BrandSignals({stats={}}:{stats?:Row}){
 return <div className="brand-signals" aria-label="品牌热度与关注">
 <span title="热度为品牌详情的累计浏览次数"><Flame size={13}/><b>{count(stats.heat)}</b><small>热度</small></span>
 <span title="按匿名浏览器标识去重的关注人数"><Heart size={13}/><b>{count(stats.followers)}</b><small>关注</small></span>
 <span title="从本站点击前往官网的次数"><Globe size={13}/><b>{count(stats.website_clicks)}</b><small>官网</small></span>
 <span title="从本站点击前往直播间的次数"><Radio size={13}/><b>{count(stats.live_clicks)}</b><small>直播</small></span>
 </div>;
}
