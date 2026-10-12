import {summarize,type ResultDocument,type ResultQuestion,type ResultResponse} from '../results/model';

// Quotes preserve commas, newlines and quotes; the apostrophe prevents spreadsheet formulas.
export function csvCell(value:string|number):string {
 let text=String(value);
 if(typeof value==='string'&&/^[\s\uFEFF]*[=+@-]/u.test(text))text="'"+text;
 return '"'+text.replace(/"/g,'""')+'"';
}
export function exportAnswer(question:ResultQuestion,answer:ResultResponse):string {
 if(answer.answer_text!==null)return answer.answer_text;
 const option=question.options.find(o=>o.position===answer.option_position);
 if(!option)return '';
 if(question.type==='true_false')return option.position===1?'T':'F';
 const letter=String.fromCharCode(64+option.position);
 return option.label===letter?letter:`${letter}. ${option.label}`;
}
export function reportCsv(doc:ResultDocument):string {
 const quick=!!doc.activity_type&&doc.activity_type!=='quiz',summary=summarize(doc);
 const header=['Student Name','Student ID'];
 if(!quick)header.push('Total Score (%)','Number of Correct Answers');
 header.push(...doc.questions.map(q=>q.prompt));
 const rows:(string|number)[][]=[header];
 const participants=summary.rows.filter(row=>row.student.joined||row.answered>0);
 const round=(value:number)=>Math.round(value*100)/100;
 const scored=participants.filter(row=>row.pending===0&&summary.totalPoints>0);
 for(const row of summary.rows){
  const participated=row.student.joined||row.answered>0;
  const values:(string|number)[]=[row.student.name,row.student.code];
  if(!quick)values.push(!participated?'':row.pending?'Pending':summary.totalPoints?round(100*row.earned/summary.totalPoints):'',!participated?'':row.cells.some(a=>a&&a.is_correct===null)?'Pending':row.cells.filter(a=>a?.is_correct===true).length);
  doc.questions.forEach((q,i)=>{const answer=row.cells[i];values.push(answer?exportAnswer(q,answer):'');});
  rows.push(values);
 }
 if(!quick){
  const correctRows=participants.filter(row=>!row.cells.some(a=>a&&a.is_correct===null));
  rows.push(['Class Scoring','',scored.length?round(scored.reduce((sum,row)=>sum+100*row.earned/summary.totalPoints,0)/scored.length):'',correctRows.length?round(correctRows.reduce((sum,row)=>sum+row.cells.filter(a=>a?.is_correct===true).length,0)/correctRows.length):'',...doc.questions.map((_q,i)=>participants.length&&!participants.some(row=>row.cells[i]?.is_correct===null)?round(100*participants.filter(row=>row.cells[i]?.is_correct===true).length/participants.length):'')]);
 }
 return '\uFEFF'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n')+'\r\n';
}
export function reportFilename(doc:ResultDocument):string {
 const safe=(text:string)=>text.normalize('NFKC').replace(/[^\p{L}\p{N}_-]+/gu,'-').replace(/^-+|-+$/g,'').slice(0,60)||'report';
 return `${safe(doc.room_name)}-${safe(doc.quiz_title)}-${safe(doc.session_id)}.csv`;
}
