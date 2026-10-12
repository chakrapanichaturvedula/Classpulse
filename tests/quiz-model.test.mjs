import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newQuestion, editQuestions, serializeQuestions, removeQuizOption } from '../src/features/quizzes/model.ts';
test('creates true/false options and preserves all three question types',()=>{const qs=['multiple_choice','true_false','short_answer'].map(newQuestion);assert.deepEqual(qs[1].options,['True','False']);assert.deepEqual(serializeQuestions(qs).map(q=>q.type),['multiple_choice','true_false','short_answer']);});
test('round-trips answer position, points and short answer aliases',()=>{const input=[{type:'short_answer',prompt:'Name an asset.',points:2.5,options:[],correct_position:null,accepted_answers:['cash','equipment'],manual_grading:false},{type:'multiple_choice',prompt:'Choose',points:1,options:['Cash','Loan'],correct_position:1,accepted_answers:[],manual_grading:false}];assert.deepEqual(serializeQuestions(editQuestions(input)),input);});
test('rejects blank, negative, nonnumeric and overly precise point values',()=>{for(const value of ['','-1','text','1.001','1001']){const q=newQuestion('multiple_choice');q.points=value;assert.throws(()=>serializeQuestions([q]),/points/);}});
test('normalizes accepted answer lines without losing names or text',()=>{const q=newQuestion('short_answer');q.acceptedText=' cash \n\n equipment ';assert.deepEqual(serializeQuestions([q])[0].accepted_answers,['cash','equipment']);});

test('new multiple-choice cards have four choices and removal preserves answer identity',()=>{
 const q=newQuestion('multiple_choice');assert.equal(q.options.length,4);q.options=['A text','B text','C text','D text'];q.correct_position=3;
 const patch=removeQuizOption(q,0);assert.deepEqual(patch.options,['B text','C text','D text']);assert.equal(patch.correct_position,2);
 assert.equal(removeQuizOption(q,2).correct_position,null);assert.equal(removeQuizOption(q,3).correct_position,3);
 assert.deepEqual(removeQuizOption({...q,options:['A','B']},0),{});
});
