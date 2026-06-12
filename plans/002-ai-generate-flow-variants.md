# Plan 002: "Generate AI variant" button — paraphrase a whole flow's text messages in one click

> **Executor instructions**: Follow this plan step by step. Run every verification command and
> confirm the expected result before moving on. If anything in "STOP conditions" occurs, stop and
> report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 235c922..HEAD -- backend/src/ai/assistant.ts backend/src/api/flowRoutes.ts dashboard/src/pages/FlowEditPage.tsx dashboard/src/lib/api.ts dashboard/src/lib/hooks.ts dashboard/src/lib/flowUtils.ts`
> If any changed since `235c922`, compare the "Current state" excerpts against live code; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (adds an AI-calling endpoint; UI mutates editor draft state)
- **Depends on**: 001 — DONE, merged to main at commit `235c922` (so `getDefaultModel` and the
  provider unions already cover all 6 providers; this plan's new code targets that landed state)
- **Category**: direction (feature)
- **Planned at**: commit `df009e2`, 2026-06-12 — **reconciled to `235c922`, 2026-06-12** (after plan 001 merged)

## Why this matters

A flow's text messages already support **variants** (`text_variants: string[]` per message — the bot
picks one at random when sending, to look less robotic). Today the user types each variant by hand.
The ask: an **AI button in the flow editor** that, in one click, generates a complete paraphrased
variant of the **entire** flow — every text message reworded once, keeping the same structure, tone,
intent, emojis, and any placeholders — and appends each rewording as a new variant on its message.
This turns a tedious manual task into one click and uses the org's already-configured BYOK provider.

**Design choice (important):** the new endpoint does NOT persist anything. It returns paraphrase
*suggestions*; the frontend appends them to the in-memory editor draft, and the user saves through
the **existing** `upsert_flow_tree` path (which already persists `textVariants`). This keeps the
write path unchanged and low-risk, and lets the user review/discard before saving.

## Current state

### How variants are stored and saved (already works — do not change the storage path)

```ts
// dashboard/src/lib/flowUtils.ts:7-16  — editor message model
export type FlowEditorMessage = {
  id?: string;
  position: number;
  messageType: FlowMessageType;
  textContent?: string | null;
  textVariants?: string[];      // <-- variants live here
  mediaUrl?: string | null;
  filename?: string | null;
  caption?: string | null;
};
```

```ts
// dashboard/src/pages/FlowEditPage.tsx:252-261  — save already serializes textVariants
messages: s.messages.map((m, j) => ({
  id: m.id, position: j, messageType: m.messageType,
  textContent: m.textContent || null,
  textVariants: m.textVariants?.filter(Boolean) ?? [],   // <-- persisted via upsert
  mediaUrl: m.mediaUrl || null, filename: m.filename || null, caption: m.caption || null,
})),
```

The backend `POST /flows/upsert` (`backend/src/api/flowRoutes.ts:191-238`) and the
`upsert_flow_tree` RPC already write `text_variants`. **Nothing about saving needs to change.**

### The flow editor host — where the AI button goes

`FlowEditPage` renders `<FlowCanvas>` with a `renderActions` render-prop that receives the live
`draft`. This is the toolbar where action buttons live (Discard / Save-as-template / Delete today):

```tsx
// dashboard/src/pages/FlowEditPage.tsx:354-395 (abridged)
<FlowCanvas
  key={editorKey}
  initialDraft={currentDraft}
  onSave={handleSave}
  ...
  renderActions={({ draft, dirty: isDirty, resetDraft }) => (
    <>
      <Button variant="outline" onClick={() => { resetDraft(); localStorage.removeItem("flow_draft"); }} disabled={!isDirty}>
        Descartar cambios
      </Button>
      <Button variant="outline" className="gap-1.5" disabled={!draft.name.trim()} onClick={() => openSaveTemplate(draft)}>
        <BookMarked size={14} /> Guardar como plantilla
      </Button>
      {draft.id && ( <Button ...>Eliminar flow</Button> )}
    </>
  )}
