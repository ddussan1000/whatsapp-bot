# Plan 007: Chunk variant generation for long flows + remove duplicate variant badge

> **Executor instructions**: Follow this plan step by step. Run every verification command and
> confirm the expected result before moving on. If anything in "STOP conditions" occurs, stop and
> report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**:
> ```
> git diff --stat 9e00888..HEAD -- backend/src/api/flowRoutes.ts dashboard/src/components/canvas/StepNode.tsx
> ```
> If either file changed since `9e00888`, compare the "Current state" excerpts below against the live
> code; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW–MEDIUM (backend: batch loop around an existing call; frontend: delete one badge)
- **Depends on**: 002, 005, 006 (all DONE) — this builds directly on 006's parsing + 005's badges
- **Category**: bug / robustness
- **Planned at**: commit `9e00888`, 2026-06-12

## Why this matters

Two independent issues remain in the AI flow-variant feature, both confirmed by the user:

### Issue 1 — long flows truncate (502 "El flujo es demasiado largo…")

`POST /flows/generate-variants` paraphrases **all** text messages in **one** AI call. DeepSeek (and
most providers) cap output at ~8192 tokens, and plan 006 caps `max_tokens` at 8000. For a long flow
the single response can't hold every paraphrase, so it truncates and 006 (correctly) returns the
"demasiado largo" 502.

> Important context for the executor: the frontend sends only each message's **main text**
> (`textContent`) — it does **not** send existing variants — so regenerating does not grow the
> input. The truncation is purely a function of total flow size vs. the single-call output ceiling.
> Raising the cap alone cannot fix this (the provider ceiling is fixed). The robust fix is to
> **chunk** the messages into batches and generate each batch in its own call, then merge — exactly
> the follow-up predicted in plan 006's maintenance notes.

### Issue 2 — duplicate variant icon on a step

Plan 005 added an always-visible `Shuffle` badge in the **step header** (counting total alternate
versions in the step). But each message **tile** already shows its own `Shuffle` badge (added in
plan 002: `variantCount + 1` "versions"). For a normal step (≤3 messages) both render, so the user
sees the shuffle icon twice — e.g. header "⤨ 1" and tile "⤨ 2" — which is redundant and confusing
(the two even count differently: header = number of variants, tile = number of versions). Fix: drop
the header badge added in 005; keep the per-message tile badge (it is more precise and sits on the
message it describes). The plan-005 auto-reveal (auto-select + expand the first varied message) stays
and remains the primary "it worked" signal.

### Issue 3 — variants should auto-expand when you open a step

In the step detail (right panel), messages with variants render their versions **collapsed** behind
a "N versiones" toggle. To read the alternate texts the user must click each one open. Requested
behavior: whenever a step is selected, **every message in that step that has variants should be
expanded by default**, so all the texts are readable immediately; switching to another step
re-applies the same default for that step. The user can still collapse any message manually within
the current selection — the default only re-applies when the selected step changes.

## Current state

### A. `backend/src/api/flowRoutes.ts`

