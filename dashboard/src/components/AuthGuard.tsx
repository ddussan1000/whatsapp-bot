import { useEffect, useState, type ReactElement } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { supabase, updateCachedSession } from "../lib/supabase";
import { api, setActiveOrgId } from "../lib/api";
import { queryClient } from "../lib/query-client";
import { SessionLoader } from "./SessionLoader";

export function AuthGuard({ children }: { children: ReactElement }) {
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const location = useLocation();

  useEffect(() => {
    let mounted = true;
    void supabase?.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      updateCachedSession(data.session);
      const ok = Boolean(data.session);
      setAuthenticated(ok);
      if (ok) {
        try {
          await queryClient.prefetchQuery({
            queryKey: ["auth", "session"],
            queryFn: api.getSession,
          });
        } catch {
          /* backend caído o token inválido */
        }
      }
      if (!mounted) return;
      setLoading(false);
    });
    const { data: listener } =
      supabase?.auth.onAuthStateChange(async (event, session) => {
        // Always keep the module-level cache in sync — this is the ONLY place
        // that updates it, making all API calls lock-free.
        // updateCachedSession above is the authoritative update point.
        // api.ts 401 retry also updates the cache as a secondary path.

        if (event === "SIGNED_OUT") {
          setActiveOrgId(null);
          setAuthenticated(false);
          return;
        }
        if (event === "TOKEN_REFRESHED" && session) {
          // Recover any queries that failed with 401 during the refresh window.
          void queryClient.invalidateQueries({ queryKey: ["supabase", "user"] });
          void queryClient.refetchQueries({
            predicate: (query) => {
              if (query.state.status !== "error") return false;
              const err = query.state.error as { status?: number } | null;
              return err?.status === 401;
            },
          });
          return;
        }
        if (session) {
          setAuthenticated(true);
        }
        if (event === "SIGNED_IN") {
          setActiveOrgId(null);
          queryClient.removeQueries({ queryKey: ["auth", "session"] });
        }
        if (session) {
          try {
            await queryClient.prefetchQuery({
              queryKey: ["auth", "session"],
              queryFn: api.getSession,
            });
          } catch {
            /* ignore */
          }
        }
      }) ?? {};

    return () => {
      mounted = false;
      listener?.subscription.unsubscribe();
    };
  }, []);

  if (!supabase) return children;
  if (loading) return <SessionLoader message="Validando sesión…" />;
  if (!authenticated)
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}
