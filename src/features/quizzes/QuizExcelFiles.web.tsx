import React,{useEffect,useRef,useState} from 'react';
import {Pressable,Text,View} from 'react-native';
import type {QuizImport} from './excel';
import {readQuizWorkbook} from './readWorkbook.web';
export function QuizExcelFiles({onRead,onBegin,disabled}:{onRead:(preview:QuizImport,title:string)=>void;onBegin:()=>void;disabled:boolean}){
 const [reading,setReading]=useState(false),[error,setError]=useState('');const working=useRef(false),alive=useRef(true);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 async function upload(event:React.ChangeEvent<HTMLInputElement>){
  const file=event.target.files?.[0];event.target.value='';if(!file||working.current)return;setError('');onBegin();
  if(!file.name.toLowerCase().endsWith('.xlsx')){setError('Choose an .xlsx file made from the Classpulse template.');return;}
  if(file.size>2*1024*1024){setError('Use a file smaller than 2 MB.');return;}
  working.current=true;setReading(true);
  try{const preview=await readQuizWorkbook(await file.arrayBuffer());if(alive.current)onRead(preview,file.name.replace(/\.xlsx$/i,'').slice(0,200));}
  catch(e){if(alive.current)setError(e instanceof Error?e.message:'Could not read this file. Use an unencrypted .xlsx template.');}
  finally{working.current=false;if(alive.current)setReading(false);}
 }
 function download(){const link=document.createElement('a');link.href='/classpulse-quiz-template.xlsx';link.download='Classpulse-quiz-template.xlsx';document.body.appendChild(link);link.click();link.remove();}
 return <View style={{gap:14}}><Pressable accessibilityRole="button" disabled={disabled||reading} onPress={download} style={{padding:10,backgroundColor:'#F0F7FA',alignSelf:'flex-start',borderRadius:4}}><Text style={{color:'#0088B0',fontWeight:'600'}}>Download Excel template</Text></Pressable><Text style={{color:'#667582',lineHeight:22}}>Replace the example rows on Questions. Types: MCQ, TF, SHORT. Use plain text, up to 100 questions.</Text>{React.createElement('input',{type:'file',accept:'.xlsx','aria-label':'Upload Excel quiz',disabled:disabled||reading,onChange:upload,style:{maxWidth:'100%',fontSize:14}})}{reading&&<Text style={{color:'#667582'}}>Reading spreadsheet…</Text>}{!!error&&<Text accessibilityRole="alert" style={{color:'#A13624'}}>{error}</Text>}</View>;
}
