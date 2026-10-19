'use client';
import {useEffect,useRef,useState} from 'react';
import type {StudySnapshot} from './cloudTypes';
export function useCloudSave(id:string|null,snapshot:StudySnapshot,onSave?: (id:string,snapshot:StudySnapshot)=>Promise<void>){
 const [status,setStatus]=useState(''),[saveError,setSaveError]=useState('');
 const latest=useRef({id,snapshot,onSave});latest.current={id,snapshot,onSave};
 const last=useRef(''),running=useRef<Promise<void>|null>(null),timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const serialized=JSON.stringify(snapshot);
 async function flush(){
  if(timer.current)clearTimeout(timer.current);
  if(running.current)await running.current;
  const current=latest.current;if(!current.id||!current.onSave)return;
  const targetId=current.id;
  const task=async()=>{
   while(latest.current.id===targetId){
    const value=latest.current,encoded=JSON.stringify(value.snapshot),key=targetId+encoded;
    if(last.current===key)break;
    setStatus('Saving…');setSaveError('');
    try{await value.onSave!(targetId,JSON.parse(encoded));last.current=key;setStatus('Saved to workspace')}
    catch(e){setStatus('Not saved');setSaveError(e instanceof Error?e.message:'Cloud save failed. Your edits are still open here.');throw e}
   }
  };
  const promise=task();running.current=promise;
  try{await promise}finally{if(running.current===promise)running.current=null}
 }
 useEffect(()=>{
  if(!id||!onSave){setStatus('');return}
  if(last.current===id+serialized)return;
  setStatus('Unsaved changes');
  timer.current=setTimeout(()=>{void flush().catch(()=>{})},900);
  return()=>{if(timer.current)clearTimeout(timer.current)};
 },[id,serialized]);
 useEffect(()=>{
  function protectUnsaved(event:BeforeUnloadEvent){const value=latest.current;if(value.id&&value.onSave&&last.current!==value.id+JSON.stringify(value.snapshot)){event.preventDefault();event.returnValue=''}}
  window.addEventListener('beforeunload',protectUnsaved);return()=>window.removeEventListener('beforeunload',protectUnsaved);
 },[]);
 return {status,saveError,flush};
}
