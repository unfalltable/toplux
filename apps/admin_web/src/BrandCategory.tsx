import {ShieldCheck,Flag} from 'lucide-react';
type Row=Record<string,any>;
export default function BrandCategory({value,onReport}:{value?:Row,onReport:()=>void}){
 const state=value?.state||'UNSET',confirmed=state==='CONFIRMED';
 return <div className={'brand-category '+(confirmed?'category-confirmed':'category-pending')}>
 <div><ShieldCheck size={16}/><span>{confirmed?'品牌主品类':'暂定主品类'}<strong>{confirmed?value?.categoryName:state==='PENDING'?(value?.suggestedCategoryName||'已提交建议')+' · 待核实':'首次助力时提交建议'}</strong></span></div>
 <p>{confirmed?'后续助力自动沿用，由平台统一维护。':'首次到账后即按建议品类展示，平台将后续核实；有误可提交纠错。'}</p>
 <button type="button" className="category-report-link" onClick={onReport}><Flag size={13}/>品类有误？提交纠错</button>
 </div>;
}
