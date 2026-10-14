import JSZip from 'jszip';
import {scriptFilename,scriptSummary,type StudentScriptDocument} from './studentScript';
export type BulkScriptOptions={sessionId:string;studentIds:string[];load:(id:string)=>Promise<StudentScriptDocument>;render:(doc:StudentScriptDocument)=>Promise<Uint8Array>;progress:(done:number,total:number)=>void;cancelled:()=>boolean};
export async function bulkScriptArchive(options:BulkScriptOptions):Promise<Uint8Array>{
 const {studentIds,sessionId}=options;
 if(!studentIds.length||studentIds.length>150||new Set(studentIds).size!==studentIds.length)throw new Error('Choose between 1 and 150 distinct participating students.');
 const check=()=>{if(options.cancelled())throw new Error('Bulk download cancelled. No ZIP was downloaded.');};
 const zip=new JSZip();let bytes=0;const filenames=new Set<string>();
 options.progress(0,studentIds.length);
 // One teacher-protected lookup and PDF at a time bounds memory and server load.
 for(const [index,id] of studentIds.entries()){
  check();const doc=await options.load(id);check();
  if(doc.session_id!==sessionId||doc.students.length!==1||doc.students[0].id!==id)throw new Error('Student or session mismatch. No ZIP was downloaded.');
  scriptSummary(doc);const pdf=await options.render(doc);check();
  bytes+=pdf.byteLength;if(bytes>256*1024*1024)throw new Error('This archive is too large. Download the scripts individually instead.');
  // Normal names stay short; only actual filename collisions receive a suffix.
  const base=scriptFilename(doc);let filename=base,sequence=2;while(filenames.has(filename.toLocaleLowerCase()))filename=base.replace(/\.pdf$/,`-${sequence++}.pdf`);filenames.add(filename.toLocaleLowerCase());zip.file(filename,pdf);
  options.progress(index+1,studentIds.length);
 }
 check();const archive=await zip.generateAsync({type:'uint8array',compression:'STORE'});check();return archive;
}
export function bulkScriptFilename(title:string,sessionId:string):string{const safe=title.normalize('NFKC').replace(/[^a-zA-Z0-9_-]+/g,'-').slice(0,70)||'quiz';return `${safe}-scripts.zip`;}