Request schema cap (raise this so long flows aren't rejected before chunking can help):

```ts
// flowRoutes.ts:416-421
schema: z.object({
  messages: z
    .array(z.object({ index: z.number().int(), text: z.string().min(1) }))
    .min(1)
    .max(40),
}),
```

The handler currently does a **single** generation call + inline `extractVariants`
(`flowRoutes.ts:439-521`). Full current body:

```ts
async (c) => {
  const { messages } = c.req.valid("json");
  const orgConfig = await getOrgAiConfig(orgId(c));
  if (!orgConfig.ai_provider || !orgConfig.ai_api_key) {
    return c.json({ error: "No hay proveedor de IA configurado. Configurá uno en Ajustes." }, 400);
  }

  const system =
    "Eres un redactor experto en mensajes de WhatsApp para ventas. Recibís un objeto JSON " +
    '{"messages": string[]} con los mensajes de un bot. Respondé SOLO con un objeto JSON ' +
    '{"variants": string[]} donde variants tiene EXACTAMENTE el mismo largo y el mismo orden que ' +
    "messages, y cada elemento es una PARÁFRASIS del mensaje original: mismo significado, tono, " +
    "intención y estructura, con otras palabras. Conservá emojis, saltos de línea y cualquier " +
    "placeholder como {{nombre}} o {nombre} sin modificarlos. No agregues texto fuera del objeto JSON.";
  const user = JSON.stringify({ messages: messages.map((m) => m.text) });

  // Scale token budget to the input so long flows are not truncated mid-array.
  const inputChars = messages.reduce((n, m) => n + m.text.length, 0);
  const maxTokens = Math.min(8000, Math.max(3000, Math.ceil(inputChars / 2) + 500));

  let raw: string | null;
  try {
    raw = await generateRawForOrg(system, user, orgConfig, maxTokens, {
      jsonMode: true,
      temperature: 0,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "AI_RESPONSE_TRUNCATED") {
      return c.json(
        { error: "El flujo es demasiado largo para generar variantes de una vez. Probá con menos mensajes." },
        502,
      );
    }
    return c.json({ error: `Fallo del proveedor de IA: ${msg}` }, 502);
  }
  if (!raw) return c.json({ error: "El proveedor de IA no devolvió respuesta." }, 502);

  // Robustly extract the variants array. Accept either {"variants":[...]} (JSON mode) or a bare
  // array, tolerating ```json fences and surrounding prose.
  function extractVariants(text: string): string[] | null {
    let s = text.trim();
    const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence && fence[1]) s = fence[1].trim();
    const tryParse = (candidate: string): unknown => {
      try {
        return JSON.parse(candidate);
      } catch {
        return undefined;
      }
    };
    let obj = tryParse(s);
    if (obj === undefined) {
      // Fall back to slicing the outermost object, then the outermost array.
      const ob = s.indexOf("{"), oe = s.lastIndexOf("}");
      if (ob >= 0 && oe > ob) obj = tryParse(s.slice(ob, oe + 1));
      if (obj === undefined) {
        const ab = s.indexOf("["), ae = s.lastIndexOf("]");
        if (ab >= 0 && ae > ab) obj = tryParse(s.slice(ab, ae + 1));
      }
    }
    if (Array.isArray(obj)) return obj.map((x) => String(x ?? ""));
    if (obj && typeof obj === "object" && Array.isArray((obj as { variants?: unknown }).variants)) {
      return (obj as { variants: unknown[] }).variants.map((x) => String(x ?? ""));
    }
    return null;
  }

  const arr = extractVariants(raw);
  if (!arr) {
    log.error({ orgId: orgId(c), rawSample: raw.slice(0, 500) }, "generate-variants: unparseable AI response");
    return c.json({ error: "No se pudo interpretar la respuesta de la IA." }, 502);
  }
  if (arr.length !== messages.length) {
    log.warn({ orgId: orgId(c), got: arr.length, expected: messages.length }, "generate-variants: length mismatch");
    return c.json({ error: "La IA devolvió una cantidad inesperada de variantes." }, 502);
  }

  const variants = messages
    .map((m, i) => ({ index: m.index, text: String(arr[i] ?? "").trim() }))
    .filter((v) => v.text.length > 0);
  return c.json({ variants }, 200);
},
```

`registerFlowRoutes(dashboardApi: OpenAPIHono)` is the enclosing exported function (the handler lives
inside it). `log` is imported (`flowRoutes.ts:8`), `generateRawForOrg` (line 7), `getOrgAiConfig`
(line 6), `orgId` is in scope (used throughout the file).

### B. `dashboard/src/components/canvas/StepNode.tsx`

The plan-005 header badge to remove — the `stepVariantCount` computation:

```tsx
// StepNode.tsx:30-33
const stepVariantCount = step.messages.reduce(
  (sum, m) => sum + (m.textVariants?.length ?? 0),
  0,
);
```

and the header badge JSX (between the label `<span>` and the move-buttons `<div>`):

```tsx
// StepNode.tsx:59-67
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

