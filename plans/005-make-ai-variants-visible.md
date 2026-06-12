# Plan 005: Make AI-generated flow variants visible in the editor

> **Executor instructions**: Follow this plan step by step. Run every verification command and
> confirm the expected result before moving on. If anything in "STOP conditions" occurs, stop and
> report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**:
> ```
> git diff --stat 1d906f6..HEAD -- dashboard/src/components/FlowCanvas.tsx \
>   dashboard/src/components/canvas/StepNode.tsx dashboard/src/pages/FlowEditPage.tsx
> ```
> If any of these changed since `1d906f6`, compare the "Current state" excerpts below against the
> live code; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW–MEDIUM (frontend-only; display badge + prop plumbing for focus/expand; no backend, no API change)
- **Depends on**: 002 (DONE — the variant-generation feature this fixes), 001/004 (DONE)
- **Category**: bug / UX
- **Planned at**: commit `1d906f6`, 2026-06-12

## Why this matters

Plan 002 added a **"Generar variante con IA"** button to the flow editor. It works: the backend
paraphrases every text message and the frontend appends each paraphrase to that message's
`textVariants` array (an *alternate version* the bot rotates between — it does **not** replace the
visible message text). The user confirmed the desired behavior is exactly this: **keep alternate
versions, but make them visible.**

The problem reported: after clicking the button, the toast said "Se generaron 15 variantes" but
**nothing appeared to change in the UI**. Root causes, all confirmed in code:

1. **The only on-canvas signal is a tiny `Shuffle` badge** rendered per message tile in
   `StepNode.tsx`, and only on the **first 3 messages** of each step
   (`step.messages.slice(0, 3)` at `StepNode.tsx:80`). Text messages at position 4+ get **no**
   badge at all. Easy to miss entirely.
2. **The paraphrases themselves are only visible inside a selected node's side panel**, collapsed
   behind a "N versiones" button (`MessageEditor.tsx` → `VariantsPanel.tsx`). After generation,
   `FlowCanvas` resets selection to `null` and clears `expandedVariants`
   (`FlowCanvas.tsx:68-75`), so **no panel is open** — the user sees the bare canvas with at most a
   tiny badge.
3. **The toast is vague** ("Se generaron N variantes") and never tells the user *where to look* or
   that they must **Guardar** to persist.

So the feature silently succeeds with almost no visible feedback. This plan makes the result
obvious: a per-step header badge that is always visible, auto-selecting + expanding the first
message that received a variant, and a clearer toast.

### The 29-vs-15 question (no code change — for the executor's understanding only)

The user's flow had 29 *steps* but only 15 variants were generated. **This is correct, not a bug.**
The handler only paraphrases **text** messages with non-empty content
(`FlowEditPage.tsx:285`: `if (m.messageType === "text" && (m.textContent ?? "").trim())`), and the
backend rejects any length mismatch with a 502
(`flowRoutes.ts:472`: `parsed.length !== messages.length`). 15 came back ⇒ the flow has 15 text
messages; the other steps are media/empty. Do **not** change the counting logic.

## Current state

### A. `dashboard/src/components/canvas/StepNode.tsx`

The node header (no variant indicator today):

```tsx
// StepNode.tsx:46-53 — header
{/* Header */}
<div className="flex items-center gap-2 border-b border-border bg-muted/30 px-3 py-2 rounded-t-xl">
  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
    {stepIndex + 1}
  </span>
  <span className="flex-1 truncate text-xs font-semibold text-foreground">
    {step.label || `Paso ${stepIndex + 1}`}
  </span>
  <div className="flex flex-col opacity-0 group-hover:opacity-100 transition-opacity">
    ... move up/down buttons ...
  </div>
</div>
```

`Shuffle` is already imported (`StepNode.tsx:5`). The per-tile badge already exists and stays:

```tsx
// StepNode.tsx:80-101 — per-message tile (only first 3 messages; keep as-is)
{step.messages.slice(0, 3).map((msg, j) => {
  ...
  const variantCount = (msg.textVariants ?? []).length;
  ...
  {variantCount > 0 && (
    <span className="flex items-center gap-0.5 rounded-full bg-primary/20 px-1 text-[9px] text-primary shrink-0">
      <Shuffle size={8} />
      {variantCount + 1}
    </span>
  )}
})}
```

