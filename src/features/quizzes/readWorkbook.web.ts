import type {CellValue} from 'exceljs';
import {parseQuizRows,type QuizImport} from './excel';
export async function readQuizWorkbook(buffer:ArrayBuffer):Promise<QuizImport>{
 const {default:ExcelJS}=await import('exceljs');
 const workbook=new ExcelJS.Workbook();
 await workbook.xlsx.load(buffer);
 const sheet=workbook.getWorksheet('Questions');
 if(!sheet)throw new Error('Use the Questions sheet in the Classpulse template.');
 if(sheet.rowCount>1001||sheet.columnCount>32)throw new Error('Use a small template with at most 100 question rows. Remove unused formatted rows or columns.');
 if(sheet.getImages().length)throw new Error('This import supports text questions. Remove images before importing.');
 const errors:string[]=[],rows:string[][]=[];
 function text(value:CellValue,row:number,column:number):string{
  if(value===null||value===undefined)return '';
  if(typeof value==='string'||typeof value==='number'||typeof value==='boolean')return String(value);
  if(typeof value==='object'&&'richText' in value)return value.richText.map(part=>part.text).join('');
  if(typeof value==='object'&&'hyperlink' in value)return value.text;
  errors.push(`Row ${row}, column ${column}: use plain text or numbers, not formulas, dates or Excel errors.`);return '';
 }
 for(let r=1;r<=sheet.rowCount;r++){
  const row:string[]=[];
  for(let c=1;c<=Math.max(10,sheet.columnCount);c++){
   const cell=sheet.getCell(r,c);if(cell.isMerged)errors.push(`Row ${r}, column ${c}: unmerge this cell.`);
   row.push(text(cell.value,r,c));
  }
  rows.push(row);
 }
 const parsed=parseQuizRows(rows);
 return {...parsed,errors:[...errors,...parsed.errors]};
}
