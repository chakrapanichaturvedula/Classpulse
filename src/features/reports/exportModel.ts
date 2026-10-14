import type {Content,TDocumentDefinitions} from 'pdfmake/interfaces';
import {summarize,type ResultDocument} from '../results/model';
import {exportAnswer} from './csv';
export function reportStatistics(doc:ResultDocument){
 const summary=summarize(doc),participants=summary.rows.filter(r=>r.student.joined||r.answered>0),scored=participants.filter(r=>!r.pending&&summary.totalPoints>0);
 return {...summary,participants:participants.length,average:scored.length?scored.reduce((n,r)=>n+100*r.earned/summary.totalPoints,0)/scored.length:null,pendingStudents:participants.filter(r=>r.pending>0).length};
}
export function completeResultRows(doc:ResultDocument,includeChoiceText=true):(string|number)[][]{
 const summary=summarize(doc),quick=!!doc.activity_type&&doc.activity_type!=='quiz';
 const header=['Student Name','Student ID',...(!quick?['Total Score (%)','Marks','Number of Correct Answers']:[]),'Status',...doc.questions.map(q=>q.prompt)];
 return [header,...summary.rows.map(row=>{
  const participated=row.student.joined||row.answered>0;
  const values:(string|number)[]=[row.student.name,row.student.code];
  if(!quick)values.push(!participated?'':row.pending?'Pending':summary.totalPoints?Math.round(10000*row.earned/summary.totalPoints)/100:'',!participated?'':`${row.earned}/${summary.totalPoints}`,!participated?'':row.cells.some(a=>a&&a.is_correct===null)?'Pending':row.cells.filter(a=>a?.is_correct===true).length);
  values.push(!participated?'Did not participate':row.pending?'Pending marking':row.complete?'Completed':'Incomplete');
  doc.questions.forEach((q,i)=>{const a=row.cells[i];values.push(!a?'':!includeChoiceText&&q.type==='multiple_choice'&&a.option_position!==null?String.fromCharCode(64+a.option_position):exportAnswer(q,a));});
  return values;
 })];
}
export function resultsSummaryDefinition(doc:ResultDocument):TDocumentDefinitions{
 const stats=reportStatistics(doc),quick=!!doc.activity_type&&doc.activity_type!=='quiz',format=(value:number|null)=>value===null?'—':`${Math.round(value*100)/100}%`;
 const content:Content[]=[{text:doc.quiz_title,fontSize:21,bold:true,margin:[0,0,0,6]},{text:`Room: ${doc.room_name}  |  Results summary`,color:'#667582',margin:[0,0,0,12]},
 {text:`${stats.participants} / ${doc.students.length} participated   |   ${Math.round(stats.completionPercent)}% completed${quick?'':`   |   Average: ${format(stats.average)}`}`,bold:true,margin:[0,0,0,7]},
 ...(!quick?[{text:`Average includes graded participants; unanswered questions score zero. ${stats.pendingStudents} participants awaiting marking.`,fontSize:9,color:'#667582',margin:[0,0,0,12]} as Content]:[]),
 {table:{headerRows:1,widths:['*',95,quick?90:110],body:[['Student','Student ID',quick?'Responses':'Marks / Score'].map(text=>({text,bold:true,fillColor:'#EDF4F7'})),...stats.rows.map(row=>{const attended=row.student.joined||row.answered>0;return [{text:row.student.name},{text:row.student.code},{text:!attended?'Absent':quick?`${row.answered}/${doc.questions.length}`:row.pending?'Pending':`${row.earned}/${stats.totalPoints}${stats.totalPoints?` (${format(100*row.earned/stats.totalPoints)})`:''}`}];})]},layout:'lightHorizontalLines',margin:[0,0,0,16]},
 {text:'Question summary',fontSize:14,bold:true,margin:[0,0,0,8]}];
 const participants=stats.rows.filter(r=>r.student.joined||r.answered>0);
 for(const [i,q] of doc.questions.entries()){
  const submitted=participants.filter(r=>r.cells[i]),pending=submitted.filter(r=>r.cells[i]?.awarded_points===null).length,correct=submitted.filter(r=>r.cells[i]?.is_correct===true).length;
  const block:Content[]=[{text:`${q.position}. ${q.prompt}`,bold:true,margin:[0,8,0,5]},{text:quick?`${submitted.length} responses`:`${correct} correct  |  ${participants.length-submitted.length} unanswered  |  ${pending} pending`,fontSize:9,color:'#667582'}];
  if(quick){const counts=new Map<string,number>();for(const row of submitted){const label=exportAnswer(q,row.cells[i]!);counts.set(label,(counts.get(label)??0)+1);}for(const [label,count] of counts)block.push({text:`${label}: ${count}`,margin:[10,3,0,0]});}
  content.push({stack:block,unbreakable:q.prompt.length<500&&block.length<12});
 }
 return {pageSize:'A4',pageMargins:[42,44,42,44],defaultStyle:{font:'Roboto',fontSize:10,lineHeight:1.15,color:'#263B4B'},content,info:{title:`${doc.quiz_title} - Results summary`,author:'Classpulse'},header:{text:'Classpulse',fontSize:9,color:'#667582',margin:[42,20,42,0]},footer:(page,count)=>({text:`${page} / ${count}`,alignment:'right',fontSize:9,color:'#667582',margin:[42,16,42,0]})};
}
export function resultExportFilename(doc:ResultDocument,extension:'xlsx'|'pdf'){const title=doc.quiz_title.normalize('NFKC').replace(/[^\p{L}\p{N}_-]+/gu,'-').replace(/^-+|-+$/g,'').slice(0,70)||'quiz';return `${title}-results.${extension}`;}
