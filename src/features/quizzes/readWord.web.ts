import {parseWordQuiz,validateWordArchive} from './word';
const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
export async function readWordQuiz(buffer:ArrayBuffer){
 validateWordArchive(buffer);const {default:JSZip}=await import('jszip');const zip=await JSZip.loadAsync(buffer);const file=zip.file('word/document.xml');if(!file)throw new Error('Choose a Word .docx document.');
 const xml=await file.async('string');if(xml.length>2*1024*1024)throw new Error('The document text is too large. Split the quiz.');if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw new Error('This document contains unsupported XML.');
 const doc=new DOMParser().parseFromString(xml,'application/xml');if(doc.getElementsByTagName('parsererror').length)throw new Error('Could not read the Word document.');
 for(const tag of ['tbl','drawing','pict','object','ins','del','numPr'])if(doc.getElementsByTagNameNS(W,tag).length)throw new Error('Use plain question paragraphs with typed option letters. Remove tables, pictures, tracked changes and automatic numbering before importing.');
 if(doc.getElementsByTagNameNS('http://schemas.openxmlformats.org/officeDocument/2006/math','oMath').length)throw new Error('Use plain text equations before importing.');
 const lines:string[]=[];
 for(const paragraph of Array.from(doc.getElementsByTagNameNS(W,'p'))){let text='';const walk=(node:Node)=>{if(node.nodeType===1){const e=node as Element;if(e.namespaceURI===W&&e.localName==='t'){text+=e.textContent??'';return;}if(e.namespaceURI===W&&['br','cr'].includes(e.localName)){text+='\n';return;}if(e.namespaceURI===W&&e.localName==='tab'){text+=' ';return;}}node.childNodes.forEach(walk);};walk(paragraph);lines.push(...text.split('\n'));}
 return parseWordQuiz(lines);
}
