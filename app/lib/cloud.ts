import {browserSupabase} from './supabase/browser';
import type {CloudDocument,DocumentSummary,StudySnapshot,Workspace} from '../cloudTypes';
import type {DocumentDraft} from '../documentDraft';
export function cloudError(error:{message?:string}|unknown){
 const message=error&&typeof error==='object'&&'message' in error?String(error.message):'Cloud request failed.';
 if(/schema cache|does not exist|relation|Could not find the table/i.test(message))return 'The Supabase tables are not ready. Run the workspace migration in your Supabase SQL editor.';
 return message;
}
export async function listWorkspaces():Promise<Workspace[]>{const {data,error}=await browserSupabase().from('workspaces').select('id,name,created_at').order('created_at');if(error)throw error;return data}
export async function createWorkspace(name:string):Promise<Workspace>{const {data,error}=await browserSupabase().from('workspaces').insert({name:name.trim()}).select('id,name,created_at').single();if(error)throw error;return data}
export async function renameWorkspace(id:string,name:string){const {error}=await browserSupabase().from('workspaces').update({name:name.trim()}).eq('id',id);if(error)throw error}
export async function listDocuments(workspaceId:string):Promise<DocumentSummary[]>{const {data,error}=await browserSupabase().from('documents').select('id,workspace_id,title,filename,file_path,updated_at,revision').eq('workspace_id',workspaceId).order('updated_at',{ascending:false});if(error)throw error;return data}
export async function openDocument(id:string):Promise<{document:CloudDocument;preview:string}>{
 const client=browserSupabase();const {data,error}=await client.from('documents').select('*').eq('id',id).single();if(error)throw error;
 const document=data as CloudDocument;let preview='';
 if(document.file_path&&document.filename.toLowerCase().endsWith('.pdf')){const {data:file,error:fileError}=await client.storage.from('documents').download(document.file_path);if(fileError)throw fileError;preview=URL.createObjectURL(file.type==='application/pdf'?file:new Blob([file],{type:'application/pdf'}))}
 return {document,preview};
}
export async function createDocument(workspaceId:string,file:File|null,draft:DocumentDraft,filename:string):Promise<CloudDocument>{
 const client=browserSupabase();const {data:{user},error:authError}=await client.auth.getUser();if(authError||!user)throw new Error('Your session expired. Sign in again.');
 const content:StudySnapshot={draft,originalBlocks:draft.blocks.map(block=>block.text),lesson:null,index:0,mode:'type',typed:'',saved:{},recallSessions:{},evaluations:{},view:'edit'};
 const {data,error}=await client.from('documents').insert({workspace_id:workspaceId,owner_id:user.id,title:draft.title,filename:filename.slice(0,255),content}).select('*').single();if(error)throw error;
 const document=data as CloudDocument;if(!file)return document;
 const extension=file.name.toLowerCase().endsWith('.pdf')?'pdf':'pptx';
 const path=`${user.id}/${workspaceId}/${document.id}/source.${extension}`;
 const {error:uploadError}=await client.storage.from('documents').upload(path,file,{contentType:extension==='pdf'?'application/pdf':'application/vnd.openxmlformats-officedocument.presentationml.presentation',upsert:false});
 if(uploadError){await client.from('documents').delete().eq('id',document.id);throw uploadError}
 const {data:updated,error:updateError}=await client.from('documents').update({file_path:path}).eq('id',document.id).select('*').single();
 if(updateError){
  // Never remove the owning row before cleaning the private object: Storage RLS uses it.
  const {error:cleanupError}=await client.storage.from('documents').remove([path]);
  if(!cleanupError)await client.from('documents').delete().eq('id',document.id);
  throw new Error('The file uploaded but its document could not be finalized. Reopen this folder before retrying.');
 }
 return updated as CloudDocument;
}
export async function saveDocument(document:CloudDocument,content:StudySnapshot):Promise<CloudDocument>{
 if(new TextEncoder().encode(JSON.stringify(content)).length>1_900_000)throw new Error('This document has too much saved progress. Keep fewer passages or start a fresh document.');
 const {data,error}=await browserSupabase().from('documents').update({title:(content.draft?.title||document.title).trim()||'Untitled document',content,revision:document.revision+1}).eq('id',document.id).eq('revision',document.revision).select('*').maybeSingle();
 if(error)throw error;
 if(!data)throw new Error('This document changed in another tab. Your current edits are kept here; reopen the document in a new tab to compare before continuing.');
 return data as CloudDocument;
}

export async function deleteDocument(document:DocumentSummary):Promise<void>{
 const client=browserSupabase();
 // Fetch authoritative paths through RLS, never trust a caller-supplied object path.
 const {data:current,error:readError}=await client.from('documents').select('id,owner_id,workspace_id,file_path,revision').eq('id',document.id).maybeSingle();
 if(readError)throw readError;
 if(!current)return; // Another tab may already have removed this document.
 if(current.revision!==document.revision)throw new Error('This document changed in another tab. Refresh the folder and review the latest version before deleting it.');
 const prefix=`${current.owner_id}/${current.workspace_id}/${current.id}/`;
 const paths=new Set<string>();
 if(current.file_path){
  if(!current.file_path.startsWith(prefix)||current.file_path.slice(prefix.length).includes('/'))throw new Error('The original file path does not match this document. Deletion was stopped.');
  paths.add(current.file_path);
 }
 // Also clean a file left behind if an earlier upload could not finalize its row.
 const {data:files,error:listError}=await client.storage.from('documents').list(prefix.slice(0,-1),{limit:100});
 if(listError)throw new Error('Could not check this document’s stored files. Nothing was deleted. Please retry.');
 if(files?.length===100)throw new Error('This document has too many stored files to delete safely. Deletion was stopped.');
 for(const file of files||[]){
  if(!file.id||file.name.includes('/'))throw new Error('Unexpected nested files were found. Deletion was stopped.');
  paths.add(prefix+file.name);
 }
 // Storage authorization depends on the owning row, so remove files FIRST.
 if(paths.size){
  const {error:fileError}=await client.storage.from('documents').remove([...paths]);
  if(fileError)throw new Error('Could not delete the original file from Storage. Your saved document was kept. Please retry.');
 }
 const {data:deleted,error:deleteError}=await client.from('documents').delete().eq('id',current.id).eq('revision',current.revision).select('id').maybeSingle();
 if(deleteError)throw new Error(paths.size?'Stored files were removed, but the database record could not be deleted. Your saved content is still in the folder. Retry deletion to finish.':'The database record could not be deleted. Your saved content is still in the folder. Please retry.');
 if(!deleted){
  const {data:remaining,error:checkError}=await client.from('documents').select('id').eq('id',current.id).maybeSingle();
  if(checkError||remaining)throw new Error('The document changed while deleting. Stored files may already be removed. Refresh this folder and retry deletion on the latest version.');
 }
}
