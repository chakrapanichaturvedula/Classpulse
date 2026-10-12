import React from 'react';
import {StyleSheet,Text,View} from 'react-native';
export function ActivityIcon({kind,color}:{kind:'quiz'|'quick_mcq'|'quick_tf'|'word_cloud';color:string}){
 if(kind==='quick_tf')return <Text style={[s.letters,{color}]}>T/F</Text>;
 if(kind==='word_cloud')return <View style={{alignItems:'center',gap:3}}><Text style={{color,fontSize:24,fontWeight:'500'}}>ideas</Text><Text style={{color,fontSize:14}}>voices · words</Text></View>;
 return <View style={[s.paper,{borderColor:color}]}>{[1,2,3].map(i=><View key={i} style={s.row}>{kind==='quick_mcq'&&<View style={[s.dot,{borderColor:color}]}/>}<View style={[s.line,{backgroundColor:color}]}/></View>)}</View>;
}
const s=StyleSheet.create({letters:{fontSize:31,fontWeight:'300'},paper:{width:42,height:48,borderWidth:2,borderRadius:5,padding:7,justifyContent:'space-evenly'},row:{flexDirection:'row',alignItems:'center',gap:4},dot:{width:6,height:6,borderWidth:1,borderRadius:3},line:{height:2,flex:1,borderRadius:2}});
