# Plan 001: Add DeepSeek & OpenRouter as selectable AI providers (BYOK)

> **Executor instructions**: Follow this plan step by step. Run every verification command and
> confirm the expected result before moving on. If anything in "STOP conditions" occurs, stop and
> report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat df009e2..HEAD -- backend/src/ai/assistant.ts backend/src/db/organizations.ts backend/src/api/dashboard.ts dashboard/src/pages/ConfigPage.tsx dashboard/src/lib/api.ts dashboard/src/lib/hooks.ts`
> If any of these changed since `df009e2`, compare the "Current state" excerpts below against the
> live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: direction (feature)
- **Planned at**: commit `df009e2`, 2026-06-12

## Why this matters

The platform lets each organization bring its own AI provider key (BYOK) for post-flow AI
responses. Today the supported set is hardcoded as `openai | gemini | anthropic | groq` in ~7
places across backend and frontend. The user wants two more: **DeepSeek** and **OpenRouter**.
Both expose an **OpenAI-compatible** Chat Completions API (same request/response shape as the
existing `openai` and `groq` integrations) — only the base URL, default model, and display label
differ. This is a low-risk, additive change. After it lands, an org can pick DeepSeek or
OpenRouter, paste their key, optionally set a model, and the bot answers with that provider.

## Current state

The provider literal `"openai" | "gemini" | "anthropic" | "groq"` (and its variants) is repeated
across these files. **Every one must be extended** to add `"deepseek"` and `"openrouter"`.

### Backend

`backend/src/ai/assistant.ts` — provider HTTP calls + dispatch. The two existing OpenAI-compatible
calls are identical except for the URL:

```ts
// backend/src/ai/assistant.ts:58-79  (Groq — OpenAI-compatible)
async function askGroq(text: string, systemPrompt: string, apiKey: string, model: string): Promise<AssistantResult> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model, max_tokens: 280, temperature: 0.3,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: text },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Groq API error ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const raw = data.choices?.[0]?.message?.content ?? '{"reply":"No pude responder","next_state":null,"send_catalog":false}';
  return extractJson(raw);
}
```

`askOpenAI` (lines 97-118) is the same with URL `https://api.openai.com/v1/chat/completions`.

```ts
// backend/src/ai/assistant.ts:120-127  (default model per provider)
function getDefaultModel(provider: "openai" | "gemini" | "anthropic" | "groq"): string {
  switch (provider) {
    case "openai": return "gpt-4o-mini";
    case "gemini": return "gemini-2.0-flash-lite";
    case "anthropic": return "claude-3-5-haiku-latest";
    case "groq": return "llama-3.3-70b-versatile";
  }
}
```

```ts
// backend/src/ai/assistant.ts:144-156  (dispatch in askAssistantForOrg)
if (orgConfig.ai_provider && orgConfig.ai_api_key) {
  const apiKey = orgConfig.ai_api_key;
  const model = orgConfig.ai_model ?? getDefaultModel(orgConfig.ai_provider);
  try {
    if (orgConfig.ai_provider === "openai") return await askOpenAI(text, systemPrompt, apiKey, model);
    if (orgConfig.ai_provider === "gemini") return await askGemini(text, systemPrompt, apiKey, model);
    if (orgConfig.ai_provider === "anthropic") return await askAnthropic(text, systemPrompt, apiKey, model);
    if (orgConfig.ai_provider === "groq") return await askGroq(text, systemPrompt, apiKey, model);
  } catch (err) {
    log.error({ err, provider: orgConfig.ai_provider }, "askAssistantForOrg: fallo proveedor org");
  }
}
```

