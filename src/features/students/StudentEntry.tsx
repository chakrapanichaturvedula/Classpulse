import React, {useEffect, useRef, useState} from 'react';
import {Pressable, StyleSheet, Text, TextInput, View} from 'react-native';
import {studentSupabase} from '../../lib/supabase';
type Entry={token:string;full_name:string;student_code:string;room_name:string;quiz_title:string;status:string};
export function StudentEntry(){
 const [room,setRoom]=useState(''),[id,setId]=useState(''),[entry,setEntry]=useState<Entry|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[connection,setConnection]=useState('');
 const working=useRef(false),alive=useRef(true);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useEffect(()=>{
  if(!entry||entry.status==='ended'||!studentSupabase)return;
  let cancelled=false;let timer:ReturnType<typeof setTimeout>;
  async function check(){
   try{const {data,error}=await studentSupabase!.rpc('classpulse_student_status',{entry_token:entry!.token});
    if(cancelled)return;
    if(error||!data){setConnection('Could not check the room. Check your connection; we will retry.');}
    else{setConnection('');if(data.status!==entry!.status)setEntry(current=>current?.token===entry!.token?{...current,status:data.status}:current);}
   }catch{if(!cancelled)setConnection('Connection interrupted. We will retry.');}
   if(!cancelled)timer=setTimeout(()=>void check(),10000);
  }
  void check();return()=>{cancelled=true;clearTimeout(timer);};
 },[entry?.token,entry?.status]);
 async function join(){
  if(working.current)return;
  if(!room.trim()||!id.trim()){setError('Enter both a room name and your Student ID.');return;}
  if(!studentSupabase){setError('Student entry needs the Supabase connection.');return;}
  working.current=true;setBusy(true);setError('');
  try{const {data,error}=await studentSupabase.rpc('classpulse_student_join',{room_name_input:room.trim(),student_code_input:id.trim()});
   if(!alive.current)return;
   if(error){setError(error.code==='P0001'?error.message:'Could not join the room. Check your connection and that student entry setup is installed.');return;}
   setEntry(data as Entry);setConnection('');
  }catch{if(alive.current)setError('Could not connect. Please try again.');}
  finally{working.current=false;if(alive.current)setBusy(false);}
 }
 function button(title:string,onPress:()=>void){return <Pressable accessibilityRole="button" accessibilityState={{disabled:busy}} disabled={busy} style={[s.button,busy&&{opacity:0.5}]} onPress={onPress}><Text style={s.buttonText}>{title}</Text></Pressable>;}
 return <View style={s.card}>
  <Text accessibilityRole="header" style={s.title}>{entry?'Your classroom':'Join your classroom'}</Text>
  {entry?<>
   <Text style={s.title}>Welcome, {entry.full_name}.</Text><Text style={s.body}>Room {entry.room_name} · {entry.student_code}</Text>
   <Text style={s.body}>Quiz: {entry.quiz_title}</Text>
   <View style={s.notice}><Text style={s.heading}>{entry.status==='ended'?'This session has ended.':'You are in the waiting room.'}</Text><Text style={s.body}>{entry.status==='ended'?'Your teacher can prepare the next quiz. Join again when they are ready.':'Your Student ID matches the saved class roster. Answering questions will be added in the next step.'}</Text></View>
   {!!connection&&<Text accessibilityRole="alert" style={s.error}>{connection}</Text>}
   {button(entry.status==='ended'?'Join another session':'Leave waiting room',()=>{setEntry(null);setConnection('');})}
   <Text style={s.body}>If you refresh this page, enter your room and Student ID again.</Text>
  </>:<>
   <Text style={s.body}>Enter the room name shared by your teacher and your Student ID. You do not need a password.</Text>
   <Text style={s.label}>Room name</Text><TextInput accessibilityLabel="Room name" style={s.input} value={room} onChangeText={setRoom} placeholder="e.g. IMTY1A" autoCapitalize="characters" autoCorrect={false} maxLength={32} editable={!busy}/>
   <Text style={s.label}>Student ID</Text><TextInput accessibilityLabel="Student ID" style={s.input} value={id} onChangeText={setId} placeholder="Your ID from the class roster" autoCapitalize="characters" autoCorrect={false} maxLength={64} editable={!busy} onSubmitEditing={()=>void join()}/>
   {!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}
   {button(busy?'Joining…':'Join room',()=>void join())}
  </>}
 </View>;
}
const s=StyleSheet.create({card:{backgroundColor:'white',borderWidth:1,borderColor:'#DFE6DD',borderRadius:20,padding:24,gap:18},title:{fontSize:25,fontWeight:'600',color:'#193C38'},heading:{fontSize:19,fontWeight:'600',color:'#193C38'},body:{fontSize:15,lineHeight:24,color:'#61736E'},label:{fontWeight:'600',color:'#193C38'},input:{borderWidth:1,borderColor:'#BBCAC0',borderRadius:10,padding:14,fontSize:16,minHeight:50,color:'#193C38'},button:{backgroundColor:'#256B5B',padding:15,borderRadius:10,alignSelf:'flex-start'},buttonText:{color:'white',fontWeight:'600'},notice:{backgroundColor:'#EAF1E8',padding:20,borderRadius:12,gap:12},error:{color:'#A13624',lineHeight:23}});
