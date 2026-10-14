import {completeResultRows} from './exportModel';
import type {ResultDocument} from '../results/model';
export async function resultWorkbook(doc:ResultDocument,includeChoiceText=true):Promise<Uint8Array>{
 const {default:ExcelJS}=await import('exceljs');const book=new ExcelJS.Workbook();book.creator='Classpulse';
 const sheet=book.addWorksheet('Results',{views:[{state:'frozen',xSplit:2,ySplit:1}]});
 const rows=completeResultRows(doc,includeChoiceText);for(const row of rows)sheet.addRow(row);
 sheet.autoFilter={from:{row:1,column:1},to:{row:1,column:rows[0].length}};
 sheet.columns.forEach((column,i)=>{column.width=i===0?28:i===1?18:i<6?20:40;});
 sheet.eachRow((row,index)=>{row.eachCell(cell=>{cell.alignment={vertical:'top',wrapText:true};cell.font={name:'Calibri',size:11};if(index===1){cell.font={name:'Calibri',size:11,bold:true,color:{argb:'FFFFFFFF'}};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF0088B0'}};}});});
 sheet.getRow(1).height=60;
 const info=book.addWorksheet('Quiz');info.addRows([['Quiz',doc.quiz_title],['Room',doc.room_name],['Roster size',doc.students.length],['Multiple-choice answer text included',includeChoiceText?'Yes':'No'],['Scoring','Absent students have no score. Unanswered questions count as zero for participants. Pending marking is shown explicitly.']]);info.getColumn(1).width=40;info.getColumn(2).width=85;info.getColumn(2).alignment={wrapText:true};
 return new Uint8Array(await book.xlsx.writeBuffer());
}
