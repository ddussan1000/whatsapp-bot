import { QueryClient } from "@tanstack/react-query";
import { supabase } from "./supabase";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30,
      gcTime: 1000 * 60 * 5,
      refetchOnWindowFocus: false,
      retry: (failureCount, error: unknown) => {
        // Never retry auth errors — they resolve via token refresh, not retries
        const status = (error as { status?: number })?.status;
        if (status === 401 || status === 403) return false;
        return failureCount < 2;
      },
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10_000),
    },
    mutations: {
      retry: 0,
    },
  },
});

function refetchAuthErrors() {
  queryClient.refetchQueries({
    predicate: (query) => {
      if (query.state.status !== "error") return false;
      const status = (query.state.error as { status?: number })?.status;
      return status === 401;
    },
  });
}

// Refresh the Supabase session when the tab becomes visible, then recover any
// queries that failed with 401 while the token was expired.
document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState !== "visible") return;
  if (supabase) {
    const { data } = await supabase.auth
      .refreshSession()
      .catch(() => ({ data: null }));
    if (data?.session) refetchAuthErrors();
  }
});
