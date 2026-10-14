import React, { useEffect, useState } from 'react';
import { Image, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { demoQuizzes, demoRoom, demoStudents } from './src/data/demo';
import { TeacherToolbar, type WorkspaceTab } from './src/components/TeacherToolbar';
import {FacultyAdmin} from './src/features/admin/FacultyAdmin';
import { TeacherAuthScreen } from './src/features/auth/TeacherAuthScreen';
import { useTeacherAuth } from './src/features/auth/useTeacherAuth';
import { supabase } from './src/lib/supabase';
import { RosterManager } from './src/features/rosters/RosterManager';
import { QuizManager } from './src/features/quizzes/QuizManager';
import { StudentEntry } from './src/features/students/StudentEntry';
import { Reports } from './src/features/reports/Reports';
import { LiveResults } from './src/features/results/LiveResults';
import { LaunchManager } from './src/features/launch/LaunchManager';

type Page = 'home' | 'teacher' | 'student' | 'account';
type Tab = 'Overview' | 'Quizzes' | 'Roster';
const colors = { ink: '#263B4B', muted: '#667582', paper: '#FFFFFF', white: '#FFFFFF', line: '#E4E9EE', teal: '#0088B0', pale: '#F0F7FA', orange: '#D66A43' };

function Button({ title, onPress, secondary = false }: { title: string; onPress: () => void; secondary?: boolean }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [s.button, secondary && s.secondary, pressed && { opacity: 0.75 }]}>
    <Text style={[s.buttonText, secondary && { color: colors.ink }]}>{title}</Text>
  </Pressable>;
}
function Tag({ children }: { children: React.ReactNode }) { return <View style={s.tag}><Text style={s.tagText}>{children}</Text></View>; }
function Card({ children, style }: { children: React.ReactNode; style?: object }) { return <View style={[s.card, style]}>{children}</View>; }

