import React,{useEffect,useRef,useState} from 'react';
import {Pressable,StyleSheet,Text,TextInput,View} from 'react-native';
import {studentSupabase} from '../../lib/supabase';
type Question={id:string;position:number;type:string;prompt:string;points:number;options:{position:number;label:string}[];saved_answer?:{option_position:number|null;answer_text:string|null}|null};
type Feed={activity_type?:string;navigation_mode?:'sequential'|'free';can_revise_answers?:boolean;status:string;total:number;answered:number;completed:boolean;question:Question|null};
export function StudentQuiz({token,onStatus}:{token:string;onStatus:(status:string)=>void}){
 const [feed,setFeed]=useState<Feed|null>(null),[option,setOption]=useState<number|null>(null),[answer,setAnswer]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[connection,setConnection]=useState('');
 const alive=useRef(false),working=useRef(false),sequence=useRef(0),questionId=useRef<string|null>(null),callback=useRef(onStatus);callback.current=onStatus;
 const position=useRef<number|null>(null),drafts=useRef(new Map<string,{option:number|null;answer:string}>());
 async function load(){
  const request=++sequence.current;
  const {data,error}=await studentSupabase!.rpc('classpulse_student_question',{entry_token:token,target_position:position.current});
  if(!alive.current||request!==sequence.current)return null;
  if(error||!data)throw new Error('Could not load the quiz. Check your connection and the question-delivery setup.');
  const next=data as Feed;
  const draft=next.question?drafts.current.get(next.question.id):undefined;
  if(next.question?.id!==questionId.current||(next.question?.saved_answer&&!draft)){questionId.current=next.question?.id??null;const saved=next.question?.saved_answer;setOption(draft?.option??saved?.option_position??null);setAnswer(draft?.answer??saved?.answer_text??'');setError('');}
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
   drafts.current.delete(q.id);
   if(feed?.navigation_mode==='free')position.current=q.saved_answer?q.position:null;
   questionId.current=null;
   if(alive.current)await load();
  }catch(error){if(alive.current)setError(error instanceof Error?error.message:'Could not save your answer. Try again.');}
  finally{working.current=false;if(alive.current)setBusy(false);}
 }
 async function navigate(target:number){
  if(working.current||!feed?.question||feed.navigation_mode!=='free')return;
  const current=feed.question;
  if(!current.saved_answer||feed.can_revise_answers)drafts.current.set(current.id,{option,answer});
  const previous=position.current;position.current=target;working.current=true;++sequence.current;setBusy(true);setError('');
  try{await load();}catch{position.current=previous;if(alive.current)setError('Could not load that question. Try again.');}
  finally{working.current=false;if(alive.current)setBusy(false);}
 }
 const q=feed?.question;
 const free=feed?.navigation_mode==='free',revise=free&&feed?.can_revise_answers===true,locked=busy||(!!q?.saved_answer&&!revise);
 const changed=!!q?.saved_answer&&(q.type==='short_answer'?answer.trim()!==q.saved_answer.answer_text:option!==q.saved_answer.option_position);
 const saveDisabled=busy||(!!q?.saved_answer&&!changed);
 return <View style={s.section}>
  {!feed?<Text style={s.body}>Checking your classroom…</Text>:feed.status==='ended'?<Text style={s.heading}>This session has ended.</Text>:feed.status==='lobby'?<><Text style={s.heading}>You are in the waiting room.</Text><Text style={s.body}>Your teacher will start the quiz. Keep this page open.</Text></>:feed.status==='paused'?<Text style={s.heading}>Your teacher has paused the quiz.</Text>:feed.completed&&!(free&&q)?<><Text style={s.heading}>{feed.activity_type&&feed.activity_type!=='quiz'?'Response submitted.':'All answers submitted.'}</Text><Text style={s.body}>{feed.answered} of {feed.total} answers saved. Wait for your teacher to finish the session.</Text></>:q?<>
   <Text style={s.body}>Question {q.position} of {feed.total} · {feed.answered} answers saved</Text>
   {free&&<View style={{flexDirection:'row',flexWrap:'wrap',gap:12}}>{[{label:'Previous',target:q.position-1},{label:'Next',target:q.position+1}].map(({label,target})=>{const disabled=busy||target<1||target>feed.total;return <Pressable key={label} accessibilityRole="button" accessibilityState={{disabled}} disabled={disabled} onPress={()=>void navigate(target)} style={[s.button,disabled&&{opacity:0.5}]}><Text style={s.buttonText}>{label}</Text></Pressable>;})}</View>}
   <Text accessibilityRole="header" style={s.heading}>{q.prompt}</Text>
   {free&&<Text style={s.body}>{revise?'You can move back and forward and change your answers until your teacher ends the session. Save each change.':feed.completed?'All answers submitted. You can review them until your teacher ends the session.':'You can move back and forward. Submit each answer to save it.'}</Text>}
   {q.type==='short_answer'?<TextInput accessibilityLabel="Your answer" value={answer} onChangeText={value=>{setAnswer(value);drafts.current.set(q.id,{option,answer:value});}} editable={!locked} multiline maxLength={feed?.activity_type==='word_cloud'?80:4000} style={s.input} placeholder={feed?.activity_type==='word_cloud'?'One word or short phrase':'Type your answer'}/>:q.options.map(o=><Pressable key={o.position} accessibilityRole="radio" accessibilityState={{checked:option===o.position,disabled:locked}} disabled={locked} onPress={()=>{setOption(o.position);drafts.current.set(q.id,{option:o.position,answer});}} style={[s.choice,option===o.position&&s.selected]}><Text style={[s.body,option===o.position&&{color:'white'}]}>{o.label}</Text></Pressable>)}
   <Text accessibilityLiveRegion="polite" style={s.body}>{revise?(q.saved_answer?(changed?'Changes not saved. Select Save changes to update your answer.':'Answer saved. You can change it while the quiz is running.'):'Submit your answer to save it. You can change it later.'):q.saved_answer?'Answer saved. Submitted answers cannot be changed.':'Once submitted, your answer is saved and cannot be changed.'}</Text>
   {(!q.saved_answer||revise)&&<Pressable accessibilityRole="button" accessibilityState={{disabled:saveDisabled}} disabled={saveDisabled} onPress={()=>void submit()} style={[s.button,saveDisabled&&{opacity:0.5}]}><Text style={s.buttonText}>{busy?'Saving…':q.saved_answer?'Save changes':'Submit answer'}</Text></Pressable>}
  </>:<Text style={s.body}>Waiting for your next question…</Text>}
  {!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}
  {!!connection&&<Text accessibilityRole="alert" style={s.error}>{connection}</Text>}
 </View>;
}
const s=StyleSheet.create({section:{gap:16,backgroundColor:'#F0F7FA',padding:20,borderRadius:12},heading:{fontSize:21,fontWeight:'600',color:'#263B4B',lineHeight:30},body:{fontSize:15,lineHeight:24,color:'#667582'},input:{borderWidth:1,borderColor:'#CDD6DE',backgroundColor:'white',borderRadius:10,padding:14,fontSize:16,minHeight:100,color:'#263B4B'},choice:{borderWidth:1,borderColor:'#CDD6DE',padding:15,borderRadius:10,backgroundColor:'white'},selected:{backgroundColor:'#0088B0',borderColor:'#0088B0'},button:{backgroundColor:'#0088B0',padding:15,borderRadius:10,alignSelf:'flex-start'},buttonText:{color:'white',fontWeight:'600'},error:{color:'#A13624',lineHeight:23}});
