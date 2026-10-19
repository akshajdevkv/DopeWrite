export type ProcessingBlock={id:number;kind:string;new_topic:boolean;topic_title?:string};
export type PracticeSection={id?:string;source_title?:string;source_text?:string;title:string;text:string;topic_id?:number;references?:{kind:string;text:string}[];scope_source_blocks?:string[];scope_processing_plan?:ProcessingBlock[];words_per_passage?:number};
export type ProcessedLesson={title:string;organization?:string;notice?:string;source_blocks?:string[];processing_plan?:ProcessingBlock[];words_per_passage?:number;sections:PracticeSection[]};
export function sectionContext(section:PracticeSection):ProcessedLesson{
 if(section.scope_source_blocks?.length&&section.scope_processing_plan?.length){
  return {title:section.title,source_blocks:section.scope_source_blocks,processing_plan:section.scope_processing_plan,words_per_passage:section.words_per_passage||120,sections:[section]};
 }
 // Build context from this passage only. Never use the lesson's document-wide source or plan.
 const sentences=section.text.split(/(?<=[.!?])\s+(?=[A-Z“"‘])/u).filter(Boolean);
 const references=(section.references||[]).filter(item=>item.text!==section.title);
 const blocks=[section.title,...sentences,...references.map(item=>item.text)];
 const plan:ProcessingBlock[]=blocks.map((_,id)=>({id,kind:id===0?'heading':id<=sentences.length?'body':references[id-sentences.length-1].kind,new_topic:id===0}));
 return {title:section.title,source_blocks:blocks,processing_plan:plan,words_per_passage:section.words_per_passage||120,sections:[section]};
}
export function replaceSelectedSections(lesson:ProcessedLesson,index:number,replacement:ProcessedLesson,replaceCount=1):ProcessedLesson{
 const original=lesson.sections[index];
 if(!original||replaceCount<1||index+replaceCount>lesson.sections.length)throw new Error('Invalid selected section range');
 let nextTopic=Math.max(-1,...lesson.sections.map((section,i)=>section.topic_id??i))+1;
 const topicIds=new Map<number,number>();
 const sections=replacement.sections.map((section,i)=>{
  const localTopic=section.topic_id??i;
  if(!topicIds.has(localTopic))topicIds.set(localTopic,nextTopic++);
  const updated:PracticeSection={...section,source_title:original.source_title??original.title,source_text:original.source_text??original.text,id:i===0?original.id:crypto.randomUUID(),topic_id:topicIds.get(localTopic),words_per_passage:replacement.words_per_passage||120};
  // A single updated passage can retain excluded text for later scoped edits.
  // Split passages get fresh per-passage contexts; they never inherit a sibling's prose.
  if(replacement.sections.length===1){
   updated.scope_source_blocks=replacement.source_blocks;
   updated.scope_processing_plan=replacement.processing_plan;
  }
  return updated;
 });
 return {...lesson,sections:[...lesson.sections.slice(0,index),...sections,...lesson.sections.slice(index+replaceCount)]};
}
