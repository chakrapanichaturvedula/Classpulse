import React,{useEffect,useRef,useState} from 'react';
import {Pressable,ScrollView,StyleSheet,Switch,Text,View} from 'react-native';
import {supabase} from '../../lib/supabase';
import {ResultDocument,responseLabel,summarize} from './model';
type Session={id:string;roster_id:string;quiz_title_snapshot:string;class_name_snapshot:string;created_at:string;status:string};
function Button({title,onPress,selected=false}:{title:string;onPress:()=>void;selected?:boolean}){return <Pressable accessibilityRole="button" accessibilityState={{selected}} onPress={onPress} style={[s.button,selected&&{backgroundColor:'#193C38'}]}><Text style={s.buttonText}>{title}</Text></Pressable>;}
export function LiveResults({teacherId,active,requestedSession}:{teacherId:string;active:boolean;requestedSession:string}){
 const [sessions,setSessions]=useState<Session[]>([]),[sessionId,setSessionId]=useState(requestedSession),[doc,setDoc]=useState<ResultDocument|null>(null);
 const [error,setError]=useState(''),[connection,setConnection]=useState('Connecting live updates…'),[lastUpdate,setLastUpdate]=useState(''),[refreshing,setRefreshing]=useState(false);
 const [names,setNames]=useState(false),[responses,setResponses]=useState(false),[results,setResults]=useState(false);
 const refresh=useRef<()=>void>(()=>{});
 useEffect(()=>{if(requestedSession)setSessionId(requestedSession);},[requestedSession]);
 useEffect(()=>{
  if(!active)return;let cancelled=false;
  async function list(){
   try{
    const {data,error}=await supabase!.from('quiz_sessions').select('id,roster_id,quiz_title_snapshot,class_name_snapshot,created_at,status').eq('teacher_id',teacherId).order('created_at',{ascending:false}).limit(50);
    if(cancelled)return;if(error)throw new Error('Could not load sessions. Check your connection.');
    const rows=data??[];setSessions(rows);setSessionId(current=>current||rows[0]?.id||'');
   }catch(error){if(!cancelled)setError(error instanceof Error?error.message:'Could not load sessions.');}
  }
  void list();return()=>{cancelled=true;};
 },[active,teacherId]);
 useEffect(()=>{
  if(!active||!sessionId)return;
  let cancelled=false,busy=false,queued=false,ended=false;
  let timer:ReturnType<typeof setTimeout>,batched:ReturnType<typeof setTimeout>|undefined;
  setDoc(null);setError('');setLastUpdate('');setConnection('Connecting live updates…');
  async function load(){
   if(cancelled)return;if(busy){queued=true;return;}
   busy=true;setRefreshing(true);
   try{
    const {data,error}=await supabase!.rpc('classpulse_live_results',{target_session:sessionId});
    if(cancelled)return;
    if(error||!data)throw new Error(error?.code==='P0001'?error.message:'Could not load results. Install the Live Results setup, then try again.');
    const next=data as ResultDocument;setDoc(next);setError('');setLastUpdate(new Date().toLocaleTimeString());ended=next.status==='ended';
    if(ended){setConnection('Session ended · saved results');void supabase!.removeChannel(channel);}
   }catch(error){if(!cancelled)setError(error instanceof Error?error.message:'Could not refresh results. Showing the last saved view.');}
   finally{busy=false;if(!cancelled){setRefreshing(false);if(queued){queued=false;void load();}}}
  }
  function schedule(){if(cancelled||batched||ended)return;batched=setTimeout(()=>{batched=undefined;void load();},500);}
  // Subscribe before fetching the first snapshot so changes during it trigger another read.
  const channel=supabase!.channel(`results-${teacherId}-${sessionId}`)
   .on('postgres_changes',{event:'*',schema:'public',table:'quiz_responses',filter:`session_id=eq.${sessionId}`},schedule)
   .on('postgres_changes',{event:'*',schema:'public',table:'session_participants',filter:`session_id=eq.${sessionId}`},schedule)
   .on('postgres_changes',{event:'*',schema:'public',table:'quiz_sessions',filter:`id=eq.${sessionId}`},schedule)
   .subscribe(status=>{if(cancelled||ended)return;if(status==='SUBSCRIBED'){setConnection('Live updates connected · backup refresh every 15 seconds');schedule();}else if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'||status==='CLOSED')setConnection('Live connection unavailable · refreshing every 15 seconds');});
  async function poll(){await load();if(!cancelled&&!ended)timer=setTimeout(()=>void poll(),15000);}
  refresh.current=()=>void load();void poll();
  return()=>{cancelled=true;clearTimeout(timer);if(batched)clearTimeout(batched);void supabase!.removeChannel(channel);refresh.current=()=>{};};
 },[active,teacherId,sessionId]);
 const summary=doc?summarize(doc):null;
 function choose(id:string){setDoc(null);setError('');setSessionId(id);}
 return <View style={s.section}>
  <Text accessibilityRole="header" style={s.title}>Live Results</Text>
  <Text style={s.body}>Choose a session. Names, responses and scores start hidden for classroom projection.</Text>
  <View style={s.card}><Text style={s.heading}>Recent sessions</Text><Text style={s.small}>Latest 50 sessions, including ended quizzes.</Text><ScrollView style={{maxHeight:200}} contentContainerStyle={{gap:10}}>{sessions.map(session=><Button key={session.id} selected={session.id===sessionId} title={`${session.quiz_title_snapshot} · ${session.class_name_snapshot} · ${new Date(session.created_at).toLocaleString()}`} onPress={()=>choose(session.id)}/>)}</ScrollView>{!sessions.length&&<Text style={s.body}>Prepare a quiz in Launch first.</Text>}</View>
  {!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}
  {sessionId&&<Button title={refreshing?'Updating…':'Refresh results'} onPress={()=>refresh.current()}/>}
  {doc&&summary&&<>
   <View style={s.card}><Text style={s.title}>{doc.quiz_title}</Text><Text style={s.body}>{doc.class_name} · Room {doc.room_name} · {doc.status==='lobby'?'Waiting to start':doc.status==='live'?'In progress':doc.status==='ended'?'Ended':'Paused'}</Text><Text accessibilityLiveRegion="polite" style={s.small}>{connection}{lastUpdate?` · Updated ${lastUpdate}`:''}</Text>
    <View style={s.wrap}><Text style={s.metric}>{summary.joined}/{doc.students.length} joined</Text><Text style={s.metric}>{summary.completed}/{doc.students.length} completed ({Math.round(summary.completionPercent)}%)</Text><Text style={s.metric}>{summary.answers} answers saved</Text>{results&&<Text style={s.metric}>Average score: {summary.averagePercent===null?'—':`${Math.round(summary.averagePercent)}%`}</Text>}</View>
    {results&&<Text style={s.small}>Average uses {summary.gradedStudents} completed quizzes with all answers graded. {summary.pending} answers await manual grading.</Text>}
    <View style={s.wrap}>{[['Show names',names,setNames],['Show responses',responses,setResponses],['Show results',results,setResults]].map(([label,value,setter])=><View key={label as string} style={s.toggle}><Switch accessibilityLabel={label as string} value={value as boolean} onValueChange={setter as (value:boolean)=>void} trackColor={{false:'#A6B5AF',true:'#256B5B'}}/><Text style={s.body}>{label as string}</Text></View>)}</View>
   </View>
   <ScrollView horizontal accessibilityLabel="Student results grid" style={s.gridScroll} contentContainerStyle={{minWidth:'100%'}}>
    <View>
     <View style={[s.row,s.headerRow]}><Text style={[s.cell,s.studentCell,s.heading]}>Student</Text><Text style={[s.cell,s.progressCell,s.heading]}>Progress{results?' / Score':''}</Text>{doc.questions.map(q=><View key={q.id} style={[s.cell,s.questionCell]}><Text style={s.heading}>Q{q.position}</Text><Text numberOfLines={3} style={s.small}>{q.prompt}</Text><Text style={s.small}>{q.points} points</Text></View>)}</View>
     {summary.rows.map((row,index)=><View key={row.student.id} style={s.row}>
      <View style={[s.cell,s.studentCell]}><Text style={s.name}>{names?row.student.name:`Student ${index+1}`}</Text>{names&&<Text style={s.small}>{row.student.code}</Text>}<Text style={s.small}>{row.student.joined?'Joined':'Not joined'}</Text></View>
      <View style={[s.cell,s.progressCell]}><Text style={s.body}>{row.answered}/{doc.questions.length} answered</Text>{results&&<Text style={s.name}>{row.percent!==null?`${Math.round(row.percent)}% · ${row.earned}/${summary.totalPoints}`:row.pending?`${row.earned}/${summary.totalPoints} · Pending`:row.complete?'No scored points':`${row.earned}/${summary.totalPoints} · Incomplete`}</Text>}</View>
      {doc.questions.map((q,qi)=>{const answer=row.cells[qi];const grade=!answer?'Not answered':answer.is_correct===null?'Pending':answer.is_correct?'Correct':'Incorrect';return <View key={q.id} style={[s.cell,s.questionCell,results&&answer&&(answer.is_correct===null?s.pending:answer.is_correct?s.correct:s.incorrect)]}>
       <Text style={s.body}>{answer?responses?responseLabel(q,answer):'Submitted':'—'}</Text>
       {results&&<Text style={s.small}>{grade}{answer?.awarded_points!==null&&answer?.awarded_points!==undefined?` · ${answer.awarded_points}/${q.points}`:''}</Text>}
      </View>;})}
     </View>)}
    </View>
   </ScrollView><Text style={s.small}>Scroll sideways to see every question. Pending scores require teacher review, which will be added in the next stage.</Text>
  </>}
 </View>;
}
const s=StyleSheet.create({section:{gap:18},title:{fontSize:27,fontWeight:'700',color:'#193C38'},heading:{fontSize:17,fontWeight:'600',color:'#193C38'},body:{fontSize:14,lineHeight:23,color:'#61736E'},small:{fontSize:12,lineHeight:20,color:'#61736E'},name:{fontSize:14,lineHeight:22,fontWeight:'600',color:'#193C38'},metric:{fontSize:17,fontWeight:'600',color:'#193C38'},card:{backgroundColor:'white',borderWidth:1,borderColor:'#DFE6DD',padding:22,borderRadius:18,gap:16},wrap:{flexDirection:'row',flexWrap:'wrap',gap:16},toggle:{flexDirection:'row',alignItems:'center',gap:8},button:{maxWidth:'100%',backgroundColor:'#256B5B',padding:13,borderRadius:10,alignSelf:'flex-start'},buttonText:{color:'white',fontWeight:'600'},error:{color:'#A13624',lineHeight:23},gridScroll:{borderWidth:1,borderColor:'#DFE6DD',borderRadius:12,backgroundColor:'white'},row:{flexDirection:'row',borderBottomWidth:1,borderBottomColor:'#DFE6DD'},headerRow:{backgroundColor:'#EAF1E8'},cell:{padding:14,borderRightWidth:1,borderRightColor:'#DFE6DD',gap:6,justifyContent:'center'},studentCell:{width:210},progressCell:{width:190},questionCell:{width:200},correct:{backgroundColor:'#ECF5E9'},incorrect:{backgroundColor:'#FAECE8'},pending:{backgroundColor:'#FFF5D9'}});
