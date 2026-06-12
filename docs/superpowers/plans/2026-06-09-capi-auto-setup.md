# CAPI Auto-Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-configure a Meta Conversions API dataset when a WhatsApp instance is created or on-demand, eliminating all manual steps for the user.

**Architecture:** A new `getOrCreateCapiDataset` function calls `POST /{wabaId}/dataset` on Meta's Graph API — this single endpoint creates the dataset AND links it to the WABA automatically. The result is stored in `meta_datasets` and linked to the instance. The POST /instances flow calls this automatically; a new `POST /instances/{id}/setup-capi` endpoint handles existing instances on demand.

**Tech Stack:** Bun + Hono + `@hono/zod-openapi`, Supabase, Meta Graph API v19.0, React + TanStack Query

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `backend/src/capi/setup-dataset.ts` | Core `getOrCreateCapiDataset` function |
| Modify | `backend/src/api/dashboard.ts` | Add `capiConfigured` to AutoConfigResultSchema, auto-setup in POST /instances, new POST /instances/{id}/setup-capi route |
| Create | `backend/scripts/setup-capi-datasets.ts` | Migration script for existing instances |
| Modify | `dashboard/src/lib/api.ts` | Add `setupCapi` method |
| Modify | `dashboard/src/lib/hooks.ts` | Add `useSetupCapiMutation` |
| Modify | `dashboard/src/pages/InstancesPage.tsx` | Add "Configurar automáticamente" button |

---

### Task 1: `src/capi/setup-dataset.ts` — core function

**Files:**
- Create: `backend/src/capi/setup-dataset.ts`

- [ ] **Step 1: Create the file**

```typescript
import { supabase } from "../db/supabase";
import { encrypt } from "../crypto/encrypt";
import { log } from "../logger";

const GRAPH_API_VERSION = "v19.0";

/**
 * Calls POST /{wabaId}/dataset on Meta Graph API.
 * Creates dataset AND links it to the WABA in one call (idempotent on Meta's side).
 * Stores result in meta_datasets and updates whatsapp_instances.meta_dataset_id.
 * Returns the Meta dataset ID string, or null on any failure.
 */
export async function getOrCreateCapiDataset(
  wabaId: string,
  accessToken: string,
  orgId: string,
  instanceId: string,
): Promise<string | null> {
  if (!supabase) return null;

  let metaDatasetId: string;
  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${wabaId}/dataset?access_token=${encodeURIComponent(accessToken)}`,
      { method: "POST", signal: AbortSignal.timeout(10_000) },
    );
    const data = (await res.json()) as {
      id?: string;
      error?: { message?: string; code?: number };
    };

    if (!res.ok || !data.id) {
      log.warn({ error: data.error, wabaId }, "CAPI setup: Meta rejected dataset creation");
      return null;
    }
    metaDatasetId = data.id;
  } catch (err) {
    log.warn({ err, wabaId }, "CAPI setup: network error calling Meta");
    return null;
  }

  // Check if this dataset already exists in our DB for this org
  const { data: existing } = await supabase
    .from("meta_datasets")
    .select("id")
    .eq("organization_id", orgId)
    .eq("dataset_id", metaDatasetId)
    .maybeSingle();

  let dbRecordId: string;

  if (existing) {
    dbRecordId = existing.id as string;
  } else {
    const { data: inserted, error: insertError } = await supabase
      .from("meta_datasets")
      .insert({
        organization_id: orgId,
        dataset_id: metaDatasetId,
        label: `CAPI - ${wabaId}`,
        access_token: await encrypt(accessToken),
      })
      .select("id")
      .single();

    if (insertError || !inserted) {
      log.warn({ error: insertError, wabaId }, "CAPI setup: failed to insert meta_dataset");
      return null;
    }
    dbRecordId = (inserted as { id: string }).id;
  }

  // Link dataset to instance
  const { error: updateError } = await supabase
    .from("whatsapp_instances")
    .update({ meta_dataset_id: dbRecordId })
    .eq("id", instanceId)
    .eq("organization_id", orgId);

  if (updateError) {
    log.warn({ error: updateError, instanceId }, "CAPI setup: failed to link dataset to instance");
    return null;
  }

  log.info({ metaDatasetId, wabaId, instanceId }, "CAPI: dataset configured ✓");
  return metaDatasetId;
}
```

- [ ] **Step 2: Verify no TypeScript errors**

```bash
cd backend && bun run --watch false src/capi/setup-dataset.ts 2>&1 | head -20
# Expected: no output (file imports fine) or "Bun v..." without errors
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/capi/setup-dataset.ts
git commit -m "feat(capi): add getOrCreateCapiDataset — POST /{wabaId}/dataset auto-setup"
```

---

### Task 2: Extend `AutoConfigResultSchema` + auto-setup in POST /instances

**Files:**
- Modify: `backend/src/api/dashboard.ts:939-944` (AutoConfigResultSchema)
- Modify: `backend/src/api/dashboard.ts:1-28` (imports)
- Modify: `backend/src/api/dashboard.ts:1869-1879` (POST /instances handler — before return)

- [ ] **Step 1: Add import for `getOrCreateCapiDataset` at the top of dashboard.ts**

Find line 28 (after `import { invalidateInstanceCache }`):
```typescript
import { invalidateInstanceCache } from "../db/instances";
```
Replace with:
```typescript
import { invalidateInstanceCache } from "../db/instances";
import { getOrCreateCapiDataset } from "../capi/setup-dataset";
```

- [ ] **Step 2: Extend `AutoConfigResultSchema` (line 939)**

Find:
```typescript
const AutoConfigResultSchema = z.object({
  wabaSubscribed: z.boolean(),
  webhookConfigured: z.boolean(),
  messagesSubscribed: z.boolean(),
  errors: z.array(z.string()),
});
```
Replace with:
```typescript
const AutoConfigResultSchema = z.object({
  wabaSubscribed: z.boolean(),
  webhookConfigured: z.boolean(),
  messagesSubscribed: z.boolean(),
  errors: z.array(z.string()),
  capiConfigured: z.boolean().optional(),
  capiDatasetId: z.string().nullable().optional(),
});
```

- [ ] **Step 3: Call setup in POST /instances handler**

Find the block that ends just before the `return c.json` (lines 1871-1879):
```typescript
    // Asignar flow si se proveyó
    if (body.flowId && data) {
      await supabase
        .from("whatsapp_instances")
        .update({ flow_id: body.flowId })
        .eq("id", data.id)
        .eq("organization_id", org);
    }

    return c.json({ instance: maskedInstance, autoConfig }, 200);