`step` is `StepNodeData["step"]` — it has `messages: { messageType, textContent, textVariants?, ... }[]`.

### B. `dashboard/src/components/FlowCanvas.tsx`

Props type and state (no focus/expand inputs today):

```tsx
// FlowCanvas.tsx:35-46 — Props
type Props = {
  initialDraft: FlowEditorDraft;
  onSave: (draft: FlowEditorDraft) => void;
  savePending?: boolean;
  saveLabel?: string;
  showPaymentConfig?: boolean;
  showMediaPicker?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
  onDraftChange?: (draft: FlowEditorDraft) => void;
  renderActions?: (ctx: FlowEditorActionsContext) => React.ReactNode;
  readOnly?: boolean;
};
```

```tsx
// FlowCanvas.tsx:48-75 — destructure + state + reset effect
function FlowCanvasInner({
  initialDraft,
  onSave,
  savePending = false,
  saveLabel = "Guardar",
  showPaymentConfig = true,
  showMediaPicker = true,
  onDirtyChange,
  onDraftChange,
  renderActions,
  readOnly = false,
}: Props) {
  const [draft, setDraftRaw] = useState<FlowEditorDraft>(initialDraft);
  const [dirty, setDirtyRaw] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [focusDelay, setFocusDelay] = useState(false);
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [uploadMsgIndex, setUploadMsgIndex] = useState<number | null>(null);
  const [expandedVariants, setExpandedVariants] = useState<Set<number>>(new Set());

  // Reset when initialDraft changes (e.g. parent loads different flow)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraftRaw(initialDraft);
    setDirtyRaw(false);
    setSelectedNodeId(null);
    setExpandedVariants(new Set());
  }, [initialDraft]);
```

The helper that converts a step + index to its node id is `stepNodeId` — already imported and used:

```tsx
// FlowCanvas.tsx:104 — inside selectedStepIndex useMemo
return draft.steps.findIndex((s, i) => stepNodeId(s, i) === selectedNodeId);
```

Confirm the import line near the top of the file looks like:
`import { stepNodeId, ... } from "@/lib/flowCanvas";` (it is already imported — do not add a duplicate).

`expandedVariants` is `Set<number>` keyed by **message index within the selected node**; it is passed
to the `MessageEditor` (`FlowCanvas.tsx:274`). The exported wrapper:

```tsx
// FlowCanvas.tsx:339 (approx)
export function FlowCanvas(props: Props) { ... <FlowCanvasInner ...props /> ... }
```

### C. `dashboard/src/pages/FlowEditPage.tsx`

The page renders `FlowCanvas` (NOT `FlowEditor`) and remounts it via `key={editorKey}` whenever
`currentDraft` is replaced:

```tsx
// FlowEditPage.tsx:398-407 (approx)
<FlowCanvas
  key={editorKey}
  initialDraft={currentDraft}
  onSave={handleSave}
  savePending={upsert.isPending}
  saveLabel="Guardar flujo"
  ...
  onDraftChange={handleDraftChange}
  renderActions={({ draft, dirty: isDirty, resetDraft }) => ( ... )}
/>
```

The generate handler builds `next` and replaces the draft (which remounts `FlowCanvas`):

```tsx
// FlowEditPage.tsx:280-320 — handleGenerateVariants
async function handleGenerateVariants(draft: FlowEditorDraft) {
  const refs: { index: number; stepIdx: number; msgIdx: number; text: string }[] = [];
  draft.steps.forEach((s, stepIdx) =>
    s.messages.forEach((m, msgIdx) => {
      if (m.messageType === "text" && (m.textContent ?? "").trim()) {
        refs.push({ index: refs.length, stepIdx, msgIdx, text: (m.textContent ?? "").trim() });
      }
    })
  );
  if (refs.length === 0) {
    toast.error("No hay mensajes de texto para parafrasear");
    return;
  }
  try {
    const res = await generateVariants.mutateAsync({
      messages: refs.map((r) => ({ index: r.index, text: r.text })),
    });
    const byIndex = new Map(res.variants.map((v) => [v.index, v.text]));
    const next: FlowEditorDraft = {
      ...draft,
      steps: draft.steps.map((s, stepIdx) => ({
        ...s,
        messages: s.messages.map((m, msgIdx) => {
          const ref = refs.find((r) => r.stepIdx === stepIdx && r.msgIdx === msgIdx);
          const variant = ref ? byIndex.get(ref.index) : undefined;
          if (!variant) return m;
          const existing = m.textVariants ?? [];
          if (existing.includes(variant)) return m;
          return { ...m, textVariants: [...existing, variant] };
        }),
      })),
    };
    setCurrentDraft(next);
    setEditorKey((k) => k + 1);
    toast.success(`Se generaron ${res.variants.length} variantes con IA`);
  } catch {
    toast.error("No se pudieron generar variantes. Verificá que tengas un proveedor de IA configurado.");
  }
}
```

