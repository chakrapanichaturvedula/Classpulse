import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {registerHooks} from 'node:module';
import ExcelJS from 'exceljs';
registerHooks({resolve(specifier,context,next){return next(specifier==='./excel'?'./excel.ts':specifier,context);}});
const {parseQuizRows,quizColumns}=await import('../src/features/quizzes/excel.ts');
const {readQuizWorkbook}=await import('../src/features/quizzes/readWorkbook.web.ts');
const mcq=['MCQ','Asset?','Cash','Loan','','','','','A','1'];
test('all three types, six options and zero/default points match stored quiz format',()=>{
 const result=parseQuizRows([quizColumns,mcq,['TF','True?','','','','','','','False','0'],['SHORT','Name?','','','','','','','Cash|Equipment',''],['SHORT','Explain','','','','','','','','2.5'],['MCQ','Six?','A','B','C','D','E','F','F','1']]);
 assert.deepEqual(result.errors,[]);assert.equal(result.questions.length,5);assert.equal(result.questions[1].correct_position,2);assert.equal(result.questions[1].points,0);assert.deepEqual(result.questions[2].accepted_answers,['Cash','Equipment']);assert.equal(result.questions[2].points,1);assert.equal(result.questions[3].manual_grading,true);assert.equal(result.questions[4].correct_position,6);
});
test('rejects duplicate/missing headers, unknown types and option gaps',()=>{
 assert.ok(parseQuizRows([['type','question'],mcq]).errors.length);assert.ok(parseQuizRows([[...quizColumns,'type'],mcq]).errors.length);
 for(const row of [['OTHER',...mcq.slice(1)],['MCQ','Gap?','A','','C','','','','A','1'],['TF','TF?','Unwanted','','','','','','True','1'],['MCQ','No correct?','Cash','Loan','','','','','F','1']])assert.ok(parseQuizRows([quizColumns,row]).errors.length);
});
test('row-specific validation catches limits, invalid marks and short-answer aliases',()=>{
 for(const value of ['-1','1001','1.001','NaN'])assert.match(parseQuizRows([quizColumns,[...mcq.slice(0,9),value]]).errors.join(' '),/Row 2.*points/);
 assert.ok(parseQuizRows([quizColumns,...Array.from({length:101},()=>mcq)]).errors.includes('Use 1 to 100 question rows.'));
 assert.ok(parseQuizRows([quizColumns,['SHORT','Answer?','','','','','','','A||B','1']]).errors.length);
 assert.equal(parseQuizRows([quizColumns,[],mcq]).questions.length,1);
});
test('question text including rupees, commas, Unicode and numeric zero stays intact',()=>{
 const result=parseQuizRows([quizColumns,['SHORT','What is ₹1,000?\nमूल्य','','','','','','','0','1']]);assert.deepEqual(result.errors,[]);assert.equal(result.questions[0].prompt,'What is ₹1,000?\nमूल्य');assert.deepEqual(result.questions[0].accepted_answers,['0']);
});
test('downloadable workbook round-trips all three example questions and validation',async()=>{
 const file=await readFile(new URL('../public/classpulse-quiz-template.xlsx',import.meta.url));const result=await readQuizWorkbook(file.buffer.slice(file.byteOffset,file.byteOffset+file.byteLength));assert.deepEqual(result.errors,[]);assert.equal(result.questions.length,3);assert.equal(result.questions[0].correct_position,1);assert.equal(result.questions[1].correct_position,1);assert.deepEqual(result.questions[2].accepted_answers,['Cash','Equipment','Fixed assets']);
 const wb=new ExcelJS.Workbook();await wb.xlsx.load(file);assert.equal(wb.getWorksheet('Questions').getCell('A2').dataValidation.type,'list');assert.ok(wb.getWorksheet('Instructions'));
});
test('workbook formulas and merged cells are rejected without using cached results',async()=>{
 const wb=new ExcelJS.Workbook(),sheet=wb.addWorksheet('Questions');sheet.addRow(quizColumns);sheet.addRow(mcq);sheet.getCell('J2').value={formula:'1+1',result:2};sheet.mergeCells('C2:D2');const result=await readQuizWorkbook(await wb.xlsx.writeBuffer());assert.ok(result.errors.some(e=>e.includes('formulas')));assert.ok(result.errors.some(e=>e.includes('unmerge')));
});
