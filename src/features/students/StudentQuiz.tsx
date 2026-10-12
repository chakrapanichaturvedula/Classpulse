import React,{useEffect,useRef,useState} from 'react';
import {Pressable,StyleSheet,Text,TextInput,View} from 'react-native';
import {studentSupabase} from '../../lib/supabase';
type Question={id:string;position:number;type:string;prompt:string;points:number;options:{position:number;label:string}[]};
type Feed={activity_type?:string;status:string;total:number;answered:number;completed:boolean;question:Question|null};
export function StudentQuiz({token,onStatus}:{token:string;onStatus:(status:string)=>void}){
 const [feed,setFeed]=useState<Feed|null>(null),[option,setOption]=useState<number|null>(null),[answer,setAnswer]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[connection,setConnection]=useState('');
 const alive=useRef(false),working=useRef(false),sequence=useRef(0),questionId=useRef<string|null>(null),callback=useRef(onStatus);callback.current=onStatus;
 async function load(){
  const request=++sequence.current;
  const {data,error}=await studentSupabase!.rpc('classpulse_student_question',{entry_token:token});
  if(!alive.current||request!==sequence.current)return null;
  if(error||!data)throw new Error('Could not load the quiz. Check your connection and the question-delivery setup.');
  const next=data as Feed;
  if(next.question?.id!==questionId.current){questionId.current=next.question?.id??null;setOption(null);setAnswer('');setError('');}
  setFeed(next);setConnection('');callback.current(next.status);return next;
 }
 useEffect(()=>{
  alive.current=true;let cancelled=false;let timer:ReturnType<typeof setTimeout>;
  async function poll(){
   let next:Feed|null=null;
   try{if(!working.current)next=await load();}catch{if(alive.current&&!cancelled)setConnection('Connection interrupted. We will retry.');}
   if(alive.current&&!cancelled&&next?.status!=='ended')timer=setTimeout(()=>void poll(),10000);
  }
  void poll();return()=>{cancelled=true;alive.current=false;++sequence.current;clearTimeout(timer);};
 },[token]);
 async function submit(){
  const q=feed?.question;if(!q||working.current)return;
  if(q.type==='short_answer'?!answer.trim():option===null){setError('Choose or enter an answer first.');return;}
  working.current=true;++sequence.current;setBusy(true);setError('');
  try{
   const {error}=await studentSupabase!.rpc('classpulse_submit_answer',{entry_token:token,target_question:q.id,selected_option:q.type==='short_answer'?null:option,response_text:q.type==='short_answer'?answer:null});
   if(error)throw new Error(error.code==='P0001'?error.message:'Could not save your answer. Try again; duplicate submissions are counted once.');
   if(alive.current)await load();
  }catch(error){if(alive.current)setError(error instanceof Error?error.message:'Could not save your answer. Try again.');}
  finally{working.current=false;if(alive.current)setBusy(false);}
 }
 const q=feed?.question;
 return <View style={s.section}>
  {!feed?<Text style={s.body}>Checking your classroom…</Text>:feed.status==='ended'?<Text style={s.heading}>This session has ended.</Text>:feed.status==='lobby'?<><Text style={s.heading}>You are in the waiting room.</Text><Text style={s.body}>Your teacher will start the quiz. Keep this page open.</Text></>:feed.status==='paused'?<Text style={s.heading}>Your teacher has paused the quiz.</Text>:feed.completed?<><Text style={s.heading}>{feed.activity_type&&feed.activity_type!=='quiz'?'Response submitted.':'All answers submitted.'}</Text><Text style={s.body}>{feed.answered} of {feed.total} answers saved. Wait for your teacher to finish the session.</Text></>:q?<>
   <Text style={s.body}>Question {q.position} of {feed.total} · {feed.answered} answers saved</Text>
   <Text accessibilityRole="header" style={s.heading}>{q.prompt}</Text>
   {q.type==='short_answer'?<TextInput accessibilityLabel="Your answer" value={answer} onChangeText={setAnswer} editable={!busy} multiline maxLength={feed?.activity_type==='word_cloud'?80:4000} style={s.input} placeholder={feed?.activity_type==='word_cloud'?'One word or short phrase':'Type your answer'}/>:q.options.map(o=><Pressable key={o.position} accessibilityRole="radio" accessibilityState={{checked:option===o.position,disabled:busy}} disabled={busy} onPress={()=>setOption(o.position)} style={[s.choice,option===o.position&&s.selected]}><Text style={[s.body,option===o.position&&{color:'white'}]}>{o.label}</Text></Pressable>)}
   <Text style={s.body}>Once submitted, your answer is saved and cannot be changed.</Text>
   <Pressable accessibilityRole="button" accessibilityState={{disabled:busy}} disabled={busy} onPress={()=>void submit()} style={[s.button,busy&&{opacity:0.5}]}><Text style={s.buttonText}>{busy?'Saving…':'Submit answer'}</Text></Pressable>
  </>:<Text style={s.body}>Waiting for your next question…</Text>}
  {!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}
  {!!connection&&<Text accessibilityRole="alert" style={s.error}>{connection}</Text>}
 </View>;
}
const s=StyleSheet.create({section:{gap:16,backgroundColor:'#F0F7FA',padding:20,borderRadius:12},heading:{fontSize:21,fontWeight:'600',color:'#263B4B',lineHeight:30},body:{fontSize:15,lineHeight:24,color:'#667582'},input:{borderWidth:1,borderColor:'#CDD6DE',backgroundColor:'white',borderRadius:10,padding:14,fontSize:16,minHeight:100,color:'#263B4B'},choice:{borderWidth:1,borderColor:'#CDD6DE',padding:15,borderRadius:10,backgroundColor:'white'},selected:{backgroundColor:'#0088B0',borderColor:'#0088B0'},button:{backgroundColor:'#0088B0',padding:15,borderRadius:10,alignSelf:'flex-start'},buttonText:{color:'white',fontWeight:'600'},error:{color:'#A13624',lineHeight:23}});
