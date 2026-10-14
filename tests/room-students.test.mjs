import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePastedStudents,checkRoomAddition,validateStudentRows} from '../src/features/rosters/studentInput.ts';
test('Excel paste preserves full names, leading zero IDs and blank emails',()=>{
 const p=parsePastedStudents('id\tname\temailid\n001\tMira Devika Rao\tMIRA@example.com\n002\tSingh, Aditya\t');
 assert.deepEqual(p.errors,[]);assert.equal(p.rows[0].id,'001');assert.equal(p.rows[1].name,'Singh, Aditya');assert.equal(p.rows[1].emailid,'');
});
test('CSV paste accepts optional header, quoted names and detects duplicate IDs',()=>{
 assert.equal(parsePastedStudents('001,"Singh, Aditya",\n002,Mira,mira@example.com').rows[0].name,'Singh, Aditya');
 assert.match(parsePastedStudents('abc,Mira,\nABC,Mira,').errors.join(' '),/duplicate ID/);
 assert.equal(parsePastedStudents('id,name,emailid\n001,Mira,').errors.length,0);
});
test('Adding students rejects enrolled IDs, malformed emails and over capacity',()=>{
 const current=[{id:'AbC',name:'Mira',emailid:''}];
 assert.match(checkRoomAddition(validateStudentRows([{id:' abc ',name:'Mira',emailid:''}]),current).errors.join(' '),/already in this room/);
 assert.ok(validateStudentRows([{id:'002',name:'Mira',emailid:'bad'}]).errors.length);
 assert.match(checkRoomAddition(validateStudentRows([{id:'002',name:'Mira',emailid:''}]),Array.from({length:150},(_,i)=>({id:String(i+10),name:'Student',emailid:''}))).errors.join(' '),/up to 0 more/);
});
test('Pasted and individual input handle quotes, commas and reject broken rows',()=>{
 assert.deepEqual(validateStudentRows([{id:'001',name:'Dr. "Mira", Rao',emailid:''}]).rows,[{id:'001',name:'Dr. "Mira", Rao',emailid:''}]);
 assert.ok(parsePastedStudents('001\tName\temail\textra').errors.length);
 assert.ok(parsePastedStudents('x'.repeat(262145)).errors.length);
 assert.ok(validateStudentRows([{id:'001',name:'',emailid:''}]).errors.length);
});
