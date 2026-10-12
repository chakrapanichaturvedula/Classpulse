import React from 'react';
import {Text} from 'react-native';
import type {QuizImport} from './excel';
export function QuizExcelFiles(_props:{onRead:(preview:QuizImport,title:string)=>void;onBegin:()=>void;disabled:boolean}){
 return <Text style={{color:'#667582'}}>Open Classpulse in your browser to download and import an Excel quiz.</Text>;
}