The per-message **tile** badge (KEEP — do NOT remove this one) is later in the same file:

```tsx
// StepNode.tsx (~94-101) — KEEP
const variantCount = (msg.textVariants ?? []).length;
...
{variantCount > 0 && (
  <span className="flex items-center gap-0.5 rounded-full bg-primary/20 px-1 text-[9px] text-primary shrink-0">
    <Shuffle size={8} />
    {variantCount + 1}
  </span>
)}
```

`Shuffle` stays imported because the tile badge still uses it — do NOT remove the import.

### Convention to follow

- Backend: Hono + Bun, plain async helpers, `throw new Error(...)`. Keep TypeScript strict; the gate
  is `cd backend && bun run check`.
- Frontend: this is a pure deletion of one badge block; keep everything else in `StepNode.tsx`
  byte-for-byte. Gate is `cd dashboard && bun run build` + `bun run lint`.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Backend typecheck | `cd backend && bun run check` | exit 0, **no errors in `flowRoutes.ts`** (see STOP note about unrelated `scripts/*.ts`) |
| Frontend build | `cd dashboard && bun run build` | exit 0 |
| Frontend lint | `cd dashboard && bun run lint` | exit 0 |

> **Known unrelated typecheck noise**: on the main checkout, `bun run check` may report errors in
> `backend/scripts/retry-capi-purchases.ts` and `backend/scripts/setup-capi-datasets.ts`. These are
> **untracked, pre-existing** user scratch files, NOT part of this plan. Your gate is that
> `flowRoutes.ts` (and `assistant.ts`) produce **zero** errors. Confirm by checking that no error
> line in the `tsc` output references `src/api/flowRoutes.ts`. Do NOT edit or delete those scripts.

## Scope

**In scope** (modify):
- `backend/src/api/flowRoutes.ts` — chunk the messages into batches, generate per batch, merge;
  raise the request cap from 40 to 100.
- `dashboard/src/components/canvas/StepNode.tsx` — delete the plan-005 header badge (the
  `stepVariantCount` const + its `<span>`). Keep the per-tile badge.
- `dashboard/src/components/FlowCanvas.tsx` — auto-expand messages that have variants whenever a step
  is selected (Issue 3).

**Out of scope** (do NOT touch):
- `backend/src/ai/assistant.ts` — the generation helpers are correct as-is (006). The batch loop
  calls the existing `generateRawForOrg` unchanged.
- Any other frontend file, the `FlowCanvas`/`FlowEditPage` auto-reveal logic (plan 005), the response
  Zod schema / wire contract (`{ variants: [{ index, text }] }` stays identical), DB, env, Redis.
- `backend/scripts/*.ts` (the unrelated untracked CAPI scripts).
- `dashboard/src/lib/__gen__/api_v1.d.ts` — the request cap change does not require regenerating it
  (the frontend uses the hand-written wrapper in `dashboard/src/lib/api.ts`). Do NOT regenerate it.

## Git workflow

- Branch: `advisor/007-chunk-variants-fix-badge`
- Conventional commit (e.g. `fix(flows): batch AI variant generation for long flows and drop duplicate badge`).
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1 — Raise the request cap (flowRoutes.ts:420)

Change `.max(40)` to `.max(100)`:

```ts
        .min(1)
        .max(100),
```

### Step 2 — Hoist `extractVariants` to module scope

The batch loop calls `extractVariants` once per batch, so it must not be redefined inside the loop.
Move the function out of the handler to **module scope** (place it just above the
`export function registerFlowRoutes(` declaration, or directly above the `db(c)` helper near the top —
anywhere at file top level after the imports). Cut the entire `function extractVariants(text: string): string[] | null { … }`
block (currently `flowRoutes.ts:479-505`) out of the handler and paste it at module scope unchanged.

After this, the handler no longer declares `extractVariants` locally; it just calls the module-level
one.

