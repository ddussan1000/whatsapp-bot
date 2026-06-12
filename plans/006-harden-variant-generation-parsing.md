# Plan 006: Harden AI variant-generation parsing (JSON mode, truncation, robust extraction)

> **Executor instructions**: Follow this plan step by step. Run every verification command and
> confirm the expected result before moving on. If anything in "STOP conditions" occurs, stop and
> report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**:
> ```
> git diff --stat 8596d6c..HEAD -- backend/src/ai/assistant.ts backend/src/api/flowRoutes.ts
> ```
> If either file changed since `8596d6c`, compare the "Current state" excerpts below against the
> live code; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P0 (the feature fails intermittently in production use)
- **Effort**: M
- **Risk**: LOW–MEDIUM (backend-only; one AI request shape + one parse path; no DB, no API contract change)
- **Depends on**: 002 (DONE — the variant feature), 001 (DONE — DeepSeek/OpenRouter providers)
- **Category**: bug
- **Planned at**: commit `8596d6c`, 2026-06-12

## Why this matters

The "Generar variante con IA" button calls `POST /flows/generate-variants`. It works sometimes and
fails other times with **502 `"No se pudo interpretar la respuesta de la IA."`** (frontend then shows
`"No se pudieron generar variantes…"`). Confirmed real on the user's DeepSeek setup.

Root cause — the request is not pinned to a deterministic JSON shape and the parse is brittle
(`backend/src/api/flowRoutes.ts` + `backend/src/ai/assistant.ts`):

1. **No JSON mode + `temperature: 0.7`** (`assistant.ts:171`). The request never sends
   `response_format: { type: "json_object" }`. So the model is free to wrap the array in
   ` ```json … ``` ` fences, prepend prose ("Aquí tienes:"), or vary formatting run to run — which
   is exactly why it succeeds once and fails the next time.
2. **Fragile extraction** (`flowRoutes.ts:466-468`): it slices `raw.indexOf("[")` …
   `raw.lastIndexOf("]")` then `JSON.parse`. This breaks if any message text contains `]`, if the
   model adds trailing prose containing a bracket, or if the output was **truncated** at
   `max_tokens: 3000` (long flows → the closing `]` never arrives → parse throws).
3. **No truncation detection and no server-side logging** of the raw output, so the failure is
   invisible and undiagnosable.

The fix: ask for a JSON **object** (`{"variants":[…]}`) with `response_format: json_object` at
`temperature: 0`, detect truncation, extract robustly (strip fences, accept object-or-array), scale
`max_tokens` to the input, and log the raw output server-side on parse failure.

> **Out of scope reminder**: the separate `ioredis getaddrinfo ENOTFOUND` error the user saw is
> unrelated (message-queue worker pointing at a remote Redis URL) and is a `.env` config issue, NOT
> part of this plan. Do not touch Redis, env, or worker code.

## Current state

### A. `backend/src/ai/assistant.ts`

```ts
// assistant.ts:166-178 — OpenAI-compatible raw completion (used by DeepSeek/OpenRouter/OpenAI/Groq)
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
```

