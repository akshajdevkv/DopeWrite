'use client';
import DOMPurify from 'dompurify';
import { useEffect,useRef,useState } from 'react';
import { ArrowLeft,ArrowUpRight,Bold,BookOpen,Check,FileText,Italic,List,ListOrdered,Redo2,Undo2,Underline,X } from 'lucide-react';
import { draftHtml,readEditor,type DocumentDraft,type BlockKind } from './documentDraft';
import type { ProcessedLesson } from './processingScope';
type Props={saveStatus?:string;draft:DocumentDraft;filename:string;preview:string;originalBlocks:string[];onChange:(draft:DocumentDraft)=>void;onStart:(lesson:ProcessedLesson)=>void;onClose:()=>void};
export default function DocumentEditor({draft,filename,preview,originalBlocks,onChange,onStart,onClose,saveStatus}:Props){
 const editor=useRef<HTMLDivElement>(null),savedRange=useRef<Range|null>(null);
 const [style,setStyle]=useState('body'),[busy,setBusy]=useState(false),[error,setError]=useState(''),[showOriginal,setShowOriginal]=useState(false);
 const current=useRef(draft);current.current=draft;
 const wordCount=draft.blocks.reduce((sum,block)=>sum+(block.text.trim()?block.text.trim().split(/\s+/u).length:0),0);
 const headings=draft.blocks.map((block,index)=>({block,index})).filter(({block})=>block.kind==='heading'&&block.text.trim());
 function commit(){if(editor.current){const next={...current.current,blocks:readEditor(editor.current),html:editor.current.innerHTML};current.current=next;onChange(next);setError('')}}
 function activeBlock(){const selection=window.getSelection(),node=selection?.anchorNode;let element=node instanceof HTMLElement?node:node?.parentElement;while(element&&element!==editor.current){if(['H1','H2','P','LI','DIV'].includes(element.tagName))return element;element=element.parentElement}return null}
 useEffect(()=>{
  const element=editor.current;if(!element)return;element.innerHTML=draft.html?DOMPurify.sanitize(draft.html,{ALLOWED_TAGS:['p','div','br','h1','h2','ul','ol','li','strong','b','em','i','u','span'],ALLOWED_ATTR:['data-kind']}):draftHtml(draft.blocks);
  const selection=()=>{const selected=window.getSelection();if(selected?.rangeCount&&element.contains(selected.anchorNode)){savedRange.current=selected.getRangeAt(0).cloneRange();const block=activeBlock();setStyle(block?.tagName==='H1'?'heading1':block?.tagName==='H2'?'heading2':block?.dataset.kind==='equation'?'equation':block?.dataset.kind==='diagram'?'diagram':block?.dataset.kind==='ignore'?'ignore':'body')}};
  document.addEventListener('selectionchange',selection);
  return()=>document.removeEventListener('selectionchange',selection);
 },[]);
 function restore(){const element=editor.current;if(!element)return;element.focus();const selection=window.getSelection();if(savedRange.current&&element.contains(savedRange.current.commonAncestorContainer)){selection?.removeAllRanges();selection?.addRange(savedRange.current)}}
 function command(name:string,value?:string){restore();document.execCommand(name,false,value);commit()}
 function format(value:string){restore();document.execCommand('formatBlock',false,value==='heading1'?'h1':value==='heading2'?'h2':'p');const block=activeBlock();if(block)block.dataset.kind=value.startsWith('heading')?'heading':value as BlockKind;setStyle(value);commit()}
 async function start(){
  if(busy)return;commit();setBusy(true);setError('');
  try{
   const content=current.current;
   if(!content.title.trim())throw new Error('Give your document a title before starting.');
   if(content.blocks.reduce((sum,block)=>sum+block.text.length,0)>45000)throw new Error('Keep edited content below 45,000 characters.');
   const response=await fetch('/api/review',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:content.title,blocks:content.blocks})});
   const result=await response.json();
   if(!response.ok)throw new Error(typeof result.detail==='string'?result.detail:'Check the document title and content, then try again.');
   onStart(result);
  }catch(e){setError(e instanceof Error?e.message:'Could not prepare practice. Your edits are kept.')}
  finally{setBusy(false)}
 }
 function jump(index:number){const target=editor.current?.querySelectorAll('h1,h2')[index];if(!(target instanceof HTMLElement))return;target.scrollIntoView({behavior:'smooth',block:'center'});editor.current?.focus();const range=document.createRange();range.selectNodeContents(target);range.collapse(true);const selection=window.getSelection();selection?.removeAllRanges();selection?.addRange(range)}
 return <div className="document-studio"><div className="studio-top"><button className="studio-back" onClick={onClose} disabled={busy}><ArrowLeft size={16}/> Workspace</button><div className="studio-document"><FileText size={24}/><div><input aria-label="Document title" maxLength={200} value={draft.title} disabled={busy} onChange={e=>onChange({...draft,title:e.target.value})}/><small>{filename} <span>·</span> <Check size={11}/> {saveStatus||'Edits kept in this session'}</small></div></div><button className="primary" disabled={busy} onClick={()=>void start()}>{busy?'Preparing practice…':'Start learning'}<ArrowUpRight size={15}/></button></div>
  <div className="studio-toolbar" role="toolbar" aria-label="Document formatting"><button aria-label="Undo edit" title="Undo" disabled={busy} onMouseDown={e=>e.preventDefault()} onClick={()=>command('undo')}><Undo2 size={16}/></button><button aria-label="Redo edit" title="Redo" disabled={busy} onMouseDown={e=>e.preventDefault()} onClick={()=>command('redo')}><Redo2 size={16}/></button><i/><label className="sr-only" htmlFor="paragraph-style">Paragraph style</label><select id="paragraph-style" aria-label="Paragraph style" value={style} disabled={busy} onChange={e=>format(e.target.value)}><option value="body">Normal text</option><option value="heading1">Topic heading</option><option value="heading2">Subheading</option><option value="equation">Equation · reference</option><option value="diagram">Diagram · reference</option><option value="ignore">Exclude from practice</option></select><i/><button aria-label="Bold" title="Bold" disabled={busy} onMouseDown={e=>e.preventDefault()} onClick={()=>command('bold')}><Bold size={16}/></button><button aria-label="Italic" title="Italic" disabled={busy} onMouseDown={e=>e.preventDefault()} onClick={()=>command('italic')}><Italic size={16}/></button><button aria-label="Underline" title="Underline" disabled={busy} onMouseDown={e=>e.preventDefault()} onClick={()=>command('underline')}><Underline size={16}/></button><i/><button aria-label="Bulleted list" title="Bulleted list" disabled={busy} onMouseDown={e=>e.preventDefault()} onClick={()=>command('insertUnorderedList')}><List size={17}/></button><button aria-label="Numbered list" title="Numbered list" disabled={busy} onMouseDown={e=>e.preventDefault()} onClick={()=>command('insertOrderedList')}><ListOrdered size={17}/></button><button className="compare-original" onClick={()=>setShowOriginal(value=>!value)} aria-pressed={showOriginal}><BookOpen size={15}/> Compare original</button></div>
  {error&&<div className="studio-error" role="alert">{error}</div>}
  <div className={`studio-body ${showOriginal?'comparing':''}`}><aside className="document-outline"><span className="eyebrow">DOCUMENT OUTLINE</span><h3>Your topics</h3>{headings.length?headings.map(({block,index},i)=><button key={index} className={block.heading_level===2?'subheading':''} onClick={()=>jump(i)}><span>{String(i+1).padStart(2,'0')}</span>{block.text}</button>):<p>Select a paragraph and choose Topic heading to create your outline.</p>}<div className="outline-tip"><FileText size={18}/><p>Correct the wording, mark your headings, and decide what belongs in practice. Scanned PDF text is recognized with OCR; check it against the original.</p><small>Normal text becomes typing practice. Headings name topics. Reference and excluded text stay out.</small></div></aside>
   <div className="editor-canvas"><div className="review-step"><span>01 UPLOAD</span><b>02 EDIT & ORGANIZE</b><span>03 LEARN & RECALL</span></div><div className="document-page"><div className="page-ruler" aria-hidden="true">1 <span>2</span><span>3</span><span>4</span><span>5</span><span>6</span></div><div ref={editor} className="editable-document" role="textbox" aria-label="Document content" aria-multiline="true" contentEditable={!busy} suppressContentEditableWarning spellCheck onInput={commit} onPaste={e=>{e.preventDefault();document.execCommand('insertText',false,e.clipboardData.getData('text/plain'));commit()}} onDrop={e=>{e.preventDefault();document.execCommand('insertText',false,e.dataTransfer.getData('text/plain'));commit()}}/></div><div className="studio-footer"><span>{wordCount} words <span>·</span> {headings.length} headings</span><span>Starting learning rebuilds sections and resets practice progress.</span></div></div>
   {showOriginal&&<section className="original-comparison" aria-label="Original document comparison"><div><strong>Original document</strong><button aria-label="Close original comparison" onClick={()=>setShowOriginal(false)}><X size={16}/></button></div>{preview?<iframe title="Original uploaded PDF" src={preview}/>:<div className="original-text">{originalBlocks.map((text,i)=><p key={i}>{text}</p>)}</div>}</section>}
  </div>
 </div>
}
