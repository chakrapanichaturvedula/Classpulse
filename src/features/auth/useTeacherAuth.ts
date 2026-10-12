import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';

export type TeacherProfile = { id: string; full_name: string };
export function useTeacherAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<TeacherProfile | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [profileError, setProfileError] = useState('');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    let eventReceived = false;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => {
      // Keep this callback synchronous to avoid SDK auth-lock deadlocks.
      eventReceived = true;
      if (active) { setSession(next); setLoading(false); }
    });
    supabase.auth.getSession().then(({ data, error }) => {
      if (active && !eventReceived) {
        setSession(data.session);
        setLoading(false);
        if (error) setProfileError('Could not restore your sign-in. Please try again.');
      }
    }).catch(() => { if (active) { setLoading(false); setProfileError('Could not reach the sign-in service.'); } });
    const stateListener = Platform.OS !== 'web' ? AppState.addEventListener('change', state => {
      if (state === 'active') supabase!.auth.startAutoRefresh();
      else supabase!.auth.stopAutoRefresh();
    }) : null;
    return () => { active = false; subscription.unsubscribe(); stateListener?.remove(); };
  }, []);

  useEffect(() => {
    setProfile(null);
    if (!supabase || !session) return;
    let active = true;
    setLoading(true); setProfileError('');
    async function loadProfile() {
      try {
        const { data: { user }, error: userError } = await supabase!.auth.getUser();
        if (userError || !user || user.is_anonymous || !user.email_confirmed_at || user.id !== session!.user.id) {
          throw new Error('Your teacher account could not be verified. Sign out and sign in again.');
        }
        const { data, error } = await supabase!.from('users').select('id, full_name').eq('id', user.id).single();
        if (error || !data) throw new Error('Your teacher profile is not available. Check that the Classpulse database setup has been applied, then retry.');
        if (active) setProfile(data);
      } catch (error) {
        if (active) setProfileError(error instanceof Error ? error.message : 'Could not load your workspace.');
      } finally { if (active) setLoading(false); }
    }
    void loadProfile();
    return () => { active = false; };
  }, [session?.access_token, retry]);

  return { session, profile, loading, profileError, retryProfile: () => setRetry(value => value + 1) };
}
