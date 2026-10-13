import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';

export type TeacherProfile = { id: string; full_name: string; is_admin?: boolean };
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
        const access=await supabase!.rpc('classpulse_access_status');
        if(access.error&&access.error.code!=='PGRST202')throw new Error('Could not check faculty approval. Please retry.');
        if(!access.error&&!access.data?.approved)throw new Error('Your email is not approved for teacher access. Contact the Classpulse administrator.');
        const { data, error } = await supabase!.from('users').select('id, full_name').eq('id', user.id).single();
        if (error || !data) throw new Error('Your teacher profile is not available. Check that the Classpulse database setup has been applied, then retry.');
        if (active) setProfile({...data,is_admin:!!access.data?.is_admin});
      } catch (error) {
        if (active) setProfileError(error instanceof Error ? error.message : 'Could not load your workspace.');
      } finally { if (active) setLoading(false); }
    }
    void loadProfile();
    return () => { active = false; };
  }, [session?.user.id, session?.user.email_confirmed_at, retry]);

  useEffect(()=>{
    if(!supabase||!session?.user.id)return;let active=true,busy=false;
    async function check(){if(busy)return;busy=true;try{const {data,error}=await supabase!.rpc('classpulse_access_status');if(active&&!error&&data?.approved===false){setProfile(null);setProfileError('Your faculty approval has been removed. Contact the Classpulse administrator.');}else if(active&&!error&&data?.approved)setProfile(current=>current?{...current,is_admin:!!data.is_admin}:current);}finally{busy=false;}}
    const timer=setInterval(()=>void check().catch(()=>{}),30000);
    const focus=()=>{void check().catch(()=>{});};
    if(Platform.OS==='web')window.addEventListener('focus',focus);
    const native=Platform.OS!=='web'?AppState.addEventListener('change',state=>{if(state==='active')focus();}):null;
    return()=>{active=false;clearInterval(timer);if(Platform.OS==='web')window.removeEventListener('focus',focus);native?.remove();};
  },[session?.user.id]);

  return { session, profile, loading, profileError, retryProfile: () => setRetry(value => value + 1) };
}
