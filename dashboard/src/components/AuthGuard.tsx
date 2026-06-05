import { useEffect, useState, type ReactElement } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { supabase, updateCachedSession } from "../lib/supabase";
import { api, setActiveOrgId } from "../lib/api";
import { queryClient } from "../lib/query-client";
import { SessionLoader } from "./SessionLoader";

const INITIAL_SESSION_TIMEOUT_MS = 8_000;

export function AuthGuard({ children }: { children: ReactElement }) {
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const location = useLocation();

  useEffect(() => {
    // supabase null = env vars missing, bypass auth entirely (render guard below)
    if (!supabase) return;

    let mounted = true;
    let resolved = false;

    // Fallback: if INITIAL_SESSION never fires (network completely dead),
    // unblock the loading screen after 8s and redirect to /login.
    const timeout = setTimeout(() => {
      if (mounted && !resolved) {
        resolved = true;
        setAuthenticated(false);
        setLoading(false);
      }
    }, INITIAL_SESSION_TIMEOUT_MS);

    const { data: listener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === "INITIAL_SESSION") {
          // Mark resolved before any await so the timeout cannot race.
          if (!resolved) {
            resolved = true;
            clearTimeout(timeout);
          }
          if (!mounted) return;
          updateCachedSession(session);
          const ok = Boolean(session);
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
          return;
        }

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
      },
    );

    return () => {
      mounted = false;
      clearTimeout(timeout);
      listener.subscription.unsubscribe();
    };
  }, []);

  if (!supabase) return children;
  if (loading) return <SessionLoader message="Validando sesión…" />;
  if (!authenticated)
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}
