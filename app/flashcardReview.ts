export type RecallQuestion={question:string;source_excerpt:string};
export type Rating='again'|'hard'|'good'|'easy';
export type RecallSession={questions:RecallQuestion[];queue?:number[];revealed?:boolean;ratings?:Record<number,Rating>};
export function pendingCards(session:RecallSession){return session.queue??session.questions.map((_,i)=>i)}
export function rateCard(session:RecallSession,rating:Rating):RecallSession{
 const queue=pendingCards(session);if(!session.revealed||!queue.length)return session;
 const [current,...remaining]=queue;
 return {...session,queue:rating==='again'?[...remaining,current]:remaining,revealed:false,ratings:{...session.ratings,[current]:rating}};
}
export function restartCards(session:RecallSession):RecallSession{return {questions:session.questions,queue:session.questions.map((_,i)=>i),revealed:false,ratings:{}}}
