import React from 'react';
import {Text} from 'react-native';
import type {ResultDocument} from '../results/model';
export function DownloadReport(_props:{doc:ResultDocument}){
 return <Text style={{fontSize:12,color:'#667582'}}>Open this report in your browser to download its CSV.</Text>;
}