export default function App() {
  const { width } = useWindowDimensions();
  const wide = width >= 760;
  const [page, setPage] = useState<Page>('home');
  const [tab, setTab] = useState<Tab>('Overview');
  const [preview, setPreview] = useState<number | null>(null);
  const auth = useTeacherAuth();
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>('launch');
  const [resultsSession,setResultsSession]=useState('');
  const [selectedClass, setSelectedClass] = useState('');
  const [quizDirty, setQuizDirty] = useState(false);
  const [quizEpoch, setQuizEpoch] = useState(0);
  const [pendingExit, setPendingExit] = useState<Page | 'classes' | 'launch' | 'results' | 'reports' | 'admin' | 'signout' | null>(null);
  useEffect(() => { setQuizDirty(false); setPendingExit(null); setWorkspaceTab('launch'); setSelectedClass(''); setResultsSession(''); }, [auth.profile?.id]);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState('');
  async function signOut(force = false) {
    if (quizDirty && !force) { setPendingExit('signout'); return; }
    if (!supabase || signingOut) return;
    setSigningOut(true); setSignOutError('');
    try {
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error) setSignOutError('Could not sign out. Check your connection and try again.');
    } catch { setSignOutError('Could not sign out. Please try again.'); }
    finally { setSigningOut(false); }
  }

  function navigate(next: Page) { if (quizDirty && next !== page) { setPendingExit(next); return; } setPage(next); setPreview(null); }
  function discardAndContinue() {
    const action = pendingExit; setPendingExit(null); setQuizDirty(false); setQuizEpoch(value => value + 1);
    if (action === 'signout') void signOut(true);
    else if (action === 'classes' || action === 'launch' || action === 'results' || action === 'reports' || action === 'admin') setWorkspaceTab(action);
    else if (action) { setPage(action); setPreview(null); }
  }

  const inWorkspace=page==='account'&&!!auth.profile&&!!auth.session&&auth.profile.id===auth.session.user.id&&!auth.loading;
  function selectTab(next:WorkspaceTab){if(quizDirty&&next!=='quizzes')setPendingExit(next);else setWorkspaceTab(next);}
  return <View style={s.root}>
    <StatusBar style="dark" />
    {inWorkspace&&<TeacherToolbar teacherId={auth.profile!.id} teacherName={auth.profile!.full_name} isAdmin={!!auth.profile!.is_admin} tab={workspaceTab} selectedClass={selectedClass} onClassSelect={setSelectedClass} onTab={selectTab} onHome={()=>navigate('home')} onSignOut={()=>void signOut()} signingOut={signingOut}/> }
    <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
      <View style={[s.container, { paddingHorizontal: wide ? 32 : 18 }]}>
        {!inWorkspace&&<View style={s.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="Classpulse home" onPress={() => navigate('home')} style={s.brand}>
            <View style={s.mark}><Text style={s.markText}>cp</Text></View>
            <Text style={s.brandText}>Classpulse<Text style={{ color: colors.orange }}>.</Text></Text>
          </Pressable>
          {page !== 'home' ? <Button title="Home" secondary onPress={() => navigate('home')} /> : <Text style={s.small}>Classroom assessment</Text>}
        </View>}
        {!supabase&&<View style={s.notice}><Text style={s.noticeText}>Teacher sign in needs a Supabase connection.</Text></View>}

        {!!pendingExit && <Card style={{ gap: 14 }}><Text style={s.cardTitle}>You have unsaved quiz changes.</Text><Text style={s.body}>Cancel to return to the editor and save your draft, or discard those edits to continue.</Text><Button title="Cancel — keep editing" secondary onPress={() => setPendingExit(null)} /><Button title="Discard changes and continue" onPress={discardAndContinue} /></Card>}
        {page === 'account' && (auth.loading ? <Card><Text style={s.body}>Opening your workspace…</Text></Card> : auth.profile && auth.session && auth.profile.id === auth.session.user.id ? <>
          <View style={{ display: workspaceTab === 'classes' ? 'flex' : 'none' }}><RosterManager key={auth.profile.id} teacherId={auth.profile.id} selectedRosterId={selectedClass} onClassSelect={setSelectedClass} /></View>
          <View style={{ display: workspaceTab === 'quizzes' ? 'flex' : 'none' }}><QuizManager key={`${auth.profile.id}-${quizEpoch}`} teacherId={auth.profile.id} onDirtyChange={setQuizDirty} /></View>
          <View style={{ display: workspaceTab === 'launch' ? 'flex' : 'none' }}><LaunchManager key={auth.profile.id} teacherId={auth.profile.id} active={workspaceTab === 'launch'} selectedRosterId={selectedClass} onClassSelect={setSelectedClass} onResults={id=>{setResultsSession(id);setWorkspaceTab('results');}} /></View>
          <View style={{display:workspaceTab==='results'?'flex':'none'}}><LiveResults key={auth.profile.id} teacherId={auth.profile.id} active={workspaceTab==='results'} requestedSession={resultsSession}/></View>
          <View style={{display:workspaceTab==='reports'?'flex':'none'}}><Reports teacherId={auth.profile.id} active={workspaceTab==='reports'} selectedRosterId={selectedClass}/></View>
          {auth.profile.is_admin&&<View style={{display:workspaceTab==='admin'?'flex':'none'}}><FacultyAdmin active={workspaceTab==='admin'}/></View>}
          {!!signOutError && <Text accessibilityRole="alert" style={s.error}>{signOutError}</Text>}
        </> : auth.session ? <Card style={{ gap: 16 }}><Text style={s.cardTitle}>We could not open your workspace.</Text><Text accessibilityRole="alert" style={s.body}>{auth.profileError || 'Your teacher profile has not been verified.'}</Text><Button title="Retry workspace" onPress={auth.retryProfile} /><Button title={signingOut ? 'Signing out…' : 'Sign out'} secondary onPress={() => void signOut()} />{!!signOutError && <Text accessibilityRole="alert" style={s.error}>{signOutError}</Text>}</Card> : <TeacherAuthScreen onPreview={() => navigate('teacher')} />)}

        {page === 'home' && <>
          <View style={{gap:12,paddingVertical:24}}><Text accessibilityRole="header" style={s.title}>Classroom quizzes, made simple.</Text><Text style={s.body}>Teachers launch a quiz. Students join with their room name and Student ID.</Text></View>
          <View style={[s.columns,wide&&{flexDirection:'row'}]}>
           <Card style={{flex:1,gap:16}}><Text style={s.cardTitle}>Teacher</Text><Text style={s.body}>Prepare quizzes and see your class’s responses.</Text><Button title={auth.profile?'Open workspace':'Teacher sign in'} onPress={()=>navigate('account')}/></Card>
           <Card style={{flex:1,gap:16}}><Text style={s.cardTitle}>Student</Text><Text style={s.body}>Enter your room name and Student ID. No password needed.</Text><Button title="Join Classroom" secondary onPress={()=>navigate('student')}/></Card>
          </View>
        </>}

        {page === 'teacher' && <>
          <View style={s.pageHeading}><Text style={s.eyebrow}>TEACHER WORKSPACE · SAMPLE</Text><Text accessibilityRole="header" style={s.title}>Welcome to your classroom.</Text><Text style={s.body}>A quiet place to prepare, check understanding, and follow up.</Text></View>
          <View style={s.tabs}>{(['Overview', 'Quizzes', 'Roster'] as Tab[]).map(item => <Pressable key={item} accessibilityRole="tab" accessibilityState={{ selected: tab === item }} onPress={() => { setTab(item); setPreview(null); }} style={[s.tab, tab === item && s.activeTab]}><Text style={[s.tabText, tab === item && { color: 'white' }]}>{item}</Text></Pressable>)}</View>
          {tab === 'Overview' && <>
            <View style={[s.columns, wide && { flexDirection: 'row' }]}>{[['3', 'Sample quizzes'], ['3', 'Fictional students'], ['150', 'Planned class limit']].map(([value, label]) => <Card key={label} style={{ flex: 1, gap: 8 }}><Text style={s.stat}>{value}</Text><Text style={s.body}>{label}</Text></Card>)}</View>
            <View style={[s.columns, wide && { flexDirection: 'row' }]}>
              <Card style={{ flex: 1, gap: 17 }}><Tag>Sample room</Tag><Text style={s.cardTitle}>Your room: {demoRoom}</Text><Text style={s.body}>Students will enter your room name and their student ID. Live session controls arrive in a later step.</Text><Button title="Join Classroom →" onPress={() => navigate('student')} /></Card>
              <Card style={{ flex: 1, gap: 17 }}><Text style={s.eyebrow}>START WITH A SMALL CHECK-IN</Text><Text style={s.cardTitle}>Financial foundations</Text><Text style={s.body}>5 questions · Multiple choice, true/false, and short answer.</Text><Button title="Browse sample quizzes →" secondary onPress={() => setTab('Quizzes')} /></Card>
            </View>
          </>}
          {tab === 'Quizzes' && <>
            <Text style={s.sectionTitle}>Sample quiz library</Text><Text style={s.body}>Quiz creation and editing will be added in Step 4.</Text>
            {demoQuizzes.map((quiz, index) => <Card key={quiz.title} style={{ gap: 16 }}><Tag>{quiz.subject}</Tag><Text style={s.cardTitle}>{quiz.title}</Text><Text style={s.body}>{quiz.description}</Text><View style={s.wrap}><Text style={s.small}>{quiz.questions} questions · {quiz.duration}</Text><Button title={preview === index ? 'Close details' : 'View details'} secondary onPress={() => setPreview(preview === index ? null : index)} /></View>{preview === index && <View style={s.notice}><Text style={s.body}>This is a sample quiz card to review the layout. Questions, editing, and publishing will be introduced in Step 4.</Text></View>}</Card>)}
          </>}
          {tab === 'Roster' && <>
            <Text style={s.sectionTitle}>First-year sample class</Text><Text style={s.body}>Fictional names and IDs. CSV upload will be added in Step 3.</Text>
            <Card style={{ gap: 0 }}>
              <View style={s.rosterRow}><Text style={[s.small, { width: wide ? 180 : 112, fontWeight: '700' }]}>Student ID</Text><Text style={[s.small, { flex: 1, fontWeight: '700' }]}>Full Name</Text></View>
              {demoStudents.map(student => <View key={student.studentId} style={s.rosterRow}><Text style={[s.idText, { width: wide ? 180 : 112 }]}>{student.studentId}</Text><Text style={[s.body, { flex: 1 }]}>{student.fullName}</Text></View>)}
            </Card><Text style={s.small}>Names stay in one Full Name field. Student IDs retain letters, numbers, and leading zeros.</Text>
          </>}
        </>}

        {page === 'student' && <StudentEntry />}
        <View style={s.footer}>
          <View style={{ gap: 5 }}><Text style={s.small}>Classpulse</Text></View>
          <Pressable accessibilityRole="link" accessibilityLabel="Powered by IMT Hyderabad. Open the institute website." onPress={() => { void Linking.openURL('https://www.imthyderabad.edu.in/'); }} style={s.instituteBrand}>
            <Text style={s.instituteCaption}>Powered by</Text>
            <Image source={require('./assets/imt-hyderabad-logo.png')} resizeMode="contain" style={s.instituteLogo} accessibilityLabel="Institute of Management Technology Hyderabad logo" />
          </Pressable>
        </View>
      </View>
    </ScrollView>
  </View>;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper }, scroll: { flexGrow: 1 },
  container: { width: '100%', maxWidth: 1180, alignSelf: 'center', paddingTop: 30, paddingBottom: 20, gap: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, paddingBottom: 10 },
  brand: { flexDirection: 'row', gap: 10, alignItems: 'center' }, mark: { backgroundColor: colors.ink, borderRadius: 12, padding: 8, width: 42, height: 42, justifyContent: 'center', alignItems: 'center' }, markText: { color: '#FFFFFF', fontWeight: '700', fontSize: 20 }, brandText: { color: colors.ink, fontSize: 26, fontWeight: '700' },
  notice: { backgroundColor: colors.pale, padding: 15, borderRadius: 12, gap: 12 }, noticeText: { color: colors.ink, fontSize: 12, lineHeight: 20, fontWeight: '600' },
  hero: { gap: 38, paddingVertical: 32 }, heroTitle: { color: colors.ink, fontWeight: '700', letterSpacing: -1.8, lineHeight: undefined }, heroBody: { color: colors.muted, fontSize: 18, lineHeight: 28, maxWidth: 470 },
  eyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 1.6, color: colors.teal, lineHeight: 18 },
  columns: { gap: 20 }, card: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 20, padding: 24 },
  cardTitle: { color: colors.ink, fontSize: 23, fontWeight: '600', lineHeight: 31 }, body: { color: colors.muted, fontSize: 15, lineHeight: 24 }, small: { color: colors.muted, fontSize: 12, lineHeight: 20 },
  button: { minHeight: 40, backgroundColor: colors.teal, paddingHorizontal: 19, paddingVertical: 10, borderRadius: 4, justifyContent: 'center', alignItems: 'center', alignSelf: 'flex-start' }, buttonText: { fontSize: 14, fontWeight: '600', color: 'white' }, secondary: { backgroundColor: colors.pale },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12, justifyContent: 'space-between' }, tag: { borderRadius: 30, backgroundColor: colors.pale, paddingHorizontal: 12, paddingVertical: 7, alignSelf: 'flex-start' }, tagText: { fontSize: 11, color: colors.teal, fontWeight: '600' },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 14 }, number: { color: '#D0DAB9', fontSize: 16, backgroundColor: '#31554F', width: 32, height: 32, textAlign: 'center', lineHeight: 32, borderRadius: 16 }, featureText: { color: 'white', flex: 1, fontSize: 15, lineHeight: 23 },
  pageHeading: { gap: 12, paddingTop: 16 }, title: { fontSize: 34, lineHeight: 43, fontWeight: '700', color: colors.ink, letterSpacing: -0.8 }, tabs: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' }, tab: { paddingVertical: 12, paddingHorizontal: 22, borderRadius: 10 }, activeTab: { backgroundColor: colors.ink }, tabText: { color: colors.muted, fontSize: 14, fontWeight: '600' }, stat: { color: colors.ink, fontWeight: '700', fontSize: 36 }, sectionTitle: { color: colors.ink, fontSize: 20, fontWeight: '600', lineHeight: 28 },
  rosterRow: { flexDirection: 'row', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.line, gap: 12, alignItems: 'center' }, idText: { color: colors.ink, fontSize: 13, fontWeight: '600' },
  studentLayout: { gap: 32, paddingVertical: 24 }, label: { color: colors.ink, fontSize: 13, fontWeight: '600' }, input: { borderWidth: 1, borderColor: '#CDD6DE', borderRadius: 10, padding: 14, minHeight: 50, fontSize: 16, color: colors.ink, backgroundColor: '#FFFFFF' }, error: { color: '#A13624', fontSize: 14, lineHeight: 22 },
  instituteBrand: { backgroundColor: '#FFFFFF', padding: 0, borderRadius: 0, flexDirection:'row', alignItems:'center', gap: 10, maxWidth: '100%', alignSelf: 'flex-start' },
  instituteCaption: { color: colors.muted, fontSize: 12, lineHeight: 19, fontWeight: '600' },
  instituteLogo: { width: 170, height: 50, maxWidth: '100%' },
  footer: { borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 22, marginTop: 24, flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 },
});
