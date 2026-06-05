import { createClient, type Session } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storage: window.localStorage,
        },
      })
    : null;

// Module-level session cache. Kept fresh by onAuthStateChange (AuthGuard) and
// the 401 retry in api.ts. API calls read from here — no lock, no network call.
let _cachedSession: Session | null = null;

export function getCachedSession(): Session | null {
  return _cachedSession;
}

export function updateCachedSession(session: Session | null): void {
  _cachedSession = session;
}

// Cache is seeded by the INITIAL_SESSION event in AuthGuard before any API
// call needs it. No module-level getSession() call — avoids the SDK lock race.
