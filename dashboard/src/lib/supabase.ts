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

// Seed the cache once at module load from localStorage (synchronous in
// supabase-js v2 when no token refresh is needed). This avoids a cold-start
// window between app mount and the first onAuthStateChange event.
if (supabase) {
  void supabase.auth.getSession()
    .then(({ data }) => {
      if (_cachedSession === null) {
        updateCachedSession(data.session);
      }
    })
    .catch(() => {
      // If getSession() fails at load time, onAuthStateChange will seed the
      // cache when the SDK recovers.
    });
}
