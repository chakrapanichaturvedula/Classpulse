import React, { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View, StyleSheet, useWindowDimensions } from 'react-native';
import { supabase } from '../../lib/supabase';
import { CsvFiles } from './CsvFiles';
import { parseRosterCsv, type CsvPreview, type RosterRow } from './csv';
import { checkRoomAddition, parsePastedStudents, validateStudentRows } from './studentInput';

type Roster = { id: string; name: string; student_count?: number };
type Dialog = 'add' | 'edit' | 'remove' | 'deleteRoom' | null;
function Action({ title, disabled, onPress, secondary = false }: { title: string; disabled?: boolean; onPress: () => void; secondary?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress} style={[s.button, secondary && s.secondary, disabled && { opacity: 0.45 }]}><Text style={[s.buttonText, secondary && {color:'#0088B0'}]}>{title}</Text></Pressable>;
}
export function RosterManager({ teacherId, selectedRosterId, onClassSelect }: { teacherId: string; selectedRosterId?: string; onClassSelect?: (id: string) => void }) {
  const wide = useWindowDimensions().width >= 1000;
  const [deletedView,setDeletedView]=useState(false),[deleteReady,setDeleteReady]=useState(false);
  const [rosters, setRosters] = useState<Roster[]>([]), [selected, setSelected] = useState('');
  const [createOpen,setCreateOpen]=useState(false),[renameOpen,setRenameOpen]=useState(false),[showRoster,setShowRoster]=useState(false);
  const [name, setName] = useState(''), [rename, setRename] = useState('');
  const [students, setStudents] = useState<RosterRow[]>([]), [preview, setPreview] = useState<CsvPreview | null>(null);
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [roomLoading, setRoomLoading] = useState(false);
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [setupNeeded,setSetupNeeded]=useState(false);
  const [roomSearch,setRoomSearch]=useState(''),[studentSearch,setStudentSearch]=useState(''),[page,setPage]=useState(0);
  const [dialog,setDialog]=useState<Dialog>(null),[method,setMethod]=useState<'single'|'paste'|'csv'>('single');
  const [editing,setEditing]=useState<RosterRow|null>(null),[studentId,setStudentId]=useState(''),[studentName,setStudentName]=useState(''),[email,setEmail]=useState(''),[paste,setPaste]=useState('');
  const [refresh, setRefresh] = useState(0);
  const saving = useRef(false), readGeneration=useRef(0);
  const current = rosters.find(value => value.id === selected);
  useEffect(() => { if (selectedRosterId) setSelected(selectedRosterId); }, [selectedRosterId]);
  useEffect(() => { if (!deletedView&&!loading) onClassSelect?.(selected); }, [selected, onClassSelect, deletedView, loading]);
  useEffect(() => {
    let active = true; setLoading(true); setError('');
    async function load() {
      try {
        const result = await supabase!.rpc(deletedView?'classpulse_deleted_rooms':'classpulse_room_list');
        if (!deletedView) { const probe=await supabase!.rpc('classpulse_deleted_rooms'); if(active)setDeleteReady(!probe.error); }
        let rows: Roster[] = result.data ?? [];
        if (result.error) {
          if (deletedView) throw new Error('Run the room deletion setup in Supabase first.');
          if (!['PGRST202','42883'].includes(result.error.code)) throw result.error;
          const fallback = await supabase!.from('rosters').select('id,name').eq('teacher_id',teacherId).order('name');
          if (fallback.error) throw fallback.error;
          rows = fallback.data ?? []; if (active) setSetupNeeded(true);
        } else if (active) setSetupNeeded(false);
        if (!active) return;
        setRosters(rows); setSelected(value => deletedView?'':rows.some(row => row.id === value) ? value : rows[0]?.id ?? '');
      } catch (error) { if (active) setError(error instanceof Error?error.message:'Rooms could not load. Choose Refresh to retry.'); }
      finally { if (active) setLoading(false); }
    }
    void load(); return () => { active = false; };
  }, [teacherId, refresh, deletedView]);
  useEffect(() => {
    readGeneration.current++; setDialog(null); setPreview(null); setStudents([]); setStudentSearch(''); setRenameOpen(false);
    if (!selected) { setRoomLoading(false); return; }
    let active = true; setRoomLoading(true);
    supabase!.from('roster_students').select('students(student_code,full_name,email)').eq('roster_id', selected).eq('teacher_id', teacherId).is('withdrawn_at', null).then(({ data, error }) => {
      if (!active) return;
      if (error) setError('Could not load this roster. Please refresh.');
      else {
        const rows = (data ?? []).map(row => { const student = row.students as unknown as {student_code:string;full_name:string;email:string|null}; return {id:student.student_code,name:student.full_name,emailid:student.email ?? ''}; }).sort((a,b) => a.name.localeCompare(b.name));
        setStudents(rows); setRosters(value => value.map(row => row.id === selected ? {...row,student_count:rows.length} : row));
      }
      setRoomLoading(false);
    });
    return () => { active = false; };
  }, [selected, refresh, teacherId]);
  function closeDialog() { if (!saving.current) { readGeneration.current++; setDialog(null); setPreview(null); setError(''); } }
  function openAdd() { readGeneration.current++; setMethod('single'); setStudentId(''); setStudentName(''); setEmail(''); setPaste(''); setPreview(null); setError(''); setDialog('add'); }
  function openStudent(student: RosterRow, action: 'edit'|'remove') { setEditing(student); setStudentId(student.id); setStudentName(student.name); setEmail(student.emailid); setError(''); setDialog(action); }
  async function mutate(action: () => Promise<void>) {
    if (saving.current) return; saving.current = true; setBusy(true); setError(''); setNotice('');
    try { await action(); } catch (error) { setError(error instanceof Error ? error.message : 'Could not save. Please try again.'); }
    finally { saving.current = false; setBusy(false); }
  }
  function rpcError(error: {code:string;message:string}) { return new Error(error.code==='P0001'?error.message:['PGRST202','42883'].includes(error.code)?'Run the room student setup in Supabase first, then refresh Rooms.':'Could not save. Please refresh and try again.'); }
  function createRoom() { void mutate(async () => {
    if (!name.trim()) throw new Error('Enter a room name.');
    const { data, error } = await supabase!.rpc('classpulse_save_room', { target_roster: null, desired_name: name.trim() });
    if (error) throw error.code === '23505' ? new Error('You already have a room with this name.') : rpcError(error);
    setName(''); setCreateOpen(false); setDeletedView(false); setRosters(value => [...value, {...data,student_count:0}].sort((a,b)=>a.name.localeCompare(b.name))); setSelected(data.id); setShowRoster(true); setNotice('Room created. Choose Add students to fill the roster.');
  }); }
  function renameRoom() { void mutate(async () => {
    if (!rename.trim()) throw new Error('Enter a room name.');
    const { data, error } = await supabase!.rpc('classpulse_save_room', { target_roster: selected, desired_name: rename.trim() });
    if (error) throw error.code === '23505' ? new Error('Another room already uses this name.') : rpcError(error);
    setRosters(value => value.map(row => row.id === selected ? {...row,...data} : row).sort((a,b)=>a.name.localeCompare(b.name))); setRenameOpen(false); setNotice('Room name saved.');
  }); }
  function saveStudents() { void mutate(async () => {
    const checked = checkRoomAddition(method==='single'?validateStudentRows([{id:studentId,name:studentName,emailid:email}]):preview??{rows:[],errors:['Review the student list first.']},students);
    if (checked.errors.length) throw new Error(checked.errors.join('\n'));
    const { error } = await supabase!.rpc('classpulse_add_students', { target_roster: selected, input_rows: checked.rows });
    if (error) throw rpcError(error);
    readGeneration.current++; setDialog(null); setPreview(null); setRefresh(value=>value+1); setNotice(`${checked.rows.length} ${checked.rows.length===1?'student added':'students added'}. Current and saved quiz rosters stay unchanged.`);
  }); }
  function saveEdit() { void mutate(async () => {
    if (!editing) return;
    const checked = validateStudentRows([{id:editing.id,name:studentName,emailid:email}]);
    if (checked.errors.length) throw new Error(checked.errors.join('\n'));
    const {error} = await supabase!.rpc('classpulse_edit_student',{target_roster:selected,student_code_input:editing.id,desired_name:checked.rows[0].name,desired_email:checked.rows[0].emailid,expected_name:editing.name,expected_email:editing.emailid});
    if (error) throw rpcError(error);
    setDialog(null); setRefresh(value=>value+1); setNotice('Student details saved. Current and saved quiz reports keep their original details.');
  }); }
  function removeStudent() { void mutate(async () => {
    if (!editing) return;
    const {error} = await supabase!.rpc('classpulse_remove_student',{target_roster:selected,student_code_input:editing.id});
    if (error) throw rpcError(error);
    setDialog(null); setRefresh(value=>value+1); setNotice('Student removed from this room. Current quizzes, saved reports and their other rooms stay unchanged.');
  }); }
  function changeRoomDeleted(rosterId: string, remove: boolean) { void mutate(async () => {
    const {error}=await supabase!.rpc('classpulse_set_room_deleted',{target_roster:rosterId,deleted:remove});
    if(error)throw rpcError(error);
    setDialog(null);setShowRoster(false);setRefresh(value=>value+1);
    setNotice(remove?'Room moved to Deleted. Saved reports remain available under Reports → All rooms.':'Room restored with its students and saved reports.');
  }); }
  const disabled = busy || loading || roomLoading;
  const filteredRooms = rosters.filter(row=>row.name.toLowerCase().includes(roomSearch.trim().toLowerCase()));
  const pages = Math.max(1,Math.ceil(filteredRooms.length/20)), visiblePage=Math.min(page,pages-1);
  const filteredStudents=students.filter(row=>`${row.id} ${row.name} ${row.emailid}`.toLowerCase().includes(studentSearch.trim().toLowerCase()));
  const generation=readGeneration.current;
  const roomList=<View style={[s.listPanel,wide&&{width:300}]}>
    <TextInput accessibilityLabel="Search rooms" placeholder="Search rooms" placeholderTextColor="#667582" style={s.input} value={roomSearch} onChangeText={value=>{setRoomSearch(value);setPage(0);}}/>
    <Text style={s.body}>{filteredRooms.length} {filteredRooms.length===1?'room':'rooms'}</Text>
    <ScrollView style={{maxHeight:560}}>{filteredRooms.slice(visiblePage*20,(visiblePage+1)*20).map(roster=>deletedView?<View key={roster.id} style={s.roomRow}><View style={{flex:1,gap:5}}><Text style={s.itemName}>{roster.name}</Text><Text style={s.body}>{roster.student_count??0} students</Text></View><Action title={`Restore ${roster.name}`} secondary disabled={disabled} onPress={()=>changeRoomDeleted(roster.id,false)}/></View>:<Pressable key={roster.id} accessibilityRole="button" accessibilityLabel={`View roster for ${roster.name}`} accessibilityState={{selected:selected===roster.id,disabled:busy}} disabled={busy} onPress={()=>{setSelected(roster.id);setShowRoster(true);setError('');setNotice('');}} style={[s.roomRow,selected===roster.id&&{backgroundColor:'#F0F7FA'}]}><View style={{gap:5,flex:1}}><Text style={s.itemName}>{roster.name}</Text><Text style={s.body}>{roster.student_count===undefined?'View roster':`${roster.student_count} students`}</Text></View><Text style={s.link}>›</Text></Pressable>)}</ScrollView>
    {!loading&&!filteredRooms.length&&<Text style={s.body}>{rosters.length?'No rooms match your search.':deletedView?'No deleted rooms.':'No rooms yet. Create your first room above.'}</Text>}
    {pages>1&&<View style={s.row}><Action title="Previous" secondary disabled={busy||visiblePage===0} onPress={()=>setPage(visiblePage-1)}/><Text style={s.body}>{visiblePage+1} / {pages}</Text><Action title="Next" secondary disabled={busy||visiblePage===pages-1} onPress={()=>setPage(visiblePage+1)}/></View>}
  </View>;
  const rosterPanel=!deletedView&&current&&<View style={[s.card,{flex:1}]}>
    {!wide&&<Action title="‹ All rooms" secondary disabled={busy} onPress={()=>setShowRoster(false)}/>}
    <View style={s.toolbar}><View><Text accessibilityRole="header" style={s.subtitle}>{current.name}</Text><Text style={s.body}>{roomLoading?'Loading students…':`${students.length} students · Maximum 150`}</Text></View><View style={s.row}><Action title="Rename room" secondary disabled={disabled} onPress={()=>{setRename(current.name);setRenameOpen(value=>!value);}}/><Action title="Add students" disabled={disabled||students.length>=150} onPress={openAdd}/><Action title="Delete room" secondary disabled={disabled} onPress={()=>{setError('');setDialog('deleteRoom');}}/></View></View>
    {renameOpen&&<View style={s.row}><TextInput accessibilityLabel="Rename selected room" style={s.input} value={rename} onChangeText={setRename} maxLength={32} editable={!disabled}/><Action title="Save room name" disabled={disabled||rename.trim()===current.name} onPress={renameRoom}/><Action title="Cancel" secondary disabled={busy} onPress={()=>setRenameOpen(false)}/></View>}
    <TextInput accessibilityLabel="Search students" placeholder="Search by name, ID or email" placeholderTextColor="#667582" style={s.input} value={studentSearch} onChangeText={setStudentSearch}/>
    <ScrollView style={{maxHeight:560}}>{filteredStudents.map(student=><View key={student.id} style={s.student}><View style={{flex:1,minWidth:180,gap:4}}><Text style={s.itemName}>{student.name}</Text><Text style={s.body}>{student.id} · {student.emailid||'No email saved'}</Text></View><View style={s.row}><Action title="Edit" secondary disabled={disabled} onPress={()=>openStudent(student,'edit')}/><Action title="Remove" secondary disabled={disabled} onPress={()=>openStudent(student,'remove')}/></View></View>)}{!roomLoading&&!filteredStudents.length&&<Text style={s.body}>{students.length?'No students match your search.':'No students yet. Choose Add students to get started.'}</Text>}</ScrollView>
    <Text style={s.small}>Roster changes apply to future quizzes. Current quizzes and saved reports keep their original roster.</Text>
  </View>;
  return <View style={s.section}>
    <View style={s.toolbar}><Text accessibilityRole="header" style={s.title}>Rooms</Text><View style={s.row}><Action title="Refresh" secondary disabled={disabled} onPress={()=>setRefresh(value=>value+1)}/><Action title="Add room" disabled={disabled} onPress={()=>setCreateOpen(value=>!value)}/></View></View>
    <Text style={s.body}>Choose a room to manage its students. Students join using the room name and their Student ID.</Text>
    {!!error&&!dialog&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    {!!notice&&<Text accessibilityLiveRegion="polite" style={s.body}>{notice}</Text>}
    {setupNeeded&&<Text style={s.body}>Run the room student setup in Supabase, then Refresh to enable adding and editing students.</Text>}
    {createOpen&&<View style={s.card}><Text style={s.subtitle}>Add room</Text><TextInput accessibilityLabel="New room name" style={s.input} value={name} onChangeText={setName} placeholder="e.g. CF2026" placeholderTextColor="#667582" maxLength={32} editable={!disabled}/><View style={s.row}><Action title={busy?'Saving…':'Create room'} disabled={disabled} onPress={createRoom}/><Action title="Cancel" secondary disabled={busy} onPress={()=>setCreateOpen(false)}/></View></View>}
    <View style={s.row}><Action title="Rooms" secondary={deletedView} disabled={busy} onPress={()=>{setDeletedView(false);setRoomSearch('');setPage(0);setShowRoster(false);}}/><Action title="Deleted" secondary={!deletedView} disabled={busy} onPress={()=>{setDeletedView(true);setRoomSearch('');setPage(0);setShowRoster(false);}}/></View>
    <View style={[s.panels,wide&&{flexDirection:'row'}]}>{(wide||!showRoster)&&roomList}{(wide||showRoster)&&rosterPanel}</View>
    <Modal visible={dialog!==null} transparent animationType="fade" onRequestClose={closeDialog}>
      <View style={s.overlay}><View accessibilityViewIsModal style={s.dialog}>
        <View style={s.toolbar}><Text accessibilityRole="header" style={s.subtitle}>{dialog==='add'?'Add students':dialog==='edit'?'Edit student':dialog==='deleteRoom'?'Delete room':'Remove student'} · {current?.name}</Text><Action title="Close" secondary disabled={busy} onPress={closeDialog}/></View>
        <ScrollView style={{flexShrink:1}} contentContainerStyle={{gap:16}} keyboardShouldPersistTaps="handled">
          {dialog==='add'&&<>
            <View style={s.row}>{([['single','Individual'],['paste','Paste a group'],['csv','Upload CSV']] as const).map(([id,label])=><Pressable key={id} accessibilityRole="tab" accessibilityState={{selected:method===id,disabled:busy}} disabled={busy} onPress={()=>{readGeneration.current++;setMethod(id);setPreview(null);setError('');}} style={[s.choice,method===id&&{borderBottomColor:'#0088B0'}]}><Text style={s.link}>{label}</Text></Pressable>)}</View>
            <Text style={s.body}>Students will be added to the existing roster. ID and full name are required; email is optional.</Text>
            {method==='single'&&<>
              <Text style={s.label}>Student ID</Text><TextInput accessibilityLabel="Student ID" style={s.input} value={studentId} onChangeText={setStudentId} maxLength={64} autoCapitalize="none" editable={!busy}/>
              <Text style={s.label}>Full name</Text><TextInput accessibilityLabel="Student full name" style={s.input} value={studentName} onChangeText={setStudentName} maxLength={200} editable={!busy}/>
              <Text style={s.label}>Email (optional)</Text><TextInput accessibilityLabel="Student email" style={s.input} value={email} onChangeText={setEmail} maxLength={254} keyboardType="email-address" autoCapitalize="none" editable={!busy}/>
            </>}
            {method==='paste'&&<><Text style={s.body}>Copy rows from Excel: Student ID, full name, email. Or paste CSV rows in that order. Each student goes on a new line.</Text><TextInput accessibilityLabel="Paste student group" multiline style={[s.input,{minHeight:150,textAlignVertical:'top'}]} value={paste} onChangeText={value=>{setPaste(value);setPreview(null);}} placeholder={'001,Full Name,name@example.com\n002,Another Name,'} placeholderTextColor="#667582" editable={!busy}/><Action title="Review students" secondary disabled={busy} onPress={()=>{setError('');setPreview(checkRoomAddition(parsePastedStudents(paste),students));}}/></>}
            {method==='csv'&&<CsvFiles disabled={busy} onRead={text=>{if(readGeneration.current!==generation)return;setError('');setPreview(checkRoomAddition(parseRosterCsv(text),students));}} onError={message=>{if(readGeneration.current!==generation)return;setPreview(null);setError(message);}}/>}
            {preview&&method!=='single'&&<View style={s.preview}><Text style={s.label}>Preview · {preview.rows.length} students</Text>{preview.errors.map((message,index)=><Text key={index} style={s.error}>{message}</Text>)}{preview.rows.slice(0,12).map((student,index)=><View key={index} style={{gap:3}}><Text style={s.itemName}>{student.id} · {student.name}</Text><Text style={s.body}>{student.emailid||'No email'}</Text></View>)}{preview.rows.length>12&&<Text style={s.body}>And {preview.rows.length-12} more students.</Text>}</View>}
          </>}
          {dialog==='edit'&&<><Text style={s.body}>Student ID: {editing?.id}</Text><Text style={s.small}>Name and email changes also apply to this student in your other rooms. Current quizzes and saved reports retain their original details.</Text><Text style={s.label}>Full name</Text><TextInput accessibilityLabel="Edit student full name" style={s.input} value={studentName} onChangeText={setStudentName} maxLength={200} editable={!busy}/><Text style={s.label}>Email (optional)</Text><TextInput accessibilityLabel="Edit student email" style={s.input} value={email} onChangeText={setEmail} maxLength={254} autoCapitalize="none" keyboardType="email-address" editable={!busy}/></>}
          {dialog==='remove'&&<><Text style={s.body}>Remove {editing?.name} ({editing?.id}) from {current?.name}?</Text><Text style={s.small}>This affects future quizzes in this room. Their current quiz access, saved answers, reports and other rooms stay unchanged.</Text></>}
          {dialog==='deleteRoom'&&<><Text style={s.body}>Move {current?.name} to Deleted?</Text><Text style={s.small}>The room will be removed from Launch and the room picker. You can restore it from the Deleted tab. Students, saved answers and reports will be kept. Find its reports under Reports → All rooms.</Text><Text style={s.small}>End any running activity in Live Results before deleting this room.</Text>{!deleteReady&&<Text style={s.error}>Run the room deletion setup in Supabase, then Refresh Rooms.</Text>}</>}
          {!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}
        </ScrollView>
        <View style={s.row}><Action title={busy?'Saving…':dialog==='add'?'Add to room':dialog==='edit'?'Save details':dialog==='deleteRoom'?'Confirm delete':'Remove from room'} disabled={busy||(dialog==='deleteRoom'?!deleteReady:setupNeeded)||(dialog==='add'&&method!=='single'&&(!preview||!!preview.errors.length))} onPress={dialog==='add'?saveStudents:dialog==='edit'?saveEdit:dialog==='deleteRoom'?()=>changeRoomDeleted(selected,true):removeStudent}/><Action title="Cancel" secondary disabled={busy} onPress={closeDialog}/></View>
      </View></View>
    </Modal>
  </View>;
}
const s = StyleSheet.create({
  section:{gap:18}, toolbar:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',alignItems:'center',gap:12},panels:{gap:20,alignItems:'stretch'},listPanel:{gap:12},roomRow:{flexDirection:'row',alignItems:'center',gap:16,padding:14,borderBottomWidth:1,borderBottomColor:'#E4E9EE'},student:{borderBottomWidth:1,borderBottomColor:'#E4E9EE',paddingVertical:14,gap:12,flexDirection:'row',flexWrap:'wrap',alignItems:'center'},itemName:{fontSize:15,color:'#263B4B',fontWeight:'600'},link:{fontSize:14,color:'#0088B0'},title:{color:'#263B4B',fontSize:28,fontWeight:'700'},subtitle:{color:'#263B4B',fontSize:20,fontWeight:'600'},label:{fontSize:14,color:'#263B4B',fontWeight:'600'},body:{color:'#667582',fontSize:14,lineHeight:23},small:{color:'#667582',fontSize:13,lineHeight:21},error:{color:'#A13624',lineHeight:23},card:{backgroundColor:'white',borderWidth:1,borderColor:'#E4E9EE',borderRadius:4,padding:18,gap:16,minWidth:0},row:{flexDirection:'row',flexWrap:'wrap',alignItems:'center',gap:10},input:{borderWidth:1,borderColor:'#CDD6DE',borderRadius:4,padding:11,fontSize:16,color:'#263B4B',minHeight:44},button:{backgroundColor:'#0088B0',paddingVertical:10,paddingHorizontal:13,borderRadius:4,alignSelf:'flex-start'},secondary:{backgroundColor:'#E5F7FC'},buttonText:{color:'white',fontWeight:'600'},choice:{backgroundColor:'#F0F7FA',paddingVertical:11,paddingHorizontal:12,borderBottomWidth:2,borderBottomColor:'transparent'},preview:{backgroundColor:'#F5F8FA',padding:16,borderRadius:4,gap:12},overlay:{flex:1,backgroundColor:'rgba(38,59,75,0.3)',alignItems:'center',justifyContent:'center',padding:18},dialog:{width:'100%',maxWidth:680,maxHeight:'90%',backgroundColor:'white',borderRadius:8,padding:24,gap:18}
});
