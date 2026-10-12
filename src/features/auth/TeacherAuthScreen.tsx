import React, { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';

export function TeacherAuthScreen({ onPreview }: { onPreview: () => void }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  async function submit() {
    if (submitting.current) return;
    setError(''); setMessage('');
    if (!supabase) { setError('Teacher accounts are waiting for the Supabase connection.'); return; }
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) { setError('Enter a valid email address.'); return; }
    if (!password) { setError('Enter your password.'); return; }
    if (mode === 'signup' && !name.trim()) { setError('Enter your full name.'); return; }
    if (mode === 'signup' && password.length < 12) { setError('Choose a password with at least 12 characters.'); return; }
    if (mode === 'signup' && password !== confirmation) { setError('The two passwords do not match.'); return; }
    submitting.current = true; setBusy(true);
    try {
      if (mode === 'login') {
        const { error: authError } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
        if (authError) {
          setError(authError.code === 'email_not_confirmed' ? 'Please confirm your email before signing in.' : 'Could not sign in. Check your details and connection, then try again.');
        } else { setPassword(''); setConfirmation(''); }
      } else {
        const { error: authError } = await supabase.auth.signUp({
          email: normalizedEmail, password,
          options: { data: { full_name: name.trim() }, emailRedirectTo: 'http://localhost:8081' },
        });
        if (authError) {
          setError(authError.status === 429 ? 'Too many attempts. Please wait before trying again.' : 'Could not create the account. Check your details, connection, and email service setup.');
        } else {
          setPassword(''); setConfirmation('');
          setMessage('If this address can be registered, check your email for a confirmation link. After confirming, return here and sign in.');
        }
      }
    } catch { setError('Could not reach the sign-in service. Please try again.'); }
    finally { submitting.current = false; setBusy(false); }
  }
  return <View style={s.panel}>
    <Text style={s.eyebrow}>YOUR TEACHING WORKSPACE</Text>
    <Text accessibilityRole="header" style={s.title}>{mode === 'login' ? 'Welcome back.' : 'Make room for your classes.'}</Text>
    <Text style={s.body}>Your account will keep your named classes, quiz folders, and results together.</Text>
    {!isSupabaseConfigured && <View style={s.notice}><Text style={s.body}>Teacher accounts are not connected yet. We’re setting up Supabase before you can create an account or sign in.</Text></View>}
    <View style={s.row}>{(['login', 'signup'] as const).map(value => <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: mode === value, disabled: busy }} disabled={busy} onPress={() => { setMode(value); setError(''); setMessage(''); setPassword(''); setConfirmation(''); }} style={[s.tab, mode === value && s.activeTab]}><Text style={{ color: mode === value ? '#FFFFFF' : '#263B4B', fontWeight: '600' }}>{value === 'login' ? 'Sign in' : 'Create account'}</Text></Pressable>)}</View>
    {mode === 'signup' && <><Text style={s.label}>Full Name</Text><TextInput accessibilityLabel="Teacher full name" style={s.input} value={name} onChangeText={setName} placeholder="Your full name" placeholderTextColor="#667582" autoComplete="name" maxLength={200} editable={!busy} /></>}
    <Text style={s.label}>Email</Text><TextInput accessibilityLabel="Teacher email" style={s.input} value={email} onChangeText={setEmail} placeholder="you@college.edu" placeholderTextColor="#667582" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" maxLength={254} editable={!busy} />
    <Text style={s.label}>Password</Text><TextInput accessibilityLabel="Teacher password" style={s.input} value={password} onChangeText={setPassword} placeholder={mode === 'signup' ? 'At least 12 characters' : 'Your password'} placeholderTextColor="#667582" secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} editable={!busy} onSubmitEditing={() => { if (mode === 'login') void submit(); }} />
    {mode === 'signup' && <><Text style={s.label}>Confirm password</Text><TextInput accessibilityLabel="Confirm teacher password" style={s.input} value={confirmation} onChangeText={setConfirmation} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete="new-password" editable={!busy} onSubmitEditing={() => void submit()} /></>}
    {!!error && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={s.error}>{error}</Text>}
    {!!message && <Text accessibilityLiveRegion="polite" style={s.body}>{message}</Text>}
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy || !isSupabaseConfigured }} disabled={busy || !isSupabaseConfigured} onPress={() => void submit()} style={[s.button, (busy || !isSupabaseConfigured) && { opacity: 0.45 }]}><Text style={s.buttonText}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in to your workspace' : 'Create teacher account'}</Text></Pressable>
    <Text style={s.small}>Students use the separate room entry screen. They do not need teacher accounts.</Text>
    <Pressable accessibilityRole="button" disabled={busy} onPress={onPreview}><Text style={s.link}>Explore the sample dashboard instead →</Text></Pressable>
  </View>;
}
const s = StyleSheet.create({
  panel: { maxWidth: 600, width: '100%', alignSelf: 'center', gap: 15, padding: 24, backgroundColor: 'white', borderWidth: 1, borderColor: '#E4E9EE', borderRadius: 20 },
  eyebrow: { color: '#0088B0', fontWeight: '700', fontSize: 11, letterSpacing: 1.4 }, title: { color: '#263B4B', fontSize: 30, fontWeight: '700' }, body: { color: '#667582', fontSize: 15, lineHeight: 24 }, small: { color: '#667582', fontSize: 12, lineHeight: 20 },
  notice: { backgroundColor: '#F0F7FA', padding: 15, borderRadius: 12 }, row: { flexDirection: 'row', gap: 12 }, tab: { padding: 12, borderRadius: 10 }, activeTab: { backgroundColor: '#263B4B' }, label: { color: '#263B4B', fontSize: 13, fontWeight: '600' }, input: { borderWidth: 1, borderColor: '#CDD6DE', borderRadius: 10, padding: 14, minHeight: 50, fontSize: 16, color: '#263B4B' }, button: { minHeight: 46, backgroundColor: '#0088B0', padding: 14, borderRadius: 10, alignItems: 'center' }, buttonText: { color: 'white', fontWeight: '600' }, error: { color: '#A13624', lineHeight: 22 }, link: { color: '#0088B0', fontWeight: '600', lineHeight: 24 },
});
