# Dashboard

Frontend de administración para el bot con:

- React + Vite + TypeScript
- TanStack Query (cache, refetch, invalidaciones)
- Componentes estilo `shadcn/ui` (UI base en `src/components/ui`)
- Tipos de API generados desde OpenAPI

## Comandos

```bash
bun install
bun run dev
bun run build
```

## Generar tipos OpenAPI

Con backend corriendo en `http://localhost:3000`:

```bash
bun run generate:api
```

Genera `src/lib/__gen__/api_v1.d.ts`.

## Variables de entorno

```bash
VITE_API_URL=http://localhost:3000
VITE_DASHBOARD_TOKEN=...
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

`/login` quedó preparado como base para Supabase Auth con Google (siguiente paso).