```
Replace with:
```typescript
    // Asignar flow si se proveyó
    if (body.flowId && data) {
      await supabase
        .from("whatsapp_instances")
        .update({ flow_id: body.flowId })
        .eq("id", data.id)
        .eq("organization_id", org);
    }

    // Auto-configurar CAPI dataset si hay wabaId + token
    if (wabaId && metaToken && data) {
      const capiDatasetId = await getOrCreateCapiDataset(wabaId, metaToken, org, data.id).catch(() => null);
      autoConfig.capiConfigured = Boolean(capiDatasetId);
      autoConfig.capiDatasetId = capiDatasetId ?? null;
    }

    return c.json({ instance: maskedInstance, autoConfig }, 200);
```

- [ ] **Step 4: Build to verify no TypeScript errors**

```bash
cd dashboard && bun run build 2>&1 | grep -E "error|Error" | head -20
cd backend && bun run --watch false src/index.ts 2>&1 | head -10
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add backend/src/api/dashboard.ts
git commit -m "feat(capi): auto-setup dataset on instance creation"
```

---

### Task 3: New `POST /instances/{id}/setup-capi` endpoint

**Files:**
- Modify: `backend/src/api/dashboard.ts` — add route after PUT /instances/{id} block (~line 1970)

This route must be added **before** the generic `GET /instances/{id}/meta-status` or any other `{id}` sub-routes, but the path `/instances/{id}/setup-capi` is specific enough that Hono routes it correctly regardless of order.

- [ ] **Step 1: Add the route after line ~1968 (end of PUT /instances/{id} handler)**

Find the comment:
```typescript
// ── GET /instances/{id}/meta-status ──────────────────────────────────────
```
Insert before it:
```typescript
// ── POST /instances/{id}/setup-capi ──────────────────────────────────────