`handleSave` also replaces the draft + bumps `editorKey` (`FlowEditPage.tsx:267-276`). The flow-load
effects do the same (`setCurrentDraft(...)`+`setEditorKey((k)=>k+1)` at lines ~141-194).

### Convention to follow

- Shadcn + Tailwind + lucide-react icons. Match the existing badge style (the per-tile Shuffle badge).
- Spanish (rioplatense) copy — "Guardá", "Abrí", "marcado" — to match the rest of the page.
- Keep existing component structure; add props, don't restructure.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Frontend typecheck + build | `cd dashboard && bun run build` | exit 0 |
| Frontend lint | `cd dashboard && bun run lint` | exit 0 |

## Scope

**In scope** (modify):
- `dashboard/src/components/canvas/StepNode.tsx` — add an always-visible per-step header badge
  summarizing total alternate versions in that step.
- `dashboard/src/components/FlowCanvas.tsx` — add optional `focusStepIndex` / `focusMessageIndex`
  props; honor them in the reset effect to auto-select the node and expand that message.
- `dashboard/src/pages/FlowEditPage.tsx` — after generation, compute the first affected
  step/message, pass them to `FlowCanvas`, clear them on save/load, and improve the toast.

**Out of scope** (do NOT touch):
- Any backend file. The backend is correct; do not change variant generation, counting, or the 502
  length check.
- `VariantsPanel.tsx` / `MessageEditor.tsx` — the panel already renders variants correctly once
  expanded. No change needed.
- The per-tile `slice(0, 3)` badge logic in `StepNode.tsx` — leave it; the new header badge covers
  the messages it omits.
- `dashboard/src/lib/__gen__/api_v1.d.ts` — do NOT regenerate or edit it; no API surface changes.
- The `ai_enabled` decoupling (plan 004) and provider list (plan 001) — unrelated.

## Git workflow

- Branch: `advisor/005-make-ai-variants-visible`
- Conventional commit (e.g. `fix(flows): surface AI-generated message variants in the editor`).
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1 — Per-step header badge in `StepNode.tsx`

Goal: every step that has any alternate version shows an always-visible badge in its **header**
(independent of the `slice(0, 3)` message preview), so the user can see at a glance which steps the
AI touched.

Inside `StepNode` (after the destructure at line 28), compute the total:

```tsx
const stepVariantCount = step.messages.reduce(
  (sum, m) => sum + (m.textVariants?.length ?? 0),
  0,
);
```

Then in the header (between the label `<span>` at line 51-53 and the move-buttons `<div>` at line
54), insert the badge — shown only when `stepVariantCount > 0`:

```tsx
{stepVariantCount > 0 && (
  <span
    title={`${stepVariantCount} versión(es) alternativa(s) en este paso`}
    className="flex shrink-0 items-center gap-0.5 rounded-full bg-primary/20 px-1.5 py-0.5 text-[9px] font-medium text-primary"
  >
    <Shuffle size={9} />
    {stepVariantCount}
  </span>
)}
```

`Shuffle` is already imported — do not add another import.

**Verify**:
- `cd dashboard && bun run build` → exit 0.
- `grep -c "stepVariantCount" dashboard/src/components/canvas/StepNode.tsx` → returns **3**
  (declaration + the two usages in the badge).

### Step 2 — Add focus/expand props to `FlowCanvas.tsx`

Add two optional props so the parent can ask the canvas to open a specific step + message after a
remount.

1. In the `Props` type (line 35-46), add after `readOnly?: boolean;`:

```tsx
  /** When set, auto-select this step (by index) after (re)mount — used to reveal AI variants. */
  focusStepIndex?: number;
  /** When `focusStepIndex` is set, also expand this message's variants panel (index within the step). */
  focusMessageIndex?: number;
```

