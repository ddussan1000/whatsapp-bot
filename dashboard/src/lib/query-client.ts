import { QueryClient } from "@tanstack/react-query";
import { getCachedSession } from "./supabase";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 120,
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

// On tab focus: recover queries that errored with 401 while the tab was hidden.
// TOKEN_REFRESHED in AuthGuard handles the refresh itself; we just need to check
// the cache here — no getSession() call, no lock.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  if (getCachedSession()) refetchAuthErrors();
});
