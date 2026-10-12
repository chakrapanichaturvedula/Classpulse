import {summarize,responseLabel,type ResultDocument} from '../results/model';

// Quotes preserve commas, newlines and quotes; the apostrophe prevents spreadsheet formulas.
export function csvCell(value:string|number):string {
 let text=String(value);
 if(typeof value==='string'&&/^[\s\uFEFF]*[=+@-]/u.test(text))text="'"+text;
 return '"'+text.replace(/"/g,'""')+'"';
}
export function reportCsv(doc:ResultDocument):string {
 const quick=!!doc.activity_type&&doc.activity_type!=='quiz',summary=summarize(doc);
 const header=['room','activity','session_id','activity_type','student_id','name','joined','answered','question_count','completion'];
 if(!quick)header.push('earned_points','possible_points','score_percent','grading_status');
 for(const q of doc.questions){header.push(`Q${q.position}: ${q.prompt} — answer`);if(!quick)header.push(`Q${q.position} — result`,`Q${q.position} — awarded_points`);}
 const rows:(string|number)[][]=[header];
 for(const row of summary.rows){
  const values:(string|number)[]=[doc.room_name,doc.quiz_title,doc.session_id,doc.activity_type??'quiz',row.student.code,row.student.name,row.student.joined?'Yes':'No',row.answered,doc.questions.length,row.complete?'Completed':'Incomplete'];
  if(!quick)values.push(row.earned,summary.totalPoints,row.percent===null?'':Math.round(row.percent*100)/100,row.pending?'Pending':!row.complete?'Incomplete':summary.totalPoints===0?'Unscored':'Graded');
  doc.questions.forEach((q,i)=>{const answer=row.cells[i];values.push(answer?responseLabel(q,answer):'');if(!quick)values.push(!answer?'Not answered':answer.is_correct===null?'Pending':answer.is_correct?'Correct':'Incorrect',answer?.awarded_points??'');});
  rows.push(values);
 }
 return '\uFEFF'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n')+'\r\n';
}
export function reportFilename(doc:ResultDocument):string {
 const safe=(text:string)=>text.normalize('NFKC').replace(/[^\p{L}\p{N}_-]+/gu,'-').replace(/^-+|-+$/g,'').slice(0,60)||'report';
 return `${safe(doc.room_name)}-${safe(doc.quiz_title)}-${safe(doc.session_id)}.csv`;
}
