import type {ResultDocument} from '../results/model';
export async function downloadResults(_doc:ResultDocument,_kind:'excel'|'summary',_includeChoiceText=true):Promise<void>{throw new Error('Open this report in your browser to download it.');}