```ts
// backend/src/ai/assistant.ts:164-176  (validateAiProvider — used by the "Verificar conexión" button)
export async function validateAiProvider(
  provider: "openai" | "gemini" | "anthropic" | "groq",
  apiKey: string,
  model: string,
): Promise<{ ok: boolean; error?: string }> {
  const testPrompt = 'Respond with exactly: {"ok":true}';
  const systemPrompt = "You are a test assistant. Follow instructions exactly.";
  try {
    if (provider === "openai") await askOpenAI(testPrompt, systemPrompt, apiKey, model);
    else if (provider === "gemini") await askGemini(testPrompt, systemPrompt, apiKey, model);
    else if (provider === "anthropic") await askAnthropic(testPrompt, systemPrompt, apiKey, model);
    else if (provider === "groq") await askGroq(testPrompt, systemPrompt, apiKey, model);
    return { ok: true };
  } catch (err) { ... }
}
```

`backend/src/db/organizations.ts:6` — the `OrgAiConfig` type:

```ts
ai_provider: "openai" | "gemini" | "anthropic" | "groq" | null;
```

`backend/src/api/dashboard.ts` — two Zod enums:

```ts
// dashboard.ts:5440  (POST /config/bot/validate-ai body)
provider: z.enum(["openai", "gemini", "anthropic", "groq"]),
// dashboard.ts:5533  (PUT /config/bot body)
ai_provider: z.enum(["openai", "gemini", "anthropic", "groq"]).nullable().optional(),
```

`backend/scripts/sql/20260406_org_ai_config.sql:4` — the DB `CHECK` constraint (inline, so Postgres
auto-named it `organizations_ai_provider_check`):

```sql
ADD COLUMN IF NOT EXISTS ai_provider text CHECK (ai_provider IN ('openai', 'gemini', 'anthropic', 'groq')),
```

### Frontend

`dashboard/src/pages/ConfigPage.tsx`:

```ts
// ConfigPage.tsx:86-91  (placeholder model shown in the input)
const MODEL_PLACEHOLDERS: Record<string, string> = {
  openai: "gpt-4o-mini",
  gemini: "gemini-2.0-flash-lite",
  anthropic: "claude-3-5-haiku-latest",
  groq: "llama-3.3-70b-versatile",
};
```

```tsx
// ConfigPage.tsx:281-289  (provider <Select> options)
<SelectContent>
  <SelectItem value="none">Sin proveedor (IA desactivada)</SelectItem>
  <SelectItem value="openai">OpenAI (GPT)</SelectItem>
  <SelectItem value="gemini">Gemini (Google)</SelectItem>
  <SelectItem value="anthropic">Anthropic (Claude)</SelectItem>
  <SelectItem value="groq">Groq (Llama)</SelectItem>
</SelectContent>
```

```ts
// ConfigPage.tsx:150-153  (cast when calling validate)
const result = await validateAiMutation.mutateAsync({
  provider: aiProvider as "openai" | "gemini" | "anthropic" | "groq",
  apiKey: aiApiKey, model,
});
```

```ts
// ConfigPage.tsx:175-181  (cast in onSave payload)
ai_provider: (aiProvider === "none" ? null : aiProvider || null) as
  | "openai" | "gemini" | "anthropic" | "groq" | null | undefined,
```

`dashboard/src/lib/api.ts:456-459` and `dashboard/src/lib/hooks.ts:293-296` — both have:

```ts
provider: "openai" | "gemini" | "anthropic" | "groq";
```

### Convention to follow

- Backend routes use `@hono/zod-openapi` (`createRoute` + Zod). Keep the `z.enum([...])` style.
- The existing OpenAI-compatible providers (`openai`, `groq`) use raw `fetch` with
  `Authorization: Bearer <key>` and parse `choices[0].message.content`. DeepSeek and OpenRouter
  use the **exact same shape**. Reuse it — see Step 1.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Backend typecheck | `cd backend && bun run check` | exit 0, no errors |
| Frontend typecheck + build | `cd dashboard && bun run build` | exit 0 |
| Frontend lint | `cd dashboard && bun run lint` | exit 0 |
| Find stale provider literals | `grep -rn '"groq"' backend/src dashboard/src` | every hit also lists the 6-provider set after edits |

## Scope

**In scope** (modify):
- `backend/src/ai/assistant.ts`
- `backend/src/db/organizations.ts`
- `backend/src/api/dashboard.ts`
- `dashboard/src/pages/ConfigPage.tsx`
- `dashboard/src/lib/api.ts`
- `dashboard/src/lib/hooks.ts`

