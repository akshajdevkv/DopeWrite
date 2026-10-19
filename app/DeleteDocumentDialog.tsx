'use client';
import {useEffect,useRef} from 'react';
import {Trash2,X} from 'lucide-react';
import type {DocumentSummary} from './cloudTypes';
type Props={document:DocumentSummary;busy:boolean;error:string;onCancel:()=>void;onConfirm:()=>void};
export default function DeleteDocumentDialog({document,busy,error,onCancel,onConfirm}:Props){
 const dialog=useRef<HTMLDialogElement>(null),cancel=useRef<HTMLButtonElement>(null);
 useEffect(()=>{const element=dialog.current,previous=window.document.activeElement;if(!element)return;element.showModal();cancel.current?.focus();return()=>{element.close();if(previous instanceof HTMLElement&&previous.isConnected)previous.focus()}},[]);
 return <dialog ref={dialog} className="delete-document-dialog" role="alertdialog" aria-labelledby="delete-document-title" aria-describedby="delete-document-description" onCancel={event=>{event.preventDefault();if(!busy)onCancel()}}>
  <div className="delete-dialog-top"><span className="delete-dialog-icon"><Trash2 size={23}/></span><button aria-label="Cancel document deletion" disabled={busy} onClick={onCancel}><X size={18}/></button></div>
  <h2 id="delete-document-title">Delete this document?</h2>
  <p className="delete-document-name">{document.title}</p>
  <div id="delete-document-description"><p>This permanently removes the document from this folder and your Supabase account, including:</p><ul><li>The original uploaded file</li><li>Edited content, lessons, typing drafts, and results</li><li>Flashcards and review progress</li></ul><p className="delete-permanent-note">This cannot be undone. The folder and other documents stay in place.</p></div>
  {error&&<div className="delete-document-error" role="alert">{error}</div>}
  <div className="delete-dialog-actions"><button ref={cancel} className="secondary" disabled={busy} onClick={onCancel}>Keep document</button><button className="delete-confirm" disabled={busy} onClick={onConfirm}>{busy?'Deleting…':error?'Retry deletion':'Delete permanently'}<Trash2 size={15}/></button></div>
 </dialog>
}
