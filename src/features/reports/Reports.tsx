import React,{useEffect,useState} from 'react';
import {Pressable,StyleSheet,Text,TextInput,View} from 'react-native';
import {supabase} from '../../lib/supabase';
import {LiveResults} from '../results/LiveResults';
type Report={id:string;quiz_title_snapshot:string;ended_at:string;student_count:number;activity_type:string};
export function Reports({teacherId,active,selectedRosterId}:{teacherId:string;active:boolean;selectedRosterId:string}){
 const [rows,setRows]=useState<Report[]>([]),[page,setPage]=useState(0),[search,setSearch]=useState(''),[selected,setSelected]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[retry,setRetry]=useState(0),[more,setMore]=useState(false);
 useEffect(()=>{setPage(0);setSelected('');setRows([]);},[selectedRosterId,search]);
 useEffect(()=>{if(!active||!selectedRosterId)return;let cancelled=false;setBusy(true);setError('');setRows([]);
  async function load(){try{
   let query=supabase!.from('quiz_sessions').select('id,quiz_title_snapshot,ended_at,student_count,activity_type').eq('teacher_id',teacherId).eq('roster_id',selectedRosterId).eq('status','ended').order('ended_at',{ascending:false}).order('id');
   if(search.trim())query=query.ilike('quiz_title_snapshot',`%${search.trim().replace(/[\\%_]/g,'\\$&')}%`);
   const {data,error}=await query.range(page*25,page*25+25);if(cancelled)return;if(error)throw new Error('Could not load reports. Please refresh.');setRows((data??[]).slice(0,25));setMore((data?.length??0)>25);
  }catch(e){if(!cancelled)setError(e instanceof Error?e.message:'Could not load reports.');}finally{if(!cancelled)setBusy(false);}}
  void load();return()=>{cancelled=true;};
 },[teacherId,active,selectedRosterId,page,search,retry]);
 const button=(label:string,action:()=>void,disabled=false)=><Pressable accessibilityRole="button" disabled={disabled} onPress={action} style={[s.button,disabled&&{opacity:0.4}]}><Text style={s.buttonText}>{label}</Text></Pressable>;
 if(selected)return <View style={s.section}>{button('‹ Reports',()=>setSelected(''))}<LiveResults key={selected} teacherId={teacherId} active={active} requestedSession={selected} report/></View>;
 return <View style={s.section}><View style={s.toolbar}><Text accessibilityRole="header" style={s.title}>Reports</Text>{button('Refresh',()=>setRetry(n=>n+1),busy)}</View><Text style={s.body}>Completed activities for the selected room. Each launch has its own saved report.</Text>
 {!selectedRosterId?<Text style={s.body}>Select a room from the top menu.</Text>:<><TextInput accessibilityLabel="Search room reports" placeholder="Search reports" value={search} onChangeText={setSearch} style={s.input}/>{!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}
 {busy?<Text style={s.body}>Loading reports…</Text>:rows.map(r=><Pressable key={r.id} accessibilityRole="button" accessibilityLabel={`Open report: ${r.quiz_title_snapshot}, ${new Date(r.ended_at).toLocaleString()}`} onPress={()=>setSelected(r.id)} style={s.report}><View style={{flex:1,gap:6}}><Text style={s.name}>{r.quiz_title_snapshot}</Text><Text style={s.body}>{new Date(r.ended_at).toLocaleString()} · {r.student_count} roster students</Text></View><Text style={s.body}>{r.activity_type==='quiz'?'Quiz':r.activity_type==='word_cloud'?'Word Cloud':r.activity_type==='quick_tf'?'True / False':'Multiple Choice'} ›</Text></Pressable>)}
 {!busy&&!error&&!rows.length&&<Text style={s.body}>{search?'No matching reports.':'No completed activities yet. End an activity in Live Results to save its report here.'}</Text>}
 <View style={s.toolbar}>{button('Previous',()=>setPage(n=>n-1),busy||page===0)}<Text style={s.body}>Page {page+1}</Text>{button('Next',()=>setPage(n=>n+1),busy||!more)}</View></>}
 </View>;
}
const s=StyleSheet.create({section:{gap:18},toolbar:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:12},title:{fontSize:28,fontWeight:'700',color:'#263B4B'},body:{fontSize:14,lineHeight:23,color:'#667582'},name:{fontSize:16,fontWeight:'600',color:'#263B4B'},report:{flexDirection:'row',alignItems:'center',flexWrap:'wrap',gap:16,padding:16,borderBottomWidth:1,borderBottomColor:'#E4E9EE'},input:{borderWidth:1,borderColor:'#CDD6DE',padding:11,borderRadius:4,fontSize:16,color:'#263B4B'},button:{backgroundColor:'#0088B0',padding:10,borderRadius:4,alignSelf:'flex-start'},buttonText:{color:'white',fontWeight:'600'},error:{color:'#A13624',lineHeight:23}});
