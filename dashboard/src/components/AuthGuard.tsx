import { useEffect, useState, type ReactElement } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { supabase } from "../lib/supabase";

export function AuthGuard({ children }: { children: ReactElement }) {
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const location = useLocation();

  useEffect(() => {
    let mounted = true;
    void supabase?.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setAuthenticated(Boolean(data.session));
      setLoading(false);
    });
    const { data: listener } =
      supabase?.auth.onAuthStateChange((_event, session) =>
        setAuthenticated(Boolean(session))
      ) ?? {};
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
