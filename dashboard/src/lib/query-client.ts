import { QueryClient, focusManager } from "@tanstack/react-query";
import { supabase } from "./supabase";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30,
      gcTime: 1000 * 60 * 5,
      refetchOnWindowFocus: true,
      retry: 1,
      // Don't retry on AbortError (timeout) — surface the error immediately
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10_000),
    },
    mutations: {
      retry: 0,
    },
  },
});

// Refresh the Supabase session BEFORE React Query fires window-focus refetches.
// Without this, queries race against Supabase's internal token refresh and get 401s
// when the user returns to a tab with a stale or expired access token.
focusManager.setEventListener((handleFocus) => {
  const onVisibilityChange = async () => {
    if (document.visibilityState !== "visible") return;
    if (supabase) {
      await supabase.auth.refreshSession().catch(() => {});
    }
    handleFocus(true);
  };

  const onWindowFocus = () => handleFocus(true);
  const onWindowBlur = () => handleFocus(false);

  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("focus", onWindowFocus);
  window.addEventListener("blur", onWindowBlur);

  return () => {
    document.removeEventListener("visibilitychange", onVisibilityChange);
    window.removeEventListener("focus", onWindowFocus);
    window.removeEventListener("blur", onWindowBlur);
  };
});
