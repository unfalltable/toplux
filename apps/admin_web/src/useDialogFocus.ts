import {useEffect,type RefObject} from 'react';

export function useDialogFocus(ref:RefObject<HTMLElement|null>,open:boolean,view?:string){
 useEffect(()=>{
  const dialog=ref.current;
  if(!open||!dialog)return;
  const opener=document.activeElement instanceof HTMLElement?document.activeElement:null;
  const overlay=dialog.closest('.modal-overlay');
  const outside=new Set<HTMLElement>();
  let branch:Element|null=overlay;
  while(branch?.parentElement){
   const parent=branch.parentElement;
   for(const element of parent.children)if(element instanceof HTMLElement&&element!==branch)outside.add(element);
   if(parent===document.body)break;
   branch=parent;
  }
  const siblings=Array.from(outside);
  const previous=siblings.map(element=>({element,inert:element.inert}));
  for(const {element} of previous)element.inert=true;
  const focusable=()=>Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])'))
   .filter(element=>element.getClientRects().length>0);
  (focusable()[0]||dialog).focus();
  const contain=(event:KeyboardEvent)=>{
   if(event.key!=='Tab')return;
   const elements=focusable(),first=elements[0],last=elements.at(-1),active=document.activeElement;
   if(!first){event.preventDefault();dialog.focus();return;}
   if(event.shiftKey&&(active===first||!elements.includes(active as HTMLElement))){event.preventDefault();last!.focus();}
   else if(!event.shiftKey&&(active===last||!elements.includes(active as HTMLElement))){event.preventDefault();first.focus();}
  };
  document.addEventListener('keydown',contain);
  return()=>{
   document.removeEventListener('keydown',contain);
   for(const {element,inert} of previous)element.inert=inert;
   if(opener?.isConnected)opener.focus();
  };
 },[ref,open]);
 useEffect(()=>{
  if(!open)return;
  const dialog=ref.current;
  const first=dialog?.querySelector<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]');
  (first||dialog)?.focus();
 },[ref,open,view]);
}
