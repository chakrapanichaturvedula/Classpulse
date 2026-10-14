import React,{useEffect,useRef,useState} from 'react';
import {Modal,Pressable,ScrollView,StyleSheet,Switch,Text,View} from 'react-native';
import {KeyCorrection} from '../reports/KeyCorrection';
import {EmailReports} from '../reports/EmailReports';
import {ManualMarking} from '../reports/ManualMarking';
import {StudentScripts} from '../reports/StudentScripts';
import {ExportResults} from '../reports/ExportResults';
import {reportStatistics} from '../reports/exportModel';
import {supabase} from '../../lib/supabase';
import {ResultDocument,cloudTerms,responseLabel,summarize} from './model';
type Session={id:string;roster_id:string;quiz_title_snapshot:string;class_name_snapshot:string;created_at:string;status:string};
function Button({title,onPress,selected=false,disabled=false}:{title:string;onPress:()=>void;selected?:boolean;disabled?:boolean}){return <Pressable accessibilityRole="button" accessibilityState={{selected,disabled}} disabled={disabled} onPress={onPress} style={[s.button,selected&&{backgroundColor:'#263B4B'},disabled&&{opacity:0.45}]}><Text style={s.buttonText}>{title}</Text></Pressable>;}
export function LiveResults({teacherId,active,requestedSession,report=false,reportEndedAt}:{teacherId:string;active:boolean;requestedSession:string;report?:boolean;reportEndedAt?:string}){
 const [actionBusy,setActionBusy]=useState(false),[confirmEnd,setConfirmEnd]=useState(false);const mutating=useRef(false);
 const [picker,setPicker]=useState(false),[review,setReview]=useState(false),[question,setQuestion]=useState<number|null>(null);
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
 const summary=doc?summarize(doc):null;const stats=doc?reportStatistics(doc):null;
 function choose(id:string){setDoc(null);setError('');setSessionId(id);setPicker(false);}
 return <View style={s.section}>
  <View style={s.toolbar}><View style={{gap:6}}><Text accessibilityRole="header" style={s.title}>{report?(doc?.quiz_title??'Loading report…'):'Live Results'}</Text>{report&&reportEndedAt&&<Text style={s.body}>{new Date(reportEndedAt).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})} IST</Text>}</View><View style={s.wrap}>{report&&doc?.status==='ended'&&doc.activity_type==='quiz'&&<EmailReports key={`email-${doc.session_id}`} sessionId={doc.session_id} title={doc.quiz_title}/>}{report&&doc?.status==='ended'&&<ExportResults doc={doc}/>}{!report&&<Button title="Select session" disabled={actionBusy} onPress={()=>setPicker(true)}/>}{!report&&!!sessionId&&<Button title={refreshing?'Updating…':'Refresh'} onPress={()=>refresh.current()}/>}</View></View>
  {report&&doc&&<View style={s.reviewRow}>{doc.activity_type==='quiz'&&<Pressable accessibilityRole="button" accessibilityState={{expanded:review}} onPress={()=>setReview(value=>!value)}><Text style={s.link}>{review?'Hide review tools':'Review marks'}</Text></Pressable>}<Pressable accessibilityRole="button" onPress={()=>refresh.current()}><Text style={s.link}>{refreshing?'Updating…':'Refresh'}</Text></Pressable></View>}
  {report&&review&&<View style={s.wrap}>{report&&doc?.status==='ended'&&doc.activity_type==='quiz'&&doc.questions.some(q=>q.type==='short_answer')&&<ManualMarking key={`mark-${doc.session_id}`} sessionId={doc.session_id} questions={doc.questions} students={doc.students} onSaved={()=>refresh.current()}/>}{report&&doc?.status==='ended'&&doc.activity_type==='quiz'&&<KeyCorrection key={`key-${doc.session_id}`} sessionId={doc.session_id} onSaved={()=>refresh.current()}/>}</View>}
  {!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}
  <Modal visible={picker} transparent animationType="fade" onRequestClose={()=>setPicker(false)}><View style={s.overlay}><View accessibilityViewIsModal style={s.dialog}><View style={s.toolbar}><Text style={s.heading}>Select session</Text><Pressable accessibilityRole="button" accessibilityLabel="Close session selection" onPress={()=>setPicker(false)}><Text style={s.close}>×</Text></Pressable></View><Text style={s.small}>Latest 50 sessions</Text><ScrollView style={{maxHeight:400}}>{sessions.map(session=><Pressable key={session.id} accessibilityRole="button" accessibilityLabel={`Select session: ${session.quiz_title_snapshot}, ${session.class_name_snapshot}, ${new Date(session.created_at).toLocaleString()}`} accessibilityState={{selected:session.id===sessionId}} disabled={actionBusy} onPress={()=>choose(session.id)} style={[s.sessionRow,session.id===sessionId&&{backgroundColor:'#F0F7FA'}]}><Text style={s.name}>{session.quiz_title_snapshot}</Text><Text style={s.small}>{session.class_name_snapshot} · {new Date(session.created_at).toLocaleString()}</Text></Pressable>)}</ScrollView>{!sessions.length&&<Text style={s.body}>Prepare a quiz in Launch first.</Text>}</View></View></Modal>
  {doc&&summary&&<>
   <View style={[s.card,report&&s.reportCard]}>{!report&&<View style={s.toolbar}>{!report&&<Text style={s.quizTitle}>{doc.quiz_title}</Text>}{!report&&doc.status!=='ended'&&<View style={s.wrap}>{doc.status==='lobby'&&<Button title="Start quiz" disabled={actionBusy} onPress={()=>void control('start')}/>}<Button title="End session" disabled={actionBusy} onPress={()=>setConfirmEnd(true)}/></View>}</View>}
    {confirmEnd&&doc.status!=='ended'&&<View style={s.wrap}><Text style={s.body}>End this session and stop new responses?</Text><Button title={actionBusy?'Ending…':'Confirm end session'} disabled={actionBusy} onPress={()=>void control('end')}/><Button title="Cancel" disabled={actionBusy} onPress={()=>setConfirmEnd(false)}/></View>}<Text style={s.body}>Room {doc.room_name} · {doc.status==='lobby'?'Waiting to start':doc.status==='live'?'In progress':doc.status==='ended'?'Ended':'Paused'}</Text>{!report&&<Text accessibilityLiveRegion="polite" style={s.small}>{connection}{lastUpdate?` · Updated ${lastUpdate}`:''}</Text>}
    {doc.key_corrected_at&&<Text style={s.body}>Answer key corrected · {new Date(doc.key_corrected_at).toLocaleString()}</Text>}{report&&stats?<View style={s.stats}>{[{label:'Participation',value:`${stats.participants} of ${doc.students.length}`},{label:'Completion',value:`${Math.round(stats.completionPercent)}%`},{label:quick?'Responses':'Average score',value:quick?String(summary.answers):stats.average===null?'—':`${Math.round(stats.average*100)/100}%`},{label:quick?'Questions':'Awaiting marking',value:quick?String(doc.questions.length):String(stats.pendingStudents)}].map(item=><View key={item.label} style={s.stat}><Text style={s.body}>{item.label}</Text><Text style={s.statValue}>{item.value}</Text></View>)}</View>:<View style={s.wrap}><Text style={s.metric}>{summary.joined}/{doc.students.length} joined</Text><Text style={s.metric}>{summary.completed}/{doc.students.length} completed ({Math.round(summary.completionPercent)}%)</Text><Text style={s.metric}>{summary.answers} answers saved</Text>{!quick&&results&&<Text style={s.metric}>Average score: {summary.averagePercent===null?'—':`${Math.round(summary.averagePercent)}%`}</Text>}</View> }
    {!quick&&results&&<Text style={s.small}>{report?'Average includes graded participants; unanswered questions score zero.':`Average: ${summary.gradedStudents} completed, fully graded quizzes.`}{summary.pending>0?` ${summary.pending} answers pending.`:''}</Text>}
    <View style={s.wrap}>{[['Show names',names,setNames],['Show responses',responses,setResponses],...(!quick?[['Show results',results,setResults]]:[])].map(([label,value,setter])=><View key={label as string} style={s.toggle}><Switch accessibilityLabel={label as string} value={value as boolean} onValueChange={setter as (value:boolean)=>void} trackColor={{false:'#A6B5AF',true:'#0088B0'}}/><Text style={s.body}>{label as string}</Text></View>)}</View>
   </View>
   {quick&&<View style={s.card}><Text style={s.heading}>{doc.questions[0]?.prompt}</Text>
    {doc.activity_type==='word_cloud'?<><View accessibilityLabel="Live word cloud" style={s.cloud}>{terms.map((term,i)=><Text key={term.text.toLowerCase()} accessibilityLabel={`${term.text}: ${term.count} students`} style={{fontSize:18+30*term.count/maxFrequency,fontWeight:'500',color:['#0088B0','#6F9FC0','#7259A8','#28756B'][i%4],padding:8,maxWidth:'100%'}}>{term.text}</Text>)}</View>{!terms.length&&<Text style={s.body}>Waiting for student words…</Text>}<Text style={s.small}>Larger words were used by more students. Each word counts once per student.</Text></>:<View style={{gap:14}}>{doc.questions[0]?.options.map(option=>{const count=doc.responses.filter(r=>r.option_position===option.position).length;const percent=summary.answers?Math.round(100*count/summary.answers):0;return <View key={option.position} style={{gap:6}}><View style={s.toolbar}><Text style={s.name}>{option.label}</Text><Text style={s.body}>{count} responses · {percent}%</Text></View><View style={s.barTrack}><View style={[s.barFill,{width:`${percent}%`}]}/></View></View>;})}</View>}
    <Text style={s.small}>Quick questions are not graded. Responses remain saved after you end the session.</Text>
   </View>}
   {(!quick||names||responses)&&<ScrollView horizontal accessibilityLabel="Student results grid" style={s.gridScroll} contentContainerStyle={{minWidth:'100%'}}>
    <View>
     <View style={[s.row,s.headerRow]}><Text style={[s.cell,s.studentCell,s.heading]}>Student</Text><Text style={[s.cell,s.progressCell,s.heading]}>{report&&!quick?'Score %':'Progress'}{!report&&!quick&&results?' / Score':''}</Text>{doc.questions.map(q=><View key={q.id} style={[s.cell,s.questionCell,report&&s.compactQuestion]}><Pressable accessibilityRole="button" accessibilityLabel={`View question ${q.position}`} onPress={()=>setQuestion(q.position)}><Text style={s.questionNumber}>Q{q.position}</Text></Pressable>{!report&&<Text numberOfLines={3} style={s.small}>{q.prompt}</Text>}{!quick&&<Text style={s.small}>{q.points} points</Text>}</View>)}</View>
     {summary.rows.map((row,index)=><View key={row.student.id} style={s.row}>
      <View style={[s.cell,s.studentCell]}><Text style={s.name}>{names?row.student.name:`Student ${index+1}`}</Text><Text style={s.small}>{names?`${row.student.code} · `:''}{row.student.joined?'Joined':'Not joined'}</Text></View>
      <View style={[s.cell,s.progressCell]}>{(!report||quick)&&<Text style={s.body}>{row.answered}/{doc.questions.length} answered</Text>}{!quick&&results&&<Text style={s.name}>{report?(row.pending?'Pending':!row.student.joined&&!row.answered?'—':summary.totalPoints?`${Math.round(10000*row.earned/summary.totalPoints)/100}% · ${row.earned}/${summary.totalPoints}`:'No scored points'):row.percent!==null?`${Math.round(row.percent)}% · ${row.earned}/${summary.totalPoints}`:row.pending?`${row.earned}/${summary.totalPoints} · Pending`:row.complete?'No scored points':`${row.earned}/${summary.totalPoints} · Incomplete`}</Text>}</View>
      {doc.questions.map((q,qi)=>{const answer=row.cells[qi];const grade=!answer?'Not answered':answer.is_correct===null?'Pending':answer.is_correct?'Correct':answer.awarded_points!==null&&answer.awarded_points>0&&answer.awarded_points<q.points?'Partial credit':'Incorrect';return <View key={q.id} style={[s.cell,s.questionCell,report&&s.compactQuestion,!quick&&results&&answer&&(answer.is_correct===null?s.pending:answer.is_correct?s.correct:s.incorrect)]}>
       <Text style={s.body}>{answer?responses?responseLabel(q,answer):'Submitted':'—'}</Text>
       {!quick&&results&&<Text style={s.small}>{grade}{answer?.awarded_points!==null&&answer?.awarded_points!==undefined?` · ${answer.awarded_points}/${q.points}`:''}</Text>}
      </View>;})}
     </View>)}
    </View>
   </ScrollView>}{!quick&&<Text style={s.small}>Scroll sideways for more questions. Pending answers need manual grading.</Text>}
  </>}
  <Modal visible={question!==null} transparent animationType="fade" onRequestClose={()=>setQuestion(null)}><View style={s.overlay}><View accessibilityViewIsModal style={s.dialog}><View style={s.toolbar}><Text style={s.heading}>Question {question}</Text><Pressable accessibilityRole="button" accessibilityLabel="Close question details" onPress={()=>setQuestion(null)}><Text style={s.close}>×</Text></Pressable></View><ScrollView style={{maxHeight:400}}><Text style={s.body}>{doc?.questions.find(q=>q.position===question)?.prompt}</Text>{doc?.questions.find(q=>q.position===question)?.options.map(o=><Text key={o.position} style={s.body}>{String.fromCharCode(64+o.position)}. {o.label}</Text>)}</ScrollView></View></View></Modal>
 </View>;
}
const s=StyleSheet.create({reviewRow:{flexDirection:'row',justifyContent:'flex-end',gap:22},link:{color:'#0088B0',fontSize:14},reportCard:{borderWidth:0,paddingHorizontal:0},stats:{flexDirection:'row',flexWrap:'wrap',borderWidth:1,borderColor:'#E4E9EE',borderRadius:4,overflow:'hidden'},stat:{flexGrow:1,flexBasis:'25%',minWidth:135,alignItems:'center',gap:6,paddingVertical:18,paddingHorizontal:14,backgroundColor:'#F7F9FA'},statValue:{fontSize:22,color:'#263B4B',fontWeight:'600'},compactQuestion:{width:110},questionNumber:{fontSize:16,fontWeight:'600',color:'#0088B0'},cloud:{minHeight:180,flexDirection:'row',flexWrap:'wrap',alignItems:'center',justifyContent:'center',padding:12},barTrack:{height:18,backgroundColor:'#F0F7FA',borderRadius:3,overflow:'hidden'},barFill:{height:18,backgroundColor:'#0088B0',borderRadius:3},quizTitle:{fontSize:22,fontWeight:'600',color:'#263B4B'},toolbar:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:16},overlay:{flex:1,backgroundColor:'rgba(38,59,75,0.25)',alignItems:'center',justifyContent:'center',padding:20},dialog:{width:'100%',maxWidth:620,maxHeight:'90%',backgroundColor:'white',padding:24,borderRadius:8,gap:16},close:{fontSize:28,color:'#667582',padding:4},sessionRow:{padding:14,gap:5,borderBottomWidth:1,borderBottomColor:'#E4E9EE'},section:{gap:18},title:{fontSize:28,fontWeight:'700',color:'#263B4B'},heading:{fontSize:16,fontWeight:'600',color:'#263B4B'},body:{fontSize:14,lineHeight:23,color:'#667582'},small:{fontSize:12,lineHeight:20,color:'#667582'},name:{fontSize:14,lineHeight:22,fontWeight:'600',color:'#263B4B'},metric:{fontSize:16,fontWeight:'600',color:'#263B4B'},card:{backgroundColor:'white',borderWidth:1,borderColor:'#E4E9EE',padding:16,borderRadius:4,gap:16},wrap:{flexDirection:'row',flexWrap:'wrap',gap:16},toggle:{flexDirection:'row',alignItems:'center',gap:8},button:{maxWidth:'100%',backgroundColor:'#0088B0',paddingVertical:9,paddingHorizontal:12,borderRadius:4,alignSelf:'flex-start'},buttonText:{color:'white',fontWeight:'600'},error:{color:'#A13624',lineHeight:23},gridScroll:{borderWidth:1,borderColor:'#E4E9EE',borderRadius:4,backgroundColor:'white'},row:{flexDirection:'row',borderBottomWidth:1,borderBottomColor:'#E4E9EE'},headerRow:{backgroundColor:'#F0F7FA'},cell:{padding:10,borderRightWidth:1,borderRightColor:'#E4E9EE',gap:6,justifyContent:'center'},studentCell:{width:180},progressCell:{width:160},questionCell:{width:160},correct:{backgroundColor:'#ECF5E9'},incorrect:{backgroundColor:'#FAECE8'},pending:{backgroundColor:'#FFF5D9'}});
