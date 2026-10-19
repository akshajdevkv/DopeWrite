import type {DocumentDraft} from './documentDraft';
import type {ProcessedLesson} from './processingScope';
import type {RecallSession} from './flashcardReview';
import type {Evaluation} from './PracticeResponse';
export type StudySnapshot={draft:DocumentDraft|null;originalBlocks:string[];lesson:ProcessedLesson|null;index:number;mode:'type'|'recall';typed:string;saved:Record<string,{typed:string}>;recallSessions:Record<string,RecallSession|undefined>;evaluations:Record<string,Evaluation|undefined>;view:'edit'|'workspace'};
export type Workspace={id:string;name:string;created_at:string};
export type DocumentSummary={id:string;workspace_id:string;title:string;filename:string;file_path:string|null;updated_at:string;revision:number};
export type CloudDocument=DocumentSummary&{owner_id:string;content:StudySnapshot};
