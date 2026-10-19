import type { ProcessedLesson } from './processingScope';
export type BlockKind='heading'|'body'|'equation'|'diagram'|'ignore';
export type ReviewBlock={text:string;kind:BlockKind;heading_level?:number};
export type DocumentDraft={title:string;blocks:ReviewBlock[];html?:string};
export function escapeHtml(text:string){return text.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!))}
export function draftHtml(blocks:ReviewBlock[]){return blocks.map(block=>{const tag=block.kind==='heading'?(block.heading_level===2?'h2':'h1'):'p';return `<${tag} data-kind="${block.kind}">${escapeHtml(block.text).replace(/\n/g,'<br>')||'<br>'}</${tag}>`}).join('')}
export function lessonDraft(lesson:ProcessedLesson):DocumentDraft{
 if(lesson.source_blocks?.length&&lesson.processing_plan?.length)return {title:lesson.title,blocks:lesson.source_blocks.map((text,i)=>({text,kind:lesson.processing_plan![i].kind as BlockKind}))};
 return {title:lesson.title,blocks:lesson.sections.flatMap(section=>[{text:section.title,kind:'heading' as BlockKind},{text:section.text,kind:'body' as BlockKind}])};
}
export function readEditor(root:HTMLElement):ReviewBlock[]{
 const blocks:ReviewBlock[]=[];
 function visit(node:Node){
  if(node.nodeType===Node.TEXT_NODE){if(node.textContent?.trim())blocks.push({text:node.textContent,kind:'body'});return}
  if(!(node instanceof HTMLElement))return;
  if(node.tagName==='UL'||node.tagName==='OL'||(node.tagName==='DIV'&&Array.from(node.children).some(child=>['P','H1','H2','DIV','UL','OL'].includes(child.tagName)))){node.childNodes.forEach(visit);return}
  const text=node.innerText.replace(/\u00a0/g,' ');
  const heading=node.tagName==='H1'||node.tagName==='H2';
  const reference=node.dataset.kind;
  const kind:BlockKind=heading?'heading':reference==='equation'||reference==='diagram'||reference==='ignore'?reference:'body';
  blocks.push({text,kind,heading_level:node.tagName==='H2'?2:1});
 }
 root.childNodes.forEach(visit);
 return blocks.length?blocks:[{text:'',kind:'body'}];
}
