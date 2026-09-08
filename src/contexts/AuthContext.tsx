import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from 'react';
import { clearDrafts } from '@/hooks/useDraftState';
import { captureError } from '@/lib/errorTelemetry';
import { supabase } from '@/lib/supabase';
import type { Session, User } from '@supabase/supabase-js';
import type { Profile, Location } from '@/types/database';

interface AuthState {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  locations: Location[];
  activeLocationId: string | null;
  isLoading: boolean;
  authError: string | null;
  retryAuth: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, meta: { first_name: string; last_name: string; role?: string }) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  setActiveLocation: (id: string | null) => void;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

// Dev-only UI preview: stubs auth so page chrome can be reviewed without signing in.
// Guarded by import.meta.env.DEV — dead-code-eliminated from production builds.
const UI_PREVIEW = import.meta.env.DEV && import.meta.env.VITE_UI_PREVIEW === '1';
const UI_PREVIEW_ROLE = import.meta.env.DEV && import.meta.env.VITE_UI_PREVIEW_ROLE === 'technician'
  ? 'technician'
  : 'owner_manager';
const PREVIEW_PROFILE = {
  id: '00000000-0000-0000-0000-00000000dead',
  org_id: '00000000-0000-0000-0000-000000000001',
  location_id: null,
  role: UI_PREVIEW_ROLE,
  first_name: 'Preview',
  last_name: 'User',
  email: 'preview@spas360.dev',
  phone: null,
  avatar_url: null,
  created_at: new Date().toISOString(),
} as unknown as Profile;
const PREVIEW_LOCATIONS = [
  { id: 'loc-minot', org_id: PREVIEW_PROFILE.org_id, name: 'Minot', address: null, phone: null, created_at: '' },
  { id: 'loc-bis', org_id: PREVIEW_PROFILE.org_id, name: 'Bismarck', address: null, phone: null, created_at: '' },
] as unknown as Location[];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(
    UI_PREVIEW ? ({ user: { id: PREVIEW_PROFILE.id } } as unknown as Session) : null
  );
  const [profile, setProfile] = useState<Profile | null>(UI_PREVIEW ? PREVIEW_PROFILE : null);
  const [locations, setLocations] = useState<Location[]>(UI_PREVIEW ? PREVIEW_LOCATIONS : []);
  const [activeLocationId, setActiveLocationId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(!UI_PREVIEW);
  const [authError, setAuthError] = useState<string | null>(null);
  const currentUser = useRef<string | null>(null);
  const loadedUser = useRef<string | null>(null);
  const loadSequence = useRef(0);

  // Fetch profile + locations for authenticated user
  const fetchProfile = useCallback(async (userId: string) => {
    const sequence = ++loadSequence.current;
    try {
    const [profileRes, locRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).abortSignal(AbortSignal.timeout(12_000)).single(),
      supabase.from('locations').select('*').order('name').abortSignal(AbortSignal.timeout(12_000)),
    ]);
    if (sequence !== loadSequence.current || currentUser.current !== userId) return;
    if (profileRes.error || !profileRes.data || locRes.error) throw new Error(profileRes.error?.message || locRes.error?.message || 'Staff profile unavailable');
    if (profileRes.data) {
      setProfile(profileRes.data);
      if (loadedUser.current !== userId) setActiveLocationId(profileRes.data.location_id);
      loadedUser.current = userId;
    }
    if (locRes.data) {
      setLocations(locRes.data);
    }
    setAuthError(null);
    } catch (error) {
      if (sequence !== loadSequence.current || currentUser.current !== userId) return;
      captureError(error, 'auth.profile');
      setAuthError('Your staff access could not refresh. Check your connection and retry. Your open work has been kept.');
    } finally {
      if (sequence === loadSequence.current) setIsLoading(false);
    }
  }, []);

  const retryAuth = useCallback(async () => {
    if (currentUser.current) await fetchProfile(currentUser.current);
    else window.location.reload();
  }, [fetchProfile]);

  useEffect(() => {
    if (UI_PREVIEW) return; // dev preview: keep the stubbed session
    // Get initial session
    let disposed = false;
    const timeout = setTimeout(() => {
      if (!disposed) { setIsLoading(false); setAuthError('Sign-in is taking longer than expected. Reconnect and retry.'); }
    }, 15_000);
    supabase.auth.getSession().then(({ data: { session: s }, error }) => {
      if (disposed) return;
      clearTimeout(timeout);
      if (error) { setAuthError('Your session could not load. Reconnect and retry.'); setIsLoading(false); return; }
      currentUser.current = s?.user.id ?? null;
      setSession(s);
      if (s?.user) {
        fetchProfile(s.user.id).finally(() => setIsLoading(false));
      } else {
        setIsLoading(false);
      }
    }).catch(() => { if (!disposed) { clearTimeout(timeout); setIsLoading(false); setAuthError('Your session could not load. Reconnect and retry.'); } });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      currentUser.current = s?.user.id ?? null;
      setSession(s);
      if (s?.user) {
        fetchProfile(s.user.id);
      } else {
        loadSequence.current += 1;
        loadedUser.current = null;
        clearDrafts();
        setProfile(null);
        setLocations([]);
        setActiveLocationId(null);
      }
    });

    return () => { disposed = true; clearTimeout(timeout); loadSequence.current += 1; subscription.unsubscribe(); };
  }, [fetchProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }, []);

  const signUp = useCallback(async (
    email: string,
    password: string,
    meta: { first_name: string; last_name: string; role?: string }
  ) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: meta },
    });
    return { error: error?.message ?? null };
  }, []);

  const signOut = useCallback(async () => {
    void Promise.resolve(supabase.rpc('record_app_activity', {
      p_event_type: 'session_ended',
      p_label: 'Signed out of SPAS 360',
      p_source: 'SPAS 360',
    })).catch(() => undefined);
    await supabase.auth.signOut();
    clearDrafts();
    setSession(null);
    setProfile(null);
  }, []);

  const setActiveLocation = useCallback((id: string | null) => {
    setActiveLocationId(id);
  }, []);

  return (
    <AuthContext.Provider value={{
      session,
      user: session?.user ?? null,
      profile,
      locations,
      activeLocationId,
      isLoading,
      authError,
      retryAuth,
      signIn,
      signUp,
      signOut,
      setActiveLocation,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
