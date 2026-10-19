export function apiError(data:unknown,fallback:string):string{
 if(!data||typeof data!=='object')return fallback;
 const detail=(data as {detail?:unknown}).detail;
 if(typeof detail==='string')return detail;
 if(Array.isArray(detail)){
  const issues=detail.slice(0,3).map(issue=>{
   if(!issue||typeof issue!=='object')return '';
   const field=Array.isArray(issue.loc)?issue.loc.filter((part:unknown)=>part!=='body').join('.'):'request';
   return `${field}: ${typeof issue.msg==='string'?issue.msg:'invalid value'}`;
  }).filter(Boolean);
  if(issues.length)return `Chat request needs updating (${issues.join('; ')}). Refresh the page and select the typing section again. Your source document is unchanged.`;
 }
 return fallback;
}
