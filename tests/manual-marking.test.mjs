import {test} from 'node:test';import assert from 'node:assert/strict';import {parseMarks} from '../src/features/reports/marking.ts';
test('marks accept zero, full and fractional credit within the maximum',()=>{assert.equal(parseMarks('0',3),0);assert.equal(parseMarks(' 1.25 ',3),1.25);assert.equal(parseMarks('3',3),3);assert.equal(parseMarks('0',0),0);});
test('marks reject blanks, negatives, overflow, nonfinite and excess precision',()=>{for(const input of ['','-1','4','1.001','NaN','Infinity','1e1','.5','3abc'])assert.throws(()=>parseMarks(input,3));});
