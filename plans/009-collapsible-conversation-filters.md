# Plan 009: Collapsible conversation filters (collapsed by default) + lint cleanup

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm
> the expected result before moving on. If anything in "STOP conditions" occurs, stop and report — do
> not improvise. When done, update the status row for this plan in `plans/README.md` (skip if `plans/`
> is absent in your tree — do not create one).
>
> **Drift check (run first)**:
> ```
> git diff --stat 6134457..HEAD -- dashboard/src/pages/ConversationsPage.tsx dashboard/src/components/FlowCanvas.tsx
> ```
> If either changed since `6134457`, compare the "Current state" excerpts below against the live code;
> on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW (frontend-only; a toggle + one conditional render, plus deleting one dead lint comment)
- **Depends on**: 008 (DONE — the responsive filter grid), 007 (DONE — introduced the lint warning)
- **Category**: UX / cleanup
- **Planned at**: commit `6134457`, 2026-06-12

## Why this matters

1. On desktop the filter block stacks vertically in the narrow sidebar (plan 008) and takes too much
   space. Make the whole filter block **collapsible**, **collapsed by default**, with a small
   indicator so the user can still tell when filters are active while collapsed.
2. Plan 007 left a cosmetic lint warning: an unused `eslint-disable` directive at
   `FlowCanvas.tsx:142` (the rule `react-hooks/set-state-in-effect` is not enabled in this project's
   ESLint config, so the disable comment is dead). Remove just that one line to restore a clean lint.

## Current state

### A. `dashboard/src/pages/ConversationsPage.tsx`

lucide imports (no `ChevronDown`/`SlidersHorizontal` yet):

```tsx
// ConversationsPage.tsx:5-21
import {
  Search,
  X,
  MessagesSquare,
  Megaphone,
  ChevronLeft,
  ChevronRight,
  Workflow,
  CornerUpLeft,
  RefreshCw,
  Mic,
  ImageIcon,
  Video,
  FileText,
  MailOpen,
  BellDot,
} from "lucide-react";
```

`hasFilters` (a truthy flag for "any filter active") already exists:

```tsx
// ConversationsPage.tsx:347-352
const hasFilters =
  search ||
  stateFilter !== "all" ||
  flowFilter !== "all" ||
  adFilter !== "all" ||
  hasUnread;
```

The filter block — header + the grid of 4 controls (search, estado, flujo, anuncio):

```tsx
// ConversationsPage.tsx:417-432 — outer wrapper + header
<div className="rounded-xl border bg-muted/20 p-3 flex flex-col gap-3">
  <div className="flex items-center justify-between">
    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      Filtros
    </p>
    {hasFilters && (
      <button
        type="button"
        onClick={clearFilters}
        className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
      >
        Limpiar
      </button>
    )}
  </div>

  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1">
    {/* Search */}
    ... four filter fields ...
  </div>
</div>
```