### Step 3 — Replace the single-call body with a batch loop

Replace the handler body **from** the `const system =` line **through** the final
`return c.json({ variants }, 200);` with the batched version below. (The `const { messages }`,
`orgConfig`, and the no-provider 400 check at the top stay unchanged; the `extractVariants` function
is now at module scope per Step 2 and must NOT appear inside the handler anymore.)

```ts
      const system =
        "Eres un redactor experto en mensajes de WhatsApp para ventas. Recibís un objeto JSON " +
        '{"messages": string[]} con los mensajes de un bot. Respondé SOLO con un objeto JSON ' +
        '{"variants": string[]} donde variants tiene EXACTAMENTE el mismo largo y el mismo orden que ' +
        "messages, y cada elemento es una PARÁFRASIS del mensaje original: mismo significado, tono, " +
        "intención y estructura, con otras palabras. Conservá emojis, saltos de línea y cualquier " +
        "placeholder como {{nombre}} o {nombre} sin modificarlos. No agregues texto fuera del objeto JSON.";

      // Generate in batches so long flows never hit the provider's single-response output ceiling.
      const BATCH_SIZE = 8;
      const texts = messages.map((m) => m.text);
      const allVariants: string[] = [];

      for (let start = 0; start < texts.length; start += BATCH_SIZE) {
        const batch = texts.slice(start, start + BATCH_SIZE);
        const user = JSON.stringify({ messages: batch });
        const inputChars = batch.reduce((n, t) => n + t.length, 0);
        const maxTokens = Math.min(8000, Math.max(1500, Math.ceil(inputChars / 2) + 500));

        let raw: string | null;
        try {
          raw = await generateRawForOrg(system, user, orgConfig, maxTokens, {
            jsonMode: true,
            temperature: 0,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg === "AI_RESPONSE_TRUNCATED") {
            return c.json(
              { error: "Un mensaje es demasiado largo para generar su variante. Acortá ese mensaje e intentá de nuevo." },
              502,
            );
          }
          return c.json({ error: `Fallo del proveedor de IA: ${msg}` }, 502);
        }
        if (!raw) return c.json({ error: "El proveedor de IA no devolvió respuesta." }, 502);

        const part = extractVariants(raw);
        if (!part) {
          log.error({ orgId: orgId(c), rawSample: raw.slice(0, 500) }, "generate-variants: unparseable AI response");
          return c.json({ error: "No se pudo interpretar la respuesta de la IA." }, 502);
        }
        if (part.length !== batch.length) {
          log.warn({ orgId: orgId(c), got: part.length, expected: batch.length }, "generate-variants: batch length mismatch");
          return c.json({ error: "La IA devolvió una cantidad inesperada de variantes." }, 502);
        }
        allVariants.push(...part);
      }

      const variants = messages
        .map((m, i) => ({ index: m.index, text: String(allVariants[i] ?? "").trim() }))
        .filter((v) => v.text.length > 0);
      return c.json({ variants }, 200);
```

> Notes:
> - With `BATCH_SIZE = 8` each call carries at most 8 short WhatsApp messages, whose paraphrases fit
>   comfortably under the output ceiling — truncation should effectively never happen now. The
>   truncation branch is kept as a safety net but its copy now points at a single over-long message.
> - Batches run **sequentially** (`await` in the loop) to avoid provider rate-limit bursts. For 100
>   messages that is at most 13 calls — acceptable latency for an explicit button click.
> - `allVariants` ends up the same length and order as `messages`, so the final mapping and the
>   `{ variants: [{ index, text }] }` response are byte-identical in shape to before.

**Verify** (after Steps 1-3):
- `cd backend && bun run check` → no error lines referencing `src/api/flowRoutes.ts` (ignore the
  unrelated `scripts/*.ts` noise described above).
- `grep -c "BATCH_SIZE" backend/src/api/flowRoutes.ts` → returns **3** (declaration + the two uses
  in the loop bounds/slice).
