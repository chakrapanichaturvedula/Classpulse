import type {Content, TDocumentDefinitions} from 'pdfmake/interfaces';
import type {QuizDocument} from './model';

export function quizPdfDefinition(quiz:QuizDocument, answers:boolean):TDocumentDefinitions {
 const total=quiz.questions.reduce((sum,q)=>sum+Math.round(q.points*100),0)/100;
 const content:Content[]=[
  {text:answers?'ANSWER KEY':'QUESTION PAPER',fontSize:10,bold:true,color:'#0088B0',margin:[0,0,0,8]},
  {text:quiz.title,fontSize:22,bold:true,margin:[0,0,0,8]},
  {text:`${quiz.questions.length} questions  |  Total marks: ${total}  |  Version ${quiz.version_number}`,color:'#667582',margin:[0,0,0,20]},
 ];
 if(!answers)content.push({text:'Name: __________________________    Student ID: ____________________',margin:[0,0,0,22]});
 quiz.questions.forEach((q,index)=>{
  const start=content.length;
  content.push({text:[{text:`${index+1}. `,bold:true},{text:q.prompt},{text:`  [${q.points} ${q.points===1?'mark':'marks'}]`,fontSize:10,color:'#667582'}],headlineLevel:1,margin:[0,12,0,8]});
  q.options.forEach((option,i)=>content.push({text:`${String.fromCharCode(65+i)}. ${option}`,margin:[18,0,0,6]}));
  if(answers){
   const answer=q.type==='short_answer'?(q.manual_grading?'Teacher assessment required':`Accepted answers: ${q.accepted_answers.join(' / ')}`):q.correct_position!==null?`Correct answer: ${String.fromCharCode(64+q.correct_position)}. ${q.options[q.correct_position-1]}`:'Answer not specified';
   content.push({text:answer,bold:true,color:'#227348',margin:[0,4,0,10]});
  }else if(q.type==='short_answer'){
   content.push({text:'_____________________________________________________________________\n\n_____________________________________________________________________',color:'#A0AAB2',margin:[0,8,0,12]});
  }
  // Keep ordinary questions together; exceptionally long questions may span pages.
  const lines=[q.prompt,...q.options,...(answers?q.accepted_answers:[])].reduce((sum,text)=>sum+text.split('\n').reduce((n,line)=>n+Math.max(1,Math.ceil(line.length/65)),0),0);
  if(lines+q.options.length*2+8<=32){const block=content.splice(start);content.push({stack:block,unbreakable:true});}
 });
 return {pageSize:'A4',pageMargins:[42,54,42,52],info:{title:`${quiz.title} - ${answers?'Answer Key':'Question Paper'}`,author:'Classpulse'},defaultStyle:{font:'Roboto',fontSize:11,lineHeight:1.2,color:'#263B4B'},content,
  header:{text:'Classpulse',fontSize:10,color:'#667582',margin:[42,22,42,0]},
  footer:(page,count)=>({columns:[{text:'Classpulse',color:'#667582'},{text:`${page} / ${count}`,alignment:'right',color:'#667582'}],fontSize:9,margin:[42,18,42,0]}),
  pageBreakBefore:(current,following)=>current.headlineLevel===1&&following.length===0,
 };
}
export function quizPdfFilename(title:string,answers:boolean):string {
 const safe=title.normalize('NFKC').replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-|-$/g,'').slice(0,70)||'quiz';
 return `${safe}-${answers?'answer-key':'question-paper'}.pdf`;
}
