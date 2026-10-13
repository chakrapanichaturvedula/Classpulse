import {parseQuizRows,quizColumns,type QuizImport} from './excel';
const heading=/^Question\s+(\d+)\s*\((.+)\)\s*$/i;
export const wordQuizExample=`Question 1 (Multiple Choice)\nWhat is 2 + 2?\nA) 3\nB) 4\nC) 5\nD) 6\nCorrect Answer: B) 4\nPoints: 1\n\nQuestion 2 (True / False)\nThe Earth orbits the Sun.\nCorrect Answer: True\n\nQuestion 3 (Short Answer)\nName a colour.\nCorrect Answer: blue | red\n\nQuestion 4 (Short Answer)\nExplain your reasoning.\nCorrect Answer: MANUAL`;
export function parseWordQuiz(lines:string[]):QuizImport{
 const clean=lines.flatMap(v=>v.split(/\r?\n/)).map(v=>v.trim()).filter(Boolean);const starts=clean.map((s,i)=>heading.test(s)?i:-1).filter(i=>i>=0);const errors:string[]=[],rows:string[][]=[quizColumns];
 if(!starts.length)return {questions:[],errors:['No question headings found. Use “Question 1 (Multiple Choice)”, “Question 2 (True / False)” or “Question 3 (Short Answer)”.']};
 const numbers=new Set<number>();
 starts.forEach((start,index)=>{
  const header=clean[start].match(heading)!;const number=Number(header[1]),kind=header[2].toLowerCase();const label=`Question ${number}`;
  if(numbers.has(number)||number!==index+1)errors.push(`${label}: number questions consecutively, starting at 1.`);numbers.add(number);
  const type=/^(multiple choice|mcq)$/.test(kind)?'MCQ':/^(true\s*\/\s*false|tf)$/.test(kind)?'TF':/^(short answer|short)(\s*\(number\))?$/.test(kind)?'SHORT':'';
  if(!type){errors.push(`${label}: use Multiple Choice, True / False or Short Answer.`);return;}
  const block=clean.slice(start+1,starts[index+1]??clean.length);const keys=block.filter(s=>/^Correct Answer\s*:/i.test(s)),points=block.filter(s=>/^Points\s*:/i.test(s));
  if(keys.length!==1)errors.push(`${label}: include exactly one “Correct Answer:” line (use MANUAL for teacher marking).`);
  if(points.length>1)errors.push(`${label}: include only one Points line.`);
  const keyIndex=block.findIndex(s=>/^Correct Answer\s*:/i.test(s));
  let raw=(keys[0]??'').replace(/^Correct Answer\s*:\s*/i,'');const options:string[]=[];const prompt:string[]=[];let optionsStarted=false;
  block.forEach((line,i)=>{
   if(/^Correct Answer\s*:|^Points\s*:/i.test(line))return;
   if(keyIndex>=0&&i>keyIndex){errors.push(`${label}: unrecognized text after the answer key: ${line.slice(0,70)}. Put each key on one line.`);return;}
   if(type==='MCQ'){
    const option=line.match(/^([A-F])[).]\s*(.+)$/i);
    if(option){optionsStarted=true;if(option[1].toUpperCase().charCodeAt(0)-65!==options.length)errors.push(`${label}: list options A to F in order.`);options.push(option[2]);}
    else if(optionsStarted){errors.push(`${label}: keep each option on one paragraph or line.`);}else prompt.push(line);
   }else if(type==='TF'&&/^(True|False)$/i.test(line))return;
   else if(/^[_\s]+$/.test(line)||/^Numeric Answer\s*:\s*[_\s]*$/i.test(line))return;
   else prompt.push(line);
  });
  if(type==='MCQ'){const match=raw.match(/^([A-F])(?:[).]\s*.*)?$/i);if(!match)errors.push(`${label}: use a key such as B or B) 4.`);raw=match?.[1]??raw;}
  if(type==='TF'){const match=raw.match(/^(True|False|T|F)(?:\s*\(.*\))?$/i);if(!match)errors.push(`${label}: use True or False for the key.`);raw=match?.[1]??raw;}
  if(type==='SHORT'&&!raw)errors.push(`${label}: provide accepted answers or explicitly use MANUAL.`);
  if(type==='SHORT'&&raw.toUpperCase()==='MANUAL')raw='';
  if(type==='SHORT'&&/\(number\)/i.test(kind)&&/^\d+(?:\.\d+)?\s+\D+/.test(raw)&&!raw.includes('|'))raw=raw.split(/\s+/)[0]+'|'+raw;
  rows.push([type,prompt.join('\n'),...options,...Array(Math.max(0,6-options.length)).fill(''),raw,(points[0]??'').replace(/^Points\s*:\s*/i,'')]);
 });
 const parsed=parseQuizRows(rows);return {questions:parsed.questions,errors:[...errors,...parsed.errors]};
}
// Reject unusually large/ZIP64 packages before JSZip expands their entries.
export function validateWordArchive(buffer:ArrayBuffer){
 if(buffer.byteLength>2*1024*1024)throw new Error('Use a Word file smaller than 2 MB.');const v=new DataView(buffer);let end=-1;
 for(let i=v.byteLength-22;i>=Math.max(0,v.byteLength-65557);i--)if(v.getUint32(i,true)===0x06054b50&&i+22+v.getUint16(i+20,true)===v.byteLength){end=i;break;}
 if(end<0)throw new Error('Choose a valid, unencrypted .docx file.');const count=v.getUint16(end+10,true),offset=v.getUint32(end+16,true);if(count===65535||count>512||v.getUint16(end+4,true)!==0||v.getUint16(end+6,true)!==0)throw new Error('Use a small, standard Word document.');let cursor=offset,expanded=0;
 for(let i=0;i<count;i++){if(cursor+46>end||v.getUint32(cursor,true)!==0x02014b50)throw new Error('Invalid Word archive.');const size=v.getUint32(cursor+24,true);if(size===0xffffffff)throw new Error('ZIP64 Word files are not supported.');expanded+=size;if(expanded>10*1024*1024)throw new Error('The expanded Word document is too large. Remove media and unused content.');cursor+=46+v.getUint16(cursor+28,true)+v.getUint16(cursor+30,true)+v.getUint16(cursor+32,true);}
 if(cursor>end)throw new Error('Invalid Word archive.');
}
