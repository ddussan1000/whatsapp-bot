# Plan 008: Fix conversations filter responsiveness + stop auto-mark-read on select

> **Executor instructions**: Follow this plan step by step. Run every verification command and
> confirm the expected result before moving on. If anything in "STOP conditions" occurs, stop and
> report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**:
> ```
> git diff --stat 9e00888..HEAD -- dashboard/src/pages/ConversationsPage.tsx
> ```
> If it changed since `9e00888`, compare the "Current state" excerpts below against the live code; on
> a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW (frontend-only; two localized edits in one file)
- **Depends on**: 003 (DONE — the WhatsApp-Web master/detail layout that introduced the narrow sidebar)
- **Category**: bug / UX
- **Planned at**: commit `9e00888`, 2026-06-12

## Why this matters

Two issues on `/conversations` (the plan-003 two-pane layout), both confirmed by the user:

### Issue 1 — filters overlap on desktop

The filter controls live inside the master pane `<aside>`, which is full-width below `lg` but shrinks
to a fixed narrow column on desktop: `lg:w-[380px] xl:w-[420px]`
(`ConversationsPage.tsx:361-365`). The filter grid, however, uses
`grid-cols-1 sm:grid-cols-2 lg:grid-cols-4` (`ConversationsPage.tsx:433`). Tailwind's `lg:` prefix is
**viewport**-based, not container-based: on a desktop viewport it forces **4 columns** into the
~380px sidebar, so the four controls cram and visually overlap. The grid breakpoints must follow the
**sidebar's** width, not the viewport — i.e. collapse back to a single column exactly where the aside
becomes narrow (`lg`).

### Issue 2 — selecting a conversation reorders the list (jarring jump)

`selectConversation` marks the conversation as read on **selection**
(`ConversationsPage.tsx:296-299`):

```tsx
function selectConversation(convId: string) {
  setParam("c", convId, false); // false = keep current page
  markRead.mutate(convId);
}
```

`useMarkConversationReadMutation` invalidates `["conversations"]` on success, triggering a refetch.
Marking read updates the conversation row, and the list (sorted by `updated_at` via the
`get_conversations_list` RPC) then re-renders with the just-touched conversation jumping to the top —
a brusque UI jump every time you open a chat.

Per the user's decision: **opening a chat should NOT auto-mark it read.** There is already an explicit
"marcar leído" button per row for that. Removing the auto-mark on select keeps the list order stable
when browsing; the order still updates normally when new messages arrive (real `updated_at` changes)
or when the user explicitly marks a chat read.

> Backend is intentionally untouched: the `POST /conversations/{id}/read` endpoint and the manual
> per-row mark-read button stay exactly as they are. This plan only stops the **implicit** mark-read
> that fires on selection.

## Current state

### `dashboard/src/pages/ConversationsPage.tsx`

The narrow sidebar (context — do NOT change):

```tsx
// ConversationsPage.tsx:359-366
<div className="flex h-full overflow-hidden">
  {/* Master list */}
  <aside
    className={[
      "h-full w-full shrink-0 overflow-y-auto border-r lg:w-[380px] xl:w-[420px]",
      ...
```

The filter grid to fix (Issue 1):

```tsx
// ConversationsPage.tsx:433
<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
```

The select handler to fix (Issue 2):

```tsx
// ConversationsPage.tsx:296-299
function selectConversation(convId: string) {
  setParam("c", convId, false); // false = keep current page
  markRead.mutate(convId);
}
```

The `markRead` mutation stays declared and is still used by the explicit per-row button (do NOT remove
the hook):

```tsx
// ConversationsPage.tsx:326
const markRead = useMarkConversationReadMutation();
```

```tsx
// ConversationsPage.tsx:~619-623 — manual mark-read button (KEEP exactly)
onClick={() => selectConversation(conv.id)}
...
markRead.mutate(conv.id);
```

### Convention to follow

- Shadcn + Tailwind. Edit only the two spots below; keep everything else byte-for-byte.
- Gate: `cd dashboard && bun run build` and `cd dashboard && bun run lint`.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Frontend build | `cd dashboard && bun run build` | exit 0 |
| Frontend lint | `cd dashboard && bun run lint` | exit 0 |

## Scope

**In scope** (modify): `dashboard/src/pages/ConversationsPage.tsx` only — the filter grid classes and
the `selectConversation` body.

**Out of scope** (do NOT touch):
- Any backend file, the `/conversations/{id}/read` endpoint, the `get_conversations_list` RPC/SQL.
- `useMarkConversationReadMutation` in `dashboard/src/lib/hooks.ts` (leave the hook as-is; it's still
  used by the explicit button).
