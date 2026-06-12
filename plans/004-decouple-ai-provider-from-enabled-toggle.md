# Plan 004: Decouple AI provider config from the "Activar respuestas con IA" toggle

> **Executor instructions**: Follow this plan step by step. Run every verification command and
> confirm the expected result before moving on. If anything in "STOP conditions" occurs, stop and
> report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 0d071bf..HEAD -- dashboard/src/pages/ConfigPage.tsx`
> If it changed since `0d071bf`, compare the "Current state" excerpts against live code; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW (frontend-only; removes `disabled` gates + copy edits in one file)
- **Depends on**: 001 (DONE), 002 (DONE) — both merged to main at `0d071bf`
- **Category**: bug / UX
- **Planned at**: commit `0d071bf`, 2026-06-12

## Why this matters

The org AI provider (provider + API key + model) is shared infrastructure used by **two** independent
features:
1. **Post-flow AI responses** — the bot auto-answers after a flow ends. Governed by the `ai_enabled`
   flag (`askAssistantForOrg` returns `null` when `ai_enabled` is false).
2. **AI flow-variant generation** (plan 002) — the editor's "Generar variante con IA" button.
   `generateRawForOrg` is **NOT** gated on `ai_enabled` by design — it only needs a provider + key.

But in `ConfigPage`, the provider/key/model/validate fields are all `disabled={!aiEnabled}`. So a user
who turns **off** auto-responses can no longer configure (or even see) their provider/key — which means
they can't use AI variant generation either. The provider config must be **independent** of the
auto-response toggle. `ai_enabled` should govern only whether the bot auto-responds, not whether a
provider can be configured at all.

**Backend needs no change** — it is already decoupled: `generateRawForOrg` ignores `ai_enabled`
(`backend/src/ai/assistant.ts`), `askAssistantForOrg` respects it, and `PUT /config/bot` /
`POST /config/bot/validate-ai` never check `ai_enabled`. This is a pure frontend gating + copy fix.

## Current state

`dashboard/src/pages/ConfigPage.tsx` has two AI sections:

**Section A — "Respuestas con IA post-flujo"** (the toggle lives here; this is response-specific):

```tsx
// ConfigPage.tsx:239-248 — the ai_enabled switch
<div className="flex items-center justify-between rounded-lg border p-4">
  <div>
    <p className="font-medium text-sm">Activar respuestas con IA</p>
    <p className="text-xs text-muted-foreground mt-0.5">
      Si está desactivado, el bot ignorará los mensajes que lleguen
      fuera de los pasos del flujo
    </p>
  </div>
  <Switch checked={aiEnabled} onCheckedChange={setAiEnabled} />
</div>
```

```tsx
// ConfigPage.tsx:256-263 — base system prompt (response-specific; gating may stay)
<Textarea ref={systemPromptRef} rows={6} ... disabled={!aiEnabled} />
```

**Section B — "API Key de IA"** (provider config — this is the shared infra wrongly gated):

```tsx
// ConfigPage.tsx:268-271 — section header (copy implies responses-only)
<Section
  title="API Key de IA"
  subtitle="Para que el bot pueda responder con IA después de un flujo, necesitás configurar tu propia API key. Sin esto, las respuestas con IA no funcionan aunque estén activadas."
>
```

```tsx
// ConfigPage.tsx:272-291 — provider select (GATED — must ungate)
<Field icon={Zap} label="Proveedor"
  description="Proveedor de IA con el que querés responder. Cada proveedor requiere su propia API key.">
  <Select value={aiProvider} onValueChange={setAiProvider} disabled={!aiEnabled}>
    <SelectTrigger><SelectValue placeholder="Seleccioná un proveedor" /></SelectTrigger>
    <SelectContent>
      <SelectItem value="none">Sin proveedor (IA desactivada)</SelectItem>
      <SelectItem value="openai">OpenAI (GPT)</SelectItem>
      ... (gemini, anthropic, groq, deepseek, openrouter) ...
    </SelectContent>
  </Select>
</Field>
```

```tsx
// ConfigPage.tsx:300-311 — API key input (GATED — must ungate)
<Input type="password" value={aiApiKey} onChange={...} placeholder={...}
  disabled={!aiEnabled} autoComplete="new-password" />
```

```tsx
// ConfigPage.tsx:319-326 — model input (GATED — must ungate)
<Input value={aiModel} onChange={...} placeholder={...} disabled={!aiEnabled} />
```

```tsx
// ConfigPage.tsx:329-346 — "Verificar conexión" button (GATED — must ungate)
<Button variant="outline" size="sm" onClick={() => void onValidateAi()}
  disabled={validateAiMutation.isPending || !aiEnabled} className="gap-2">
  ...
