import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { demoQuizzes, demoRoom, demoStudents } from './src/data/demo';
import { TeacherAuthScreen } from './src/features/auth/TeacherAuthScreen';
import { useTeacherAuth } from './src/features/auth/useTeacherAuth';
import { supabase } from './src/lib/supabase';
import { RosterManager } from './src/features/rosters/RosterManager';
import { QuizManager } from './src/features/quizzes/QuizManager';

type Page = 'home' | 'teacher' | 'student' | 'account';
type Tab = 'Overview' | 'Quizzes' | 'Roster';
type Student = typeof demoStudents[number];
const colors = { ink: '#193C38', muted: '#61736E', paper: '#F6F5EF', white: '#FFFFFF', line: '#DFE6DD', teal: '#256B5B', pale: '#EAF1E8', orange: '#B75432' };

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
  const [room, setRoom] = useState('');
  const [studentId, setStudentId] = useState('');
  const [error, setError] = useState('');
  const [joined, setJoined] = useState<Student | null>(null);
  const [preview, setPreview] = useState<number | null>(null);
  const auth = useTeacherAuth();
  const [workspaceTab, setWorkspaceTab] = useState<'classes' | 'quizzes'>('classes');
  const [quizDirty, setQuizDirty] = useState(false);
  const [quizEpoch, setQuizEpoch] = useState(0);
  const [pendingExit, setPendingExit] = useState<Page | 'classes' | 'signout' | null>(null);
  useEffect(() => { setQuizDirty(false); setPendingExit(null); }, [auth.profile?.id]);
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

  function navigate(next: Page) { if (quizDirty && next !== page) { setPendingExit(next); return; } setPage(next); setError(''); setJoined(null); setPreview(null); }
  function discardAndContinue() {
    const action = pendingExit; setPendingExit(null); setQuizDirty(false); setQuizEpoch(value => value + 1);
    if (action === 'signout') void signOut(true);
    else if (action === 'classes') setWorkspaceTab('classes');
    else if (action) { setPage(action); setError(''); setJoined(null); setPreview(null); }
  }
  function join() {
    const normalizedRoom = room.trim().toUpperCase();
    const normalizedId = studentId.trim().toUpperCase();
    if (!normalizedRoom || !normalizedId) { setError('Enter both a room name and your student ID.'); return; }
    const student = demoStudents.find(value => value.studentId === normalizedId);
    if (normalizedRoom !== demoRoom || !student) { setError('Those details do not match this sample room. Try DEMO101 and 25A2HP001.'); return; }
    setRoom(normalizedRoom); setStudentId(normalizedId); setError(''); setJoined(student!);
  }

  return <View style={s.root}>
    <StatusBar style="dark" />
    <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
      <View style={[s.container, { paddingHorizontal: wide ? 40 : 20 }]}>
        <View style={s.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="Classpulse home" onPress={() => navigate('home')} style={s.brand}>
            <View style={s.mark}><Text style={s.markText}>cp</Text></View>
            <Text style={s.brandText}>Classpulse<Text style={{ color: colors.orange }}>.</Text></Text>
          </Pressable>
          {page !== 'home' ? <Button title="Home" secondary onPress={() => navigate('home')} /> : <Tag>Made for your classroom</Tag>}
        </View>
        <View style={s.notice}><Text style={s.noticeText}>{supabase ? 'STEP 4 · Classes, quiz folders, and versioned quiz creation. Live sessions arrive later.' : 'STEP 4 · Teacher accounts need a Supabase connection. Sample classrooms remain fictional; live quizzes arrive later.'}</Text></View>

        {!!pendingExit && <Card style={{ gap: 14 }}><Text style={s.cardTitle}>You have unsaved quiz changes.</Text><Text style={s.body}>Cancel to return to the editor and save your draft, or discard those edits to continue.</Text><Button title="Cancel — keep editing" secondary onPress={() => setPendingExit(null)} /><Button title="Discard changes and continue" onPress={discardAndContinue} /></Card>}
        {page === 'account' && (auth.loading ? <Card><Text style={s.body}>Opening your workspace…</Text></Card> : auth.profile && auth.session && auth.profile.id === auth.session.user.id ? <>
          <View style={s.pageHeading}><Text style={s.eyebrow}>YOUR PRIVATE TEACHER WORKSPACE</Text><Text accessibilityRole="header" style={s.title}>Welcome, {auth.profile.full_name}.</Text><Text style={s.body}>{auth.session.user.email}</Text></View>
          <View style={s.wrap}><Button title="My classes" secondary={workspaceTab !== 'classes'} onPress={() => { if (quizDirty) setPendingExit('classes'); else setWorkspaceTab('classes'); }} /><Button title="My quizzes" secondary={workspaceTab !== 'quizzes'} onPress={() => setWorkspaceTab('quizzes')} /></View>
          <View style={{ display: workspaceTab === 'classes' ? 'flex' : 'none' }}><RosterManager key={auth.profile.id} teacherId={auth.profile.id} /></View>
          <View style={{ display: workspaceTab === 'quizzes' ? 'flex' : 'none' }}><QuizManager key={`${auth.profile.id}-${quizEpoch}`} teacherId={auth.profile.id} onDirtyChange={setQuizDirty} /></View>
          {!!signOutError && <Text accessibilityRole="alert" style={s.error}>{signOutError}</Text>}
          <Button title={signingOut ? 'Signing out…' : 'Sign out'} secondary onPress={() => void signOut()} />
        </> : auth.session ? <Card style={{ gap: 16 }}><Text style={s.cardTitle}>We could not open your workspace.</Text><Text accessibilityRole="alert" style={s.body}>{auth.profileError || 'Your teacher profile has not been verified.'}</Text><Button title="Retry workspace" onPress={auth.retryProfile} /><Button title={signingOut ? 'Signing out…' : 'Sign out'} secondary onPress={() => void signOut()} />{!!signOutError && <Text accessibilityRole="alert" style={s.error}>{signOutError}</Text>}</Card> : <TeacherAuthScreen onPreview={() => navigate('teacher')} />)}

        {page === 'home' && <>
          <View style={[s.hero, wide && { flexDirection: 'row', alignItems: 'center' }]}>
            <View style={{ flex: 1, gap: 22 }}>
              <Text style={s.eyebrow}>A LITTLE CHECK-IN. A LOT OF CLARITY.</Text>
              <Text accessibilityRole="header" style={[s.heroTitle, { fontSize: wide ? 58 : 40 }]}>Know where your{wide ? '\n' : ' '}class stands.</Text>
              <Text style={s.heroBody}>Bring every student into the conversation. A simple space for classroom quizzes, quick polls, and thoughtful feedback.</Text>
              <View style={s.wrap}><Tag>Up to 150 students per class</Tag><Tag>Phone-friendly access</Tag></View>
            </View>
            <Card style={{ flex: 1, gap: 20, backgroundColor: colors.ink, borderColor: colors.ink, padding: 30 }}>
              <Text style={[s.eyebrow, { color: '#B7CABC' }]}>YOUR CLASSROOM, AT A GLANCE</Text>
              <Text style={{ fontSize: 27, fontWeight: '600', color: 'white' }}>Small questions. Better teaching.</Text>
              {['Create a quiz around your lesson', 'Let students join with their ID', 'See understanding as it happens'].map((item, index) => <View key={item} style={s.featureRow}><Text style={s.number}>{index + 1}</Text><Text style={s.featureText}>{item}</Text></View>)}
              <Text style={{ color: '#B7CABC', lineHeight: 21 }}>We’re building this together, one tested step at a time.</Text>
            </Card>
          </View>
          <View style={[s.columns, wide && { flexDirection: 'row' }]}>
            <Card style={{ flex: 1, gap: 16 }}><Text style={s.eyebrow}>FOR TEACHERS</Text><Text accessibilityRole="header" style={s.cardTitle}>Your teaching workspace</Text><Text style={s.body}>Sign in to your own workspace, or explore the sample dashboard from the sign-in screen.</Text><Button title={auth.profile ? 'Open my workspace →' : 'Teacher sign in →'} onPress={() => navigate('account')} /></Card>
            <Card style={{ flex: 1, gap: 16 }}><Text style={s.eyebrow}>FOR STUDENTS</Text><Text accessibilityRole="header" style={s.cardTitle}>A quick way into class</Text><Text style={s.body}>Try entering a room with a student ID. No student password to remember.</Text><Button title="Open student entry →" secondary onPress={() => navigate('student')} /></Card>
          </View>
        </>}

        {page === 'teacher' && <>
          <View style={s.pageHeading}><Text style={s.eyebrow}>TEACHER WORKSPACE · SAMPLE</Text><Text accessibilityRole="header" style={s.title}>Welcome to your classroom.</Text><Text style={s.body}>A quiet place to prepare, check understanding, and follow up.</Text></View>
          <View style={s.tabs}>{(['Overview', 'Quizzes', 'Roster'] as Tab[]).map(item => <Pressable key={item} accessibilityRole="tab" accessibilityState={{ selected: tab === item }} onPress={() => { setTab(item); setPreview(null); }} style={[s.tab, tab === item && s.activeTab]}><Text style={[s.tabText, tab === item && { color: 'white' }]}>{item}</Text></Pressable>)}</View>
          {tab === 'Overview' && <>
            <View style={[s.columns, wide && { flexDirection: 'row' }]}>{[['3', 'Sample quizzes'], ['3', 'Fictional students'], ['150', 'Planned class limit']].map(([value, label]) => <Card key={label} style={{ flex: 1, gap: 8 }}><Text style={s.stat}>{value}</Text><Text style={s.body}>{label}</Text></Card>)}</View>
            <View style={[s.columns, wide && { flexDirection: 'row' }]}>
              <Card style={{ flex: 1, gap: 17 }}><Tag>Sample room</Tag><Text style={s.cardTitle}>Your room: {demoRoom}</Text><Text style={s.body}>Students will enter your room name and their student ID. Live session controls arrive in a later step.</Text><Button title="Try student entry →" onPress={() => navigate('student')} /></Card>
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

        {page === 'student' && <View style={[s.studentLayout, wide && { flexDirection: 'row' }]}>
          <View style={{ flex: 1, gap: 20 }}><Text style={s.eyebrow}>STUDENT ENTRY</Text><Text accessibilityRole="header" style={s.title}>Come on in.</Text><Text style={s.heroBody}>Your teacher will share a room name. All you need is that name and your student ID.</Text><Card style={{ backgroundColor: colors.pale, gap: 12 }}><Text style={s.cardTitle}>Try a sample student</Text><Text style={s.body}>Room: {demoRoom}{'\n'}Student ID: 25A2HP001{'\n'}Full Name: Mira Devika Rao</Text><Button title="Fill sample details" secondary onPress={() => { setRoom(demoRoom); setStudentId('25A2HP001'); setError(''); setJoined(null); }} /></Card></View>
          <Card style={{ flex: 1, gap: 18 }}>
            {joined ? <>
              <Tag>Sample entry successful</Tag><Text accessibilityRole="header" style={s.cardTitle}>Welcome, {joined.fullName}.</Text><Text style={s.body}>Room {room} · {joined.studentId}</Text><View style={[s.notice, { padding: 24 }]}><Text style={s.sectionTitle}>You’re in the sample waiting room.</Text><Text style={s.body}>In the finished app, your teacher’s question will appear here. This preview does not connect to a teacher or verify a real roster.</Text></View><Button title="Back to student entry" secondary onPress={() => setJoined(null)} />
            </> : <>
              <Text style={s.cardTitle}>Join a room</Text><Text style={s.label}>Room name</Text><TextInput accessibilityLabel="Room name" style={s.input} placeholder="e.g. DEMO101" placeholderTextColor={colors.muted} value={room} onChangeText={value => { setRoom(value); setError(''); }} autoCapitalize="characters" autoCorrect={false} maxLength={32} returnKeyType="next" />
              <Text style={s.label}>Student ID</Text><TextInput accessibilityLabel="Student ID" style={s.input} placeholder="e.g. 25A2HP001" placeholderTextColor={colors.muted} value={studentId} onChangeText={value => { setStudentId(value); setError(''); }} autoCapitalize="characters" autoCorrect={false} maxLength={64} onSubmitEditing={join} returnKeyType="go" />
              {!!error && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={s.error}>{error}</Text>}
              <Button title="Enter sample room →" onPress={join} /><Text style={s.small}>Preview only. Student authentication comes in Step 5.</Text>
            </>}
          </Card>
        </View>}
        <View style={s.footer}><Text style={s.small}>Classpulse · More understanding, one question at a time.</Text><Text style={s.small}>Step 4 of 10</Text></View>
      </View>
    </ScrollView>
  </View>;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper }, scroll: { flexGrow: 1 },
  container: { width: '100%', maxWidth: 1180, alignSelf: 'center', paddingTop: 24, paddingBottom: 24, gap: 22 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, paddingBottom: 10 },
  brand: { flexDirection: 'row', gap: 10, alignItems: 'center' }, mark: { backgroundColor: colors.ink, borderRadius: 12, padding: 8, width: 42, height: 42, justifyContent: 'center', alignItems: 'center' }, markText: { color: '#FFFFFF', fontWeight: '700', fontSize: 20 }, brandText: { color: colors.ink, fontSize: 26, fontWeight: '700' },
  notice: { backgroundColor: colors.pale, padding: 15, borderRadius: 12, gap: 12 }, noticeText: { color: colors.ink, fontSize: 12, lineHeight: 20, fontWeight: '600' },
  hero: { gap: 38, paddingVertical: 32 }, heroTitle: { color: colors.ink, fontWeight: '700', letterSpacing: -1.8, lineHeight: undefined }, heroBody: { color: colors.muted, fontSize: 18, lineHeight: 28, maxWidth: 470 },
  eyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 1.6, color: colors.teal, lineHeight: 18 },
  columns: { gap: 20 }, card: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 20, padding: 24 },
  cardTitle: { color: colors.ink, fontSize: 23, fontWeight: '600', lineHeight: 31 }, body: { color: colors.muted, fontSize: 15, lineHeight: 24 }, small: { color: colors.muted, fontSize: 12, lineHeight: 20 },
  button: { minHeight: 46, backgroundColor: colors.teal, paddingHorizontal: 19, paddingVertical: 13, borderRadius: 10, justifyContent: 'center', alignItems: 'center', alignSelf: 'flex-start' }, buttonText: { fontSize: 14, fontWeight: '600', color: 'white' }, secondary: { backgroundColor: colors.pale },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12, justifyContent: 'space-between' }, tag: { borderRadius: 30, backgroundColor: colors.pale, paddingHorizontal: 12, paddingVertical: 7, alignSelf: 'flex-start' }, tagText: { fontSize: 11, color: colors.teal, fontWeight: '600' },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 14 }, number: { color: '#D0DAB9', fontSize: 16, backgroundColor: '#31554F', width: 32, height: 32, textAlign: 'center', lineHeight: 32, borderRadius: 16 }, featureText: { color: 'white', flex: 1, fontSize: 15, lineHeight: 23 },
  pageHeading: { gap: 12, paddingTop: 16 }, title: { fontSize: 34, lineHeight: 43, fontWeight: '700', color: colors.ink, letterSpacing: -0.8 }, tabs: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' }, tab: { paddingVertical: 12, paddingHorizontal: 22, borderRadius: 10 }, activeTab: { backgroundColor: colors.ink }, tabText: { color: colors.muted, fontSize: 14, fontWeight: '600' }, stat: { color: colors.ink, fontWeight: '700', fontSize: 36 }, sectionTitle: { color: colors.ink, fontSize: 20, fontWeight: '600', lineHeight: 28 },
  rosterRow: { flexDirection: 'row', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.line, gap: 12, alignItems: 'center' }, idText: { color: colors.ink, fontSize: 13, fontWeight: '600' },
  studentLayout: { gap: 32, paddingVertical: 24 }, label: { color: colors.ink, fontSize: 13, fontWeight: '600' }, input: { borderWidth: 1, borderColor: '#BBCAC0', borderRadius: 10, padding: 14, minHeight: 50, fontSize: 16, color: colors.ink, backgroundColor: '#FCFCF9' }, error: { color: '#A13624', fontSize: 14, lineHeight: 22 },
  footer: { borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 22, marginTop: 24, flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 },
});
