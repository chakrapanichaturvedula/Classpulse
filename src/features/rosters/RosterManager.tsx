import React, { useEffect, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View, StyleSheet } from 'react-native';
import { supabase } from '../../lib/supabase';
import { CsvFiles } from './CsvFiles';
import { parseRosterCsv, type CsvPreview, type RosterRow } from './csv';

type Roster = { id: string; name: string };
function Action({ title, disabled, onPress }: { title: string; disabled?: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress} style={[s.button, disabled && { opacity: 0.45 }]}><Text style={s.buttonText}>{title}</Text></Pressable>;
}
export function RosterManager({ teacherId, selectedRosterId, onClassSelect }: { teacherId: string; selectedRosterId?: string; onClassSelect?: (id: string) => void }) {
  const [rosters, setRosters] = useState<Roster[]>([]), [selected, setSelected] = useState('');
  const [createOpen,setCreateOpen]=useState(false),[renameOpen,setRenameOpen]=useState(false);
  const [name, setName] = useState(''), [rename, setRename] = useState('');
  const [students, setStudents] = useState<RosterRow[]>([]), [preview, setPreview] = useState<CsvPreview | null>(null);
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [roomLoading, setRoomLoading] = useState(false);
  const [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [refresh, setRefresh] = useState(0);
  const saving = useRef(false);
  const selectedRef = useRef(selected); selectedRef.current = selected;
  const current = rosters.find(value => value.id === selected);
  useEffect(() => { if (selectedRosterId) setSelected(selectedRosterId); }, [selectedRosterId]);
  useEffect(() => { if (selected) onClassSelect?.(selected); }, [selected, onClassSelect]);
  useEffect(() => {
    let active = true; setLoading(true); setError('');
    supabase!.from('rosters').select('id,name').eq('teacher_id', teacherId).order('created_at').then(({ data, error }) => {
      if (!active) return;
      if (error) setError('Rooms could not load. Install the Step 3 Supabase setup, then choose Retry.');
      else { setRosters(data ?? []); setSelected(value => (data ?? []).some(row => row.id === value) ? value : data?.[0]?.id ?? ''); }
      setLoading(false);
    });
    return () => { active = false; };
  }, [teacherId, refresh]);
  useEffect(() => {
    setPreview(null); setStudents([]); setRename(current?.name ?? '');
    if (!selected) { setRoomLoading(false); return; }
    let active = true; setRoomLoading(true);
    supabase!.from('roster_students').select('students(student_code,full_name,email)').eq('roster_id', selected).eq('teacher_id', teacherId).is('withdrawn_at', null).then(({ data, error }) => {
      if (!active) return;
      if (error) setError('Could not load this room. Please retry.');
      else setStudents((data ?? []).map(row => { const student = row.students as unknown as {student_code:string;full_name:string;email:string|null}; return {id:student.student_code,name:student.full_name,emailid:student.email ?? ''}; }).sort((a,b) => a.name.localeCompare(b.name)));
      setRoomLoading(false);
    });
    return () => { active = false; };
  }, [selected, refresh, teacherId]);

  async function mutate(action: () => Promise<void>) {
    if (saving.current) return; saving.current = true; setBusy(true); setError(''); setNotice('');
    try { await action(); } catch (error) { setError(error instanceof Error ? error.message : 'Could not save. Please try again.'); }
    finally { saving.current = false; setBusy(false); }
  }
  function createRoom() { void mutate(async () => {
    if (!name.trim()) throw new Error('Enter a room name.');
    const { data, error } = await supabase!.rpc('classpulse_save_room', { target_roster: null, desired_name: name.trim() });
    if (error) throw new Error(error.code === '23505' ? 'You already have a room with this name.' : error.code==='P0001'?error.message:'Could not create the room. Run the room setup first.');
    setName(''); setCreateOpen(false); setRosters(value => [...value, data]); setSelected(data.id); setNotice('Room created. Download the template to add students.');
  }); }
  function renameRoom() { void mutate(async () => {
    if (!rename.trim()) throw new Error('Enter a room name.');
    const { data, error } = await supabase!.rpc('classpulse_save_room', { target_roster: selected, desired_name: rename.trim() });
    if (error) throw new Error(error.code === '23505' ? 'Another room already uses this name.' : error.code==='P0001'?error.message:'Could not rename the room. Run the room setup first.');
    setRosters(value => value.map(row => row.id === selected ? data : row)); setRenameOpen(false); setNotice('Room name saved.');
  }); }
  function saveRoster() { void mutate(async () => {
    if (!preview || preview.errors.length || !selected) throw new Error('Fix the preview errors before saving.');
    const { error } = await supabase!.rpc('classpulse_import_roster', { target_roster: selected, input_rows: preview.rows });
    if (error) throw new Error(error.code === 'P0001' ? error.message : 'Could not save the roster. No partial import was saved. Please retry.');
    setPreview(null); setRefresh(value => value + 1); setNotice('Roster saved.');
  }); }
  const disabled = busy || loading || roomLoading;
  return <View style={s.section}>
    <View style={s.toolbar}><Text accessibilityRole="header" style={s.title}>Rooms</Text><View style={s.row}><Action title="Refresh" disabled={disabled} onPress={()=>setRefresh(value=>value+1)}/><Action title="Add room" disabled={disabled} onPress={()=>setCreateOpen(value=>!value)}/></View></View>
    <Text style={s.body}>Students join using the room name below. Upload one roster for each room.</Text>
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    {!!notice && <Text accessibilityLiveRegion="polite" style={s.body}>{notice}</Text>}
    {createOpen&&<View style={s.card}><Text style={s.subtitle}>Add room</Text><TextInput accessibilityLabel="New room name" style={s.input} value={name} onChangeText={setName} placeholder="e.g. CF2026" placeholderTextColor="#667582" maxLength={32} editable={!disabled} /><Action title={busy ? 'Saving…' : 'Create room'} disabled={disabled} onPress={createRoom} /><Action title="Cancel" onPress={()=>setCreateOpen(false)}/></View>}
    <View style={s.roomList}>{rosters.map(roster=><Pressable key={roster.id} accessibilityRole="button" accessibilityState={{selected:selected===roster.id,disabled:busy}} disabled={busy} onPress={()=>{setSelected(roster.id);setRenameOpen(false);setError('');setNotice('');}} style={[s.roomRow,selected===roster.id&&{backgroundColor:'#F0F7FA'}]}><Text style={s.itemName}>{roster.name}</Text><Text style={s.link}>View roster ›</Text></Pressable>)}</View>
    {!loading && !error && !rosters.length && <Text style={s.body}>No rooms yet. Create your first room above.</Text>}
    {!!current && <View style={s.card}>
      <View style={s.toolbar}><Text accessibilityRole="header" style={s.subtitle}>{current.name}</Text><Action title="Rename room" disabled={disabled} onPress={()=>{setRename(current.name);setRenameOpen(value=>!value);}}/></View>
      {renameOpen&&<View style={s.row}><TextInput accessibilityLabel="Rename selected room" style={s.input} value={rename} onChangeText={setRename} maxLength={32} editable={!disabled} /><Action title="Save room name" disabled={disabled || rename.trim() === current.name} onPress={renameRoom} /><Action title="Cancel" onPress={()=>setRenameOpen(false)}/></View>}
      <Text style={s.body}>{roomLoading ? 'Loading students…' : `${students.length} students · Maximum 150`}</Text>
      <CsvFiles disabled={disabled} onRead={text => { if (selectedRef.current !== selected) return; setPreview(parseRosterCsv(text)); setError(''); setNotice(''); }} onError={message => { if (selectedRef.current !== selected) return; setPreview(null); setError(message); }} />
      {preview && <View style={s.preview}>
        <Text style={s.subtitle}>Upload preview · {preview.rows.length} students</Text>
        <Text style={s.body}>Saving replaces this room’s current student list. Students in other rooms remain enrolled. An existing ID must have matching student details.</Text>
        {preview.errors.map((message,index) => <Text key={index} style={s.error}>{message}</Text>)}
        {preview.rows.map((student,index) => <StudentLine key={index} student={student} />)}
        <View style={s.row}><Action title={busy ? 'Saving…' : 'Save roster'} disabled={disabled || preview.errors.length > 0} onPress={saveRoster} /><Action title="Cancel upload" disabled={busy} onPress={() => setPreview(null)} /></View>
      </View>}
      {!preview&&!roomLoading&&students.length>0&&<View style={s.student}><Text style={[s.columnId,s.tableLabel]}>STUDENT ID</Text><Text style={[s.columnName,s.tableLabel]}>NAME</Text><Text style={[s.columnEmail,s.tableLabel]}>EMAIL</Text></View>}
      {!preview && !roomLoading && students.map(student => <StudentLine key={student.id} student={student} />)}
      {!preview && !roomLoading && !students.length && <Text style={s.body}>No students saved in this room yet.</Text>}
    </View>}
  </View>;
}
function StudentLine({student}:{student:RosterRow}){return <View style={s.student}><Text style={[s.columnId,s.itemName]}>{student.id}</Text><Text style={[s.columnName,s.body]}>{student.name}</Text><Text style={[s.columnEmail,s.body]}>{student.emailid||'—'}</Text></View>;}
const s = StyleSheet.create({toolbar:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',alignItems:'center',gap:16},roomList:{borderTopWidth:1,borderTopColor:'#E4E9EE'},roomRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:16,padding:14,borderBottomWidth:1,borderBottomColor:'#E4E9EE'},itemName:{fontSize:14,color:'#263B4B',fontWeight:'500'},link:{fontSize:13,color:'#0088B0'},columnId:{width:125},columnName:{flex:1,minWidth:150},columnEmail:{flex:1,minWidth:160},tableLabel:{fontSize:12,fontWeight:'600',color:'#667582'},
  section:{gap:18}, title:{color:'#263B4B',fontSize:28,fontWeight:'700'},subtitle:{color:'#263B4B',fontSize:18,fontWeight:'600'}, body:{color:'#667582',fontSize:14,lineHeight:23},error:{color:'#A13624',lineHeight:23},card:{backgroundColor:'white',borderWidth:1,borderColor:'#E4E9EE',borderRadius:4,padding:18,gap:16},row:{flexDirection:'row',flexWrap:'wrap',gap:10},input:{borderWidth:1,borderColor:'#CDD6DE',borderRadius:4,padding:11,fontSize:16,color:'#263B4B',minHeight:40},button:{backgroundColor:'#0088B0',paddingVertical:9,paddingHorizontal:12,borderRadius:4,alignSelf:'flex-start'},buttonText:{color:'white',fontWeight:'600'},choice:{backgroundColor:'#F0F7FA',paddingVertical:9,paddingHorizontal:12,borderRadius:4},preview:{backgroundColor:'#FFFFFF',padding:16,borderRadius:12,gap:14},student:{borderTopWidth:1,borderTopColor:'#E4E9EE',paddingVertical:12,gap:12,flexDirection:'row',flexWrap:'wrap',alignItems:'center'},
});

