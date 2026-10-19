/** Offer only the next short continuation; this never grades a response. */
export function inlineCompletion(source:string,value:string,maxChars=48):string{
 const normalizedSource=source.replace(/\s+/gu,' '),normalizedValue=value.replace(/\s+/gu,' ');
 let offset=0;
 if(normalizedSource.toLowerCase().startsWith(normalizedValue.toLowerCase()))offset=normalizedValue.length;
 else{
  // Resume suggestions from the latest matching phrase, even after a line break or a rewritten phrase.
  const words=normalizedValue.match(/\S+\s*/gu)||[];
  let found=false;
  for(let count=Math.min(8,words.length);count>=1;count--){
   const tail=words.slice(-count).join('');
   if(tail.trim().length<3)continue;
   const index=normalizedSource.toLowerCase().lastIndexOf(tail.toLowerCase());
   if(index>=0){offset=index+tail.length;found=true;break}
  }
  if(!found)return '';
 }
 const rest=normalizedSource.slice(offset);
 if(!rest)return '';
 const sentence=rest.match(/^.*?[.!?](?:\s|$)/u)?.[0]||rest;
 if(sentence.length<=maxChars)return sentence;
 const line=sentence.slice(0,maxChars),breakAt=line.lastIndexOf(' ');
 return breakAt>0?line.slice(0,breakAt+1):line;
}
