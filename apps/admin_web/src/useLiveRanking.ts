import {useCallback,useEffect,useRef,useState} from 'react';
import {api} from './public-api';
type Row=Record<string,any>;
type Snapshot={scope:string,items:Row[],leaderSince:string|null,serverTime:string,updatedAt:string,loading:boolean,error:string,events:Row[]};
const empty=(scope:string):Snapshot=>({scope,items:[],leaderSince:null,serverTime:'',updatedAt:'',loading:true,error:'',events:[]});
export function useLiveRanking(category:string,enabled:boolean){
 const scope=category||'global',endpoint=category?'/categories/'+category+'/merchant-board':'/merchant-board';
 const [snapshot,setSnapshot]=useState<Snapshot>(()=>empty(scope));
 const request=useRef<AbortController|null>(null),version=useRef(0),cursor=useRef<{scope:string,value:string}|null>(null);
 const refresh=useCallback(async()=>{
  const seq=++version.current;
  request.current?.abort();
  const controller=new AbortController();request.current=controller;
  let timedOut=false;const timeout=setTimeout(()=>{timedOut=true;controller.abort();},10000);
  const after=cursor.current?.scope===scope?cursor.current.value:'';
  try{
   const response=await api(endpoint+(after?'?after='+encodeURIComponent(after):''),'GET',undefined,undefined,controller.signal);
   if(seq!==version.current)return;
   if(response.activityCursor!==undefined)cursor.current={scope,value:String(response.activityCursor)};
   setSnapshot({scope,items:response.items,leaderSince:response.leaderSince||null,serverTime:response.serverTime||response.updatedAt||'',updatedAt:response.updatedAt||new Date().toISOString(),loading:false,error:'',events:response.events||[]});
  }catch(error:any){
   if((controller.signal.aborted&&!timedOut)||seq!==version.current)return;
   setSnapshot(previous=>({...previous.scope===scope?previous:empty(scope),loading:false,error:timedOut?'网络超时，稍后自动重试':error.message||'暂时无法更新榜单'}));
  }finally{clearTimeout(timeout);if(request.current===controller)request.current=null;}
 },[scope,endpoint]);
 useEffect(()=>{
  if(!enabled)return;
  void refresh();
  const poll=()=>{if(!document.hidden&&!request.current)void refresh();};
  const interval=setInterval(poll,3000);
  document.addEventListener('visibilitychange',poll);window.addEventListener('focus',poll);
  return()=>{clearInterval(interval);document.removeEventListener('visibilitychange',poll);window.removeEventListener('focus',poll);version.current++;request.current?.abort();request.current=null;};
 },[enabled,refresh]);
 const patchStats=(id:string,stats:Row)=>setSnapshot(previous=>({...previous,items:previous.items.map(item=>(item.merchant_id||item.id)===id?{...item,stats}:item)}));
 return {...(snapshot.scope===scope?snapshot:empty(scope)),refresh,patchStats};
}
