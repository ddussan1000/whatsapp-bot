# Plan 003: WhatsApp-Web-style master/detail layout for `/conversations`

> **Executor instructions**: Follow this plan step by step. Run every verification command and
> confirm the expected result before moving on. If anything in "STOP conditions" occurs, stop and
> report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 96c506d..HEAD -- dashboard/src/pages/ConversationsPage.tsx dashboard/src/pages/ConversationDetailPage.tsx dashboard/src/App.tsx dashboard/src/layout/AppLayout.tsx`
> If any changed since `96c506d`, compare the "Current state" excerpts against live code; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: MED (touches the two largest pages; layout/scroll behavior is fiddly). The approach is
  deliberately chosen to keep edits SMALL and avoid extracting code out of the 1727-line detail file.
- **Depends on**: none
- **Category**: direction (feature / UX)
- **Planned at**: commit `df009e2`, 2026-06-12 — baseline refreshed to `96c506d`, 2026-06-12 (in-scope files unchanged by plans 001/002; excerpts still valid)

## Why this matters

Today `/conversations` is a list; clicking a row **navigates away** to `/conversations/:id`, hiding
the list entirely. To see another chat you must hit Back and click again. The user wants a
**WhatsApp-Web layout**: list on the left, the selected chat on the right, both visible at once, so
switching chats is instant and context is preserved — without losing any current functionality
(filters, pagination, composer, media, flow trigger, stage edit, payments, info modal) or
performance.

**Approach (low-risk, chosen deliberately):** do NOT extract the detail logic out of the giant
`ConversationDetailPage`. Instead:
1. Make `ConversationDetailPage` accept an optional `conversationId` prop (falls back to the route
   param when absent) plus an `embedded`/`onBack` pair to adjust chrome — a ~6-line change.
2. Turn `ConversationsPage` into a two-pane shell: the existing list on the left, and an embedded
   `<ConversationDetailPage>` (or an empty state) on the right. Selection is stored in the URL as
   `?c=<id>`, coexisting with the existing filter params.
3. Keep the old `/conversations/:id` route working unchanged for deep links/bookmarks.

This preserves every feature for free (the detail component is reused whole) and is realistic for a
weaker executor: no large refactor, just a wrapper + prop plumbing.

## Current state

### AppLayout content slot (the height context the panes live in)

```tsx
// dashboard/src/layout/AppLayout.tsx:379-381
<div className="flex flex-1 flex-col min-h-0 overflow-x-hidden overflow-y-auto">
  <Outlet />
</div>
```

The page is rendered into this flex-column slot. `ConversationDetailPage` already fills it with
`<section className="flex h-full flex-col overflow-hidden">` (see below), so `h-full` works in this
slot and internal panes can scroll independently. The two-pane shell must do the same: a root that is
`flex h-full overflow-hidden`, with each pane scrolling internally — NOT relying on the outer
`overflow-y-auto`.

### Routes today

```tsx
// dashboard/src/App.tsx:99-103
<Route path="/conversations" element={<ConversationsPage />} />
<Route path="/conversations/:id" element={<ConversationDetailPage />} />
```

### List page — selection currently navigates away

```tsx
// dashboard/src/pages/ConversationsPage.tsx:227-229
export function ConversationsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
```

```ts
// ConversationsPage.tsx:273-287 — the param setter (note resetPage flag)
function setParam(key: string, value: string, resetPage = true) {
  setSearchParams((prev) => {
    const next = new URLSearchParams(prev);
    if (value && value !== "all" && value !== "desc") next.set(key, value);
    else next.delete(key);
    if (resetPage) next.delete("page");
    return next;
  }, { replace: true });
}
```

```tsx
// ConversationsPage.tsx:592-606 — the list; row click navigates today
<div className="flex flex-col gap-2">
  {items.map((conv) => (
    <ConversationRow
      key={conv.id}
      conv={conv}
      onClick={() => navigate(`/conversations/${conv.id}`)}     // <-- changes to in-page selection
      onMarkRead={(e) => { e.stopPropagation(); markRead.mutate(conv.id); }}
    />
  ))}
