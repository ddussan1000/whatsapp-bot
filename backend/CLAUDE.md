---
description: Backend-specific conventions for the WhatsApp bot API (Bun + Hono)
globs: "*.ts, package.json"
alwaysApply: false
---

Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun install` instead of `npm install` or `yarn`
- Use `bunx <package> <command>` instead of `npx`
- Bun automatically loads .env — no dotenv needed.

## Framework

This project uses **Hono** (not `Bun.serve` or Express directly).

- Routes are defined with `@hono/zod-openapi` — always use `createRoute` + Zod schemas.
- Validate inputs with `.valid("query")` / `.valid("json")` (never trust raw `c.req.query()`).
- All dashboard routes live in `src/api/dashboard.ts`. Register specific routes BEFORE parameterized ones (e.g. `/conversations/filters` before `/conversations/:id`).
- Multi-tenant: extract org ID with `orgId(c)` — every DB query must filter by it.

## Bun APIs to prefer

- `Bun.file` over `node:fs` readFile/writeFile
- `bun:sqlite` for SQLite (not used here, but prefer over better-sqlite3)
- `Bun.$\`cmd\`` instead of execa for shell commands

## Database

- Supabase client is in `src/db/supabase.ts` — import `supabase` from there.
- Migrations go in `scripts/sql/YYYYMMDD_description.sql` — run manually in Supabase Studio.
- RLS is enabled on all tables. Backend uses the service role key (bypasses RLS), but always include `organization_id` filters explicitly.

## Running

```bash
bun run dev   # starts with --watch
```

## Testing

```bash
bun test
```