- The aside width classes, the detail pane, pagination, search, or any other part of the page.
- `dashboard/src/lib/__gen__/api_v1.d.ts`.

## Git workflow

- Branch: `advisor/008-conversations-filters-and-read`
- Conventional commit (e.g. `fix(conversations): responsive filter grid and stop auto-mark-read on select`).
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1 — Make the filter grid follow the sidebar width (Issue 1)

At `ConversationsPage.tsx:433`, change the grid so it collapses back to a single column at `lg` (where
the aside becomes the narrow 380px column). Replace:

```tsx
<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
```

with:

```tsx
<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1">
```

Rationale: below `lg` the aside is full-width, so 1 column on phones and 2 columns on `sm`+ tablets is
fine; at `lg`+ the aside shrinks to ~380–420px, so the filters stack in a single column and never
overlap. (The controls are already `h-9` / `w-full` inside their grid cells, so single-column stacking
renders cleanly.)

### Step 2 — Don't auto-mark-read on selection (Issue 2)

At `ConversationsPage.tsx:296-299`, remove the `markRead.mutate(convId)` line so selecting a chat only
changes the URL selection (no read mutation, no refetch, no reorder):

```tsx
function selectConversation(convId: string) {
  setParam("c", convId, false); // false = keep current page
}
```

Leave the `markRead` hook declaration (line 326) and the explicit per-row mark-read button untouched —
they remain the intended way to mark a chat read.

**Verify** (after both steps):
- `cd dashboard && bun run build` → exit 0.
- `cd dashboard && bun run lint` → exit 0 (no "unused variable" for `markRead` — it is still used by
  the button).
- `grep -c "lg:grid-cols-4" dashboard/src/pages/ConversationsPage.tsx` → returns **0**.
- `grep -c "lg:grid-cols-1" dashboard/src/pages/ConversationsPage.tsx` → returns **1**.
- `grep -c "markRead.mutate" dashboard/src/pages/ConversationsPage.tsx` → returns **1** (only the
  explicit button remains; the auto-call in `selectConversation` is gone).

## Test plan

No automated harness (see `plans/README.md`). Manual smoke test (human):

1. `cd dashboard && bun run dev`, open `/conversations` on a desktop-width window.
2. Confirm the four filters (Buscar, Estado, Flujo, Anuncio Meta) stack cleanly in the narrow sidebar
   — no overlap, each full-width and readable.
3. Resize narrower (tablet) → filters become 2 columns; phone width → single column. No overlap at any
   size.
4. Click several conversations in turn → the list order **does not change** on selection (no jump to
   top). The selected row highlights and the detail pane opens as before.
5. Click a row's explicit "marcar leído" button → it still marks read (unread badge clears). Reordering
   here is acceptable/expected (explicit action).
6. Simulate/await a new inbound message → that conversation still moves up normally (real activity).

## Done criteria

ALL must hold:

- [ ] `cd dashboard && bun run build` exits 0.
- [ ] `cd dashboard && bun run lint` exits 0.
- [ ] `grep -c "lg:grid-cols-4" dashboard/src/pages/ConversationsPage.tsx` → `0`.
- [ ] `grep -c "lg:grid-cols-1" dashboard/src/pages/ConversationsPage.tsx` → `1`.
- [ ] `grep -c "markRead.mutate" dashboard/src/pages/ConversationsPage.tsx` → `1`.
- [ ] Only `dashboard/src/pages/ConversationsPage.tsx` modified (`git status`).
- [ ] `plans/README.md` status row updated (if `plans/` exists in your tree; if absent, skip and say
      so — do not create a new `plans/` tree).

## STOP conditions

Stop and report (do not improvise) if:

- The "Current state" excerpts don't match live code (drift since `9e00888`).
- Removing the auto `markRead.mutate(convId)` leaves `markRead` unused (lint error) — that would mean
  the explicit button was refactored away; report rather than deleting the hook.
- `bun run build`/`lint` fails twice after a reasonable fix.

## Maintenance notes

- The filter grid is now viewport-keyed to match the aside's `lg` width transition. If the aside width
  breakpoints ever change (e.g. a resizable sidebar), prefer Tailwind container queries (`@container`
  on the aside + `@[..]:grid-cols-*` on the grid) so the filters track the actual container width
  instead of the viewport.
- Read state is now driven solely by the explicit per-row button. If the product later wants
  "mark read on open" back, do it without reordering — e.g. mark read but keep the row's `updated_at`
  untouched (the list sorts by `updated_at`), or update the cache optimistically without an invalidate
  that re-sorts. There may also be an `updated_at` touch-on-any-update path (DB trigger) worth
  confirming before reintroducing auto-read.
```
