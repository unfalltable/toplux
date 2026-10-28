import {useEffect,useRef,useState} from 'react';
const money=(fen:number)=>'¥'+(fen/100).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2});
export function AnimatedAmount({value}:{value:number}){
 const [display,setDisplay]=useState(value),current=useRef(value);
 useEffect(()=>{
  const from=current.current,start=performance.now();
  if(matchMedia('(prefers-reduced-motion: reduce)').matches){current.current=value;setDisplay(value);return;}
  let frame=0;
  const tick=(now:number)=>{
   const progress=Math.min(1,(now-start)/750),next=Math.round(from+(value-from)*(1-Math.pow(1-progress,3)));
   current.current=next;setDisplay(next);
   if(progress<1)frame=requestAnimationFrame(tick);
  };
  frame=requestAnimationFrame(tick);
  return()=>cancelAnimationFrame(frame);
 },[value]);
 return <strong className="animated-amount" aria-label={money(value)}>{money(display)}</strong>;
}
export function LeaderReign({since,serverTime}:{since:string,serverTime:string}){
 const [seconds,setSeconds]=useState(0);
 useEffect(()=>{
  const started=Date.parse(since),server=Date.parse(serverTime),received=performance.now();
  const tick=()=>setSeconds(Math.max(0,Math.floor(((Number.isFinite(server)?server:Date.now())+performance.now()-received-started)/1000)));
  tick();const timer=setInterval(tick,1000);return()=>clearInterval(timer);
 },[since,serverTime]);
 const days=Math.floor(seconds/86400),hours=Math.floor(seconds%86400/3600),minutes=Math.floor(seconds%3600/60),rest=seconds%60;
 const duration=(days?days+' 天 ':'')+[hours,minutes,rest].map(n=>String(n).padStart(2,'0')).join(':');
 return <div className="leader-reign" aria-live="off"><span>持续霸榜</span><time dateTime={since} title={'本次领跑开始于 '+new Date(since).toLocaleString('zh-CN')}>{duration}</time></div>;
}
