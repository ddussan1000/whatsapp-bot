import { useEffect, useState, type ReactElement } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { api } from "../lib/api";
import { queryClient } from "../lib/query-client";

export function AuthGuard({ children }: { children: ReactElement }) {
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const location = useLocation();

  useEffect(() => {
    let mounted = true;
    void supabase?.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
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
      supabase?.auth.onAuthStateChange(async (_event, session) => {
        setAuthenticated(Boolean(session));
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
  if (loading) return <p className="muted">Validando sesión...</p>;
  if (!authenticated)
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}
