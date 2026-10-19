export const product={name:'DopeWrite',price:99,currency:'INR',billing:'one-time' as const};
export function checkoutDestination(value:string|undefined){
 if(!value)return null;
 try{const url=new URL(value);return url.protocol==='https:'?url.toString():null}catch{return null}
}