- `grep -c "function extractVariants" backend/src/api/flowRoutes.ts` → returns **1**, and it must be
  at module scope (not indented inside the handler). Confirm by eye that it sits at column 0.
- `grep -c "max(100)" backend/src/api/flowRoutes.ts` → returns **1**; `grep -c "max(40)"` → **0**.

### Step 4 — Remove the duplicate header badge (StepNode.tsx)

Delete the `stepVariantCount` const (`StepNode.tsx:30-33`) **and** the header badge `<span>` block
(`StepNode.tsx:59-67`). Leave everything else — including the per-tile `variantCount` badge and the
`Shuffle` import — untouched.

**Verify**:
- `cd dashboard && bun run build` → exit 0.
- `cd dashboard && bun run lint` → exit 0 (no "unused variable `stepVariantCount`").
- `grep -c "stepVariantCount" dashboard/src/components/canvas/StepNode.tsx` → returns **0**.
- `grep -c "variantCount" dashboard/src/components/canvas/StepNode.tsx` → returns **3** (the kept
  per-tile badge: declaration + the two usages). Report the actual number.
- `grep -c "Shuffle" dashboard/src/components/canvas/StepNode.tsx` → returns **≥2** (import + tile
  badge usage) — confirms the import was NOT removed.

### Step 5 — Auto-expand variants when a step is selected (FlowCanvas.tsx)

Goal (Issue 3): when the user selects a step, every message in that step that has variants should
have its versions panel **expanded by default**, so the texts are immediately readable.

`FlowCanvas` already holds `expandedVariants` (a `Set<number>` of message indices within the selected
step) and passes it to the right panel:

```tsx
// FlowCanvas.tsx:66 — state
const [expandedVariants, setExpandedVariants] = useState<Set<number>>(new Set());
```

```tsx
// FlowCanvas.tsx:102-110 — selection derivation + selectNode (clears the set)
const selectedStepIndex = useMemo(() => {
  if (!selectedNodeId || selectedNodeId === START_NODE_ID) return null;
  return draft.steps.findIndex((s, i) => stepNodeId(s, i) === selectedNodeId);
}, [selectedNodeId, draft.steps]);

function selectNode(id: string | null) {
  setSelectedNodeId(id);
  setExpandedVariants(new Set());
}
```

Add a `useEffect` that re-applies the default-expanded set **whenever the selected step changes**
(keyed on `selectedNodeId` only, so editing within the current step does not fight the user's manual
collapses). Place it **immediately after** the `selectNode` function (i.e. right after
`FlowCanvas.tsx:110`):

```tsx
  // When a step is selected, expand by default every message that already has variants, so the
  // alternate versions are readable without opening each one. Re-applies only when the selected
  // step changes (not on every edit), so manual collapses within a step are preserved.
  useEffect(() => {
    if (selectedStepIndex == null || selectedStepIndex < 0) return;
    const step = draft.steps[selectedStepIndex];
    if (!step) return;
    const toExpand = new Set<number>();
    step.messages.forEach((m, i) => {
      if ((m.textVariants?.length ?? 0) > 0) toExpand.add(i);
    });
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setExpandedVariants(toExpand);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNodeId]);
```

> Notes:
> - This composes correctly with the plan-005 focus reveal: after generating variants the focus logic
>   selects the affected step, and this effect then expands **all** of that step's varied messages
>   (a superset of the single focused one) — which is the desired "show me everything" behavior.
> - `useEffect` is already imported in `FlowCanvas.tsx` (the existing reset effect uses it) — do not
>   add a duplicate import.
> - Do NOT remove the `setExpandedVariants(new Set())` inside `selectNode`/`resetDraft`; the new
>   effect runs right after and fills the defaults. Leaving the clear in place keeps the
>   non-variant case (no varied messages) correctly collapsed.

**Verify**:
- `cd dashboard && bun run build` → exit 0; `cd dashboard && bun run lint` → exit 0.
- `grep -c "toExpand" dashboard/src/components/FlowCanvas.tsx` → returns **3** (declaration + `.add` +
  the `new Set` argument usage). Report the actual number.

