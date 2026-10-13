import {quizPdfDefinition,quizPdfFilename} from './pdf';
import type {QuizDocument} from './model';
export async function downloadQuizPdf(quiz:QuizDocument,answers:boolean):Promise<void>{
 const [{default:pdfMake},{default:fonts}]=await Promise.all([import('pdfmake/build/pdfmake'),import('pdfmake/build/vfs_fonts')]);
 pdfMake.vfs=fonts as unknown as Record<string,string>;
 const blob=await new Promise<Blob>((resolve)=>pdfMake.createPdf(quizPdfDefinition(quiz,answers)).getBlob(resolve));
 const url=URL.createObjectURL(blob),link=document.createElement('a');
 link.href=url;link.download=quizPdfFilename(quiz.title,answers);document.body.appendChild(link);link.click();link.remove();
 setTimeout(()=>URL.revokeObjectURL(url),10000);
}