2. In the `FlowCanvasInner` destructure (line 48-59), add after `readOnly = false,`:

```tsx
  focusStepIndex,
  focusMessageIndex,
```

3. Replace the reset effect (lines 68-75) so it honors the focus inputs instead of always clearing:

```tsx
  // Reset when initialDraft changes (e.g. parent loads different flow).
  // If the parent passed a focus target (e.g. after generating AI variants), auto-select
  // that step and expand the given message so the new versions are immediately visible.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraftRaw(initialDraft);
    setDirtyRaw(false);
    if (
      focusStepIndex != null &&
      focusStepIndex >= 0 &&
      focusStepIndex < initialDraft.steps.length
    ) {
      setSelectedNodeId(
        stepNodeId(initialDraft.steps[focusStepIndex], focusStepIndex),
      );
      setExpandedVariants(new Set(focusMessageIndex != null ? [focusMessageIndex] : []));
    } else {
      setSelectedNodeId(null);
      setExpandedVariants(new Set());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDraft]);
```

> Note: the effect intentionally depends only on `initialDraft` (a remount with `key=editorKey`
> creates a fresh `initialDraft` reference each time, which is what drives this). Keep the existing
> `eslint-disable` for `set-state-in-effect`, and add the `exhaustive-deps` disable shown above
> because `focusStepIndex`/`focusMessageIndex` are read but intentionally not in the dep array
> (they only matter at the moment `initialDraft` changes). If lint still complains, that is the only
> acceptable place to disable it — do not add them to the deps (that would re-fire the reset on
> unrelated renders).

**Verify**:
- `cd dashboard && bun run build` → exit 0.
- `cd dashboard && bun run lint` → exit 0.
- `grep -c "focusStepIndex" dashboard/src/components/FlowCanvas.tsx` → returns **4** (type decl,
  destructure, and the two reads in the effect).

### Step 3 — Wire focus + improve toast in `FlowEditPage.tsx`

1. Add a focus-state hook near the other editor state (next to `editorKey` at `FlowEditPage.tsx:108`):

```tsx
const [focusAfterGen, setFocusAfterGen] = useState<{ step: number; msg: number } | null>(null);
```

2. In `handleGenerateVariants`, after building `next` and before `setCurrentDraft(next)`, compute the
first message that actually received a variant and record it; also compute how many messages were
affected for the toast. Replace the `setCurrentDraft(next); setEditorKey(...); toast.success(...)`
block with:

```tsx
    // First message (in step/message order) that received a new variant — to auto-reveal it.
    let focus: { step: number; msg: number } | null = null;
    let affectedMessages = 0;
    next.steps.forEach((s, stepIdx) =>
      s.messages.forEach((m, msgIdx) => {
        const before = draft.steps[stepIdx]?.messages[msgIdx]?.textVariants?.length ?? 0;
        const after = m.textVariants?.length ?? 0;
        if (after > before) {
          affectedMessages += 1;
          if (!focus) focus = { step: stepIdx, msg: msgIdx };
        }
      })
    );
    setFocusAfterGen(focus);
    setCurrentDraft(next);
    setEditorKey((k) => k + 1);
    toast.success(
      `IA generó ${res.variants.length} versión(es) alternativa(s) en ${affectedMessages} mensaje(s). ` +
        `Abrí los pasos marcados ⤨ para verlas. Guardá el flujo para conservarlas.`,
    );
```

3. Clear the focus on any *other* draft replacement so a later remount doesn't re-open a stale node.
In `handleSave`'s `onSuccess` (around `FlowEditPage.tsx:268-274`), add `setFocusAfterGen(null);`
before `setCurrentDraft(savedDraft)`. Do the same in each flow-load path that calls
`setCurrentDraft(...)` + `setEditorKey((k) => k + 1)` (the effects around lines 141, 152-153,
172-178, 193-194) — add `setFocusAfterGen(null);` immediately before each `setCurrentDraft(...)`
there. (Generation is the only path that should set a non-null focus.)

4. Pass the props to `<FlowCanvas>` (in the JSX around `FlowEditPage.tsx:399`), e.g. right after
`initialDraft={currentDraft}`:

```tsx
          focusStepIndex={focusAfterGen?.step}
          focusMessageIndex={focusAfterGen?.msg}
```

