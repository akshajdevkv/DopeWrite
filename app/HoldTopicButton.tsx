'use client';
import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
type Props={children:ReactNode;className:string;onSelect:()=>void;onPeek:()=>void;onRelease:()=>void};
export default function HoldTopicButton({children,className,onSelect,onPeek,onRelease}:Props){
 const timer=useRef<ReturnType<typeof setTimeout>|null>(null),held=useRef(false),suppressClick=useRef(false),start=useRef({x:0,y:0});
 const handlers=useRef({onPeek,onRelease});handlers.current={onPeek,onRelease};
 function stop(){if(timer.current){clearTimeout(timer.current);timer.current=null}if(held.current){held.current=false;handlers.current.onRelease()}}
 function arm(){stop();suppressClick.current=false;timer.current=setTimeout(()=>{timer.current=null;held.current=true;suppressClick.current=true;handlers.current.onPeek()},500)}
 useEffect(()=>{const cancel=()=>stop();window.addEventListener('blur',cancel);document.addEventListener('visibilitychange',cancel);return()=>{if(timer.current)clearTimeout(timer.current);if(held.current)handlers.current.onRelease();window.removeEventListener('blur',cancel);document.removeEventListener('visibilitychange',cancel)}},[]);
 return <button className={className} title="Press and hold to preview all typing hints in red" aria-describedby="topic-hold-help"
  onPointerDown={event=>{if(event.button!==0)return;start.current={x:event.clientX,y:event.clientY};event.currentTarget.setPointerCapture(event.pointerId);arm()}}
  onPointerUp={()=>stop()} onPointerCancel={()=>stop()} onLostPointerCapture={()=>stop()}
  onPointerMove={event=>{if(Math.hypot(event.clientX-start.current.x,event.clientY-start.current.y)>12)stop()}}
  onKeyDown={event=>{if(event.key===' '||event.key==='Enter'){event.preventDefault();if(!event.repeat)arm()}if(event.key==='Escape')stop()}}
  onKeyUp={event=>{if(event.key===' '||event.key==='Enter'){event.preventDefault();const wasHeld=held.current;stop();suppressClick.current=false;if(!wasHeld)onSelect()}}} onBlur={()=>stop()}
  onContextMenu={event=>{if(held.current||suppressClick.current)event.preventDefault()}}
  onClick={event=>{if(suppressClick.current){suppressClick.current=false;event.preventDefault();return}onSelect()}}>{children}</button>
}
