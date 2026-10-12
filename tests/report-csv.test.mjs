import {test} from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
registerHooks({resolve(specifier,context,next){return next(specifier==='../results/model'?'../results/model.ts':specifier,context);}});
const {reportCsv,csvCell,reportFilename}=await import('../src/features/reports/csv.ts');
const doc={session_id:'session-123',quiz_title:'Quiz, "one"',class_name:'Old class',room_name:'CF2026',status:'ended',activity_type:'quiz',questions:[{id:'q',position:1,type:'short_answer',prompt:'Explain, please',points:2,options:[]}],students:[{id:'s1',code:'001',name:'Mira Devika Rao',joined:true},{id:'s2',code:'25A2HP458',name:'Sanchit Bhatia',joined:false}],responses:[{student_id:'s1',question_id:'q',option_position:null,answer_text:'Cash, "fixed"\nassets',is_correct:true,awarded_points:2}]};
test('exports all roster students, text IDs, saved answers and scored completion',()=>{
 const csv=reportCsv(doc);assert.ok(csv.startsWith('\uFEFF'));assert.ok(csv.includes('"001","Mira Devika Rao","Yes","1","1","Completed","2","2","100","Graded"'));assert.ok(csv.includes('"25A2HP458","Sanchit Bhatia","No","0","1","Incomplete","0","2","","Incomplete"'));assert.ok(csv.includes('"Cash, ""fixed""\nassets"'));assert.ok(csv.includes('"Quiz, ""one"""'));assert.ok(csv.endsWith('\r\n'));
});
test('pending grading does not export a final percentage or fabricate zero awarded points',()=>{
 const csv=reportCsv({...doc,responses:[{...doc.responses[0],is_correct:null,awarded_points:null}]});assert.ok(csv.includes('"Completed","0","2","","Pending"'));assert.ok(csv.includes('"Pending",""'));
});
test('quick questions export raw phrases without quiz grading columns',()=>{
 const csv=reportCsv({...doc,activity_type:'word_cloud',responses:[{...doc.responses[0],answer_text:'CLOUD normal CLOUD',is_correct:null,awarded_points:null}]});assert.ok(csv.includes('CLOUD normal CLOUD'));assert.ok(!csv.includes('score_percent'));assert.ok(!csv.includes('awarded_points'));assert.ok(!csv.includes('Pending'));
});
test('formula-looking text is inert, including whitespace prefixes, headers and names',()=>{
 for(const input of ['=SUM(1,2)','+123','-123','@cmd','\t=1','\n  =1'])assert.equal(csvCell(input),'"\''+input.replace(/"/g,'""')+'"');assert.equal(csvCell(-2),'"-2"');assert.equal(csvCell('001'),'"001"');assert.ok(reportCsv({...doc,quiz_title:'=HYPERLINK("bad")'}).includes('"\'=HYPERLINK'));
});
test('distinct launches get safe distinct filenames',()=>{
 assert.notEqual(reportFilename(doc),reportFilename({...doc,session_id:'session-456'}));assert.ok(!/[\\/:*?"<>|]/.test(reportFilename({...doc,quiz_title:'../../Quiz:1?'})));assert.ok(reportFilename(doc).startsWith('CF2026-'));
});
