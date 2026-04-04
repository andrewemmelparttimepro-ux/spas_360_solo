import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local'
  );
}

// Using untyped client — row-level type safety is enforced through
// our interfaces in @/types/database.ts and explicit typing in hooks.
// For full Supabase type generation, run: npx supabase gen types typescript
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