**In scope** (create):
- `backend/scripts/sql/20260612_ai_provider_add_deepseek_openrouter.sql`

**Out of scope** (do NOT touch):
- `backend/src/crypto/encrypt.ts` — encryption is provider-agnostic; new providers reuse it unchanged.
- The OCR/Gemini-Vision receipt pipeline (`backend/src/receipts/`) — uses the server `GEMINI_API_KEY`,
  unrelated to org BYOK providers.
- `dashboard/src/lib/__gen__/api_v1.d.ts` — generated file; do not hand-edit.
- The existing `20260406_org_ai_config.sql` migration — never edit an applied migration; add a new one.

## Git workflow

- Branch: `advisor/001-ai-providers-deepseek-openrouter`
- Commit style — conventional commits, matching `git log` (e.g. `feat(ai): add DeepSeek and OpenRouter providers`).
- Do NOT push or open a PR unless the operator instructed it.

## Decided values (use exactly these)

| Provider | Literal | Display label | Base URL | Default model |
|----------|---------|---------------|----------|---------------|
| DeepSeek | `deepseek` | `DeepSeek` | `https://api.deepseek.com/v1/chat/completions` | `deepseek-chat` |
| OpenRouter | `openrouter` | `OpenRouter` | `https://openrouter.ai/api/v1/chat/completions` | `openai/gpt-4o-mini` |

Both are OpenAI-compatible: `Authorization: Bearer <key>`, body `{ model, messages, max_tokens, temperature }`,
response `choices[0].message.content`. (OpenRouter also accepts optional `HTTP-Referer` / `X-Title`
headers for usage ranking — omit them; they are not required.)

## Steps

### Step 1: Refactor the OpenAI-compatible call into one helper, add the two providers

In `backend/src/ai/assistant.ts`, replace the bodies of `askOpenAI` and `askGroq` with a shared
helper so all four OpenAI-compatible providers share one implementation (prevents 4-way drift).
Add the helper above `askOpenAI`:

