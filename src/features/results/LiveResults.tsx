import React,{useEffect,useRef,useState} from 'react';
import {Modal,Pressable,ScrollView,StyleSheet,Switch,Text,View} from 'react-native';
import {DownloadReport} from '../reports/DownloadReport';
import {supabase} from '../../lib/supabase';
import {ResultDocument,cloudTerms,responseLabel,summarize} from './model';
type Session={id:string;roster_id:string;quiz_title_snapshot:string;class_name_snapshot:string;created_at:string;status:string};
function Button({title,onPress,selected=false,disabled=false}:{title:string;onPress:()=>void;selected?:boolean;disabled?:boolean}){return <Pressable accessibilityRole="button" accessibilityState={{selected,disabled}} disabled={disabled} onPress={onPress} style={[s.button,selected&&{backgroundColor:'#263B4B'},disabled&&{opacity:0.45}]}><Text style={s.buttonText}>{title}</Text></Pressable>;}
export function LiveResults({teacherId,active,requestedSession,report=false}:{teacherId:string;active:boolean;requestedSession:string;report?:boolean}){
 const [actionBusy,setActionBusy]=useState(false),[confirmEnd,setConfirmEnd]=useState(false);const mutating=useRef(false);
 const [picker,setPicker]=useState(false);
 const [sessions,setSessions]=useState<Session[]>([]),[sessionId,setSessionId]=useState(requestedSession),[doc,setDoc]=useState<ResultDocument|null>(null);
 const [error,setError]=useState(''),[connection,setConnection]=useState('Connecting live updates…'),[lastUpdate,setLastUpdate]=useState(''),[refreshing,setRefreshing]=useState(false);
 const [names,setNames]=useState(false),[responses,setResponses]=useState(false),[results,setResults]=useState(false);
 const refresh=useRef<()=>void>(()=>{});
 useEffect(()=>{if(requestedSession)setSessionId(requestedSession);},[requestedSession]);
 useEffect(()=>{
  if(!active||report)return;let cancelled=false;
  async function list(){
   try{
    const query=()=>supabase!.from('quiz_sessions').select('id,roster_id,quiz_title_snapshot,class_name_snapshot,created_at,status').eq('teacher_id',teacherId).order('created_at',{ascending:false}).limit(50);
    let listed=await query().is('report_deleted_at',null);
    if(listed.error?.code==='42703'||listed.error?.code==='PGRST204')listed=await query();
    const {data,error}=listed;
    if(cancelled)return;if(error)throw new Error('Could not load sessions. Check your connection.');
    const rows=data??[];setSessions(rows);setSessionId(current=>current||rows[0]?.id||'');
   }catch(error){if(!cancelled)setError(error instanceof Error?error.message:'Could not load sessions.');}
  }
  void list();return()=>{cancelled=true;};
 },[active,teacherId,report]);
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
 useEffect(()=>{setConfirmEnd(false);},[sessionId]);
 async function control(action:'start'|'end'){
  if(!doc||mutating.current)return;mutating.current=true;setActionBusy(true);setError('');
  try{const {error}=await supabase!.rpc(action==='start'?'classpulse_start_session':'classpulse_end_session',{target_session:doc.session_id});if(error)throw new Error(error.code==='P0001'?error.message:'Could not update the session. Try again.');setConfirmEnd(false);refresh.current();}
  catch(error){setError(error instanceof Error?error.message:'Could not update the session.');}
  finally{mutating.current=false;setActionBusy(false);}
 }
 const quick=!!doc?.activity_type&&doc.activity_type!=='quiz';
 const terms=doc?cloudTerms(doc.responses):[];
 const maxFrequency=terms[0]?.count??1;
 const summary=doc?summarize(doc):null;
 function choose(id:string){setDoc(null);setError('');setSessionId(id);setPicker(false);}
 return <View style={s.section}>
  <View style={s.toolbar}><Text accessibilityRole="header" style={s.title}>{report?'Saved report':'Live Results'}</Text><View style={s.wrap}>{report&&doc?.status==='ended'&&<DownloadReport doc={doc}/>}{!report&&<Button title="Select session" disabled={actionBusy} onPress={()=>setPicker(true)}/>}{!!sessionId&&<Button title={refreshing?'Updating…':'Refresh'} onPress={()=>refresh.current()}/>}</View></View>
  {!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}
  <Modal visible={picker} transparent animationType="fade" onRequestClose={()=>setPicker(false)}><View style={s.overlay}><View accessibilityViewIsModal style={s.dialog}><View style={s.toolbar}><Text style={s.heading}>Select session</Text><Pressable accessibilityRole="button" accessibilityLabel="Close session selection" onPress={()=>setPicker(false)}><Text style={s.close}>×</Text></Pressable></View><Text style={s.small}>Latest 50 sessions</Text><ScrollView style={{maxHeight:400}}>{sessions.map(session=><Pressable key={session.id} accessibilityRole="button" accessibilityLabel={`Select session: ${session.quiz_title_snapshot}, ${session.class_name_snapshot}, ${new Date(session.created_at).toLocaleString()}`} accessibilityState={{selected:session.id===sessionId}} disabled={actionBusy} onPress={()=>choose(session.id)} style={[s.sessionRow,session.id===sessionId&&{backgroundColor:'#F0F7FA'}]}><Text style={s.name}>{session.quiz_title_snapshot}</Text><Text style={s.small}>{session.class_name_snapshot} · {new Date(session.created_at).toLocaleString()}</Text></Pressable>)}</ScrollView>{!sessions.length&&<Text style={s.body}>Prepare a quiz in Launch first.</Text>}</View></View></Modal>
  {doc&&summary&&<>
   <View style={s.card}><View style={s.toolbar}><Text style={s.quizTitle}>{doc.quiz_title}</Text>{!report&&doc.status!=='ended'&&<View style={s.wrap}>{doc.status==='lobby'&&<Button title="Start quiz" disabled={actionBusy} onPress={()=>void control('start')}/>}<Button title="End session" disabled={actionBusy} onPress={()=>setConfirmEnd(true)}/></View>}</View>
    {confirmEnd&&doc.status!=='ended'&&<View style={s.wrap}><Text style={s.body}>End this session and stop new responses?</Text><Button title={actionBusy?'Ending…':'Confirm end session'} disabled={actionBusy} onPress={()=>void control('end')}/><Button title="Cancel" disabled={actionBusy} onPress={()=>setConfirmEnd(false)}/></View>}<Text style={s.body}>Room {doc.room_name} · {doc.status==='lobby'?'Waiting to start':doc.status==='live'?'In progress':doc.status==='ended'?'Ended':'Paused'}</Text><Text accessibilityLiveRegion="polite" style={s.small}>{connection}{lastUpdate?` · Updated ${lastUpdate}`:''}</Text>
    <View style={s.wrap}><Text style={s.metric}>{summary.joined}/{doc.students.length} joined</Text><Text style={s.metric}>{summary.completed}/{doc.students.length} completed ({Math.round(summary.completionPercent)}%)</Text><Text style={s.metric}>{summary.answers} answers saved</Text>{!quick&&results&&<Text style={s.metric}>Average score: {summary.averagePercent===null?'—':`${Math.round(summary.averagePercent)}%`}</Text>}</View>
    {!quick&&results&&<Text style={s.small}>Average: {summary.gradedStudents} completed, fully graded quizzes.{summary.pending>0?` ${summary.pending} answers pending.`:''}</Text>}
    <View style={s.wrap}>{[['Show names',names,setNames],['Show responses',responses,setResponses],...(!quick?[['Show results',results,setResults]]:[])].map(([label,value,setter])=><View key={label as string} style={s.toggle}><Switch accessibilityLabel={label as string} value={value as boolean} onValueChange={setter as (value:boolean)=>void} trackColor={{false:'#A6B5AF',true:'#0088B0'}}/><Text style={s.body}>{label as string}</Text></View>)}</View>
   </View>
   {quick&&<View style={s.card}><Text style={s.heading}>{doc.questions[0]?.prompt}</Text>
    {doc.activity_type==='word_cloud'?<><View accessibilityLabel="Live word cloud" style={s.cloud}>{terms.map((term,i)=><Text key={term.text.toLowerCase()} accessibilityLabel={`${term.text}: ${term.count} students`} style={{fontSize:18+30*term.count/maxFrequency,fontWeight:'500',color:['#0088B0','#6F9FC0','#7259A8','#28756B'][i%4],padding:8,maxWidth:'100%'}}>{term.text}</Text>)}</View>{!terms.length&&<Text style={s.body}>Waiting for student words…</Text>}<Text style={s.small}>Larger words were used by more students. Each word counts once per student.</Text></>:<View style={{gap:14}}>{doc.questions[0]?.options.map(option=>{const count=doc.responses.filter(r=>r.option_position===option.position).length;const percent=summary.answers?Math.round(100*count/summary.answers):0;return <View key={option.position} style={{gap:6}}><View style={s.toolbar}><Text style={s.name}>{option.label}</Text><Text style={s.body}>{count} responses · {percent}%</Text></View><View style={s.barTrack}><View style={[s.barFill,{width:`${percent}%`}]}/></View></View>;})}</View>}
    <Text style={s.small}>Quick questions are not graded. Responses remain saved after you end the session.</Text>
   </View>}
   {(!quick||names||responses)&&<ScrollView horizontal accessibilityLabel="Student results grid" style={s.gridScroll} contentContainerStyle={{minWidth:'100%'}}>
    <View>
     <View style={[s.row,s.headerRow]}><Text style={[s.cell,s.studentCell,s.heading]}>Student</Text><Text style={[s.cell,s.progressCell,s.heading]}>Progress{!quick&&results?' / Score':''}</Text>{doc.questions.map(q=><View key={q.id} style={[s.cell,s.questionCell]}><Text style={s.heading}>Q{q.position}</Text><Text numberOfLines={3} style={s.small}>{q.prompt}</Text>{!quick&&<Text style={s.small}>{q.points} points</Text>}</View>)}</View>
     {summary.rows.map((row,index)=><View key={row.student.id} style={s.row}>
      <View style={[s.cell,s.studentCell]}><Text style={s.name}>{names?row.student.name:`Student ${index+1}`}</Text><Text style={s.small}>{names?`${row.student.code} · `:''}{row.student.joined?'Joined':'Not joined'}</Text></View>
      <View style={[s.cell,s.progressCell]}><Text style={s.body}>{row.answered}/{doc.questions.length} answered</Text>{!quick&&results&&<Text style={s.name}>{row.percent!==null?`${Math.round(row.percent)}% · ${row.earned}/${summary.totalPoints}`:row.pending?`${row.earned}/${summary.totalPoints} · Pending`:row.complete?'No scored points':`${row.earned}/${summary.totalPoints} · Incomplete`}</Text>}</View>
      {doc.questions.map((q,qi)=>{const answer=row.cells[qi];const grade=!answer?'Not answered':answer.is_correct===null?'Pending':answer.is_correct?'Correct':'Incorrect';return <View key={q.id} style={[s.cell,s.questionCell,!quick&&results&&answer&&(answer.is_correct===null?s.pending:answer.is_correct?s.correct:s.incorrect)]}>
       <Text style={s.body}>{answer?responses?responseLabel(q,answer):'Submitted':'—'}</Text>
       {!quick&&results&&<Text style={s.small}>{grade}{answer?.awarded_points!==null&&answer?.awarded_points!==undefined?` · ${answer.awarded_points}/${q.points}`:''}</Text>}
      </View>;})}
     </View>)}
    </View>
   </ScrollView>}{!quick&&<Text style={s.small}>Scroll sideways for more questions. Pending answers need manual grading.</Text>}
  </>}
 </View>;
}
const s=StyleSheet.create({cloud:{minHeight:180,flexDirection:'row',flexWrap:'wrap',alignItems:'center',justifyContent:'center',padding:12},barTrack:{height:18,backgroundColor:'#F0F7FA',borderRadius:3,overflow:'hidden'},barFill:{height:18,backgroundColor:'#0088B0',borderRadius:3},quizTitle:{fontSize:22,fontWeight:'600',color:'#263B4B'},toolbar:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:16},overlay:{flex:1,backgroundColor:'rgba(38,59,75,0.25)',alignItems:'center',justifyContent:'center',padding:20},dialog:{width:'100%',maxWidth:620,maxHeight:'90%',backgroundColor:'white',padding:24,borderRadius:8,gap:16},close:{fontSize:28,color:'#667582',padding:4},sessionRow:{padding:14,gap:5,borderBottomWidth:1,borderBottomColor:'#E4E9EE'},section:{gap:18},title:{fontSize:28,fontWeight:'700',color:'#263B4B'},heading:{fontSize:16,fontWeight:'600',color:'#263B4B'},body:{fontSize:14,lineHeight:23,color:'#667582'},small:{fontSize:12,lineHeight:20,color:'#667582'},name:{fontSize:14,lineHeight:22,fontWeight:'600',color:'#263B4B'},metric:{fontSize:16,fontWeight:'600',color:'#263B4B'},card:{backgroundColor:'white',borderWidth:1,borderColor:'#E4E9EE',padding:16,borderRadius:4,gap:16},wrap:{flexDirection:'row',flexWrap:'wrap',gap:16},toggle:{flexDirection:'row',alignItems:'center',gap:8},button:{maxWidth:'100%',backgroundColor:'#0088B0',paddingVertical:9,paddingHorizontal:12,borderRadius:4,alignSelf:'flex-start'},buttonText:{color:'white',fontWeight:'600'},error:{color:'#A13624',lineHeight:23},gridScroll:{borderWidth:1,borderColor:'#E4E9EE',borderRadius:4,backgroundColor:'white'},row:{flexDirection:'row',borderBottomWidth:1,borderBottomColor:'#E4E9EE'},headerRow:{backgroundColor:'#F0F7FA'},cell:{padding:10,borderRightWidth:1,borderRightColor:'#E4E9EE',gap:6,justifyContent:'center'},studentCell:{width:180},progressCell:{width:160},questionCell:{width:160},correct:{backgroundColor:'#ECF5E9'},incorrect:{backgroundColor:'#FAECE8'},pending:{backgroundColor:'#FFF5D9'}});
