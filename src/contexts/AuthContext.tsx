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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [activeLocationId, setActiveLocationId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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
