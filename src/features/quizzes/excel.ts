import type {StoredQuestion} from './model';
export const quizColumns=['type','question','option_a','option_b','option_c','option_d','option_e','option_f','correct_answer','points'];
export type QuizImport={questions:StoredQuestion[];errors:string[]};
export function parseQuizRows(rows:string[][]):QuizImport{
 const questions:StoredQuestion[]=[],errors:string[]=[];
 const headers=(rows[0]??[]).map(v=>v.trim().toLowerCase());
 for(const name of quizColumns)if(headers.filter(h=>h===name).length!==1)errors.push(`Header: include ${name} exactly once.`);
 if(headers.some(h=>h&&!quizColumns.includes(h)))errors.push('Use the supplied template headers.');
 if(errors.length)return {questions,errors};
 let count=0;
 rows.slice(1).forEach((row,index)=>{
  if(!row.some(v=>v.trim()))return;count++;
  const label=`Row ${index+2}`;
  const get=(name:string)=>(row[headers.indexOf(name)]??'').trim();
  const kind=get('type').toUpperCase(),prompt=get('question'),rawPoints=get('points'),points=rawPoints===''?1:Number(rawPoints),answer=get('correct_answer');
  const before=errors.length;
  if(row.some((value,i)=>value.trim()&&!headers[i]))errors.push(`${label}: data appears in a column without a header.`);
  if(!['MCQ','TF','SHORT'].includes(kind))errors.push(`${label}: type must be MCQ, TF or SHORT.`);
  if(!prompt||prompt.length>4000)errors.push(`${label}: enter a question of 1 to 4000 characters.`);
  if(!Number.isFinite(points)||points<0||points>1000||Math.abs(points*100-Math.round(points*100))>0.000001)errors.push(`${label}: points must be 0 to 1000, with up to two decimals.`);
  const options=quizColumns.slice(2,8).map(get);let correct:number|null=null;let accepted:string[]=[];
  if(kind==='MCQ'){
   while(options.length&&!options.at(-1))options.pop();
   if(options.length<2||options.some(o=>!o||o.length>1000))errors.push(`${label}: fill 2 to 6 options in order without gaps, each up to 1000 characters.`);
   const upper=answer.toUpperCase();correct=/^[A-F]$/.test(upper)?upper.charCodeAt(0)-64:/^[1-6]$/.test(answer)?Number(answer):null;
   if(correct===null||correct>options.length)errors.push(`${label}: correct_answer must identify a filled option (A to F).`);
  }else{
   if(options.some(Boolean))errors.push(`${label}: leave option columns blank for TF and SHORT.`);
   if(kind==='TF'){
    correct=['TRUE','T'].includes(answer.toUpperCase())?1:['FALSE','F'].includes(answer.toUpperCase())?2:null;
    if(correct===null)errors.push(`${label}: correct_answer must be True or False.`);
   }else if(kind==='SHORT'&&answer){accepted=answer.split('|').map(v=>v.trim());if(accepted.length>20||accepted.some(a=>!a||a.length>1000))errors.push(`${label}: use 1 to 20 accepted answers, separated by |, each up to 1000 characters.`);}
  }
  if(errors.length===before)questions.push({type:kind==='MCQ'?'multiple_choice':kind==='TF'?'true_false':'short_answer',prompt,points,options:kind==='MCQ'?options:kind==='TF'?['True','False']:[],correct_position:correct,accepted_answers:accepted,manual_grading:kind==='SHORT'&&!answer});
 });
 if(count===0||count>100)errors.push('Use 1 to 100 question rows.');
 if(new TextEncoder().encode(JSON.stringify(questions)).length>524288)errors.push('The quiz text is too large. Shorten the questions or split the quiz.');
 return {questions,errors};
}