/>
```

To inject AI results into the live editor, follow the **exact pattern already used** by save and
template-restore: build a new draft object and re-seed the canvas via `setCurrentDraft(newDraft)`
followed by `setEditorKey((k) => k + 1)` (the `key` change remounts `FlowCanvas` with the new
`initialDraft`). See `FlowEditPage.tsx:268-270` (post-save) and `:150-151` (template) for the pattern.

### The AI provider infrastructure to reuse

```ts
// backend/src/ai/assistant.ts:121-154 — per-org dispatch, gated on ai_enabled (post-flow responder)
export async function askAssistantForOrg(text, orgConfig, systemOverride?): Promise<AssistantResult | null>
```

Since plan 001 landed, `backend/src/ai/assistant.ts` already contains a `const OPENAI_COMPATIBLE_URLS`
map (`as const`, keys `openai|groq|deepseek|openrouter`), an `askOpenAICompatible` helper, a
6-provider `getDefaultModel` (line 109), and the `GoogleGenAI` import. Your new code (Step 1) lives
alongside these — it does NOT modify them.

`askAssistantForOrg` is the **wrong** entry point to reuse directly: it is gated on `ai_enabled`
(which governs the *auto-responder*, not editor tools), forces a sales JSON schema, and caps
`max_tokens` at 280. This plan adds a sibling helper, `generateRawForOrg`, that returns the raw model
text and is gated only on a provider+key being configured.

```ts
// backend/src/db/organizations.ts:23 — load decrypted org AI config by org id (cached)
export async function getOrgAiConfig(organizationId: string): Promise<OrgAiConfig>
```

```ts
// backend/src/api/flowRoutes.ts:62-66 — org id helper available inside flow routes
function orgId(c: any) { const id = getSession(c).organizationId; if (!id) throw new Error(...); return id; }
```

### Convention to follow

- Backend: `@hono/zod-openapi` `createRoute` + Zod schemas; validate with `c.req.valid("json")`.
  New routes are registered inside `registerFlowRoutes(dashboardApi)` in `flowRoutes.ts`.
- Frontend data access: hand-written fetch wrappers in `dashboard/src/lib/api.ts`, TanStack Query
  hooks in `dashboard/src/lib/hooks.ts`. Model the new ones on `validateAiProvider` (api.ts:456-470)
  and `useValidateAiMutation` (hooks.ts:291-299).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Backend typecheck | `cd backend && bun run check` | exit 0 |
| Frontend build | `cd dashboard && bun run build` | exit 0 |
| Frontend lint | `cd dashboard && bun run lint` | exit 0 |

## Scope

**In scope** (modify):
- `backend/src/ai/assistant.ts` — add `generateRawForOrg` + raw provider helpers.
- `backend/src/api/flowRoutes.ts` — add `POST /flows/generate-variants` route.
- `dashboard/src/lib/api.ts` — add `generateFlowVariants` wrapper.
- `dashboard/src/lib/hooks.ts` — add `useGenerateFlowVariantsMutation`.
- `dashboard/src/pages/FlowEditPage.tsx` — add the AI button + apply-to-draft handler.

**Out of scope** (do NOT touch):
- `upsert_flow_tree` RPC / the SQL migrations — the save path is unchanged.
- `FlowCanvas.tsx`, `FlowEditor.tsx`, `MessageEditor.tsx`, `VariantsPanel.tsx` — the existing
  variant UI already renders `textVariants`; appending to the array is enough. Do not refactor them.
- `askAssistantForOrg` and the post-flow responder behavior.

## Git workflow

- Branch: `advisor/002-ai-flow-variants`
- Conventional commits (e.g. `feat(flows): AI button to generate a paraphrased flow variant`).
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Backend — add `generateRawForOrg` to `assistant.ts`

Add a raw (non-JSON-coerced) completion helper. It dispatches per provider and returns the raw model
text. Place it after `validateAiProvider` (end of file). It defines its own `Record<string,string>`
URL map (kept deliberately — see the note after the code block):

```ts
// Raw text completion using the org's BYOK provider. Unlike askAssistantForOrg this is NOT gated on
// ai_enabled (that flag governs the auto-responder, not editor tools) and does not coerce to the
// sales JSON schema — it returns whatever the model produced. Returns null if no provider/key configured.
const RAW_OPENAI_COMPATIBLE_URLS: Record<string, string> = {
  openai: "https://api.openai.com/v1/chat/completions",
  groq: "https://api.groq.com/openai/v1/chat/completions",
  deepseek: "https://api.deepseek.com/v1/chat/completions",
  openrouter: "https://openrouter.ai/api/v1/chat/completions",
};

