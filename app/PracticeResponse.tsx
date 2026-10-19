'use client';
import { useEffect, useRef, useState } from 'react';
import { inlineCompletion } from './inlineCompletion';
import { ArrowUpRight, Check } from 'lucide-react';
export type Evaluation = {score:number;accuracy:number;coverage:number;summary:string;strengths:string[];missing:string[];incorrect:string[];method:string};
type Props = {source:string;value:string;recall:boolean;focusMode?:boolean;result?:Evaluation;onChange:(value:string)=>void;onResult:(result:Evaluation|undefined)=>void};
export default function PracticeResponse({source,value,recall,focusMode=false,result,onChange,onResult}:Props){
 const [submitting,setSubmitting]=useState(false),[error,setError]=useState(''),[atEnd,setAtEnd]=useState(true),[dismissed,setDismissed]=useState(false),[columns,setColumns]=useState(48);
 const editor=useRef<HTMLTextAreaElement>(null);
 const lastLine=value.slice(value.lastIndexOf('\n')+1);
 const suggestion=!recall&&atEnd&&!dismissed&&!submitting?inlineCompletion(source,value,Math.max(16,columns-(lastLine.length%columns))):'';
 const controller=useRef<AbortController|null>(null);
 useEffect(()=>()=>controller.current?.abort(),[]);
 useEffect(()=>{const element=editor.current;if(!element)return;const measure=()=>{const style=getComputedStyle(element);const context=document.createElement('canvas').getContext('2d');if(context)context.font=`${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;const character=context?.measureText('M').width||parseFloat(style.fontSize)*.61;const padding=parseFloat(style.paddingLeft)+parseFloat(style.paddingRight);setColumns(Math.max(8,Math.floor((element.clientWidth-padding)/character)))};const observer=new ResizeObserver(measure);observer.observe(element);measure();return()=>observer.disconnect()},[focusMode]);
 function edit(next:string){onChange(next);onResult(undefined);setError('');setDismissed(false)}
 async function submit(){
  if(!value.trim()||submitting)return;
  const request=new AbortController();controller.current=request;setSubmitting(true);setError('');
  try{
   const response=await fetch('/api/evaluate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({source,response:value}),signal:request.signal});
   const data=await response.json();
   if(!response.ok)throw new Error(typeof data.detail==='string'?data.detail:'Could not assess your response. Please try again.');
   if(!request.signal.aborted)onResult(data);
  }catch(e){if(!request.signal.aborted)setError(e instanceof Error?e.message:'Assessment failed. Please try again.');}
  finally{if(!request.signal.aborted)setSubmitting(false);}
 }
 return <div className="response-practice">
  <label className="response-label" htmlFor="practice-response">{recall?'What do you remember?':'Your response'}</label>
  <div className={recall?'response-editor':'response-editor guided-editor'}>
   {!recall&&<div className="typing-ghost" aria-hidden="true"><span className="ghost-prefix">{value}</span><span>{suggestion||'\u200b'}</span></div>}
   <textarea ref={editor} id="practice-response" className="recall-input" aria-describedby="practice-hint-note" placeholder={recall?'Write what you remember about this topic…':undefined} value={value} maxLength={30000} disabled={submitting} onChange={e=>edit(e.target.value)} onSelect={e=>setAtEnd(e.currentTarget.selectionStart===e.currentTarget.value.length&&e.currentTarget.selectionEnd===e.currentTarget.value.length)} onKeyDown={e=>{if(e.nativeEvent.isComposing)return;if(e.key==='Escape'){if(!focusMode)setDismissed(true);return}if(e.key==='Tab'&&!e.shiftKey&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&suggestion){e.preventDefault();const next=(value+suggestion).slice(0,30000);edit(next);requestAnimationFrame(()=>{editor.current?.setSelectionRange(next.length,next.length);setAtEnd(true)})}}}/>
  </div>
  <p id="practice-hint-note" className="hint-note">{recall?'No hints in Recall. Submit when you’re ready to review what you remembered.':focusMode?'Tab accepts the next hint · Esc exits full screen · no live scoring.':'Tab accepts the next hint · Esc dismisses it · no live scoring.'}</p>
  <div className="submit-row"><small>{value.trim()?value.trim().split(/\s+/u).length:0} words · no live scoring</small><button className="primary" disabled={!value.trim()||submitting} onClick={submit}>{submitting?'Reviewing retention…':result?'Submit again':'Submit & review retention'}<ArrowUpRight size={16}/></button></div>
  {error&&<div className="assessment-error" role="alert">{error}</div>}
  {result&&<div className="assessment-result" role="status"><div className="score-heading"><div><span className="eyebrow">RETENTION REVIEW</span><strong>{result.score}<small>/100</small></strong></div><Check size={23}/></div><p>{result.summary}</p><div className="score-breakdown"><span>Key ideas recalled <b>{result.coverage}%</b></span><span>{recall?'Unaided recall · no hints shown':'Guided practice · hints available'}</span></div>{[{title:'What you got right',items:result.strengths},{title:'Ideas to add',items:result.missing},{title:'Corrections',items:result.incorrect}].filter(group=>group.items.length).map(group=><section key={group.title}><h3>{group.title}</h3><ul>{group.items.map((item,i)=><li key={i}>{item}</li>)}</ul></section>)}<small>{result.method==='exact'?'Complete source match.':'Review of the ideas in your submitted response. Use Recall without hints to check unaided retention.'}</small></div>}
 </div>
}
