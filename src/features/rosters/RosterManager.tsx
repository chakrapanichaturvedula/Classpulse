import React, { useEffect, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View, StyleSheet } from 'react-native';
import { supabase } from '../../lib/supabase';
import { CsvFiles } from './CsvFiles';
import { parseRosterCsv, type CsvPreview, type RosterRow } from './csv';

type Roster = { id: string; name: string };
function Action({ title, disabled, onPress }: { title: string; disabled?: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress} style={[s.button, disabled && { opacity: 0.45 }]}><Text style={s.buttonText}>{title}</Text></Pressable>;
}
export function RosterManager({ teacherId }: { teacherId: string }) {
  const [rosters, setRosters] = useState<Roster[]>([]), [selected, setSelected] = useState('');
  const [name, setName] = useState(''), [rename, setRename] = useState('');
  const [students, setStudents] = useState<RosterRow[]>([]), [preview, setPreview] = useState<CsvPreview | null>(null);
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [classLoading, setClassLoading] = useState(false);
  const [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [refresh, setRefresh] = useState(0);
  const saving = useRef(false);
  const selectedRef = useRef(selected); selectedRef.current = selected;
  const current = rosters.find(value => value.id === selected);
  useEffect(() => {
    let active = true; setLoading(true); setError('');
    supabase!.from('rosters').select('id,name').eq('teacher_id', teacherId).order('created_at').then(({ data, error }) => {
      if (!active) return;
      if (error) setError('Classes could not load. Install the Step 3 Supabase setup, then choose Retry.');
      else { setRosters(data ?? []); setSelected(value => (data ?? []).some(row => row.id === value) ? value : data?.[0]?.id ?? ''); }
      setLoading(false);
    });
    return () => { active = false; };
  }, [teacherId, refresh]);
  useEffect(() => {
    setPreview(null); setStudents([]); setRename(current?.name ?? '');
    if (!selected) { setClassLoading(false); return; }
    let active = true; setClassLoading(true);
    supabase!.from('roster_students').select('students(student_code,full_name,email)').eq('roster_id', selected).eq('teacher_id', teacherId).is('withdrawn_at', null).then(({ data, error }) => {
      if (!active) return;
      if (error) setError('Could not load this class. Please retry.');
      else setStudents((data ?? []).map(row => { const student = row.students as unknown as {student_code:string;full_name:string;email:string|null}; return {id:student.student_code,name:student.full_name,emailid:student.email ?? ''}; }).sort((a,b) => a.name.localeCompare(b.name)));
      setClassLoading(false);
    });
    return () => { active = false; };
  }, [selected, refresh, teacherId]);

  async function mutate(action: () => Promise<void>) {
    if (saving.current) return; saving.current = true; setBusy(true); setError(''); setNotice('');
    try { await action(); } catch (error) { setError(error instanceof Error ? error.message : 'Could not save. Please try again.'); }
    finally { saving.current = false; setBusy(false); }
  }
  function createClass() { void mutate(async () => {
    if (!name.trim()) throw new Error('Enter a class name.');
    const { data, error } = await supabase!.from('rosters').insert({ name: name.trim(), teacher_id: teacherId }).select('id,name').single();
    if (error) throw new Error(error.code === '23505' ? 'You already have a class with this name.' : 'Could not create the class. Check the Step 3 database setup.');
    setName(''); setRosters(value => [...value, data]); setSelected(data.id); setNotice('Class created. Download the template to add students.');
  }); }
  function renameClass() { void mutate(async () => {
    if (!rename.trim()) throw new Error('Enter a class name.');
    const { data, error } = await supabase!.from('rosters').update({ name: rename.trim() }).eq('id', selected).eq('teacher_id', teacherId).select('id,name').single();
    if (error) throw new Error(error.code === '23505' ? 'Another class already uses this name.' : 'Could not rename the class. Please retry.');
    setRosters(value => value.map(row => row.id === selected ? data : row)); setNotice('Class name saved.');
  }); }
  function saveRoster() { void mutate(async () => {
    if (!preview || preview.errors.length || !selected) throw new Error('Fix the preview errors before saving.');
    const { error } = await supabase!.rpc('classpulse_import_roster', { target_roster: selected, input_rows: preview.rows });
    if (error) throw new Error(error.code === 'P0001' ? error.message : 'Could not save the roster. No partial import was saved. Please retry.');
    setPreview(null); setRefresh(value => value + 1); setNotice('Roster saved.');
  }); }
  const disabled = busy || loading || classLoading;
  return <View style={s.section}>
    <Text accessibilityRole="header" style={s.title}>Your classes</Text>
    <Text style={s.body}>Create a named class, then fill and upload its roster template.</Text>
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    {!!notice && <Text accessibilityLiveRegion="polite" style={s.body}>{notice}</Text>}
    <View style={s.card}><Text style={s.subtitle}>Create a class</Text><TextInput accessibilityLabel="New class name" style={s.input} value={name} onChangeText={setName} placeholder="e.g. First Year — Section A" placeholderTextColor="#61736E" maxLength={120} editable={!disabled} /><Action title={busy ? 'Saving…' : 'Create class'} disabled={disabled} onPress={createClass} /></View>
    <Action title={loading ? 'Loading classes…' : 'Retry / refresh classes'} disabled={disabled} onPress={() => setRefresh(value => value + 1)} />
    <View style={s.row}>{rosters.map(roster => <Pressable key={roster.id} accessibilityRole="button" accessibilityState={{ selected: selected === roster.id, disabled: busy }} disabled={busy} style={[s.choice, selected === roster.id && { backgroundColor: '#193C38' }]} onPress={() => { setSelected(roster.id); setError(''); setNotice(''); }}><Text style={{ color: selected === roster.id ? 'white' : '#193C38', fontWeight: '600' }}>{roster.name}</Text></Pressable>)}</View>
    {!loading && !error && !rosters.length && <Text style={s.body}>No classes yet. Create your first class above.</Text>}
    {!!current && <View style={s.card}>
      <Text accessibilityRole="header" style={s.subtitle}>{current.name}</Text>
      <TextInput accessibilityLabel="Rename selected class" style={s.input} value={rename} onChangeText={setRename} maxLength={120} editable={!disabled} /><Action title="Save class name" disabled={disabled || rename.trim() === current.name} onPress={renameClass} />
      <Text style={s.body}>{classLoading ? 'Loading students…' : `${students.length} students saved · Maximum 150`}</Text>
      <CsvFiles disabled={disabled} onRead={text => { if (selectedRef.current !== selected) return; setPreview(parseRosterCsv(text)); setError(''); setNotice(''); }} onError={message => { if (selectedRef.current !== selected) return; setPreview(null); setError(message); }} />
      {preview && <View style={s.preview}>
        <Text style={s.subtitle}>Upload preview · {preview.rows.length} students</Text>
        <Text style={s.body}>Saving replaces this class’s current student list. Students in other classes remain enrolled. An existing ID must have matching student details.</Text>
        {preview.errors.map((message,index) => <Text key={index} style={s.error}>{message}</Text>)}
        {preview.rows.map((student,index) => <StudentLine key={index} student={student} />)}
        <View style={s.row}><Action title={busy ? 'Saving…' : 'Save roster'} disabled={disabled || preview.errors.length > 0} onPress={saveRoster} /><Action title="Cancel upload" disabled={busy} onPress={() => setPreview(null)} /></View>
      </View>}
      {!preview && !classLoading && students.map(student => <StudentLine key={student.id} student={student} />)}
      {!preview && !classLoading && !students.length && <Text style={s.body}>No students saved in this class yet.</Text>}
    </View>}
  </View>;
}
function StudentLine({ student }: { student: RosterRow }) { return <View style={s.student}><Text style={{color:'#193C38',fontWeight:'600'}}>{student.id} · {student.name}</Text><Text style={s.body}>{student.emailid || 'No email provided'}</Text></View>; }
const s = StyleSheet.create({
  section:{gap:18}, title:{color:'#193C38',fontSize:27,fontWeight:'700'},subtitle:{color:'#193C38',fontSize:20,fontWeight:'600'}, body:{color:'#61736E',fontSize:14,lineHeight:23},error:{color:'#A13624',lineHeight:23},card:{backgroundColor:'white',borderWidth:1,borderColor:'#DFE6DD',borderRadius:20,padding:22,gap:16},row:{flexDirection:'row',flexWrap:'wrap',gap:10},input:{borderWidth:1,borderColor:'#BBCAC0',borderRadius:10,padding:14,fontSize:16,color:'#193C38',minHeight:48},button:{backgroundColor:'#256B5B',padding:14,borderRadius:10,alignSelf:'flex-start'},buttonText:{color:'white',fontWeight:'600'},choice:{backgroundColor:'#EAF1E8',padding:14,borderRadius:10},preview:{backgroundColor:'#F6F5EF',padding:16,borderRadius:12,gap:14},student:{borderTopWidth:1,borderTopColor:'#DFE6DD',paddingTop:12,gap:5},
});
