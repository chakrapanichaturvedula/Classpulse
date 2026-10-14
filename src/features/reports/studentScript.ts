import type {Content,TDocumentDefinitions} from 'pdfmake/interfaces';
import {responseLabel,summarize,type ResultDocument,type ResultQuestion} from '../results/model';
export type ScriptQuestion=ResultQuestion&{correct_position:number|null;accepted_answers:string[];manual_grading:boolean};
export type StudentScriptDocument=Omit<ResultDocument,'questions'>&{ended_at:string;questions:ScriptQuestion[]};
export function scriptSummary(doc:StudentScriptDocument){
 if(doc.status!=='ended'||doc.activity_type!=='quiz'||doc.students.length!==1)throw new Error('Select one student from an ended quiz.');
 const summary=summarize(doc),row=summary.rows[0];
 if(!row.student.joined&&row.answered===0)throw new Error('This student did not participate in the quiz.');
 if(row.pending)throw new Error('Finish marking this student’s pending answers before downloading a corrected script.');
 return {...row,total:summary.totalPoints,percentage:summary.totalPoints>0?Math.round(10000*row.earned/summary.totalPoints)/100:null};
}
export function studentScriptDefinition(doc:StudentScriptDocument):TDocumentDefinitions{
 const row=scriptSummary(doc);
 const content:Content[]=[
 {columns:[{text:doc.quiz_title,fontSize:21,bold:true},{text:'Corrected answer script',alignment:'right',fontSize:10,color:'#667582',width:150}],margin:[0,0,0,7]},
 {table:{widths:['*',145],body:[[{stack:[{text:row.student.name,bold:true,fontSize:12},{text:`Student ID: ${row.student.code}`,margin:[0,4,0,0]}]},{stack:[{text:`${row.earned} / ${row.total} marks`,bold:true,fontSize:14,alignment:'right'},{text:row.percentage===null?'':`${row.percentage}%`,alignment:'right',margin:[0,4,0,0]}]}]]},layout:{hLineWidth:()=>0,vLineWidth:()=>0,fillColor:()=> '#F3F6F8',paddingLeft:()=>10,paddingRight:()=>10,paddingTop:()=>10,paddingBottom:()=>10},margin:[0,0,0,10]},
 {text:`Room: ${doc.room_name}  |  ${new Date(doc.ended_at).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})} IST`,color:'#667582',fontSize:9,margin:[0,0,0,5]},
 {text:`${row.complete?'Completed':'Incomplete'} - ${row.answered} of ${doc.questions.length} answered${row.complete?'':'. Unanswered questions receive 0 marks.'}`,color:'#667582',fontSize:9,margin:[0,0,0,7]}];
 if(doc.key_corrected_at)content.push({text:`Answer key updated: ${new Date(doc.key_corrected_at).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})} (IST)`,color:'#0088B0',margin:[0,0,0,7]});
 doc.questions.forEach((q,i)=>{
  const answer=row.cells[i];
  const correct=q.type==='short_answer'?(q.manual_grading?(answer?'Teacher-assessed response':'Teacher assessment required'):q.accepted_answers.join(' / ')):(()=>{const option=q.options.find(o=>o.position===q.correct_position);return option?`${q.type==='true_false'?'':String.fromCharCode(64+option.position)+'. '}${option.label}`:'Not specified';})();
  const choiceLines:Content[]=q.options.every(o=>o.label.length<55)?Array.from({length:Math.ceil(q.options.length/2)},(_,index)=>({columns:q.options.slice(index*2,index*2+2).map(o=>({text:`${String.fromCharCode(64+o.position)}. ${o.label}`,width:'*',color:'#667582'})),columnGap:14,margin:[14,0,0,3]})):q.options.map(o=>({text:`${String.fromCharCode(64+o.position)}. ${o.label}`,color:'#667582',margin:[14,0,0,2]}));
  const block:Content[]=[{text:[{text:`${q.position}. `,bold:true},{text:q.prompt}],margin:[0,10,0,5]},
   ...choiceLines,
   {columns:[{text:`Student answer: ${answer?responseLabel(q,answer).replace(' · ','. '):'Not answered'}`},{text:`${q.type==='short_answer'&&!q.manual_grading?'Accepted answers':q.manual_grading?'Assessment':'Correct answer'}: ${correct}`,color:'#227348'}],columnGap:14,margin:[0,4,0,5]},
   {text:`Marks: ${answer?.awarded_points??0} / ${q.points}  |  ${!answer?'Not answered':answer.is_correct===null?'Teacher marked':answer.is_correct?'Correct':answer.awarded_points!==null&&answer.awarded_points>0&&answer.awarded_points<q.points?'Partial credit':'Incorrect'}`,bold:true,margin:[0,0,0,7]}];
  if(answer?.teacher_comment)block.push({text:`Teacher feedback: ${answer.teacher_comment}`,margin:[0,0,0,10]});
  const lines=[q.prompt,...q.options.map(o=>o.label),answer?.answer_text??'',answer?.teacher_comment??'',correct].reduce((n,t)=>n+t.split('\n').reduce((a,l)=>a+Math.max(1,Math.ceil(l.length/65)),0),0);
  content.push({stack:block,unbreakable:lines+q.options.length*2+12<=32});
 });
 return {pageSize:'A4',pageMargins:[42,44,42,44],defaultStyle:{font:'Roboto',fontSize:10,lineHeight:1.15,color:'#263B4B'},info:{title:`${doc.quiz_title} - ${row.student.code} - Corrected script`,author:'Classpulse'},content,
 header:{text:'Classpulse',fontSize:10,color:'#667582',margin:[42,22,42,0]},footer:(page,count)=>({columns:[{text:`Student ID: ${row.student.code}`,color:'#667582'},{text:`${page} / ${count}`,alignment:'right',color:'#667582'}],fontSize:9,margin:[42,18,42,0]})};
}
export function scriptFilename(doc:StudentScriptDocument){const safe=(value:string)=>value.normalize('NFKC').replace(/[^\p{L}\p{M}\p{N}_-]+/gu,'-').replace(/^-+|-+$/g,'').slice(0,70);const student=doc.students[0];const base=`${safe(student.code)||'student'}${safe(student.name)?'-'+safe(student.name):''}`;return `${/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(base)?'student-'+base:base}.pdf`;}
