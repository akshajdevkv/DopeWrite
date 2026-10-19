'use client';
import { useEffect, useRef, useState } from 'react';
import { Brain, Check, RotateCcw } from 'lucide-react';
import { pendingCards, rateCard, restartCards, type Rating, type RecallSession } from './flashcardReview';
export type { RecallSession } from './flashcardReview';
type Props={title:string;source:string;session?:RecallSession;onUpdate:(session:RecallSession)=>void};
export default function RecallQuestions({title,source,session,onUpdate}:Props){
 const [loading,setLoading]=useState(!session?.questions.length),[error,setError]=useState('');
 const generation=useRef<AbortController|null>(null);
 async function generate(){
  generation.current?.abort();
  const request=new AbortController();generation.current=request;setLoading(true);setError('');
  try{
   const response=await fetch('/api/recall-questions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title,source}),signal:request.signal});
   const data=await response.json();
   if(!response.ok)throw new Error(typeof data.detail==='string'?data.detail:'Could not create flashcards for this section. Please try again.');
   if(!request.signal.aborted)onUpdate(restartCards({questions:data.questions}));
  }catch(e){if(!request.signal.aborted)setError(e instanceof Error?e.message:'Could not generate flashcards.')}
  finally{if(!request.signal.aborted)setLoading(false)}
 }
 useEffect(()=>{if(!session?.questions.length)void generate();return()=>generation.current?.abort()},[]);
 const queue=session?pendingCards(session):[],card=session?.questions[queue[0]],complete=!!session?.questions.length&&!queue.length;
 function reveal(){if(session&&card)onUpdate({...session,revealed:true})}
 function rate(rating:Rating){if(session)onUpdate(rateCard(session,rating))}
 useEffect(()=>{
  function keydown(event:KeyboardEvent){
   if(event.repeat||event.altKey||event.ctrlKey||event.metaKey||!(event.target instanceof HTMLElement)||event.target.closest('input,textarea,select,[contenteditable="true"],[role="dialog"]'))return;
   if(!card||loading)return;
   if(event.code==='Space'&&!session?.revealed&&!event.target.closest('button')){event.preventDefault();reveal()}
   const ratings:Record<string,Rating>={'1':'again','2':'hard','3':'good','4':'easy'};
   if(session?.revealed&&ratings[event.key]){event.preventDefault();rate(ratings[event.key])}
  }
  window.addEventListener('keydown',keydown);return()=>window.removeEventListener('keydown',keydown);
 },[session,loading,card]);
 return <div className="flashcard-review">
  {loading&&<div className="flashcard-loading" role="status"><Brain size={27}/><p>Preparing your flashcards…</p></div>}
  {error&&<div className="assessment-error" role="alert">{error}<button className="secondary" disabled={loading} onClick={()=>void generate()}>Retry flashcards</button></div>}
  {card&&session&&<><div className="flashcard-topline"><span><Brain size={16}/> ACTIVE RECALL</span><span>{session.questions.length-queue.length} / {session.questions.length} reviewed</span></div><div className="flashcard-progress" role="progressbar" aria-label="Flashcard review progress" aria-valuemin={0} aria-valuemax={session.questions.length} aria-valuenow={session.questions.length-queue.length}><span style={{width:`${100*(session.questions.length-queue.length)/session.questions.length}%`}}/></div>
   <article className={`recall-flashcard ${session.revealed?'answer-shown':''}`} aria-label={`Flashcard ${queue[0]+1}`}><span className="flashcard-kicker">QUESTION {queue[0]+1}</span><h3>{card.question}</h3>{session.revealed&&<div className="flashcard-answer" role="region" aria-label="Flashcard answer"><span className="flashcard-kicker">ANSWER · FROM YOUR MATERIAL</span><p>{card.source_excerpt}</p></div>}{!session.revealed&&<p className="flashcard-think">Take a moment. Recall the answer before you turn the card.</p>}</article>
   <div className="flashcard-controls">{session.revealed?<><p>How well did you remember?</p><div className="flashcard-ratings">{(['again','hard','good','easy'] as Rating[]).map((rating,i)=><button key={rating} className={`rating-${rating}`} onClick={()=>rate(rating)}><strong>{rating==='again'?'Again':rating[0].toUpperCase()+rating.slice(1)}</strong><small>{rating==='again'?'Review again':rating==='hard'?'With effort':rating==='good'?'Remembered':'Effortless'} <kbd>{i+1}</kbd></small></button>)}</div></>:<button className="primary show-flashcard-answer" onClick={reveal}>Show answer <kbd>Space</kbd></button>}</div><p className="flashcard-help">Again brings this card back at the end. Progress is kept for this session.</p></>}
  {complete&&session&&<div className="flashcard-complete" role="status"><div><Check size={30}/></div><span className="flashcard-kicker">SECTION COMPLETE</span><h3>A little more knowledge, remembered.</h3><p>You reviewed all {session.questions.length} cards in this section.</p><button className="secondary" onClick={()=>onUpdate(restartCards(session))}><RotateCcw size={15}/> Review again</button></div>}
 </div>
}