**Verify**:
- `cd dashboard && bun run build` → exit 0.
- `cd dashboard && bun run lint` → exit 0.
- `grep -c "setFocusAfterGen" dashboard/src/pages/FlowEditPage.tsx` → returns **at least 6** (one
  declaration via `useState`, one set-in-generate, and one clear before each `setCurrentDraft` in
  save + the flow-load paths). Report the exact number you produced.
- `grep -c "focusStepIndex={focusAfterGen" dashboard/src/pages/FlowEditPage.tsx` → returns **1**.

## Test plan

No automated test harness (see `plans/README.md`). Verification is build + lint (above) plus a manual
smoke test (human):

1. Ensure an AI provider with a valid key is configured in `/config` (DeepSeek works).
2. `cd dashboard && bun run dev`, open a flow with several **text** steps in the editor.
3. Click **"Generar variante con IA"**.
4. Expect: the toast names how many versions + messages and tells you to look for ⤨ and to save;
   the canvas now shows a **⤨ N badge in the header** of every step that got a variant; and the
   **first** affected step is auto-selected with its message's variants panel **expanded**, showing
   "Versión 1 (principal)" + "Versión 2".
5. Open another marked step → its "N versiones" button reveals the paraphrase too.
6. Click **Guardar flujo** → reload → the variants persist (badges still present).
7. Regression: load a flow with **no** variants → no header badges, no node auto-selected, editor
   behaves exactly as before. Generate, save, then open the flow fresh → no stale node is
   auto-selected on load (focus only triggers right after generation).

## Done criteria

ALL must hold:

- [ ] `cd dashboard && bun run build` exits 0.
- [ ] `cd dashboard && bun run lint` exits 0.
- [ ] `grep -c "stepVariantCount" dashboard/src/components/canvas/StepNode.tsx` → `3`.
- [ ] `grep -c "focusStepIndex" dashboard/src/components/FlowCanvas.tsx` → `4`.
- [ ] `grep -c "focusStepIndex={focusAfterGen" dashboard/src/pages/FlowEditPage.tsx` → `1`.
- [ ] Only these three files modified (`git status`): `StepNode.tsx`, `FlowCanvas.tsx`,
      `FlowEditPage.tsx`. (`api_v1.d.ts` must NOT appear.)
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report (do not improvise) if:

- The "Current state" excerpts don't match live code (drift since `1d906f6`) — especially if
  `FlowEditPage` renders `FlowEditor` instead of `FlowCanvas`, or `stepNodeId` is not already
  imported in `FlowCanvas.tsx`.
- `stepNodeId` has a different signature than `stepNodeId(step, index)` — inspect
  `dashboard/src/lib/flowCanvas.ts` and report; do not guess the node-id format.
- After Step 2, lint reports an error that cannot be resolved with the single documented
  `exhaustive-deps` disable on the reset effect (i.e. adding the disable is not enough) — report
  rather than restructuring the effect or adding the focus props to the dep array.
- `bun run build`/`lint` fails twice after a reasonable fix.
- You find that variants do NOT round-trip through save (the saved flow loses `textVariants`) — that
  would be a backend/persistence bug outside this plan's scope; report it.

## Maintenance notes

- `focusStepIndex`/`focusMessageIndex` are a one-shot reveal mechanism keyed off the remount. They
  must be cleared by the parent on every non-generation draft replacement (save, load) — otherwise a
  later remount re-opens a stale node. The grep gate in Step 3 guards this.
- A cleaner long-term design would replace the `setCurrentDraft + key` remount with an imperative
  handle on `FlowCanvas` (`useImperativeHandle`) to merge variants into the live draft and expand
  them **without** a remount (preserving scroll, selection, and dirty state). That is a larger
  refactor; this plan deliberately uses the lower-risk prop path. If a future change adds that
  handle, drop the focus props.
- Known minor limitation (acceptable, do not fix here): the post-generation remount resets `dirty`
  to `false`, so the variants are not written to the `flow_draft` localStorage autosave until the
  user makes a further edit. They are still saved correctly via **Guardar** (the Save button is not
  gated on `dirty`). If this becomes a real complaint, add an `initialDirty?: boolean` prop to
  `FlowCanvas` and pass `true` after generation.
- The canvas shows only one node's variant panel at a time by design, so "expand all variants at
  once" is intentionally not attempted — the header badges + auto-revealing the first one is the
  visibility contract.
