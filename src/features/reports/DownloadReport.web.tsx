import React,{useState} from 'react';
import {Pressable,Text,View} from 'react-native';
import type {ResultDocument} from '../results/model';
import {reportCsv,reportFilename} from './csv';
export function DownloadReport({doc}:{doc:ResultDocument}){
 const [error,setError]=useState('');
 function download(){
  setError('');let url:string|undefined;let link:HTMLAnchorElement|undefined;
  try{url=URL.createObjectURL(new Blob([reportCsv(doc)],{type:'text/csv;charset=utf-8'}));link=document.createElement('a');link.href=url;link.download=reportFilename(doc);document.body.appendChild(link);link.click();}
  catch{setError('The report could not download. Please try again.');}
  finally{link?.remove();if(url){const downloadUrl=url;setTimeout(()=>URL.revokeObjectURL(downloadUrl),10000);}}
 }
 return <View style={{gap:6}}><Pressable accessibilityRole="button" onPress={download} style={{backgroundColor:'#0088B0',paddingVertical:9,paddingHorizontal:12,borderRadius:4,alignSelf:'flex-start'}}><Text style={{color:'white',fontWeight:'600'}}>Download CSV</Text></Pressable>{!!error&&<Text accessibilityRole="alert" style={{color:'#A13624'}}>{error}</Text>}</View>;
}