</Button>
```

```tsx
// ConfigPage.tsx:350-363 — "Prompt adicional" textarea (response-specific; gating may stay)
<Textarea value={aiSystemPrompt} onChange={...} ... disabled={!aiEnabled} />
```

Note: `onValidateAi` (lines 131-165) already does **not** check `aiEnabled` — it only checks that a
provider and key are present. And the key/model fields are only shown when a provider is selected
(`{aiProvider && aiProvider !== "none" && (...)}` at line 293) — that condition is independent of
`aiEnabled` and must stay.

### Convention to follow

- This is a Shadcn + Tailwind page. Edit only the JSX attributes/copy named below. Keep the existing
  component structure (`<Field>`, `<Section>`, `<Select>`) intact.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Frontend typecheck + build | `cd dashboard && bun run build` | exit 0 |
| Frontend lint | `cd dashboard && bun run lint` | exit 0 |

## Scope

**In scope** (modify):
- `dashboard/src/pages/ConfigPage.tsx` — remove `!aiEnabled` gating from the provider/key/model/validate
  fields; update copy so it's clear the provider is shared (responses + variant generation).

**Out of scope** (do NOT touch):
- Any backend file — backend is already correctly decoupled (`generateRawForOrg` ignores `ai_enabled`).
- The `ai_enabled` Switch itself (Section A) and the base/extra system-prompt textareas — those are
  genuinely response-specific; leaving their `disabled={!aiEnabled}` gating is correct and intended.
- The `onSave`/`onValidateAi` handlers' logic — no change needed.

## Git workflow

- Branch: `advisor/004-decouple-ai-provider`
- Conventional commit (e.g. `fix(config): allow AI provider setup independent of post-flow toggle`).
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Ungate the provider select

In `ConfigPage.tsx` (~line 277-281), remove `disabled={!aiEnabled}` from the provider `<Select>`:

```tsx
<Select value={aiProvider} onValueChange={setAiProvider}>
```

While here, relabel the `none` option (line ~286-288) so it no longer conflates provider with the
toggle:

```tsx
<SelectItem value="none">Sin proveedor</SelectItem>
```

### Step 2: Ungate the API key input

In `ConfigPage.tsx` (~line 300-311), remove `disabled={!aiEnabled}` from the API key `<Input>`. Keep
every other attribute (`type="password"`, `autoComplete="new-password"`, value/onChange/placeholder).

### Step 3: Ungate the model input

In `ConfigPage.tsx` (~line 319-326), remove `disabled={!aiEnabled}` from the model `<Input>`.

### Step 4: Ungate the "Verificar conexión" button

In `ConfigPage.tsx` (~line 333-334), change the disabled expression to drop `!aiEnabled`:

```tsx
disabled={validateAiMutation.isPending}
```

### Step 5: Update the section copy so intent is clear

In `ConfigPage.tsx` (~line 268-271), update the Section subtitle so it reflects the provider is used by
both features:

```tsx
<Section
  title="Proveedor de IA"
  subtitle="Configurá tu propia API key. Se usa para las respuestas con IA post-flujo y también para funciones como generar variantes de mensajes con IA en el editor de flujos. Podés configurarlo aunque las respuestas automáticas estén desactivadas."
>
```

And the provider `<Field>` description (~line 272-275):

```tsx
<Field
  icon={Zap}
  label="Proveedor"
  description="Proveedor de IA a usar. Cada proveedor requiere su propia API key. Independiente del interruptor de respuestas automáticas."
>
```

**Verify** (after all steps):
- `cd dashboard && bun run build` → exit 0.
- `cd dashboard && bun run lint` → exit 0.
- `grep -c "disabled={!aiEnabled}" dashboard/src/pages/ConfigPage.tsx` → returns **2** (only the two
  system-prompt textareas in Section A remain gated; the 4 provider-field gates are gone).

## Test plan

No automated test harness (see `plans/README.md`). Verification is build + lint (above) plus a manual
smoke test (human):

1. `cd dashboard && bun run dev`, open `/config`.
2. Turn the "Activar respuestas con IA" switch **OFF**.
3. Confirm the **Proveedor** select, **API Key** input, **Modelo** input, and **Verificar conexión**
   button are all still **enabled** and editable.
4. Select DeepSeek, paste a key, click **Verificar conexión** → works (independent of the toggle).
5. Save. Reload → provider + key persist, switch still OFF.
6. Confirm the base "Prompt del sistema" and "Prompt adicional" textareas ARE still disabled while the
   switch is OFF (those stay response-gated — intended).

## Done criteria

ALL must hold:

- [ ] `cd dashboard && bun run build` exits 0.
- [ ] `cd dashboard && bun run lint` exits 0.
- [ ] `grep -c "disabled={!aiEnabled}" dashboard/src/pages/ConfigPage.tsx` returns `2`.
- [ ] `grep -n "Sin proveedor" dashboard/src/pages/ConfigPage.tsx` → label updated (no "IA desactivada").
- [ ] Only `dashboard/src/pages/ConfigPage.tsx` is modified (`git status`).
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report (do not improvise) if:

- The "Current state" excerpts don't match live code (drift since `0d071bf`).
- After removing the gates, `grep -c "disabled={!aiEnabled}"` returns a number other than `2` — means
  the file's gating differs from what this plan assumed; report rather than guessing which to remove.
- `bun run build`/`lint` fails twice after a reasonable fix.
- You discover a backend path that blocks saving/validating a provider when `ai_enabled` is false
  (there shouldn't be one) — report it; do not edit backend.

## Maintenance notes

- `ai_enabled` now means strictly "auto-respond to post-flow messages with AI." It does NOT gate
  provider configuration or AI editor tools. If a future feature reuses the org provider, it should
  follow `generateRawForOrg`'s pattern (gate on provider+key presence, not on `ai_enabled`).
- A reviewer should confirm the two remaining `disabled={!aiEnabled}` gates are exactly the base system
  prompt (Section A) and the extra "Prompt adicional" textarea — both response-specific.
- Copy/label is Spanish (rioplatense, "configurá/podés") to match the rest of the page — keep that voice.
