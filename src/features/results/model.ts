export type ResultQuestion={id:string;position:number;prompt:string;type:string;points:number;options:{position:number;label:string}[]};
export type ResultStudent={id:string;name:string;code:string;joined:boolean};
export type ResultResponse={student_id:string;question_id:string;option_position:number|null;answer_text:string|null;is_correct:boolean|null;awarded_points:number|null};
export type ResultDocument={activity_type?:'quiz'|'quick_mcq'|'quick_tf'|'word_cloud';session_id:string;quiz_title:string;class_name:string;room_name:string;status:string;questions:ResultQuestion[];students:ResultStudent[];responses:ResultResponse[]};
export function summarize(doc:ResultDocument){
 const byStudent=new Map<string,Map<string,ResultResponse>>();
 for(const response of doc.responses){let answers=byStudent.get(response.student_id);if(!answers){answers=new Map();byStudent.set(response.student_id,answers);}answers.set(response.question_id,response);}
 const totalPoints=doc.questions.reduce((sum,q)=>sum+Math.round(q.points*100),0)/100;
 const rows=doc.students.map(student=>{
  const answers=byStudent.get(student.id)??new Map<string,ResultResponse>();
  const cells=doc.questions.map(q=>answers.get(q.id));
  const answered=cells.filter(Boolean).length,pending=cells.filter(r=>r&&r.awarded_points===null).length;
  const earned=cells.reduce((sum,r)=>sum+Math.round((r?.awarded_points??0)*100),0)/100;
  const complete=doc.questions.length>0&&answered===doc.questions.length;
  const percent=complete&&pending===0&&totalPoints>0?100*earned/totalPoints:null;
  return {student,cells,answered,pending,earned,complete,percent};
 });
 const finalScores=rows.filter(r=>r.percent!==null).map(r=>r.percent!);
 const completed=rows.filter(r=>r.complete).length;
 return {rows,totalPoints,completed,joined:doc.students.filter(s=>s.joined).length,
  answers:rows.reduce((sum,r)=>sum+r.answered,0),pending:rows.reduce((sum,r)=>sum+r.pending,0),
  completionPercent:doc.students.length?100*completed/doc.students.length:0,
  averagePercent:finalScores.length?finalScores.reduce((a,b)=>a+b,0)/finalScores.length:null,gradedStudents:finalScores.length};
}
export function responseLabel(question:ResultQuestion,response:ResultResponse){
 if(response.answer_text!==null)return response.answer_text;
 const option=question.options.find(o=>o.position===response.option_position);
 if(!option)return 'Submitted';
 return question.type==='true_false'||option.label===String.fromCharCode(64+option.position)?option.label:`${String.fromCharCode(64+option.position)} · ${option.label}`;
}

export function cloudTerms(responses:ResultResponse[]){
 const counts=new Map<string,{text:string;students:Set<string>}>();
 for(const response of responses){
  if(!response.answer_text)continue;
  const normalized=response.answer_text.normalize('NFKC').toLowerCase().replace(/[’‘]/g,"'");
  // Preserve accents, apostrophes, hyphenated words and numeric percentages.
  const words=normalized.match(/[\p{L}\p{M}\p{N}]+(?:['-][\p{L}\p{M}\p{N}]+)*(?:[.,]\p{N}+)*(?:%)?/gu)??[];
  for(const word of new Set(words)){
   let item=counts.get(word);if(!item){item={text:word,students:new Set()};counts.set(word,item);}
   item.students.add(response.student_id);
  }
 }
 return [...counts.values()].map(item=>({text:item.text,count:item.students.size})).sort((a,b)=>b.count-a.count||a.text.localeCompare(b.text));
}
