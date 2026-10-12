import {test} from 'node:test';
import assert from 'node:assert/strict';
import {summarize,cloudTerms,responseLabel} from '../src/features/results/model.ts';
const questions=[{id:'q1',position:1,type:'multiple_choice',prompt:'Asset?',points:2,options:[{position:1,label:'Cash'}]},{id:'q2',position:2,type:'short_answer',prompt:'Explain',points:3,options:[]}];
const student=id=>({id,name:`Student ${id}`,code:`00${id}`,joined:id!=='3'});
const response=(student_id,question_id,awarded_points)=>({student_id,question_id,option_position:question_id==='q1'?1:null,answer_text:question_id==='q2'?'Explanation':null,is_correct:awarded_points===null?null:awarded_points>0,awarded_points});
const doc=responses=>({session_id:'s',quiz_title:'Quiz',class_name:'Class',room_name:'ROOM',status:'live',questions,students:['1','2','3'].map(student),responses});
test('counts completion separately from pending grades and absent students',()=>{
 const s=summarize(doc([response('1','q1',2),response('1','q2',null),response('2','q1',0)]));
 assert.equal(s.completed,1);assert.equal(s.joined,2);assert.equal(s.answers,3);assert.equal(s.pending,1);
 assert.equal(s.averagePercent,null);assert.equal(s.rows[0].percent,null);assert.equal(s.rows[2].complete,false);
});
test('averages only complete fully graded quizzes using points, not answer counts',()=>{
 const s=summarize(doc([response('1','q1',2),response('1','q2',0),response('2','q1',0),response('2','q2',3)]));
 assert.equal(s.rows[0].percent,40);assert.equal(s.rows[1].percent,60);assert.equal(s.averagePercent,50);assert.equal(s.gradedStudents,2);
});
test('zero-point quizzes and empty rosters do not yield invalid percentages',()=>{
 const d=doc([response('1','q1',0),response('1','q2',0)]);d.questions=d.questions.map(q=>({...q,points:0}));assert.equal(summarize(d).rows[0].percent,null);
 d.students=[];const s=summarize(d);assert.equal(s.completionPercent,0);assert.equal(s.averagePercent,null);
});
test('question alignment uses stable IDs and ignores unrelated responses',()=>{
 const d=doc([response('1','q2',3),response('1','q1',2),response('1','unknown',100),response('foreign','q1',2)]);
 const s=summarize(d);assert.equal(s.answers,2);assert.equal(s.rows[0].cells[0].question_id,'q1');assert.equal(s.rows[0].percent,100);
});
test('shows the chosen option text, true/false labels and complete short answers',()=>{
 assert.equal(responseLabel(questions[0],response('1','q1',2)),'A · Cash');
 assert.equal(responseLabel({...questions[0],type:'true_false'},response('1','q1',2)),'Cash');
 assert.equal(responseLabel(questions[1],response('1','q2',3)),'Explanation');
});

test('decimal marks do not show floating-point rounding artifacts',()=>{
 const d=doc([response('1','q1',0.1),response('1','q2',0.2)]);d.questions=d.questions.map((q,i)=>({...q,points:i?0.2:0.1}));const s=summarize(d);assert.equal(s.totalPoints,0.3);assert.equal(s.rows[0].earned,0.3);assert.equal(s.rows[0].percent,100);
});

test('word cloud splits words and merges case variants across students',()=>{
 const rs=[{...response('1','q2',null),answer_text:'CLOUD NORMAL CLOUD'},{...response('2','q2',null),answer_text:'cloud'}];
 assert.deepEqual(cloudTerms(rs),[{text:'cloud',count:2},{text:'normal',count:1}]);
});
test('repeated words and duplicate rows cannot inflate a student count',()=>{
 const r={...response('1','q2',null),answer_text:'Cash cash, CASH!!!'};assert.deepEqual(cloudTerms([r,r]),[{text:'cash',count:1}]);
});
test('multiword replies contribute each word and preserve numeric meanings',()=>{
 const rs=['Fixed   Assets','fixed assets','100%','100'].map((answer_text,i)=>({...response(String(i),'q2',null),answer_text}));
 const terms=cloudTerms(rs);assert.equal(terms.length,4);assert.equal(terms.find(t=>t.text==='fixed').count,2);assert.equal(terms.find(t=>t.text==='assets').count,2);assert.equal(terms.find(t=>t.text==='100%').count,1);
});
test('cloud normalization handles Unicode words and equivalent apostrophes',()=>{
 const rs=['ＣＬＯＵＤ नकद don’t','cloud नकद don\'t'].map((answer_text,i)=>({...response(String(i),'q2',null),answer_text}));
 const terms=cloudTerms(rs);assert.equal(terms.find(t=>t.text==='cloud').count,2);assert.equal(terms.find(t=>t.text==='नकद').count,2);assert.equal(terms.find(t=>t.text==="don't").count,2);
});
test('oral multiple choice letters do not repeat in results labels',()=>{assert.equal(responseLabel({...questions[0],options:[{position:1,label:'A'}]},response('1','q1',null)),'A');});