async function rawOpenAICompatible(url: string, system: string, user: string, apiKey: string, model: string, maxTokens: number): Promise<string> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model, max_tokens: maxTokens, temperature: 0.7,
      messages: [ { role: "system", content: system }, { role: "user", content: user } ],
    }),
  });
  if (!res.ok) throw new Error(`AI API error ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content ?? "";
}

async function rawAnthropic(system: string, user: string, apiKey: string, model: string, maxTokens: number): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] }),
  });
  if (!res.ok) throw new Error(`Anthropic API error ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { content?: Array<{ text?: string }> };
  return data.content?.[0]?.text ?? "";
}

async function rawGemini(system: string, user: string, apiKey: string, model: string, maxTokens: number): Promise<string> {
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model,
    config: { temperature: 0.7, maxOutputTokens: maxTokens, systemInstruction: system },
    contents: [{ role: "user", parts: [{ text: user }] }],
  });
  return response.text ?? "";
}

export async function generateRawForOrg(
  system: string,
  user: string,
  orgConfig: OrgAiConfig,
  maxTokens = 3000,
): Promise<string | null> {
  if (!orgConfig.ai_provider || !orgConfig.ai_api_key) return null;
  const apiKey = orgConfig.ai_api_key;
  const model = orgConfig.ai_model ?? getDefaultModel(orgConfig.ai_provider);
  const p = orgConfig.ai_provider;
  if (p === "gemini") return await rawGemini(system, user, apiKey, model, maxTokens);
  if (p === "anthropic") return await rawAnthropic(system, user, apiKey, model, maxTokens);
  const url = RAW_OPENAI_COMPATIBLE_URLS[p];
  if (!url) return null;
  return await rawOpenAICompatible(url, system, user, apiKey, model, maxTokens);
}
```

`GoogleGenAI` and `getDefaultModel` are already in this file (import at top, function at line 109).
`getDefaultModel` already accepts all 6 providers (plan 001 widened it), so `getDefaultModel(orgConfig.ai_provider)`
typechecks. **Why a separate `RAW_OPENAI_COMPATIBLE_URLS` (`Record<string,string>`) instead of reusing
001's `OPENAI_COMPATIBLE_URLS`?** Because `OPENAI_COMPATIBLE_URLS` is `as const` with strict keys, so
indexing it with `orgConfig.ai_provider` (the full 6-member union, which includes `gemini`/`anthropic`)
fails typecheck. The `Record<string,string>` map sidesteps that and returns `undefined` for the
non-OpenAI-compatible providers, which the `if (!url) return null;` guard handles. This is intentional,
minimal duplication — do NOT modify 001's `OPENAI_COMPATIBLE_URLS`.

**Verify**: `cd backend && bun run check` → exit 0.

### Step 2: Backend — add `POST /flows/generate-variants`

In `backend/src/api/flowRoutes.ts`, add imports at the top:

```ts
import { getOrgAiConfig } from "../db/organizations";
import { generateRawForOrg } from "../ai/assistant";
```

Inside `registerFlowRoutes(dashboardApi)` (after the `/flows/upsert` route, before the closing `}`),
register:

```ts
dashboardApi.openapi(
  createRoute({
    method: "post",
    path: "/flows/generate-variants",
    request: {
      headers: AuthHeaderSchema,
      body: {
        required: true,
        content: {
          "application/json": {
            schema: z.object({
              messages: z
                .array(z.object({ index: z.number().int(), text: z.string().min(1) }))
                .min(1)
                .max(40),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Generated variants",
        content: {
          "application/json": {
            schema: z.object({ variants: z.array(z.object({ index: z.number().int(), text: z.string() })) }),
          },
        },
      },
      400: { description: "No AI provider configured / bad input", content: { "application/json": { schema: ErrorSchema } } },
      502: { description: "AI generation failed", content: { "application/json": { schema: ErrorSchema } } },
    },
  }),
  async (c) => {
    const { messages } = c.req.valid("json");
    const orgConfig = await getOrgAiConfig(orgId(c));
    if (!orgConfig.ai_provider || !orgConfig.ai_api_key) {
      return c.json({ error: "No hay proveedor de IA configurado. Configurá uno en Ajustes." }, 400);
    }

    const system =
      "Eres un redactor experto en mensajes de WhatsApp para ventas. Te paso un arreglo JSON de " +
      "mensajes de un bot. Devuelve EXACTAMENTE un arreglo JSON de strings, mismo largo y mismo " +
      "orden, donde cada elemento es una PARÁFRASIS del mensaje original: mismo significado, mismo " +
      "tono, misma intención y estructura, pero con otras palabras. Conservá emojis, saltos de " +
      "línea y cualquier placeholder como {{nombre}} o {nombre} sin modificarlos. No agregues texto " +
      "fuera del arreglo JSON.";
    const user = JSON.stringify(messages.map((m) => m.text));

    let raw: string | null;
    try {
      raw = await generateRawForOrg(system, user, orgConfig);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: `Fallo del proveedor de IA: ${msg}` }, 502);
    }
    if (!raw) return c.json({ error: "El proveedor de IA no devolvió respuesta." }, 502);

    // Extract a JSON array of strings from the model output.
    let parsed: unknown;
    try {
      const start = raw.indexOf("[");
      const end = raw.lastIndexOf("]");
      parsed = JSON.parse(start >= 0 && end > start ? raw.slice(start, end + 1) : raw);
    } catch {
      return c.json({ error: "No se pudo interpretar la respuesta de la IA." }, 502);
    }
    if (!Array.isArray(parsed) || parsed.length !== messages.length) {
      return c.json({ error: "La IA devolvió una cantidad inesperada de variantes." }, 502);
    }

    const variants = messages.map((m, i) => ({ index: m.index, text: String(parsed[i] ?? "").trim() }))
      .filter((v) => v.text.length > 0);
    return c.json({ variants }, 200);
  },
);
```

`ErrorSchema`, `AuthHeaderSchema`, `orgId`, `createRoute`, `z` are all already imported/defined in
this file (lines 1-66).

**Verify**: `cd backend && bun run check` → exit 0.

### Step 3: Frontend — `api.ts` wrapper

In `dashboard/src/lib/api.ts`, add a method next to `validateAiProvider` (after line 470), modeled on it:

```ts
generateFlowVariants: (payload: { messages: { index: number; text: string }[] }) =>
  buildHeaders(true).then((headers) =>
    fetch(`${API_URL}/api/flows/generate-variants`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    }).then((r) => {
      if (!r.ok) return throwApiError(r);
      return r.json() as Promise<{ variants: { index: number; text: string }[] }>;
    })
  ),
```

**Verify**: `cd dashboard && bun run build` → exit 0.

### Step 4: Frontend — `hooks.ts` mutation

In `dashboard/src/lib/hooks.ts`, after `useValidateAiMutation` (line 299), add:

```ts
export function useGenerateFlowVariantsMutation() {
  return useMutation({
    mutationFn: (payload: { messages: { index: number; text: string }[] }) =>
      api.generateFlowVariants(payload),
  });
}
```

**Verify**: `cd dashboard && bun run build` → exit 0.

### Step 5: Frontend — AI button + apply-to-draft in `FlowEditPage.tsx`

1. Add imports: `Sparkles` from `lucide-react` (the toolbar already imports `BookMarked, Trash2`),
   and `useGenerateFlowVariantsMutation` from `@/lib/hooks`.

2. Inside the component, near the other mutations (after line 101), add:
   ```ts
   const generateVariants = useGenerateFlowVariantsMutation();
   ```

3. Add a handler (place it near `handleSave`, after line 275). It collects text messages, calls the
   endpoint, and re-seeds the canvas with appended variants using the existing
   `setCurrentDraft` + `setEditorKey` pattern:
   ```ts
   async function handleGenerateVariants(draft: FlowEditorDraft) {
     // Flatten text messages with non-empty content, keeping a stable index map.
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
       // Build a new draft with each generated paraphrase appended to its message's textVariants.
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

4. Add the button inside `renderActions`, before "Guardar como plantilla" (around line 374):
   ```tsx
   <Button
     variant="outline"
     className="gap-1.5"
     disabled={generateVariants.isPending}
     onClick={() => void handleGenerateVariants(draft)}
   >
     <Sparkles size={14} />
     {generateVariants.isPending ? "Generando…" : "Generar variante con IA"}
   </Button>
   ```

**Verify**:
- `cd dashboard && bun run build` → exit 0.
- `cd dashboard && bun run lint` → exit 0.

## Test plan

No automated test harness (see `plans/README.md`). Verification is typecheck + build + lint plus a
**manual smoke test** (human, with a configured AI provider + key on the org):

1. `cd backend && bun run dev`; `cd dashboard && bun run dev`.
2. Open a flow with ≥2 text messages at `/flows/:id/edit`.
3. Click **Generar variante con IA**. Expect a success toast and, on each text message, the variant
   count badge increments by one (open the variants panel to see the new paraphrase).
4. Save the flow. Reload → the new variants persist (proves the existing upsert path stored them).
5. Negative: on an org with no AI provider configured, the button shows an error toast (HTTP 400).

Document that step 3-5 require a live key; do not block plan completion on them.

## Done criteria

ALL must hold:

- [ ] `cd backend && bun run check` exits 0.
- [ ] `cd dashboard && bun run build` exits 0.
- [ ] `cd dashboard && bun run lint` exits 0.
- [ ] `grep -n "generate-variants" backend/src/api/flowRoutes.ts` → route present.
- [ ] `grep -n "generateRawForOrg" backend/src/ai/assistant.ts` → exported function present.
- [ ] `grep -n "Generar variante con IA" dashboard/src/pages/FlowEditPage.tsx` → button present.
- [ ] No files outside the in-scope list are modified (`git status`), and `upsert_flow_tree` / SQL
      migrations are untouched.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report (do not improvise) if:

- The "Current state" excerpts don't match live code (drift since `235c922`) — especially if the
  `renderActions`/`setCurrentDraft`+`setEditorKey` re-seed pattern in `FlowEditPage.tsx` has changed.
- `bun run check`/`build` fails twice after a reasonable fix.
- You find that appending to `textVariants` does NOT show up in the editor's variant panel — that
  implies the variant UI reads variants differently than assumed; report rather than refactoring
  `FlowCanvas`/`MessageEditor`/`VariantsPanel` (out of scope).
- The AI consistently returns a wrong-length array even for small flows — report; the prompt or the
  one-call-for-all-messages strategy may need rethinking (do not silently switch to per-message calls,
  which changes cost characteristics).

## Maintenance notes

- The endpoint paraphrases **only `text` messages**; captions on media messages are intentionally not
  touched (kept simple). If product wants captions paraphrased too, extend the flatten step in
  `handleGenerateVariants` and the server prompt.
- One AI call handles the whole flow (cheaper, atomic). `max(40)` input messages and `max_tokens=3000`
  are guardrails — a very large flow would hit them; revisit if flows grow.
- `generateRawForOrg` defines its own `RAW_OPENAI_COMPATIBLE_URLS` (`Record<string,string>`), which now
  duplicates the URLs in 001's `OPENAI_COMPATIBLE_URLS` (`as const`). This is intentional (the `as const`
  map can't be indexed by the full provider union — see Step 1 note). A later cleanup could unify them
  behind one helper that accepts the union and narrows internally; harmless duplication until then.
- A reviewer should check: the endpoint never returns or logs the org's API key (it doesn't — keys flow
  only through `generateRawForOrg`), and the prompt preserves placeholders/emojis (verify in smoke test).
