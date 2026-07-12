import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
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
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, meta: { first_name: string; last_name: string; role?: string }) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  setActiveLocation: (id: string | null) => void;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

// Dev-only UI preview: stubs auth so page chrome can be reviewed without signing in.
// Guarded by import.meta.env.DEV — dead-code-eliminated from production builds.
const UI_PREVIEW = import.meta.env.DEV && import.meta.env.VITE_UI_PREVIEW === '1';
const PREVIEW_PROFILE = {
  id: '00000000-0000-0000-0000-00000000dead',
  org_id: '00000000-0000-0000-0000-000000000001',
  location_id: null,
  role: 'owner_manager',
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

  // Fetch profile + locations for authenticated user
  const fetchProfile = useCallback(async (userId: string) => {
    const [profileRes, locRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).single(),
      supabase.from('locations').select('*').order('name'),
    ]);

    if (profileRes.data) {
      setProfile(profileRes.data);
      setActiveLocationId(profileRes.data.location_id);
    }
    if (locRes.data) {
      setLocations(locRes.data);
    }
  }, []);

  useEffect(() => {
    if (UI_PREVIEW) return; // dev preview: keep the stubbed session
    // Get initial session
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      if (s?.user) {
        fetchProfile(s.user.id).finally(() => setIsLoading(false));
      } else {
        setIsLoading(false);
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s?.user) {
        fetchProfile(s.user.id);
      } else {
        setProfile(null);
        setLocations([]);
        setActiveLocationId(null);
      }
    });

    return () => subscription.unsubscribe();
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
    await supabase.rpc('record_app_activity', {
      p_event_type: 'session_ended',
      p_label: 'Signed out of SPAS 360',
      p_source: 'SPAS 360',
    });
    await supabase.auth.signOut();
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