## Test plan

No automated harness (see `plans/README.md`). Verification is the typecheck/build/lint above plus a
manual smoke test (human, real DeepSeek key):

1. `cd backend && bun run dev`, `cd dashboard && bun run dev`.
2. Open a **long** flow (many text steps — the one that previously failed). Click "Generar variante
   con IA". Expect: it now completes without the "demasiado largo" error (generation happens in
   batches under the hood).
3. Click it again to add a second variant per message → also succeeds (input is the same size each
   time; batching makes it reliable).
4. On the canvas, a step with one text message now shows the shuffle icon **once** (on the message
   tile, e.g. "⤨ 2"), not twice. The header no longer has its own shuffle badge.
5. Click a step that has variants → its messages' versions panels are **already expanded** (you can
   read "Versión 1 (principal)", "Versión 2", … without clicking). Collapse one manually, then click
   a different step and back → defaults re-apply on the step change; messages without variants stay
   collapsed. Save; reload; variants persist.

## Done criteria

ALL must hold:

- [ ] `cd backend && bun run check` → no error referencing `src/api/flowRoutes.ts` or
      `src/ai/assistant.ts` (unrelated `scripts/*.ts` errors are acceptable and pre-existing).
- [ ] `cd dashboard && bun run build` exits 0; `cd dashboard && bun run lint` exits 0.
- [ ] `grep -c "BATCH_SIZE" backend/src/api/flowRoutes.ts` → `3`.
- [ ] `grep -c "function extractVariants" backend/src/api/flowRoutes.ts` → `1` (module scope).
- [ ] `grep -c "max(100)" backend/src/api/flowRoutes.ts` → `1`; `grep -c "max(40)"` → `0`.
- [ ] `grep -c "stepVariantCount" dashboard/src/components/canvas/StepNode.tsx` → `0`.
- [ ] `grep -c "toExpand" dashboard/src/components/FlowCanvas.tsx` → `3`.
- [ ] Only `backend/src/api/flowRoutes.ts`, `dashboard/src/components/canvas/StepNode.tsx`, and
      `dashboard/src/components/FlowCanvas.tsx` modified (`git status`). No `assistant.ts`, no
      `api_v1.d.ts`, no `scripts/*.ts`.
- [ ] `plans/README.md` status row updated (if the file exists in your tree; if `plans/` is absent,
      skip and say so — do not create a new `plans/` tree).

## STOP conditions

Stop and report (do not improvise) if:

- The "Current state" excerpts don't match live code (drift since `9e00888`).
- After hoisting, `extractVariants` would need any handler-local variable (it does not — it only uses
  its `text` argument) — if you find a dependency, STOP rather than passing extra params.
- `bun run check` reports an error in `src/api/flowRoutes.ts` itself (not the unrelated scripts) that
  you cannot fix with the literal code above after one reasonable attempt — report the exact error.
- Frontend lint flags something other than the expected removal — report rather than deleting more.
- You conclude batching still truncates a single batch even at `BATCH_SIZE = 8` — that would mean one
  individual message is enormous; report it (the per-message-too-long copy already covers the user
  message, but a structural change like per-message calls would be a new decision).

## Maintenance notes

- `BATCH_SIZE = 8` is conservative. If latency on big flows becomes a complaint, batches could run
  with bounded concurrency (e.g. `Promise.all` over groups of 2–3) — but watch provider rate limits;
  sequential is the safe default.
- The request cap is now 100 messages. If flows ever exceed that, raise the cap and rely on batching;
  there is no longer a single-call size limit to worry about.
- The single source of the "it worked" signal is now: the per-message tile badge + the plan-005
  auto-select/expand of the first varied message. If a future redesign wants a per-step summary
  again, make it count the **same** unit as the tile (versions, not raw variants) and show it only
  where tiles are hidden (steps with >3 messages), to avoid re-introducing this duplication.