dashboardApi.openapi(
  createRoute({
    method: "post",
    path: "/instances/{id}/setup-capi",
    request: {
      headers: AuthHeaderSchema,
      params: z.object({ id: z.string() }),
    },
    responses: {
      200: {
        description: "CAPI dataset configured",
        content: {
          "application/json": {
            schema: z.object({
              ok: z.boolean(),
              datasetId: z.string().nullable(),
              alreadyExisted: z.boolean(),
            }),
          },
        },
      },
      400: { description: "Faltan datos de instancia", content: { "application/json": { schema: ErrorSchema } } },
      404: { description: "Instancia no encontrada", content: { "application/json": { schema: ErrorSchema } } },
      500: { description: "Error", content: { "application/json": { schema: ErrorSchema } } },
    },
  }),
  async (c) => {
    if (!supabase) return c.json({ error: "Supabase no configurado" }, 500);
    const { id } = c.req.valid("param");
    const org = orgId(c);

    const { data: inst } = await supabase
      .from("whatsapp_instances")
      .select("id, waba_id, meta_token, meta_dataset_id")
      .eq("id", id)
      .eq("organization_id", org)
      .maybeSingle();

    if (!inst) return c.json({ error: "Instancia no encontrada" }, 404);

    const alreadyExisted = Boolean(inst.meta_dataset_id);

    if (!inst.waba_id || !inst.meta_token) {
      return c.json(
        { error: "La instancia requiere waba_id y meta_token para configurar CAPI" },
        400,
      );
    }

    const token = await safeDecrypt(inst.meta_token as string);
    if (!token) return c.json({ error: "No se pudo descifrar el token de la instancia" }, 400);

    const datasetId = await getOrCreateCapiDataset(
      inst.waba_id as string,
      token,
      org,
      id,
    ).catch(() => null);

    return c.json({ ok: Boolean(datasetId), datasetId: datasetId ?? null, alreadyExisted }, 200);
  },
);

```

- [ ] **Step 2: Build to verify**

```bash
cd backend && bun run --watch false src/api/dashboard.ts 2>&1 | head -10
```
Expected: no errors.

- [ ] **Step 3: Generate updated OpenAPI types in frontend**

```bash
cd dashboard && bun run generate:api
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/api/dashboard.ts dashboard/src/lib/__gen__/api_v1.d.ts
git commit -m "feat(capi): add POST /instances/{id}/setup-capi endpoint"
```

---

### Task 4: Frontend — `api.ts` + `hooks.ts`

**Files:**
- Modify: `dashboard/src/lib/api.ts` — add `setupCapi` method
- Modify: `dashboard/src/lib/hooks.ts` — add `useSetupCapiMutation`

- [ ] **Step 1: Add `setupCapi` to `api.ts`**

Find `reconfigureMeta` method (line ~709) and add after it:
```typescript
  setupCapi: (id: string) =>
    buildHeaders(true).then((headers) =>
      fetch(`${API_URL}/api/instances/${id}/setup-capi`, {
        method: "POST",
        headers,
      }).then((r) => {
        if (!r.ok) return throwApiError(r);
        return r.json() as Promise<{ ok: boolean; datasetId: string | null; alreadyExisted: boolean }>;
      })
    ),
```

- [ ] **Step 2: Add `useSetupCapiMutation` to `hooks.ts`**

Find `useReconfigureMetaMutation` (line ~589) and add after it:
```typescript
export function useSetupCapiMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (instanceId: string) => api.setupCapi(instanceId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["instances"] }),
  });
}
```

- [ ] **Step 3: Build to verify**

```bash
cd dashboard && bun run build 2>&1 | grep -E "error TS|Error" | head -10
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add dashboard/src/lib/api.ts dashboard/src/lib/hooks.ts
git commit -m "feat(capi): add setupCapi api method and useSetupCapiMutation hook"
```

---

### Task 5: Frontend — button in `InstancesPage.tsx`

**Files:**
- Modify: `dashboard/src/pages/InstancesPage.tsx:693-757` (CAPI section)

- [ ] **Step 1: Add `useSetupCapiMutation` import**

Find the existing hooks destructuring near the top of the component (look for `useUpdateInstanceMutation` usage) and add:
```typescript
const setupCapi = useSetupCapiMutation();
```
Also add the import at the top of the file if not already there:
```typescript
import { ..., useSetupCapiMutation } from "@/lib/hooks";
```

- [ ] **Step 2: Add the "Configurar automáticamente" button in the CAPI section**

Find (line ~706):
```typescript
              <p className="text-xs text-muted-foreground">
                Reporta compras confirmadas a Meta para optimizar tus campañas CTWA. Creá los
                datasets en la sección de abajo y asigná uno a este número.
              </p>
              <Field label="Dataset de conversiones">
```
Replace with:
```typescript
              <p className="text-xs text-muted-foreground">
                Reporta compras confirmadas a Meta para optimizar tus campañas CTWA. Creá los
                datasets en la sección de abajo y asigná uno a este número.
              </p>
              {instance.waba_id && !instance.meta_dataset_id && (
                <Button
                  variant="default"
                  size="sm"
                  className="self-start"
                  loading={setupCapi.isPending}
                  loadingText="Configurando…"
                  onClick={() =>
                    setupCapi.mutate(instance.id, {
                      onSuccess: (data) => {
                        if (data.ok) toast.success("CAPI configurado correctamente");
                        else toast.error("No se pudo configurar CAPI. Verificá el token de la instancia.");
                      },
                      onError: (e) => toast.error((e as Error).message),
                    })
                  }
                >
                  Configurar automáticamente
                </Button>
              )}
              <Field label="Dataset de conversiones">
