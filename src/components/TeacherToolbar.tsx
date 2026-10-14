import React,{useEffect,useState} from 'react';
import {Modal,Pressable,ScrollView,StyleSheet,Text,TextInput,View,useWindowDimensions} from 'react-native';
import {supabase} from '../lib/supabase';
export type WorkspaceTab='launch'|'quizzes'|'classes'|'results'|'reports'|'admin';
type ClassRoom={id:string;name:string;room:string|null};
export function TeacherToolbar({teacherId,teacherName,tab,selectedClass,onClassSelect,onTab,onHome,onSignOut,signingOut,isAdmin=false}:{teacherId:string;teacherName:string;tab:WorkspaceTab;selectedClass:string;onClassSelect:(id:string)=>void;onTab:(tab:WorkspaceTab)=>void;onHome:()=>void;onSignOut:()=>void;signingOut:boolean;isAdmin?:boolean}){
 const {width}=useWindowDimensions();const wide=width>=900;
 const [classes,setClasses]=useState<ClassRoom[]>([]),[open,setOpen]=useState(false),[error,setError]=useState(''),[search,setSearch]=useState('');
 useEffect(()=>{let cancelled=false;
  async function load(){try{
   const [rosters,rooms]=await Promise.all([supabase!.from('rosters').select('id,name').eq('teacher_id',teacherId).order('name'),supabase!.from('rooms').select('roster_id,room_name').eq('teacher_id',teacherId)]);
   if(cancelled)return;if(rosters.error||rooms.error){setError('Rooms could not load. Close and reopen to retry.');return;}
   setError('');setClasses((rosters.data??[]).map(c=>({...c,room:rooms.data?.find(r=>r.roster_id===c.id)?.room_name??null})));
  }catch{if(!cancelled)setError('Rooms could not load. Close and reopen to retry.');}}
  void load();return()=>{cancelled=true;};
 },[teacherId,tab,open,selectedClass]);
 const selected=classes.find(c=>c.id===selectedClass);
 const initials=teacherName.trim().split(/\s+/).slice(0,2).map(n=>n[0]).join('').toUpperCase();
 const navigation=<ScrollView style={wide?{flex:1}:undefined} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabs}>
   {([['launch','Launch'],['quizzes','Library'],['classes','Rooms'],['reports','Reports'],['results','Live Results'],...(isAdmin?[['admin','Admin'] as const]:[])] as const).map(([id,label])=><Pressable key={id} accessibilityRole="tab" accessibilityState={{selected:tab===id}} onPress={()=>onTab(id)} style={[s.tab,tab===id&&s.active]}><Text style={[s.tabText,tab===id&&{color:'#0088B0'}]}>{label}</Text></Pressable>)}
  </ScrollView>;
 return <View style={s.bar}>
  <View style={s.top}>
   <Pressable accessibilityRole="button" accessibilityLabel="Classpulse home" onPress={onHome} style={s.brand}><Text style={s.mark}>cp</Text>{width>=600&&<Text style={s.brandName}>Classpulse</Text>}</Pressable>
   {wide&&navigation}
   <View style={s.account}><Pressable accessibilityRole="button" accessibilityLabel="Select classroom room" onPress={()=>{setSearch('');setOpen(true);}} style={s.room}><Text numberOfLines={1} style={s.roomText}>{selected?.room??selected?.name??'Select room'}  ▾</Text></Pressable><View accessibilityLabel={`Teacher: ${teacherName}`} style={s.avatar}><Text style={s.avatarText}>{initials}</Text></View><Pressable accessibilityRole="button" disabled={signingOut} onPress={onSignOut}><Text style={s.signOut}>{signingOut?'Signing out…':'Sign out'}</Text></Pressable></View>
  </View>
  {!wide&&navigation}
  <Modal visible={open} transparent animationType="fade" onRequestClose={()=>setOpen(false)}>
   <View style={s.overlay}><View accessibilityViewIsModal style={s.dialog}><View style={s.dialogHeader}><Text style={s.heading}>Select room</Text><Pressable accessibilityRole="button" accessibilityLabel="Close room selection" onPress={()=>setOpen(false)}><Text style={s.close}>×</Text></Pressable></View>
    {!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    <TextInput accessibilityLabel="Search classroom rooms" placeholder="Search rooms" placeholderTextColor="#667582" value={search} onChangeText={setSearch} style={{borderWidth:1,borderColor:'#CDD6DE',borderRadius:4,padding:11,fontSize:16,color:'#263B4B'}}/><ScrollView style={{maxHeight:360}}>{classes.filter(c=>(c.room??c.name).toLowerCase().includes(search.trim().toLowerCase())).map(c=><Pressable key={c.id} accessibilityRole="button" accessibilityState={{selected:c.id===selectedClass}} onPress={()=>{onClassSelect(c.id);setOpen(false);}} style={[s.roomRow,c.id===selectedClass&&{backgroundColor:'#F0F7FA'}]}><Text style={s.roomText}>{c.room??'Room not created'}</Text></Pressable>)}</ScrollView>
    {!!classes.length&&!classes.some(c=>(c.room??c.name).toLowerCase().includes(search.trim().toLowerCase()))&&<Text style={s.small}>No rooms match your search.</Text>}{!classes.length&&!error&&<Text style={s.small}>Add a room and upload its roster in Rooms.</Text>}
   </View></View>
  </Modal>
 </View>;
}
const s=StyleSheet.create({bar:{backgroundColor:'white',borderBottomWidth:1,borderBottomColor:'#E4E9EE'},top:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:24,paddingTop:6,paddingBottom:4,gap:12,flexWrap:'wrap'},brand:{flexDirection:'row',alignItems:'center',gap:9},mark:{backgroundColor:'#0088B0',color:'white',fontSize:17,fontWeight:'700',padding:7,borderRadius:5},brandName:{fontSize:20,color:'#263B4B',fontWeight:'600'},account:{flexDirection:'row',alignItems:'center',gap:14},room:{backgroundColor:'#F2F5F7',paddingVertical:8,paddingHorizontal:12,borderRadius:4,maxWidth:210},roomText:{fontSize:14,fontWeight:'600',color:'#263B4B'},avatar:{backgroundColor:'#E5F7FC',borderRadius:4,padding:9},avatarText:{color:'#0088B0',fontSize:12,fontWeight:'600'},signOut:{color:'#667582',fontSize:12},tabs:{paddingHorizontal:20,gap:8},tab:{paddingHorizontal:15,paddingVertical:14,borderBottomWidth:2,borderBottomColor:'transparent'},active:{borderBottomColor:'#0088B0'},tabText:{color:'#263B4B',fontSize:14,fontWeight:'500'},overlay:{flex:1,backgroundColor:'rgba(38,59,75,0.25)',alignItems:'center',justifyContent:'center',padding:20},dialog:{width:'100%',maxWidth:480,maxHeight:'85%',backgroundColor:'white',borderRadius:8,padding:24,gap:16},dialogHeader:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},heading:{fontSize:20,fontWeight:'600',color:'#263B4B'},close:{fontSize:27,color:'#667582',padding:4},roomRow:{padding:14,borderBottomWidth:1,borderBottomColor:'#E4E9EE',gap:5},small:{fontSize:13,lineHeight:21,color:'#667582'},error:{color:'#A13624',lineHeight:22}});
