import type {ResultDocument} from '../results/model';
import {resultExportFilename,resultsSummaryDefinition} from './exportModel';
export async function downloadResults(doc:ResultDocument,kind:'excel'|'summary',includeChoiceText=true){
 let bytes:Uint8Array;
 if(kind==='excel'){const {resultWorkbook}=await import('./resultsExcel');bytes=await resultWorkbook(doc,includeChoiceText);}else{const [{default:pdfMake},{default:fonts}]=await Promise.all([import('pdfmake/build/pdfmake'),import('pdfmake/build/vfs_fonts')]);pdfMake.vfs=fonts as unknown as Record<string,string>;bytes=await new Promise(resolve=>pdfMake.createPdf(resultsSummaryDefinition(doc)).getBuffer(buffer=>resolve(new Uint8Array(buffer))));}
 const url=URL.createObjectURL(new Blob([bytes as BlobPart],{type:kind==='excel'?'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'application/pdf'}));const link=document.createElement('a');link.href=url;link.download=resultExportFilename(doc,kind==='excel'?'xlsx':'pdf');document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
