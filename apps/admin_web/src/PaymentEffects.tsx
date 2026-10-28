import {useEffect,useRef,useState} from 'react';
import {Sparkles,Zap} from 'lucide-react';
type Event=Record<string,any>;
export default function PaymentEffects({events}:{events:Event[]}){
 const seen=useRef(new Set<string>()),[queue,setQueue]=useState<Event[]>([]);
 useEffect(()=>{
  const fresh=events.filter(event=>{if(seen.current.has(event.id))return false;seen.current.add(event.id);return true;});
  if(fresh.length)setQueue(previous=>[...previous,...fresh].slice(-8));
  if(seen.current.size>500)seen.current=new Set(Array.from(seen.current).slice(-250));
 },[events]);
 const active=queue[0];
 useEffect(()=>{
  if(!active)return;
  const timer=setTimeout(()=>setQueue(previous=>previous.slice(1)),active.combo>=3?4200:2800);
  return()=>clearTimeout(timer);
 },[active?.id]);
 if(!active)return null;
 const critical=active.combo>=3;
 return <aside className={'payment-toast '+(critical?'critical-payment':'')} key={active.id} data-event-id={active.id} role="status">
 <div className="payment-emblem" aria-hidden="true">{critical?<Zap size={26}/>:<Sparkles size={23}/>}<i/><i/><i/></div>
 <div><span className="payment-kind">{critical?'暴击助力':active.combo>1?'连续助力':'有新的欣赏'}{active.combo>1&&<b>连击 ×{active.combo}</b>}</span><p>一位支持者为 <strong>{active.name}</strong> 助力</p><span className="payment-value">+ ¥{(active.amount_fen/100).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2})}</span></div>
 </aside>;
}
