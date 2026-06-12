# Auth Guard — Migración a INITIAL_SESSION

**Fecha:** 2026-06-05  
**Problema:** Usuarios se quedan colgados en "Validando sesión" indefinidamente.

## Causa raíz

`AuthGuard` llama `supabase.auth.getSession()` sin `.catch()` ni timeout. El SDK de Supabase v2 usa un lock interno — si hay dos llamadas concurrentes (`supabase.ts:34` + `AuthGuard:15`), la segunda espera a la primera. Si la red cuelga, ambas cuelgan → `setLoading(false)` nunca se llama.

## Solución

Usar el evento `INITIAL_SESSION` de `onAuthStateChange` como fuente de verdad única para el estado inicial de auth. Este evento siempre dispara (session en localStorage → sincrónico; token expirado → async post-refresh), elimina la doble llamada a `getSession()`, y el lock duplicado.

## Cambios

### `dashboard/src/components/AuthGuard.tsx`

- Eliminar `supabase?.auth.getSession()` del `useEffect`
- Manejar `INITIAL_SESSION` dentro del listener `onAuthStateChange` existente
- El handler de `INITIAL_SESSION` ejecuta lo mismo que hacía el `.then()` del `getSession()`: `updateCachedSession`, `setAuthenticated`, prefetch de `["auth", "session"]`, `setLoading(false)`
- Agregar timeout de 8 segundos con flag `resolved` — si `INITIAL_SESSION` nunca llega (red completamente muerta), fuerza `setLoading(false)` + `setAuthenticated(false)` → redirect a `/login`

### `dashboard/src/lib/supabase.ts`

- Eliminar el bloque `if (supabase) { void supabase.auth.getSession()... }` al final del archivo
- Ya no necesario: `INITIAL_SESSION` seed el cache en `AuthGuard` antes de cualquier API call

### `dashboard/src/lib/hooks.ts`

- En `useSessionQuery`: agregar `retry: false`
- `AuthGuard` ya hace prefetch antes de mostrar contenido → `AdminGuard` siempre tiene cache hit
- Evita 3 reintentos × 20s si backend está lento

### `dashboard/src/components/AdminGuard.tsx`

- Sin cambios de lógica — se beneficia del fix en `useSessionQuery`

## Comportamiento por escenario

| Escenario | Antes | Después |
|-----------|-------|---------|
| Token en localStorage, sin refresh | ~200ms | <50ms (sync) |
| Token expirado, refresh necesario | Cuelga si red lenta | INITIAL_SESSION post-refresh |
| Red completamente muerta | Cuelga infinito | 8s → redirect /login |
| Backend caído (AdminGuard) | Hasta 60s loading | Falla rápido, redirect / |

## Sin cambios en

`api.ts`, `query-client.ts`, `AdminGuard.tsx` (lógica), `AppLayout.tsx`, toda lógica post-auth.