```ts
// assistant.ts:201-216 — generic per-org raw entrypoint
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

`rawOpenAICompatible` is **only** called from `generateRawForOrg` (verify with
`rg -n "rawOpenAICompatible" backend/src`). `generateRawForOrg` is called from
`flowRoutes.ts` (the variant endpoint) — verify with `rg -n "generateRawForOrg" backend/src`. If
either has additional callers, treat as a STOP condition and report (the signature changes below
must not break another caller).

### B. `backend/src/api/flowRoutes.ts`

The endpoint (imports `generateRawForOrg` at line 7, `getOrgAiConfig` at line 6; the shared pino
logger is **not yet imported here**):

```ts
// flowRoutes.ts:438-480 — POST /flows/generate-variants handler
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
```

The shared logger is `import { log } from "../logger";` (pino; `log.error(obj, msg)` /
`log.warn(...)`). The request schema caps `messages` at `.min(1).max(40)` (line ~417-419) — keep
that.

### Convention to follow

- Backend = Hono + `@hono/zod-openapi`, Bun runtime, `fetch` for HTTP. Match the existing helper
  style in `assistant.ts` (plain async fns, `throw new Error(...)` on failure).
- Keep TypeScript strict — `bun run check` (`tsc --noEmit`) must pass with zero errors.
- Do not introduce new dependencies.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Backend typecheck | `cd backend && bun run check` | exit 0, no errors |

(There is no backend test runner wired up; do not add one.)

## Scope

**In scope** (modify):
- `backend/src/ai/assistant.ts` — give `rawOpenAICompatible` an options bag (JSON mode + temperature)
  and surface truncation; thread options through `generateRawForOrg`.
- `backend/src/api/flowRoutes.ts` — request an object via JSON mode at temp 0, scale `max_tokens`,
  parse robustly (strip fences, accept `{variants:[…]}` or bare array), map truncation to a clear
  502, and log the raw output server-side on parse failure.

**Out of scope** (do NOT touch):
- `rawGemini` / `rawAnthropic` internals beyond what threading the options bag requires (for those two
  providers, JSON mode is provider-specific; this plan only hardens the OpenAI-compatible path the
  user hit — DeepSeek. Passing the options through is fine, but do NOT try to implement Gemini/Anthropic
  JSON mode here — just ignore the jsonMode flag for them).
- Any frontend file (`dashboard/`), DB, SQL, env, Redis/worker code, or the request/response Zod
  schemas (the wire contract `{ variants: [{ index, text }] }` stays identical).
- The `.max(40)` message cap and the `parsed.length !== messages.length` invariant — keep both.

## Git workflow

- Branch: `advisor/006-harden-variant-parsing`
- Conventional commit (e.g. `fix(flows): pin JSON mode and robust parsing for AI variant generation`).
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1 — `rawOpenAICompatible`: JSON mode, temperature, truncation detection

Replace the function (`assistant.ts:166-178`) with this version. It adds an `opts` bag, sets
`response_format` when `jsonMode` is true, honors an explicit `temperature`, and throws a tagged
error when the provider truncated the output:

```ts
async function rawOpenAICompatible(
  url: string,
  system: string,
  user: string,
  apiKey: string,
  model: string,
  maxTokens: number,
  opts: { jsonMode?: boolean; temperature?: number } = {},
): Promise<string> {
  const body: Record<string, unknown> = {
    model,
    max_tokens: maxTokens,
    temperature: opts.temperature ?? 0.7,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  };
  if (opts.jsonMode) body.response_format = { type: "json_object" };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`AI API error ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
  };
  if (data.choices?.[0]?.finish_reason === "length") {
    throw new Error("AI_RESPONSE_TRUNCATED");
  }
  return data.choices?.[0]?.message?.content ?? "";
}
```

### Step 2 — `generateRawForOrg`: thread the options bag

Update the signature + the OpenAI-compatible call (`assistant.ts:201-216`) to accept and forward
`opts`. Gemini/Anthropic ignore it (do NOT change their helper calls):

```ts
export async function generateRawForOrg(
  system: string,
  user: string,
  orgConfig: OrgAiConfig,
  maxTokens = 3000,
  opts: { jsonMode?: boolean; temperature?: number } = {},
): Promise<string | null> {
  if (!orgConfig.ai_provider || !orgConfig.ai_api_key) return null;
  const apiKey = orgConfig.ai_api_key;
  const model = orgConfig.ai_model ?? getDefaultModel(orgConfig.ai_provider);
  const p = orgConfig.ai_provider;
  if (p === "gemini") return await rawGemini(system, user, apiKey, model, maxTokens);
  if (p === "anthropic") return await rawAnthropic(system, user, apiKey, model, maxTokens);
  const url = RAW_OPENAI_COMPATIBLE_URLS[p];
  if (!url) return null;
  return await rawOpenAICompatible(url, system, user, apiKey, model, maxTokens, opts);
}
```

**Verify** (after Steps 1-2):
- `cd backend && bun run check` → exit 0.
- `grep -c "jsonMode" backend/src/ai/assistant.ts` → returns **at least 3** (the `opts` type in
  `rawOpenAICompatible`, the `response_format` guard, and the `opts` type in `generateRawForOrg`).

### Step 3 — `flowRoutes.ts`: JSON object prompt, scaled tokens, robust parse, logging

3a. Add the logger import near the other imports at the top of `flowRoutes.ts` (after line 7):

```ts
import { log } from "../logger";
```

3b. In the handler, replace the `system`/`user` construction and the `generateRawForOrg` call so it
asks for a JSON **object** and uses JSON mode + temp 0 + scaled tokens. Replace the block from the
`const system =` declaration through the `raw = await generateRawForOrg(system, user, orgConfig);`
line with:

```ts
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
```

3c. Replace the extraction block (the `// Extract a JSON array…` comment through the
`if (!Array.isArray(parsed) …)` check) with a robust parser that strips markdown fences and accepts
either `{ "variants": [...] }` or a bare array, logging the raw output server-side on failure:

```ts
  // Robustly extract the variants array. Accept either {"variants":[...]} (JSON mode) or a bare
  // array, tolerating ```json fences and surrounding prose.
  function extractVariants(text: string): string[] | null {
    let s = text.trim();
    const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) s = fence[1].trim();
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
```

> Note: this replaces the old `let parsed: unknown; try { … } …` + `if (!Array.isArray(parsed) …)` +
> the final `const variants = …` block in one shot. Make sure you do NOT leave the old `parsed`
> code behind (no duplicate `const variants`). The function `extractVariants` is declared inside the
> handler (a local function declaration is fine here and matches the handler's existing local style).

**Verify** (after Step 3):
- `cd backend && bun run check` → exit 0.
- `grep -c "AI_RESPONSE_TRUNCATED" backend/src/api/flowRoutes.ts` → returns **1**.
- `grep -c "extractVariants" backend/src/api/flowRoutes.ts` → returns **3** (declaration + the
  `const arr = extractVariants(raw)` call + … actually count and report the real number; expected 2:
  the `function extractVariants` declaration and the call. If you also reference it elsewhere report
  that.) Report the exact number.
- `grep -c "response_format" backend/src/ai/assistant.ts` → returns **1**.
- `grep -n "jsonMode: true" backend/src/api/flowRoutes.ts` → present (1 line).

## Test plan

No backend test runner (see `plans/README.md`). Verification is `bun run check` (above) plus a manual
smoke test (human, needs a real DeepSeek key configured for the org):

1. `cd backend && bun run dev`, `cd dashboard && bun run dev`.
2. Open a flow with several text messages, click **"Generar variante con IA"** a few times in a row.
   - Expect: it succeeds consistently now (no intermittent "No se pudo interpretar…"); each text
     message gets a "Versión 2" (and the badges/auto-reveal from plan 005).
3. Try a deliberately **long** flow (many long text messages). If it exceeds the model's budget you
   should now get the clear message *"El flujo es demasiado largo…"* instead of the generic parse
   error.
4. If a parse error ever occurs, the backend log now contains a
   `generate-variants: unparseable AI response` line with a 500-char `rawSample` to diagnose with.
   Confirm the raw sample is logged **only server-side** and never returned to the client.

## Done criteria

ALL must hold:

- [ ] `cd backend && bun run check` exits 0.
- [ ] `grep -c "response_format" backend/src/ai/assistant.ts` → `1`.
- [ ] `grep -c "AI_RESPONSE_TRUNCATED" backend/src/ai/assistant.ts` → `1` and
      `grep -c "AI_RESPONSE_TRUNCATED" backend/src/api/flowRoutes.ts` → `1`.
- [ ] `grep -c "jsonMode" backend/src/ai/assistant.ts` → `≥3`.
- [ ] `grep -n "log.error" backend/src/api/flowRoutes.ts` → at least the unparseable-response line.
- [ ] The wire response is still `{ variants: [{ index, text }] }` (Zod response schema unchanged).
- [ ] Only `backend/src/ai/assistant.ts` and `backend/src/api/flowRoutes.ts` modified (`git status`).
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report (do not improvise) if:

- The "Current state" excerpts don't match live code (drift since `8596d6c`).
- `rawOpenAICompatible` or `generateRawForOrg` has callers other than the ones named above — the
  signature changes could break them; report instead of guessing.
- `bun run check` reports type errors you cannot resolve with the literal code above after one
  reasonable fix (e.g. a `Record<string, unknown>` body field typing issue) — report the exact error.
- You find the request schema or response schema would have to change to make this work — it should
  NOT; the wire contract is unchanged. If you think it must change, STOP and report.
- DeepSeek/the provider rejects `response_format: { type: "json_object" }` with a 4xx during the
  smoke test — report it; do not silently remove JSON mode (a provider-capability fallback is a
  follow-up, not part of this plan).

## Maintenance notes

- `response_format: { type: "json_object" }` is supported by OpenAI, DeepSeek, Groq, and most
  OpenRouter models, and requires the word "json" to appear in the prompt (it does). If a future
  OpenRouter model rejects it, add a per-provider capability flag rather than dropping JSON mode
  globally.
- Gemini and Anthropic still go through their own helpers without JSON mode. If variant generation
  is later enabled/relied upon for those providers, mirror this hardening there (Gemini:
  `responseMimeType: "application/json"`; Anthropic: prefill the assistant turn with `{`), plus their
  own truncation detection (`finish_reason` / `stop_reason === "max_tokens"`).
- The `max_tokens` heuristic (`inputChars / 2 + 500`, capped at 8000) is deliberately generous since
  paraphrases are ~same length as inputs. If very large flows still truncate, the next step is to
  chunk the messages array into batches and merge results, not to raise the cap unbounded.