The grid `<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1">` opens at line 433
and its matching `</div>` is at line 572 (immediately before the outer wrapper's `</div>` at 573).
Component state is declared in the function body (e.g. `const [searchInput, setSearchInput] = useState(search);`
at line 242).

### B. `dashboard/src/components/FlowCanvas.tsx`

```tsx
// FlowCanvas.tsx — inside the plan-007 auto-expand effect (~line 139-142)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setExpandedVariants(toExpand);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNodeId]);
```

The `react-hooks/set-state-in-effect` disable is the dead one (lint reports it as unused). The
`react-hooks/exhaustive-deps` disable on the next line is **real** (the effect reads
`selectedStepIndex`/`draft` but deps are `[selectedNodeId]`) — KEEP it.

### Convention to follow

- Shadcn + Tailwind + lucide-react. Match existing icon sizing (`size={13}`/`14`) and the muted-label
  styling already used for "Filtros".
- Spanish copy. Gates: `cd dashboard && bun run build` and `cd dashboard && bun run lint`.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Frontend build | `cd dashboard && bun run build` | exit 0 |
| Frontend lint | `cd dashboard && bun run lint` | exit 0, **0 warnings** |

## Scope

**In scope** (modify):
- `dashboard/src/pages/ConversationsPage.tsx` — add a collapse toggle; render the filter grid only
  when open; default closed; show an active-filters dot when collapsed.
- `dashboard/src/components/FlowCanvas.tsx` — delete the single dead `eslint-disable` line.

**Out of scope** (do NOT touch): any backend file, other frontend files, the filter fields' own
markup/logic (only wrap them), `api_v1.d.ts`, the aside width, the `exhaustive-deps` disable in
FlowCanvas.

## Git workflow

- Branch: `advisor/009-collapsible-filters`
- Conventional commit (e.g. `feat(conversations): collapsible filter panel, collapsed by default`).
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1 — Add the two icons to the lucide import

In `ConversationsPage.tsx:5-21`, add `ChevronDown` and `SlidersHorizontal` to the import list (keep
the others):

```tsx
import {
  Search,
  X,
  MessagesSquare,
  Megaphone,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  SlidersHorizontal,
  Workflow,
  CornerUpLeft,
  RefreshCw,
  Mic,
  ImageIcon,
  Video,
  FileText,
  MailOpen,
  BellDot,
} from "lucide-react";
```

### Step 2 — Add collapse state (default collapsed)

Add this near the other `useState` declarations in the component body (e.g. just after the
`const [searchInput, setSearchInput] = useState(search);` line ~242):

```tsx
const [filtersOpen, setFiltersOpen] = useState(false);
```

### Step 3 — Turn the header into a toggle + conditionally render the grid

Replace the header `<div className="flex items-center justify-between"> … </div>`
(`ConversationsPage.tsx:418-431`) with a toggle button that controls `filtersOpen`, keeping the
"Limpiar" action. The "Filtros" label becomes the toggle; a small primary dot appears when filters are
active **and** the panel is collapsed (so the user knows filters apply without opening it); a chevron
rotates when open:

```tsx
  <div className="flex items-center justify-between">
    <button
      type="button"
      onClick={() => setFiltersOpen((o) => !o)}
      aria-expanded={filtersOpen}
      className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
    >
      <SlidersHorizontal size={13} />
      Filtros
      {hasFilters && !filtersOpen && (
        <span
          className="h-1.5 w-1.5 rounded-full bg-primary"
          aria-label="Hay filtros activos"
        />
      )}
      <ChevronDown
        size={14}
        className={`transition-transform ${filtersOpen ? "rotate-180" : ""}`}
      />
    </button>
    {hasFilters && (
      <button
        type="button"
        onClick={clearFilters}
        className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
      >
        Limpiar
      </button>
    )}
  </div>
```

Then wrap the existing filter grid so it only renders when open. The grid is the
`<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1"> … </div>` block
(`ConversationsPage.tsx:433-572`). Wrap it exactly:

```tsx
  {filtersOpen && (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1">
      {/* …all four existing filter fields, UNCHANGED… */}
    </div>
  )}
```

Do not change anything inside the grid — only add the `{filtersOpen && (` before it and the `)}` after
its closing `</div>`. Mind the JSX braces: the result must be valid (the outer wrapper `<div … flex
flex-col gap-3>` now contains the header `<div>` and the `{filtersOpen && (…)}` expression).

### Step 4 — Remove the dead lint directive (FlowCanvas.tsx)

Delete the single line `// eslint-disable-next-line react-hooks/set-state-in-effect` immediately above
`setExpandedVariants(toExpand);` (FlowCanvas ~line 139). Keep `setExpandedVariants(toExpand);` and keep
the `// eslint-disable-next-line react-hooks/exhaustive-deps` line below it.

**Verify** (after all steps):
- `cd dashboard && bun run build` → exit 0.
- `cd dashboard && bun run lint` → exit 0 **and 0 warnings** (the FlowCanvas unused-directive warning
  is gone).
- `grep -c "filtersOpen" dashboard/src/pages/ConversationsPage.tsx` → returns **at least 4** (state
  declaration, `onClick` toggle, `aria-expanded`, the dot condition, and the grid wrapper — report the
  actual count).
- `grep -c "set-state-in-effect" dashboard/src/components/FlowCanvas.tsx` → returns **0**.
- `grep -c "react-hooks/exhaustive-deps" dashboard/src/components/FlowCanvas.tsx` → returns **1**
  (the real one is still there).

## Test plan

Manual smoke test (human):

1. `cd dashboard && bun run dev`, open `/conversations`.
2. The filter panel is **collapsed** by default — only the "Filtros" toggle row shows; the four
   controls are hidden, saving vertical space.
3. Click "Filtros" → the grid expands (search + estado + flujo + anuncio); the chevron rotates. Click
   again → collapses.
4. Apply a filter, collapse the panel → a small primary dot shows next to "Filtros" indicating active
   filters. "Limpiar" still clears them.
5. Resize: behavior identical at all widths; no overlap.

## Done criteria

ALL must hold:

- [ ] `cd dashboard && bun run build` exits 0.
- [ ] `cd dashboard && bun run lint` exits 0 with **0 warnings**.
- [ ] `grep -c "filtersOpen" dashboard/src/pages/ConversationsPage.tsx` → ≥ 4.
- [ ] `grep -c "set-state-in-effect" dashboard/src/components/FlowCanvas.tsx` → `0`.
- [ ] `grep -c "react-hooks/exhaustive-deps" dashboard/src/components/FlowCanvas.tsx` → `1`.
- [ ] Only `dashboard/src/pages/ConversationsPage.tsx` and `dashboard/src/components/FlowCanvas.tsx`
      modified (`git status`).
- [ ] `plans/README.md` status row updated (or skipped if `plans/` absent).

## STOP conditions

Stop and report (do not improvise) if:

- The "Current state" excerpts don't match live code (drift since `6134457`) — especially if the grid
  `</div>` is not where described, so the `{filtersOpen && (...)}` wrap would mis-nest.
- `bun run build`/`lint` fails twice after a reasonable fix (e.g. a JSX-brace mismatch from the wrap —
  re-check the closing `)}` placement).
- Removing the `set-state-in-effect` line causes a NEW lint error (it should only remove a warning).

## Maintenance notes

- Filters now default collapsed. If product later wants search always visible, lift just the Search
  field out of the `{filtersOpen && …}` block (keep it above the toggle) and leave the three dropdowns
  inside the collapse.
- The active-filters dot is intentionally minimal; if a count is preferred, compute the number of
  non-default filters and render it in the badge instead of a dot.
```
