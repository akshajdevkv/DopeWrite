'use client';
import {Children, useEffect, useRef, useState, type ReactNode} from 'react';

export default function ResizablePanes({recall,children}:{recall:boolean;children:ReactNode}){
 const container=useRef<HTMLDivElement>(null);
 const dragging=useRef(false);
 const [resizing,setResizing]=useState(false),[ratio,setRatio]=useState(50),[minimum,setMinimum]=useState(25);
 const clamp=(value:number)=>Math.min(100-minimum,Math.max(minimum,value));
 useEffect(()=>{
  const element=container.current;if(!element||recall)return;
  const measure=()=>{const width=element.clientWidth-10;if(width<=0)return;const limit=Math.min(50,Math.max(25,220/width*100));setMinimum(limit);setRatio(value=>Math.max(limit,Math.min(100-limit,value)))};
  const observer=new ResizeObserver(measure);observer.observe(element);measure();return()=>observer.disconnect();
 },[recall]);
 useEffect(()=>{const stop=()=>{dragging.current=false;setResizing(false)};window.addEventListener('blur',stop);return()=>window.removeEventListener('blur',stop)},[]);
 const panes=Children.toArray(children);
 function move(clientX:number){const rect=container.current?.getBoundingClientRect();if(rect)setRatio(clamp((clientX-rect.left-5)/(rect.width-10)*100))}
 return <div ref={container} className={`panes ${recall?'flashcard-mode':'resizable-panes'} ${resizing?'is-resizing':''}`} style={recall?undefined:{gridTemplateColumns:`minmax(0,${ratio}fr) 10px minmax(0,${100-ratio}fr)`}}>
  {recall?children:<>{panes[0]}<div className="pane-divider" role="separator" aria-label="Resize source and canvas" aria-orientation="vertical" aria-valuemin={Math.ceil(minimum)} aria-valuemax={Math.floor(100-minimum)} aria-valuenow={Math.round(ratio)} aria-valuetext={`Source ${Math.round(ratio)} percent, canvas ${Math.round(100-ratio)} percent`} tabIndex={0} title="Drag to resize · Arrow keys to adjust · Double-click to reset"
   onPointerDown={event=>{if(event.button!==0)return;event.preventDefault();event.currentTarget.focus();event.currentTarget.setPointerCapture(event.pointerId);dragging.current=true;setResizing(true)}}
   onPointerMove={event=>{if(dragging.current)move(event.clientX)}}
   onPointerUp={()=>{dragging.current=false;setResizing(false)}} onPointerCancel={()=>{dragging.current=false;setResizing(false)}} onLostPointerCapture={()=>{dragging.current=false;setResizing(false)}}
   onDoubleClick={()=>setRatio(50)} onKeyDown={event=>{const step=event.shiftKey?10:2;if(event.key==='ArrowLeft'){event.preventDefault();setRatio(value=>clamp(value-step))}else if(event.key==='ArrowRight'){event.preventDefault();setRatio(value=>clamp(value+step))}else if(event.key==='Home'){event.preventDefault();setRatio(minimum)}else if(event.key==='End'){event.preventDefault();setRatio(100-minimum)}else if(event.key==='Enter'){event.preventDefault();setRatio(50)}}}><span/></div>{panes[1]}</>}
 </div>
}