```ts
const OPENAI_COMPATIBLE_URLS = {
  openai: "https://api.openai.com/v1/chat/completions",
  groq: "https://api.groq.com/openai/v1/chat/completions",
  deepseek: "https://api.deepseek.com/v1/chat/completions",
  openrouter: "https://openrouter.ai/api/v1/chat/completions",
} as const;

type OpenAICompatibleProvider = keyof typeof OPENAI_COMPATIBLE_URLS;

async function askOpenAICompatible(
  provider: OpenAICompatibleProvider,
  text: string,
  systemPrompt: string,
  apiKey: string,
  model: string,
): Promise<AssistantResult> {
  const res = await fetch(OPENAI_COMPATIBLE_URLS[provider], {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      max_tokens: 280,
      temperature: 0.3,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: text },
      ],
    }),
  });
  if (!res.ok) throw new Error(`${provider} API error ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const raw = data.choices?.[0]?.message?.content ?? '{"reply":"No pude responder","next_state":null,"send_catalog":false}';
  return extractJson(raw);
}
```

Then delete `askOpenAI` and `askGroq` (lines 58-79 and 97-118) — their call sites will use the
helper directly. (Keep `askAnthropic` and `askGemini` as-is; they are not OpenAI-compatible.)

**Verify**: `cd backend && bun run check` → will still error until Steps 2-3 update the call sites; that's expected. Proceed.

### Step 2: Widen the provider type and `getDefaultModel`

In `backend/src/ai/assistant.ts`, update `getDefaultModel` (lines 120-127) — change the parameter
type and add the two cases:

```ts
function getDefaultModel(provider: "openai" | "gemini" | "anthropic" | "groq" | "deepseek" | "openrouter"): string {
  switch (provider) {
    case "openai": return "gpt-4o-mini";
    case "gemini": return "gemini-2.0-flash-lite";
    case "anthropic": return "claude-3-5-haiku-latest";
    case "groq": return "llama-3.3-70b-versatile";
    case "deepseek": return "deepseek-chat";
    case "openrouter": return "openai/gpt-4o-mini";
  }
}
```

In `backend/src/db/organizations.ts:6`, widen the `OrgAiConfig.ai_provider` union:

```ts
ai_provider: "openai" | "gemini" | "anthropic" | "groq" | "deepseek" | "openrouter" | null;
```

### Step 3: Wire the new providers into dispatch + validation

In `askAssistantForOrg` (lines 148-152), replace the four `if` branches with:

```ts
if (orgConfig.ai_provider === "openai" || orgConfig.ai_provider === "groq" ||
    orgConfig.ai_provider === "deepseek" || orgConfig.ai_provider === "openrouter") {
  return await askOpenAICompatible(orgConfig.ai_provider, text, systemPrompt, apiKey, model);
}
if (orgConfig.ai_provider === "gemini") return await askGemini(text, systemPrompt, apiKey, model);
if (orgConfig.ai_provider === "anthropic") return await askAnthropic(text, systemPrompt, apiKey, model);
```

In `validateAiProvider` (lines 164-176), update the parameter type and branches the same way:

```ts
export async function validateAiProvider(
  provider: "openai" | "gemini" | "anthropic" | "groq" | "deepseek" | "openrouter",
  apiKey: string,
  model: string,
): Promise<{ ok: boolean; error?: string }> {
  const testPrompt = 'Respond with exactly: {"ok":true}';
  const systemPrompt = "You are a test assistant. Follow instructions exactly.";
  try {
    if (provider === "openai" || provider === "groq" || provider === "deepseek" || provider === "openrouter") {
      await askOpenAICompatible(provider, testPrompt, systemPrompt, apiKey, model);
    } else if (provider === "gemini") await askGemini(testPrompt, systemPrompt, apiKey, model);
    else if (provider === "anthropic") await askAnthropic(testPrompt, systemPrompt, apiKey, model);
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}
```

**Verify**: `cd backend && bun run check` → exit 0, no errors. (If errors remain, they point to a
missed call site — fix before continuing.)

### Step 4: Extend the two backend Zod enums

In `backend/src/api/dashboard.ts`, line 5440 and line 5533, add the two literals to each `z.enum`:

```ts
// line 5440
provider: z.enum(["openai", "gemini", "anthropic", "groq", "deepseek", "openrouter"]),
// line 5533
ai_provider: z.enum(["openai", "gemini", "anthropic", "groq", "deepseek", "openrouter"]).nullable().optional(),
```

**Verify**: `cd backend && bun run check` → exit 0.

### Step 5: Write the SQL migration (human applies it later)

Create `backend/scripts/sql/20260612_ai_provider_add_deepseek_openrouter.sql`:

```sql
-- Migration: allow DeepSeek and OpenRouter as org AI providers
-- The original CHECK was created inline in 20260406_org_ai_config.sql, so Postgres
-- auto-named it organizations_ai_provider_check. Drop and re-create with the wider set.
ALTER TABLE organizations DROP CONSTRAINT IF EXISTS organizations_ai_provider_check;
ALTER TABLE organizations
  ADD CONSTRAINT organizations_ai_provider_check
  CHECK (ai_provider IN ('openai', 'gemini', 'anthropic', 'groq', 'deepseek', 'openrouter'));
```

Do **not** attempt to run this. It is applied manually in Supabase Studio by a human (see
`plans/README.md`). Note it in your handoff.

**Verify**: file exists — `ls backend/scripts/sql/20260612_ai_provider_add_deepseek_openrouter.sql` → prints the path.

### Step 6: Frontend — provider literals, labels, and model placeholders

`dashboard/src/pages/ConfigPage.tsx`:

- Extend `MODEL_PLACEHOLDERS` (lines 86-91):
  ```ts
  const MODEL_PLACEHOLDERS: Record<string, string> = {
    openai: "gpt-4o-mini",
    gemini: "gemini-2.0-flash-lite",
    anthropic: "claude-3-5-haiku-latest",
    groq: "llama-3.3-70b-versatile",
    deepseek: "deepseek-chat",
    openrouter: "openai/gpt-4o-mini",
  };
  ```
- Add two `<SelectItem>`s after the `groq` one (line 288):
  ```tsx
  <SelectItem value="deepseek">DeepSeek</SelectItem>
  <SelectItem value="openrouter">OpenRouter</SelectItem>
  ```
- Widen both casts (lines 151 and 175-181) to include `| "deepseek" | "openrouter"`:
  ```ts
  provider: aiProvider as "openai" | "gemini" | "anthropic" | "groq" | "deepseek" | "openrouter",
  ```
  ```ts
  ai_provider: (aiProvider === "none" ? null : aiProvider || null) as
    | "openai" | "gemini" | "anthropic" | "groq" | "deepseek" | "openrouter" | null | undefined,
  ```

`dashboard/src/lib/api.ts` (line 457) and `dashboard/src/lib/hooks.ts` (line 294) — widen both
`provider:` union types to the 6-provider set:

```ts
provider: "openai" | "gemini" | "anthropic" | "groq" | "deepseek" | "openrouter";
```

**Verify**:
- `cd dashboard && bun run build` → exit 0.
- `cd dashboard && bun run lint` → exit 0.

## Test plan

No automated test harness exists (see `plans/README.md`). Verification is typecheck + build + lint
(above) plus this **manual smoke test**, to be run by a human with a real key after the SQL
migration is applied:

1. Start backend (`cd backend && bun run dev`) and frontend (`cd dashboard && bun run dev`).
2. Go to `/config`, open the AI section, select **DeepSeek**, paste a real DeepSeek key, leave model
   blank, click **Verificar conexión** → expect "Conexión verificada correctamente".
3. Repeat for **OpenRouter** with a real OpenRouter key and model `openai/gpt-4o-mini`.
4. Save. Reload `/config` → provider persists, key shows as "configurada".

Document in the handoff that steps 2-4 require live keys and the migration applied; do not block
plan completion on them.

## Done criteria

ALL must hold:

- [ ] `cd backend && bun run check` exits 0.
- [ ] `cd dashboard && bun run build` exits 0.
- [ ] `cd dashboard && bun run lint` exits 0.
- [ ] `grep -rn '"deepseek"' backend/src dashboard/src` shows it present in: assistant.ts (helper map,
      getDefaultModel, dispatch, validate), organizations.ts, dashboard.ts (both enums), ConfigPage.tsx,
      api.ts, hooks.ts.
- [ ] `grep -rn '"groq"' backend/src dashboard/src` returns no enum/union that lacks `deepseek`/`openrouter`
      (i.e. no provider list was missed).
- [ ] `backend/scripts/sql/20260612_ai_provider_add_deepseek_openrouter.sql` exists and was NOT applied by you.
- [ ] No files outside the in-scope list are modified (`git status`).
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report (do not improvise) if:

- The "Current state" excerpts don't match the live code (drift since `df009e2`).
- `bun run check` or `bun run build` fails twice after a reasonable fix attempt.
- You find a 7th place where the provider list is hardcoded that isn't in the Scope list (report it;
  it likely also needs widening).
- DeepSeek or OpenRouter turns out NOT to be OpenAI-compatible in a way that breaks `askOpenAICompatible`
  (e.g. different auth header or response shape) — do not silently special-case it; report.

## Maintenance notes

- Provider literals are duplicated across ~7 sites by design (no shared type module today). A future
  cleanup could extract a single `AI_PROVIDERS` const + derived Zod enum + TS union shared by backend
  and frontend; out of scope here to keep risk low. If you do that later, this plan's grep checks are
  the list of sites to consolidate.
- **Rejected for now**: a generic "custom OpenAI-compatible base URL" field (paste any base URL). It
  would remove the need to add providers one by one, but is a product decision and conflicts with the
  current DB `CHECK` constraint approach. Revisit if more OpenAI-compatible providers get requested.
- Default model names (`deepseek-chat`, `openai/gpt-4o-mini`) can change as providers evolve. They are
  only fallbacks when the org leaves the model field blank; the user can always override per-org.