```

- [ ] **Step 3: Build to verify**

```bash
cd dashboard && bun run build 2>&1 | grep -E "error TS|Error" | head -20
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add dashboard/src/pages/InstancesPage.tsx
git commit -m "feat(capi): add auto-configure CAPI button in instances UI"
```

---

### Task 6: Migration script for existing instances

**Files:**
- Create: `backend/scripts/setup-capi-datasets.ts`

- [ ] **Step 1: Create the script**

```typescript
/**
 * Configures CAPI datasets for all existing instances that have waba_id + meta_token
 * but no linked meta_dataset_id.
 * Safe to run multiple times — getOrCreateCapiDataset is idempotent.
 * Run: bun run scripts/setup-capi-datasets.ts
 * Optional: bun run scripts/setup-capi-datasets.ts --dry-run --limit=5
 */

import { createClient } from "@supabase/supabase-js";
import { safeDecrypt } from "../src/crypto/encrypt";
import { getOrCreateCapiDataset } from "../src/capi/setup-dataset";

const supabaseClient = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! || process.env.SUPABASE_KEY!,
);

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const limitArg = args.find((a) => a.startsWith("--limit="));
const limit = limitArg ? parseInt(limitArg.split("=")[1]) : 200;

console.log(`CAPI dataset setup: limit=${limit} dry-run=${dryRun}`);

const { data: instances, error } = await supabaseClient
  .from("whatsapp_instances")
  .select("id, label, organization_id, waba_id, meta_token, meta_dataset_id")
  .not("waba_id", "is", null)
  .not("meta_token", "is", null)
  .is("meta_dataset_id", null)
  .limit(limit);

if (error) {
  console.error("Failed to fetch instances:", error.message);
  process.exit(1);
}

console.log(`Found ${instances.length} instances without CAPI dataset`);

let ok = 0;
let skipped = 0;

for (const inst of instances) {
  if (dryRun) {
    console.log(
      `[dry-run] would setup CAPI for "${inst.label}" (${inst.id}) waba_id=${inst.waba_id}`,
    );
    ok++;
    continue;
  }

  const token = await safeDecrypt(inst.meta_token as string);
  if (!token) {
    console.warn(`⚠ Skipping "${inst.label}" — could not decrypt token`);
    skipped++;
    continue;
  }

  const datasetId = await getOrCreateCapiDataset(
    inst.waba_id as string,
    token,
    inst.organization_id as string,
    inst.id as string,
  );

  if (datasetId) {
    console.log(`✓ "${inst.label}" → dataset ${datasetId}`);
    ok++;
  } else {
    console.warn(`✗ "${inst.label}" → failed (check logs for details)`);
    skipped++;
  }

  await Bun.sleep(300);
}

console.log(`Done. ok=${ok} skipped=${skipped}`);
```

- [ ] **Step 2: Dry-run to verify script works**

```bash
cd backend && bun run scripts/setup-capi-datasets.ts --dry-run --limit=5
```
Expected: list of instances with `[dry-run] would setup CAPI for...` lines. No errors.

- [ ] **Step 3: Commit**

```bash
git add backend/scripts/setup-capi-datasets.ts
git commit -m "feat(capi): add setup-capi-datasets migration script"
```

---

### Task 7: Run migration + retry past purchases

This task runs after all code is deployed or in local env with prod `.env`.

- [ ] **Step 1: Dry-run migration**

```bash
cd backend && bun run scripts/setup-capi-datasets.ts --dry-run
```
Expected: list of all instances that will be configured.

- [ ] **Step 2: Run migration (live)**

```bash
cd backend && bun run scripts/setup-capi-datasets.ts
```
Expected: each instance shows `✓ "label" → dataset <ID>`.

- [ ] **Step 3: Verify at least one instance now has a dataset**

```bash
cd backend && bun run scripts/get-instance-token.ts
```
Expected: `waba_id` is set, `meta_token` decrypts correctly (sanity check).

- [ ] **Step 4: Dry-run CAPI retry for past purchases**

```bash
cd backend && bun run scripts/retry-capi-purchases.ts --dry-run --limit=10
```
Expected: list of payments that would be retried.

- [ ] **Step 5: Retry past purchases (live)**

```bash
cd backend && bun run scripts/retry-capi-purchases.ts --limit=50
```
Expected: `fired=N skipped=0`. Check backend logs for `CAPI: Purchase event sent ✓`.
