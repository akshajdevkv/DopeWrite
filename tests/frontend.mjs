import assert from 'node:assert/strict';
import {inlineCompletion} from '../app/inlineCompletion.ts';
import {apiError} from '../app/apiError.ts';
import {sectionContext,replaceSelectedSections} from '../app/processingScope.ts';

const passage='Active recall strengthens memory. Regular practice helps ideas stay available.';
const initialHint=inlineCompletion(passage,'',24);
assert(initialHint.length>0&&initialHint.length<=24);
assert.notEqual(initialHint,passage);
assert.equal(inlineCompletion(passage,passage),'');
assert.equal(inlineCompletion(passage,'Unrelated response with no matching phrase'),'');
assert.equal(inlineCompletion(passage,'Active recall strengthens memory.\n',60),'Regular practice helps ideas stay available.');
let completed='';
for(let i=0;i<20&&completed!==passage;i++){const hint=inlineCompletion(passage,completed,24);assert(hint.length>0);completed+=hint}
assert.equal(completed,passage);
const validationError=apiError({detail:[{loc:['body','scope'],msg:'Field required',input:{secret:'never expose this'}}]},'generic');
assert(validationError.includes('scope'));
assert(!validationError.includes('never expose this'));
assert.equal(apiError({detail:'Rate limited'},'generic'),'Rate limited');

const lesson={title:'Document',source_blocks:['DOCUMENT-WIDE SOURCE MUST NOT BE SENT'],sections:[
 {id:'neighbor',title:'Other',text:'OTHER SECTION MUST NOT BE SENT',topic_id:0},
 {id:'selected',title:'Original source heading',text:passage,topic_id:1}
]};
const context=sectionContext(lesson.sections[1]);
assert(!JSON.stringify(context).includes('OTHER SECTION'));
assert(!JSON.stringify(context).includes('DOCUMENT-WIDE'));
const replacement={title:'Selected',source_blocks:context.source_blocks,processing_plan:context.processing_plan,words_per_passage:60,sections:[{title:'Typing exercise title',text:'Active recall strengthens memory.',topic_id:0}]};
const edited=replaceSelectedSections(lesson,1,replacement);
assert.equal(edited.sections[1].source_title,'Original source heading');
assert.equal(edited.sections[1].source_text,passage);
assert.equal(edited.sections[1].text,'Active recall strengthens memory.');
assert.deepEqual(edited.sections[0],lesson.sections[0]);
const reedited=replaceSelectedSections(edited,1,{...replacement,sections:[{title:'Another typing title',text:'Regular practice helps ideas stay available.',topic_id:0}]});
assert.equal(reedited.sections[1].source_text,passage);
assert.equal(reedited.sections[1].source_title,'Original source heading');
const split=replaceSelectedSections(lesson,1,{...replacement,sections:[{title:'Part 1',text:'First part.',topic_id:0},{title:'Part 2',text:'Second part.',topic_id:0}]});
assert.equal(split.sections[1].source_text,passage);
assert.equal(split.sections[2].source_text,passage);
assert(!JSON.stringify(sectionContext(split.sections[1])).includes('Second part.'));
const restored=replaceSelectedSections(split,1,context,2);
assert.equal(restored.sections.length,2);
assert.deepEqual(restored.sections[0],lesson.sections[0]);
assert.equal(restored.sections[1].text,passage);
console.log('Passed inline completion, validation feedback, typing-only edits, source immutability, scope, and Undo checks.');

const {draftHtml,lessonDraft}=await import('../app/documentDraft.ts');
const draft=lessonDraft(lesson);
assert.equal(draft.blocks[0].text,'Other');
const html=draftHtml([{text:'<script>alert(1)</script> & words',kind:'body'},{text:'My topic',kind:'heading',heading_level:2},{text:'Ignore this',kind:'ignore'}]);
assert(!html.includes('<script>'));
assert(html.includes('&lt;script&gt;'));
assert(html.includes('<h2 data-kind="heading">My topic</h2>'));
assert(html.includes('data-kind="ignore"'));
console.log('Passed editor markup safety and explicit heading checks.');

const {pendingCards,rateCard,restartCards}=await import('../app/flashcardReview.ts');
const deck={questions:[{question:'First?',source_excerpt:'First answer.'},{question:'Second?',source_excerpt:'Second answer.'}]};
assert.deepEqual(pendingCards(deck),[0,1]);
assert.equal(rateCard(deck,'good'),deck,'Cannot rate before revealing the answer');
const repeated=rateCard({...deck,revealed:true},'again');
assert.deepEqual(pendingCards(repeated),[1,0]);
assert.equal(repeated.revealed,false);
const advanced=rateCard({...repeated,revealed:true},'hard');
assert.deepEqual(pendingCards(advanced),[0]);
const finished=rateCard({...advanced,revealed:true},'easy');
assert.deepEqual(pendingCards(finished),[]);
assert.deepEqual(pendingCards(restartCards(finished)),[0,1]);
assert.deepEqual(restartCards(finished).ratings,{});
assert.deepEqual(deck.questions,finished.questions,'Review never edits the source answers');
console.log('Passed flashcard reveal, retry queue, rating, completion, and restart checks.');

const {googleSignInOptions,authCallbackMessage}=await import('../app/googleAuth.ts');
const googleOptions=googleSignInOptions('http://localhost:3000/some/path?next=https://external.example');
assert.equal(googleOptions.provider,'google');
assert.equal(googleOptions.options.redirectTo,'http://localhost:3000/auth/callback');
assert.equal(googleOptions.options.scopes,'openid email profile');
assert.equal(googleOptions.options.queryParams.prompt,'select_account');
assert.equal(googleOptions.options.skipBrowserRedirect,true);
assert.throws(()=>googleSignInOptions('javascript:alert(1)'),/Invalid/);
assert(authCallbackMessage('cancelled').includes('cancelled'));
assert(authCallbackMessage('callback').includes('Sign-in could not be completed'));
assert(!authCallbackMessage('<script>').includes('<script>'));
assert.equal(authCallbackMessage(null),'');
console.log('Passed Google OAuth provider, minimal scopes, callback origin, cancellation, and safe error message checks.');

const {product,checkoutDestination}=await import('../app/product.ts');
assert.equal(product.price,99);assert.equal(product.currency,'INR');assert.equal(product.billing,'one-time');
assert.equal(checkoutDestination(undefined),null);
assert.equal(checkoutDestination('javascript:alert(1)'),null);
assert.equal(checkoutDestination('http://example.com/checkout'),null);
assert.equal(checkoutDestination('https://example.com/checkout'),'https://example.com/checkout');
console.log('Passed product price, one-time billing, and safe payment-link configuration checks.');

const {authDestination}=await import('../app/googleAuth.ts');
assert.equal(authDestination('/checkout'),'/checkout');
for(const next of ['https://example.com','//example.com','/checkout/../admin','/checkout?next=bad',null])assert.equal(authDestination(next),'/app');
assert.equal(new URL(googleSignInOptions('https://app.example.com','/checkout').options.redirectTo).searchParams.get('next'),'/checkout');
console.log('Passed checkout sign-in return path and external redirect rejection checks.');