</div>
```

```tsx
// ConversationsPage.tsx:95-116 — ConversationRow signature + root (add a "selected" highlight here)
function ConversationRow({ conv, onClick, onMarkRead }: {
  conv: Conversation; onClick: () => void; onMarkRead: (e: React.MouseEvent) => void;
}) {
  ...
  return (
    <div role="button" tabIndex={0} onClick={onClick}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onClick()}
      className="flex w-full items-center gap-3 rounded-xl border bg-card px-4 py-3 text-left transition-all hover:bg-muted/40 hover:shadow-sm cursor-pointer">
```

The whole page returns one `<section className="flex flex-col gap-4 p-3 sm:gap-5 sm:p-6"> ... </section>`
(opens at line 347, closes at line 639) containing header (348-394), filters (396-553), list
(555-606), pagination (608-638).

### Detail page — reads id from the route, has a back button

```tsx
// dashboard/src/pages/ConversationDetailPage.tsx:1255-1257
export function ConversationDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
```

```tsx
// ConversationDetailPage.tsx:1427-1441 — returns a fragment; section fills height; back = navigate(-1)
return (
  <>
    <section className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-2 border-b bg-background px-4 py-3">
        <Button variant="ghost" size="icon-sm" onClick={() => navigate(-1)} className="shrink-0" aria-label="Volver">
          <ArrowLeft size={18} />
        </Button>
        ...
```

The detail component already resets its message state when `id` changes (effect at lines 1285-1297),
so swapping the `conversationId` prop refetches correctly without a manual remount. Everything else
(composer 1581-1621, info modal, flow trigger dialog, payments) is keyed off the same `id`/hooks and
needs **no change**.

### Convention to follow

- React Router v7 (`react-router-dom` ^7) with `useSearchParams` for URL state — the list already
  stores all filters in the URL; add `c` (selected conversation) the same way.
- Tailwind v4; breakpoints `sm` (640), `lg` (1024). There is **no** `Resizable` component and **no**
  `useMediaQuery` hook in the repo — use responsive Tailwind classes for the single-pane↔two-pane
  switch, not JS. Use `cn` from `@/lib/utils` for conditional classes (standard shadcn helper; verify
  it exists with `grep -rn "export function cn" dashboard/src/lib/utils.ts`).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Frontend typecheck + build | `cd dashboard && bun run build` | exit 0 |
| Frontend lint | `cd dashboard && bun run lint` | exit 0 |
| Confirm `cn` helper exists | `grep -rn "export function cn" dashboard/src/lib/utils.ts` | one match |

## Scope

**In scope** (modify):
- `dashboard/src/pages/ConversationDetailPage.tsx` — add optional props; conditionalize back button. (~6 lines)
- `dashboard/src/pages/ConversationsPage.tsx` — two-pane shell, `?c` selection, selected-row highlight.

**Out of scope** (do NOT touch):
- `dashboard/src/App.tsx` routing — keep BOTH routes (`/conversations` and `/conversations/:id`) as-is
  so existing deep links still work. (An optional redirect is described as a deferred enhancement.)
- The detail component's internals: message fetching/pagination, composer, media upload, info modal,
  flow trigger, payments, stage editing, `ChatBubble`, `parseContent`, `ClientInfoModal`. Reused whole.
- `dashboard/src/lib/hooks.ts`, `api.ts` — no data-layer change. The same hooks power both panes.
- `AppLayout.tsx` — the existing content slot already supports `h-full` panes.
- Do NOT add a realtime/polling mechanism — none exists today; preserving "current functionality"
  means keeping the manual Refresh button. (Noted as a deferred enhancement.)

## Git workflow

- Branch: `advisor/003-conversations-master-detail`
- Conventional commits (e.g. `feat(conversations): WhatsApp-Web master/detail layout`).
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Make `ConversationDetailPage` embeddable

In `dashboard/src/pages/ConversationDetailPage.tsx`, change the component signature (lines 1255-1257)
to accept optional props and derive `id` from the prop first, route param second:

```tsx
export function ConversationDetailPage({
  conversationId,
  embedded = false,
  onBack,
}: {
  conversationId?: string;
  embedded?: boolean;
  onBack?: () => void;
} = {}) {
  const params = useParams();
  const id = conversationId ?? params.id ?? "";
  const navigate = useNavigate();
```

Update the back button (lines 1433-1441) so that in embedded mode it calls `onBack` and is hidden on
desktop (where the list is already visible):

```tsx
<Button
  variant="ghost"
  size="icon-sm"
  onClick={embedded ? onBack : () => navigate(-1)}
  className={cn("shrink-0", embedded && "lg:hidden")}
  aria-label="Volver"
>
  <ArrowLeft size={18} />
</Button>
```

Add `cn` to the imports from `@/lib/utils` if not already imported (check the existing import block at
the top of the file; many pages already import `cn`).

**Verify**: `cd dashboard && bun run build` → exit 0 (the existing `/conversations/:id` route still
renders it with no props, so `conversationId` is undefined and it falls back to `params.id`).

### Step 2: Add `?c` selection + selected highlight to the list

In `dashboard/src/pages/ConversationsPage.tsx`:

1. Import the detail page and `cn` at the top:
   ```ts
   import { ConversationDetailPage } from "./ConversationDetailPage";
   import { cn } from "@/lib/utils";
   ```

2. Inside `ConversationsPage`, after the other param reads (around line 269), add:
   ```ts
   const selectedId = searchParams.get("c") ?? "";
   ```

3. Add a selection helper near `setParam` (after line 287). Selecting also marks the conversation read
   (WhatsApp-like) — reuse the existing `markRead` mutation:
   ```ts
   function selectConversation(convId: string) {
     setParam("c", convId, false); // false = keep current page
     markRead.mutate(convId);
   }
   ```

4. Change the row click (line 598) from `navigate(...)` to `selectConversation`, and pass a `selected`
   flag:
   ```tsx
   <ConversationRow
     key={conv.id}
     conv={conv}
     selected={conv.id === selectedId}
     onClick={() => selectConversation(conv.id)}
     onMarkRead={(e) => { e.stopPropagation(); markRead.mutate(conv.id); }}
   />
   ```

5. Extend `ConversationRow` (signature at lines 95-103) to accept `selected` and highlight when set.
   Add `selected?: boolean` to the prop type and merge a highlight class into the root `<div>` (line
   116) using `cn`:
   ```tsx
   function ConversationRow({ conv, onClick, onMarkRead, selected }: {
     conv: Conversation; onClick: () => void; onMarkRead: (e: React.MouseEvent) => void; selected?: boolean;
   }) {
     ...
     <div role="button" tabIndex={0} onClick={onClick}
       onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onClick()}
       className={cn(
         "flex w-full items-center gap-3 rounded-xl border bg-card px-4 py-3 text-left transition-all hover:bg-muted/40 hover:shadow-sm cursor-pointer",
         selected && "bg-muted ring-1 ring-primary/30",
       )}>
   ```

6. The `navigate` variable may now be unused in `ConversationsPage` — if `bun run lint` flags it,
   remove the `const navigate = useNavigate();` line (227-228) and its import if no longer used.

**Verify**: `cd dashboard && bun run build` → exit 0 (layout pane comes next; the page still renders
the single-column list at this point).

### Step 3: Wrap the page in the two-pane shell

In `ConversationsPage`, the component currently returns a single
`<section className="flex flex-col gap-4 p-3 sm:gap-5 sm:p-6"> ... </section>` (opens line 347, closes
line 639). Wrap it so the list becomes the LEFT pane and a detail/empty area becomes the RIGHT pane.

Replace the opening `return ( <section className="flex flex-col gap-4 p-3 sm:gap-5 sm:p-6"> ` with:

```tsx
return (
  <div className="flex h-full overflow-hidden">
    {/* ── Left: conversation list ── */}
    <aside
      className={cn(
        "h-full w-full shrink-0 overflow-y-auto border-r lg:w-[380px] xl:w-[420px]",
        selectedId ? "hidden lg:block" : "block",
      )}
    >
      <section className="flex flex-col gap-4 p-3 sm:gap-5 sm:p-6">
```

…keep ALL existing inner content (header, filters, list, pagination) unchanged…

…and replace the closing `</section> ) ; }` (lines 639-641) with:

```tsx
      </section>
    </aside>

    {/* ── Right: selected conversation ── */}
    <main
      className={cn(
        "h-full flex-1 overflow-hidden",
        selectedId ? "block" : "hidden lg:block",
      )}
    >
      {selectedId ? (
        <ConversationDetailPage
          key={selectedId}
          conversationId={selectedId}
          embedded
          onBack={() => setParam("c", "", false)}
        />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
          <MessagesSquare size={40} className="text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">
            Seleccioná una conversación para ver el chat
          </p>
        </div>
      )}
    </main>
  </div>
);
}
```

Notes:
- `key={selectedId}` forces a clean remount of the detail component when switching chats — the
  simplest way to guarantee no stale scroll position or message state leaks between conversations.
- `MessagesSquare` is already imported in this file (used by the empty-list state at line 574).
- Responsive behavior: below `lg`, exactly one pane shows — the list when nothing is selected, the
  detail when something is (the detail's back button, `lg:hidden` from Step 1, clears `?c`). At `lg`+,
  both panes show side by side; the back button is hidden and selecting a row just swaps the right pane.

**Verify**:
- `cd dashboard && bun run build` → exit 0.
- `cd dashboard && bun run lint` → exit 0.

### Step 4: Manual layout/behavior verification

Run the app and confirm the behaviors in the Test plan below. Pay special attention to height/scroll:
the list pane and the chat window must each scroll **independently**, and the page must NOT produce a
second outer scrollbar. If the whole page scrolls instead of the panes, the `h-full`/`overflow`
classes on the root/`aside`/`main` are wrong — fix before claiming done.

## Test plan

No automated test harness (see `plans/README.md`). Verification is typecheck + build + lint plus this
**manual smoke test** in a browser (desktop width ≥1024px unless noted):

1. `cd dashboard && bun run dev`, open `/conversations`.
2. Desktop: list on the left, "Seleccioná una conversación…" placeholder on the right.
3. Click a conversation → its chat appears on the right; the **list stays visible**; the row is
   highlighted. URL becomes `/conversations?c=<id>` (plus any active filters).
4. Click a different conversation → right pane swaps instantly; previous selection un-highlights.
5. In the right pane, confirm every feature still works: send a text message; open media picker;
   scroll up to load older messages; open the Info (ℹ) modal and edit stage / add a payment; trigger a
   flow (▶); stop a flow; Refresh (↻).
6. Apply a list filter (search/stage/flow/ad) and paginate — filters and `?c` coexist; the selected
   chat stays selected across pagination.
7. Reload the page with `?c=<id>` in the URL → the chat re-opens (deep-link/selection persists).
8. Narrow the window below 1024px: only one pane shows. With a chat open, the back arrow returns to the
   list (clears `?c`). With no chat open, only the list shows.
9. Visit `/conversations/<id>` directly (old deep link) → full-page detail still renders with a working
   back button (unchanged behavior).
10. Confirm independent scrolling: long list scrolls within the left pane; long chat scrolls within the
    right pane; no double/outer scrollbar.

## Done criteria

ALL must hold:

- [ ] `cd dashboard && bun run build` exits 0.
- [ ] `cd dashboard && bun run lint` exits 0.
- [ ] `grep -n "conversationId" dashboard/src/pages/ConversationDetailPage.tsx` → prop is read.
- [ ] `grep -n 'searchParams.get("c")' dashboard/src/pages/ConversationsPage.tsx` → selection wired.
- [ ] `grep -n "ConversationDetailPage" dashboard/src/pages/ConversationsPage.tsx` → embedded usage present.
- [ ] `dashboard/src/App.tsx` is unchanged (`git status` shows it unmodified) — both routes still exist.
- [ ] Only `ConversationsPage.tsx` and `ConversationDetailPage.tsx` are modified (`git status`).
- [ ] Manual smoke test (all 10 items above) passes — record the result in the handoff.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report (do not improvise) if:

- The "Current state" excerpts don't match live code (drift since `96c506d`), especially the detail
  page's return structure (fragment + `<section className="flex h-full flex-col overflow-hidden">`) or
  the list's row-click at line 598.
- `bun run build`/`lint` fails twice after a reasonable fix.
- `cn` does NOT exist at `@/lib/utils` (the grep in "Commands" returns nothing) — report; do not invent
  a different utility.
- After wiring, the two panes won't scroll independently no matter how the `h-full`/`overflow` classes
  are arranged — this implies AppLayout's content slot changed; report rather than editing AppLayout.
- The detail component throws or shows perpetual skeletons when mounted with a valid `conversationId`
  prop — implies it depends on the route param somewhere beyond line 1256; report the location.

## Maintenance notes

- **Deferred enhancements (intentionally out of scope):**
  - *Resizable split*: add shadcn `Resizable` (`bunx shadcn@latest add resizable`) to let users drag the
    pane divider. Skipped to keep this change small; the fixed `lg:w-[380px] xl:w-[420px]` is fine to start.
  - *Live updates*: there is no polling/realtime today. A natural follow-up is a `refetchInterval` on the
    conversations list query and the detail messages fetch so the open chat updates without the Refresh
    button. Out of scope here.
  - *Route redirect*: optionally make `/conversations/:id` redirect to `/conversations?c=:id` so there is
    a single experience. Kept as a separate standalone route here to guarantee old bookmarks behave
    exactly as before.
- A reviewer should scrutinize: (1) that NO detail feature regressed (the component is reused whole, so
  the risk is purely layout/height/scroll, not logic); (2) that selecting a conversation marking it read
  (Step 2.3) is desired product behavior — if not, drop the `markRead.mutate` call from
  `selectConversation` and keep marking read only via the explicit button.
- The detail component is large (~1727 lines). This plan deliberately avoids splitting it. If a future
  task does extract a `<ConversationView>` from it, this embedded usage is the seam to extract along.
