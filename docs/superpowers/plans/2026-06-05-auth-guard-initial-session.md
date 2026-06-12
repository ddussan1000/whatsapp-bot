# Auth Guard — Migración a INITIAL_SESSION

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminar el cuelgue infinito en "Validando sesión" reemplazando `getSession()` con el evento `INITIAL_SESSION` de `onAuthStateChange` y añadiendo timeout de 8s.

**Architecture:** `AuthGuard` suscribe a `onAuthStateChange` y maneja `INITIAL_SESSION` como fuente de verdad única del estado inicial de auth. Timeout de 8s como fallback. Se elimina la llamada duplicada a `getSession()` en `supabase.ts`. Se añade `retry: false` a `useSessionQuery` para que `AdminGuard` falle rápido en vez de reintentar 3×20s.

**Tech Stack:** Supabase JS v2, React, TanStack Query v5, TypeScript, Bun.

---

## Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `dashboard/src/components/AuthGuard.tsx` | Reemplazar `getSession()` con `INITIAL_SESSION` + timeout |
| `dashboard/src/lib/supabase.ts` | Eliminar bloque `getSession()` al final |
| `dashboard/src/lib/hooks.ts` | Añadir `retry: false` a `useSessionQuery` |

---

### Task 1: Eliminar `getSession()` duplicado de `supabase.ts`

**Files:**
- Modify: `dashboard/src/lib/supabase.ts`

- [ ] **Step 1: Eliminar bloque getSession al final del archivo**

El archivo actual termina con (líneas 33-44):
```ts
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
```

Reemplazar el archivo completo con:
```ts
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
// Seeded by the INITIAL_SESSION event in AuthGuard before any API call is made.
let _cachedSession: Session | null = null;

export function getCachedSession(): Session | null {
  return _cachedSession;
}

export function updateCachedSession(session: Session | null): void {
  _cachedSession = session;
}
```

- [ ] **Step 2: Verificar que el archivo compiló sin errores**

```bash
cd /home/ddussan/Proyectos/AutomatizationProjects/whatsapp-bot/dashboard && bun run build 2>&1 | grep -E "error|Error" | head -20
```

Esperado: sin líneas con "error" relacionadas a `supabase.ts`.

---

### Task 2: Migrar `AuthGuard` a `INITIAL_SESSION`

**Files:**
- Modify: `dashboard/src/components/AuthGuard.tsx`

- [ ] **Step 1: Reemplazar AuthGuard.tsx completo**

```tsx
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
          // Mark resolved before any await so the timeout can't race.
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
              /* backend caído o token inválido — el usuario puede seguir navegando */
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
```

- [ ] **Step 2: Verificar build sin errores de AuthGuard**

```bash
cd /home/ddussan/Proyectos/AutomatizationProjects/whatsapp-bot/dashboard && bun run build 2>&1 | grep -E "error TS|AuthGuard" | head -20
```

Esperado: sin líneas de error.

---

### Task 3: Añadir `retry: false` a `useSessionQuery`

**Files:**
- Modify: `dashboard/src/lib/hooks.ts` (línea ~338)

- [ ] **Step 1: Localizar y modificar useSessionQuery**

Buscar en `hooks.ts`:
```ts
export function useSessionQuery() {
  return useQuery({ queryKey: ["auth", "session"], queryFn: api.getSession, staleTime: 5 * 60_000 });
}
```

Reemplazar con:
```ts
export function useSessionQuery() {
  return useQuery({
    queryKey: ["auth", "session"],
    queryFn: api.getSession,
    staleTime: 5 * 60_000,
    retry: false,
  });
}
```

**Por qué `retry: false`:** `AuthGuard` hace prefetch de `["auth", "session"]` antes de renderizar contenido protegido. Cuando `AdminGuard` monta, el query ya tiene datos en cache. Si el backend falla, `retry: false` hace que `isError` se active rápido (→ redirect a `/`) en vez de reintentar 3 veces × 20s = 60s de loading.

- [ ] **Step 2: Build completo final**

```bash
cd /home/ddussan/Proyectos/AutomatizationProjects/whatsapp-bot/dashboard && bun run build 2>&1
```

Esperado: `✓ built in X.XXs` sin líneas de error TypeScript.

---

### Task 4: Commit

- [ ] **Step 1: Commit de los tres cambios**

```bash
cd /home/ddussan/Proyectos/AutomatizationProjects/whatsapp-bot && git add dashboard/src/components/AuthGuard.tsx dashboard/src/lib/supabase.ts dashboard/src/lib/hooks.ts && git commit -m "$(cat <<'EOF'
fix(auth): replace getSession() with INITIAL_SESSION event to prevent infinite loading

- AuthGuard now uses onAuthStateChange INITIAL_SESSION as the sole source of
  truth for initial auth state, eliminating the SDK lock race between AuthGuard
  and the module-level getSession() call in supabase.ts
- 8-second timeout fallback unblocks the loading screen if the network is
  completely dead, redirecting to /login instead of hanging forever
- Remove the module-level getSession() seed call from supabase.ts — the
  INITIAL_SESSION event seeds the cache before any API call needs it
- Add retry: false to useSessionQuery so AdminGuard fails fast instead of
  retrying 3x20s when the backend is slow

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```
