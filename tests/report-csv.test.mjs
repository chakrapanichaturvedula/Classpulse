import {test} from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
registerHooks({resolve(specifier,context,next){return next(specifier==='../results/model'?'../results/model.ts':specifier,context);}});
const {reportCsv,csvCell,reportFilename,exportAnswer}=await import('../src/features/reports/csv.ts');
const doc={session_id:'session-123',quiz_title:'Quiz, "one"',class_name:'Old class',room_name:'CF2026',status:'ended',activity_type:'quiz',questions:[{id:'q',position:1,type:'short_answer',prompt:'Explain, please',points:2,options:[]}],students:[{id:'s1',code:'001',name:'Mira Devika Rao',joined:true},{id:'s2',code:'25A2HP458',name:'Sanchit Bhatia',joined:false}],responses:[{student_id:'s1',question_id:'q',option_position:null,answer_text:'Cash, "fixed"\nassets',is_correct:true,awarded_points:2}]};
test('Socrative columns, real IDs, full answers, absent rows and class scoring',()=>{
 const csv=reportCsv(doc);assert.ok(csv.startsWith('\uFEFF"Student Name","Student ID","Total Score (%)","Number of Correct Answers","Explain, please"\r\n'));assert.ok(csv.includes('"Mira Devika Rao","001","100","1","Cash, ""fixed""\nassets"'));assert.ok(csv.includes('"Sanchit Bhatia","25A2HP458","","",""'));assert.ok(csv.includes('"Class Scoring","","100","1","100"'));assert.ok(csv.endsWith('\r\n'));
});
test('pending grades stay explicit instead of becoming incorrect or zero',()=>{
 const csv=reportCsv({...doc,responses:[{...doc.responses[0],is_correct:null,awarded_points:null}]});assert.ok(csv.includes('"Mira Devika Rao","001","Pending","Pending"'));assert.ok(csv.includes('"Class Scoring","","","",""'));
});
test('quick questions have only names, IDs and raw answers without class grades',()=>{
 const csv=reportCsv({...doc,activity_type:'word_cloud',responses:[{...doc.responses[0],answer_text:'CLOUD normal CLOUD',is_correct:null,awarded_points:null}]});assert.ok(csv.includes('CLOUD normal CLOUD'));assert.ok(!csv.includes('Total Score'));assert.ok(!csv.includes('Class Scoring'));assert.ok(!csv.includes('Pending'));
});
test('formula-looking text is inert, including whitespace prefixes and question headers',()=>{
 for(const input of ['=SUM(1,2)','+123','-123','@cmd','\t=1','\n  =1'])assert.equal(csvCell(input),'"\''+input.replace(/"/g,'""')+'"');assert.equal(csvCell(-2),'"-2"');assert.equal(csvCell('001'),'"001"');assert.ok(reportCsv({...doc,questions:[{...doc.questions[0],prompt:'=HYPERLINK("bad")'}]}).includes('"\'=HYPERLINK'));
});
test('distinct launches get safe distinct filenames',()=>{
 assert.notEqual(reportFilename(doc),reportFilename({...doc,session_id:'session-456'}));assert.ok(!/[\\/:*?"<>|]/.test(reportFilename({...doc,quiz_title:'../../Quiz:1?'})));assert.ok(reportFilename(doc).startsWith('CF2026-'));
});
test('choice letters, T/F and oral choices match familiar export labels',()=>{
 const question={...doc.questions[0],type:'multiple_choice',options:[{position:1,label:'Yes'},{position:2,label:'No'}]};const answer={...doc.responses[0],answer_text:null,option_position:1};assert.equal(exportAnswer(question,answer),'A. Yes');assert.equal(exportAnswer({...question,type:'true_false'},answer),'T');assert.equal(exportAnswer({...question,type:'true_false'},{...answer,option_position:2}),'F');assert.equal(exportAnswer({...question,options:[{position:1,label:'A'}]},answer),'A');
});
test('class denominator includes joined incomplete students but excludes absent roster members',()=>{
 const d={...doc,questions:[doc.questions[0],{...doc.questions[0],id:'q2',prompt:'Second',points:2}],students:[...doc.students,{id:'s3',code:'003',name:'Incomplete',joined:true}]};
 const csv=reportCsv(d);assert.ok(csv.includes('"Mira Devika Rao","001","50","1"'));assert.ok(csv.includes('"Incomplete","003","0","0"'));assert.ok(csv.includes('"Class Scoring","","25","0.5","50","0"'));
});
test('empty participation and zero point quizzes avoid invalid averages',()=>{
 const csv=reportCsv({...doc,students:[doc.students[1]],responses:[]});assert.ok(csv.includes('"Class Scoring","","","",""'));const zero=reportCsv({...doc,questions:[{...doc.questions[0],points:0}],responses:[{...doc.responses[0],awarded_points:0}]});assert.ok(!zero.includes('NaN'));assert.ok(!zero.includes('Infinity'));assert.ok(zero.includes('"Class Scoring","","","1","100"'));
});
test('class scoring reproduces the seven-student example percentages',()=>{
 const correctness=[[1,1,1,1],[1,0,1,0],[1,1,1,1],[1,0,1,1],[1,0,1,0],[0,0,0,0],[1,1,1,1]];
 const questions=Array.from({length:4},(_,i)=>({...doc.questions[0],id:`q${i}`,prompt:`Question ${i}`,points:1}));
 const students=correctness.map((_,i)=>({id:`s${i}`,code:`ID${i}`,name:`Student ${i}`,joined:true}));
 const responses=correctness.flatMap((row,i)=>row.map((value,j)=>({student_id:`s${i}`,question_id:`q${j}`,answer_text:'Answer',option_position:null,is_correct:!!value,awarded_points:value})));
 const csv=reportCsv({...doc,questions,students,responses});assert.ok(csv.includes('"Class Scoring","","67.86","2.71","85.71","42.86","85.71","57.14"'));
});
