let csrf='';
export function setPublicCsrf(value:string){csrf=value;}
export async function api(path:string,method='GET',body?:any,key?:string,signal?:AbortSignal){
 const response=await fetch('/api/v1'+path,{method,signal,credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf,...(key?{'Idempotency-Key':key}:{})},body:body===undefined?undefined:JSON.stringify(body)});
 const data=await response.json();if(!response.ok)throw new Error(data.message||'请求失败，请重试');return data;
}
