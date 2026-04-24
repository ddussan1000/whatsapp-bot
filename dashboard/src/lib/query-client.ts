import { QueryClient } from "@tanstack/react-query";
import { supabase } from "./supabase";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30,
      gcTime: 1000 * 60 * 5,
      refetchOnWindowFocus: false,
      retry: 1,
      // Don't retry on AbortError (timeout) — surface the error immediately
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10_000),
    },
    mutations: {
      retry: 0,
    },
  },
});

// Refresh the Supabase session when the tab becomes visible.
// Decoupled from React Query's focus refetch (refetchOnWindowFocus: false) so the
// token stays fresh without triggering a burst of API requests on every tab switch.
document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState !== "visible") return;
  if (supabase) {
    await supabase.auth.refreshSession().catch(() => {});
  }
});
