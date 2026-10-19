'use client';
import { useEffect, useRef, useState } from 'react';
import { apiError } from './apiError';
import { ArrowUpRight, RotateCcw, Sparkles, X } from 'lucide-react';
import { sectionContext, type ProcessedLesson, type PracticeSection } from './processingScope';
export type { ProcessedLesson } from './processingScope';
type Message={role:'user'|'assistant';content:string};
type Props={section:PracticeSection;open:boolean;onClose:()=>void;onApply:(lesson:ProcessedLesson,replaceCount?:number)=>void};
export default function ProcessingChat({section,open,onClose,onApply}:Props){
 const [messages,setMessages]=useState<Message[]>([]),[draft,setDraft]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[versions,setVersions]=useState<{previous:ProcessedLesson;insertedCount:number}[]>([]);
 const controller=useRef<AbortController|null>(null),bottom=useRef<HTMLDivElement>(null),input=useRef<HTMLTextAreaElement>(null);
 useEffect(()=>()=>controller.current?.abort(),[]);
 useEffect(()=>{if(open)bottom.current?.scrollIntoView({block:'nearest'});},[open,messages,busy]);
 useEffect(()=>{if(open)input.current?.focus()},[open]);
 async function send(){
  if(!draft.trim()||busy)return;
  const conversation:Message[]=[...messages,{role:'user',content:draft.trim()}];setMessages(conversation);setDraft('');setError('');setBusy(true);
  const request=new AbortController();controller.current=request;
  const context=sectionContext(section);
  const blocks=context.source_blocks,plan=context.processing_plan;
  try{
   const response=await fetch('/api/processing-chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({scope:'section',title:section.title,source_blocks:blocks,processing_plan:plan,words_per_passage:context.words_per_passage||120,messages:conversation.slice(-12).map(message=>({...message,content:message.content.slice(0,3000)}))}),signal:request.signal});
   const data=await response.json();
   if(!response.ok)throw new Error(apiError(data,'Could not update the typing exercise. Your source document is unchanged; please try again.'));
   if(request.signal.aborted)return;
   if(data.applied&&data.lesson){setVersions(previous=>[...previous,{previous:context,insertedCount:data.lesson.sections.length}]);onApply(data.lesson,1)}
   setMessages(previous=>[...previous,{role:'assistant',content:data.reply+(data.applied?'\n\nApplied to the selected typing exercise only. The source document is unchanged; this exercise’s attempts were reset.':'')}]);
  }catch(e){if(!request.signal.aborted){setError(e instanceof Error?e.message:'AI chat failed. Your document is unchanged.');setDraft(conversation[conversation.length-1].content)}}
  finally{if(!request.signal.aborted)setBusy(false)}
 }
 function undo(){const previous=versions[versions.length-1];if(!previous||busy)return;onApply(previous.previous,previous.insertedCount);setVersions(items=>items.slice(0,-1));setMessages(items=>[...items,{role:'assistant',content:'Undid the typing exercise change. The source document and other exercises are unchanged.'}]);setError('')}
 return <section className="processing-chat" hidden={!open} aria-label="AI document assistant">
  <div className="chat-header"><div><Sparkles size={18}/><span>Document AI<small>Typing exercise only</small></span></div><button onClick={onClose} aria-label="Close AI chat"><X size={18}/></button></div>
  <div className="chat-scope"><span>EDITING THE TYPING EXERCISE</span><strong>{section.title}</strong></div>
  <div className="chat-messages" role="log" aria-live="polite"><div className="chat-intro"><Sparkles size={24}/><h3>Adjust the typing practice.</h3><p>Chat changes the hints and practice content on the right. Only this exercise is shared with Groq. The PDF and source panel on the left stay unchanged.</p><div className="chat-suggestions">{['Use 60-word typing exercises','Exclude headings from typing','Include this exercise’s equation in typing'].map(prompt=><button disabled={busy} key={prompt} onClick={()=>{setDraft(prompt);input.current?.focus()}}>{prompt}<ArrowUpRight size={12}/></button>)}</div></div>{messages.map((message,i)=><div className={`chat-message ${message.role}`} key={i}><small>{message.role==='user'?'You':'Document AI'}</small><p>{message.content}</p></div>)}{busy&&<div className="chat-thinking" role="status">Reviewing your processing settings…</div>}<div ref={bottom}/></div>
  {error&&<div className="chat-error" role="alert">{error}</div>}
  <div className="chat-compose"><label htmlFor="processing-instruction">Change the typing exercise</label><textarea ref={input} id="processing-instruction" placeholder="e.g. Remove the last sentence from the typing hints…" value={draft} disabled={busy} maxLength={3000} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();void send()}}}/><div><button className="chat-undo" disabled={!versions.length||busy} onClick={undo}><RotateCcw size={13}/> Undo last change</button><button className="primary" disabled={!draft.trim()||busy} onClick={()=>void send()}>{busy?'Working…':'Send'}<ArrowUpRight size={14}/></button></div><small>Changes and Undo affect only this typing exercise. The original source stays unchanged.</small></div>
 </section>
}
