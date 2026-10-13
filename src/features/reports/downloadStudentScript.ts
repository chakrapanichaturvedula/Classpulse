import type {StudentScriptDocument} from './studentScript';
import type {BulkScriptOptions} from './bulkScripts';
export async function downloadStudentScript(_doc:StudentScriptDocument):Promise<void>{throw new Error('Open Classpulse in a web browser to download corrected scripts.');}
export async function downloadBulkScripts(_title:string,_options:Omit<BulkScriptOptions,'render'>):Promise<void>{throw new Error('Open Classpulse in a web browser to download a script ZIP.');}
