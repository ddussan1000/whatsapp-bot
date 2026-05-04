# Plan Fase 2 (cerrado) - Flows unificados

Este plan incorpora tus decisiones finales:

- `templates` pasa a `flow_id` (desaparece `campaign_id`)
- `campaigns` desaparece completamente
- el flow es mutable (sin versionado tipo `flow_versions`)
- `no_match_behavior` default = `trigger`
- por ahora, una instancia tiene solo 1 `flow_id` activo
- guardado batch por **RPC SQL** en transaccion

---

## 1) Objetivo funcional

Unificar `products + campaigns + flow_definitions` en una sola entidad `flows`:

- trigger de entrada (`trigger_phrase`, `trigger_first_word`, `keywords`)
- comportamiento si no matchea (`no_match_behavior`)
- prompt IA por flow (`system_prompt`)
- pasos y mensajes (`flow_steps`, `flow_step_messages`)
- asignacion de flow a instancia (`whatsapp_instances.flow_id`)

El webhook debe rutear por `instance.flow_id`, sin dependencia de `campaigns` ni `products`.

---

## 2) Diseno de datos final

## 2.1 Tablas nuevas/modificadas

- **`flows`** (nueva)
  - `id`, `organization_id`, `name`, `trigger_phrase`, `trigger_first_word`
  - `keywords text[] not null default '{}'`
  - `no_match_behavior text not null default 'trigger' check (...)`
  - `system_prompt text null`
  - `is_active boolean not null default true`
  - `created_at`, `updated_at`

- **`flow_steps`** (se conserva)
  - `flow_id` referencia a `flows.id`
  - mantener `position`, `delay_seconds`, `label`
  - `trigger_keywords` se mantiene por compatibilidad, pero el matching principal pasa a `flows.*`

- **`flow_step_messages`** (se conserva)
  - sin cambios de estructura

- **`whatsapp_instances`** (modificada)
  - agregar `flow_id uuid null references flows(id) on delete set null`

- **`conversations`** (modificada)
  - agregar `flow_id uuid null references flows(id) on delete set null`
  - eliminar `product_id`
  - eliminar `campaign_id`

- **`messages`** (modificada)
  - agregar `flow_id uuid null references flows(id) on delete set null`
  - eliminar `product_id`
  - eliminar `campaign_id`

- **`payments`** (modificada)
  - agregar `flow_id uuid null references flows(id) on delete set null`
  - eliminar `product_id`
  - eliminar `campaign_id`

- **`product_referrals` -> `flow_referrals`**
  - renombrar tabla
  - `product_id` -> `flow_id`
  - mantener `ctwa_clid` unico por `organization_id`

- **`message_templates`** (modificada)
  - agregar `flow_id uuid references flows(id) on delete set null`
  - migrar `campaign_id -> flow_id` usando mapeo de migracion
  - eliminar `campaign_id`

## 2.2 Tablas eliminadas

- `campaigns`
- `products`
- `flow_definitions`
- `flow_versions` (si ya no se usa para nada)

> Nota: `flow_nodes/flow_edges/flow_triggers/flow_actions` solo eliminarlos si validas que no se usan en runtime.

---

## 3) Estrategia de migracion SQL (archivo unico)

Archivo: `backend/scripts/sql/20260401_phase2_flows_redesign.sql`

Orden:

1. crear `flows`
2. poblar `flows` desde `flow_definitions` (+ datos de `products` cuando aplique)
3. agregar `flow_id` a `whatsapp_instances`, `conversations`, `messages`, `payments`, `message_templates`
4. migrar datos (`product_id/campaign_id -> flow_id`) con tabla temporal de mapeo
5. renombrar `product_referrals` a `flow_referrals`
6. ajustar FKs e indices
7. eliminar columnas antiguas (`product_id`, `campaign_id`, `organizations.bot_config`)
8. eliminar tablas legacy (`campaigns`, `products`, `flow_definitions`)
9. recrear/ajustar RLS y policies
10. validaciones post-migracion (queries de control)

## 3.1 Requisito de seguridad de migracion

Antes de `drop`:

- confirmar que no quedan referencias activas (`information_schema.constraint_column_usage`)
- confirmar que backend y frontend ya no usan endpoints legacy

---

## 4) RLS y politicas (obligatorio verificar)

Mantener el patron actual del proyecto: `public.is_org_member(organization_id)`.
No usar `current_setting('app.organization_id')`.

Tablas que deben quedar con RLS habilitado y policy tenant:

- `flows`
- `flow_steps`
- `flow_step_messages`
- `flow_referrals`
- `whatsapp_instances`
- `message_templates`
- `conversations`
- `messages`
- `payments`
- `scheduled_flow_messages`

Politicas sugeridas:

- `for all using (public.is_org_member(organization_id))`
- para tablas admin-only (si hubiera), `public.is_org_admin(organization_id)`

## 4.1 Checklist SQL de verificacion (agregar al final del script)

```sql
-- 1) RLS habilitado
select schemaname, tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in (
    'flows','flow_steps','flow_step_messages','flow_referrals',
    'whatsapp_instances','message_templates','conversations','messages',
    'payments','scheduled_flow_messages'
  )
order by tablename;

-- 2) Policies existentes
select schemaname, tablename, policyname, permissive, roles, cmd, qual
from pg_policies
where schemaname = 'public'
  and tablename in (
    'flows','flow_steps','flow_step_messages','flow_referrals',
    'whatsapp_instances','message_templates','conversations','messages',
    'payments','scheduled_flow_messages'
  )
order by tablename, policyname;

-- 3) FKs residuales a tablas legacy (debe retornar 0 filas)
select conrelid::regclass as table_name, confrelid::regclass as referenced_table, conname
from pg_constraint
where contype = 'f'
  and confrelid::regclass::text in ('public.products','public.campaigns','public.flow_definitions');
```

---

## 5) Backend - cambios concretos

## 5.1 API (`backend/src/api/dashboard.ts`)

Agregar/ajustar:

- `GET /flows` (lista flow + steps + messages anidados)
- `GET /flows/:id`
- `POST /flows/upsert` (batch save completo)
- `DELETE /flows/:id`
- `PUT /instances/:id/flow` (`{ flowId: string | null }`)
- `GET /flow-referrals`
- `POST /flow-referrals`

Eliminar endpoints legacy:

- `/products*`
- `/campaigns*`
- `/flow-definitions*`
- `/flow-steps*`
- `/flow-step-messages*`
- `/config/bot` (si el prompt global deja de existir)

## 5.2 RPC SQL para batch save

Implementar funcion SQL (ejemplo nombre):

- `public.upsert_flow_tree(payload jsonb) returns uuid`

Responsabilidad:

1. upsert `flows`
2. upsert `flow_steps`
3. upsert `flow_step_messages`
4. borrar steps/messages ausentes en payload
5. todo en una sola transaccion

Backend solo invoca:

```ts
await supabase.rpc("upsert_flow_tree", { payload });
```

## 5.3 Webhook (`backend/src/webhook/handler.ts`)

Reescribir routing:

1. resolver instancia por `phone_number_id`
2. si no hay `instance.flow_id`, ignorar
3. cargar flow asignado (con steps/messages)
4. obtener/actualizar conversacion con `flow_id`
5. aplicar trigger solo si:
   - conversacion nueva, o
   - expirada >24h
6. si no matchea trigger:
   - `no_match_behavior='trigger'` -> dispara igual
   - `ignore` -> no responde
7. conversacion activa (<24h): responder IA con `flow.system_prompt`

## 5.4 Motores y tipos

Actualizar archivos:

- `backend/src/bot/flowEngine.ts`
  - quitar dependencia de `flow_definitions` y `product_id`
  - operar con `flows`
  - en `scheduled_flow_messages` guardar `flow_id` en lugar de `product_id`

- `backend/src/bot/flows.ts`
  - usar prompt del flow, no de product/campaign

- `backend/src/types.ts`
  - `ConversationState`: reemplazar `product/productId/campaignId` por `flowId`

- `backend/src/db/conversations.ts`
- `backend/src/db/messages.ts`
- `backend/src/db/payments.ts`
- `backend/src/receipts/handler.ts`
- `backend/src/db/instances.ts`
  - agregar `flow_id` en selects/types

---

## 6) Frontend - cambios concretos

## 6.1 Tipos/API/Hooks

- `dashboard/src/types/api.ts`
  - nuevo `Flow` (con steps/messages anidados)
  - nuevo `UpsertFlowBody`
  - eliminar tipos de `Product`, `Campaign`, `FlowDefinition` y bot-config

- `dashboard/src/lib/api.ts`
  - `getFlows`, `getFlow`, `upsertFlow`, `deleteFlow`
  - `assignFlowToInstance`
  - `getFlowReferrals`, `createFlowReferral`
  - eliminar metodos legacy de product/campaign/flow-definitions/config

- `dashboard/src/lib/hooks.ts`
  - `useFlowsQuery`, `useFlowQuery`, `useUpsertFlowMutation`, `useDeleteFlowMutation`, `useAssignFlowMutation`
  - eliminar hooks legacy

## 6.2 UI

- `dashboard/src/pages/FlowsPage.tsx`
  - redisenar a lista + editor draft local + guardar batch unico

- `dashboard/src/pages/InstancesPage.tsx`
  - agregar selector `flow_id` por instancia

- `dashboard/src/pages/ReferralsPage.tsx`
  - usar `flow_id` en vez de `product_id`

- `dashboard/src/layout/AppLayout.tsx`
  - quitar `ProductSelector` y enlaces de products/campaigns/config

- `dashboard/src/App.tsx`
  - eliminar rutas de `ProductsPage`, `CampaignsPage`, `ConfigPage`
  - mantener `TemplatesPage` solo si queda util con `flow_id`

---

## 7) Orden de implementacion recomendado

## Fase 2.1 - DB + RPC

1. crear script `20260401_phase2_flows_redesign.sql`
2. crear funcion RPC `upsert_flow_tree`
3. ejecutar validaciones RLS/policies al final del script

## Fase 2.2 - Backend

1. endpoints nuevos (`flows`, asignacion a instancia, referrals)
2. webhook nuevo por `instance.flow_id`
3. actualizar `flowEngine`, tipos y DB adapters
4. remover endpoints legacy
5. regenerar `openapi.json`

## Fase 2.3 - Frontend

1. tipos/API/hooks nuevos
2. nueva `FlowsPage`
3. actualizar `InstancesPage` y `ReferralsPage`
4. limpiar navegacion y rutas legacy

## Fase 2.4 - Verificacion

- `backend`: `bun run check`
- `dashboard`: `bun run build`
- smoke tests:
  - crear flow con steps/messages
  - asignar flow a instancia
  - recibir mensaje nuevo -> trigger
  - conversacion activa <24h -> respuesta IA
  - no match + default trigger -> flow se dispara
  - revisar RLS efectivo con usuario miembro/no miembro

---

## 8) Criterios de aceptacion

- no existe dependencia funcional de `products/campaigns/flow_definitions`
- un flow se guarda en una sola operacion atomica (RPC SQL)
- templates referencian `flow_id`
- webhook usa `instance.flow_id` como origen de routing
- todas las tablas impactadas tienen RLS activo y policies tenant correctas
- frontend no muestra secciones legacy

---

## 9) Riesgos y mitigacion

- **Riesgo:** ruptura por drops tempranos.  
  **Mitigacion:** hacer migracion + backend + frontend en misma ventana de deploy.

- **Riesgo:** policy faltante deja tabla inaccesible.  
  **Mitigacion:** incluir queries de verificacion en script y checklist post-run.

- **Riesgo:** trigger demasiado agresivo (default `trigger`).  
  **Mitigacion:** permitir override por flow (`ignore`) y monitorear tasa de respuestas.

- **Riesgo:** CTWA referral vs flow asignado por instancia.  
  **Mitigacion:** documentar prioridad desde ahora (propuesta: referral > instance flow solo en primer mensaje).

# Plan Fase 2 — Rediseño del sistema de Flows

## Contexto

El modelo actual mezcla conceptos: `products`, `campaigns`, y `flow_definitions` son capas que el usuario no entiende intuitivamente. El rediseño colapsa todo en una entidad principal: **el Flow**, que es la unidad de trabajo completa (trigger + pasos + config del bot).

---

## Nuevo modelo mental

```
Flow
 ├── Trigger (frase + primera palabra normalizada + keywords adicionales)
 ├── No-match behavior (trigger igualmente | ignorar)
 ├── System prompt (comportamiento del bot con IA para esta conversación)
 └── Steps[]
      └── Step
           ├── position, delay_seconds, label
           └── Messages[] (text | image | document | video)

WhatsApp Instance
 └── flow_id → Flow asignado (uno activo a la vez)
```

Un Flow puede existir sin asignarse a ningún número (draft). Varios números pueden compartir el mismo Flow. Un número tiene exactamente un Flow activo.

---

## Reglas de negocio

### Trigger evaluation — cuándo se dispara

Se evalúa el trigger únicamente si:
- Es el **primer mensaje** de la conversación (no existe registro previo), O
- El **último mensaje tiene más de 24 horas** de antigüedad (conversación expirada)

Si hay conversación activa (< 24h), el bot responde con IA usando `flow.system_prompt` directamente, sin re-evaluar el trigger.

### Algoritmo de matching del trigger

```
trigger_phrase: "Hola, quiero más información!"
  → normalizar: lowercase, strip puntuación → "hola quiero mas informacion"
  → trigger_first_word: "hola"   ← guardado en DB al crear/editar el flow

Mensaje entrante: "Hola!" o "hola" o "HOLA como están"
  → normalizar: lowercase, strip puntuación → "hola" / "hola como estan"
  → contiene "hola"? → MATCH ✓

Mensaje entrante: "quiero saber el precio"
  → contiene "hola"? → NO MATCH
  → revisar keywords adicionales del flow (ej: ["precio", "info", "cotización"])
  → "precio" encontrado en mensaje? → MATCH ✓

Sin match en trigger_first_word ni keywords:
  → no_match_behavior === "trigger" (default) → disparar flow igualmente
  → no_match_behavior === "ignore" → no hacer nada, no responder
```

### Normalización de texto (compartida trigger + mensaje)
1. Lowercase
2. Eliminar signos de puntuación: `.,!?¿¡;:'"()-`
3. Trim espacios extras
4. Split por espacios → array de palabras
5. Para trigger_first_word: tomar `words[0]`

---

## Cambios de Schema (Base de datos)

### Tabla nueva: `flows`

Reemplaza a `products` + `flow_definitions`.

```sql
CREATE TABLE flows (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  trigger_phrase      TEXT NOT NULL,
  trigger_first_word  TEXT NOT NULL,  -- auto-extraído y normalizado al guardar
  keywords            TEXT[] NOT NULL DEFAULT '{}',
  no_match_behavior   TEXT NOT NULL DEFAULT 'trigger'
                        CHECK (no_match_behavior IN ('trigger', 'ignore')),
  system_prompt       TEXT,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE flows ENABLE ROW LEVEL SECURITY;
CREATE POLICY flows_org ON flows
  USING (organization_id = current_setting('app.organization_id')::uuid);
```

### Tabla modificada: `flow_steps`

Quitar `flow_id` que referenciaba `flow_definitions.id` y apuntar directamente a `flows.id`. El resto de columnas se mantiene igual.

```sql
-- Migración:
ALTER TABLE flow_steps
  DROP CONSTRAINT flow_steps_flow_id_fkey,
  ADD CONSTRAINT flow_steps_flow_id_fkey
    FOREIGN KEY (flow_id) REFERENCES flows(id) ON DELETE CASCADE;
```

### Tabla `flow_step_messages`

Sin cambios estructurales. Sigue referenciando `flow_steps.id`.

### Tabla modificada: `whatsapp_instances`

Agregar referencia al flow asignado.

```sql
ALTER TABLE whatsapp_instances
  ADD COLUMN flow_id UUID REFERENCES flows(id) ON DELETE SET NULL;
```

### Tabla modificada: `conversations`

Renombrar `product_id` → `flow_id`.

```sql
ALTER TABLE conversations
  ADD COLUMN flow_id UUID REFERENCES flows(id) ON DELETE SET NULL;

-- Migrar datos existentes si hay product_id:
-- UPDATE conversations SET flow_id = (
--   SELECT fd.id FROM flow_definitions fd
--   JOIN products p ON fd.product_id = p.id
--   WHERE p.id = conversations.product_id LIMIT 1
-- );

ALTER TABLE conversations DROP COLUMN product_id;
```

### Tabla modificada: `product_referrals` → `flow_referrals`

```sql
ALTER TABLE product_referrals RENAME TO flow_referrals;
ALTER TABLE flow_referrals RENAME COLUMN product_id TO flow_id;
ALTER TABLE flow_referrals
  DROP CONSTRAINT product_referrals_product_id_fkey,
  ADD CONSTRAINT flow_referrals_flow_id_fkey
    FOREIGN KEY (flow_id) REFERENCES flows(id) ON DELETE CASCADE;
```

### Tablas a eliminar

```sql
DROP TABLE flow_definitions;   -- fusionada en flows
DROP TABLE campaigns;          -- ya no existe el concepto
DROP TABLE products;           -- reemplazada por flows
```

### Tabla `scheduled_flow_messages`

Sin cambios estructurales. Ya referencia `flow_steps` correctamente.

### Tabla `organizations`

Eliminar `bot_config` jsonb (el system_prompt ahora vive en cada flow). Si había un system_prompt global, se migra al flow correspondiente.

```sql
ALTER TABLE organizations DROP COLUMN bot_config;
```

---

## Script de migración completo

Archivo: `backend/scripts/sql/20260401_phase2_flows_redesign.sql`

Orden de operaciones:
1. Crear tabla `flows`
2. Migrar datos de `products` + `flow_definitions` → `flows` (para orgs existentes)
3. Agregar `flow_id` a `whatsapp_instances`
4. Agregar `flow_id` a `conversations`, migrar datos, eliminar `product_id`
5. Renombrar `product_referrals` → `flow_referrals`
6. Eliminar `flow_definitions`
7. Eliminar `campaigns`
8. Eliminar `products`
9. Eliminar `bot_config` de `organizations`
10. Actualizar políticas RLS

---

## Cambios de Backend

### Endpoint nuevo: `POST /api/flows` — Upsert completo (batch save)

Este es el endpoint principal del editor. Recibe el flow completo con todos sus pasos y mensajes en una sola petición y lo persiste en una transacción.

```ts
// Request body
{
  id?: string,                    // si existe → update, si no → create
  name: string,
  triggerPhrase: string,          // backend extrae trigger_first_word automáticamente
  keywords?: string[],
  noMatchBehavior?: "trigger" | "ignore",
  systemPrompt?: string,
  isActive?: boolean,
  steps: Array<{
    id?: string,
    position: number,
    delaySeconds: number,
    label?: string,
    messages: Array<{
      id?: string,
      position: number,
      messageType: "text" | "image" | "document" | "video",
      textContent?: string,
      mediaUrl?: string,
      filename?: string,
      caption?: string,
    }>
  }>
}

// Response: FlowWithSteps completo
```

La lógica backend:
1. Upsert del flow record, calcular `trigger_first_word` automáticamente
2. Para cada step: upsert por `id` si existe, insert si no
3. Para cada message: upsert por `id` si existe, insert si no
4. Eliminar steps con IDs que ya no estén en el payload
5. Eliminar messages con IDs que ya no estén en el payload
6. Todo en una transacción

### Endpoint: `GET /api/flows` — Lista con steps anidados

```
GET /api/flows
→ Flow[] con steps[] y messages[] anidados
```

### Endpoint: `DELETE /api/flows/:id`

Elimina flow, cascada automática a steps y messages.

### Endpoint: `GET /api/flows/:id` — Flow individual

Para cargar el editor.

### Endpoint: `PUT /api/whatsapp-instances/:id/flow`

Asignar o remover el flow activo de una instancia.

```ts
// Request
{ flowId: string | null }
```

### Endpoints a eliminar
- `/api/products` (CRUD completo)
- `/api/campaigns` (CRUD completo)
- `/api/flow-definitions` (CRUD completo)
- `/api/flow-steps` (CRUD — ahora va todo por el batch save)
- `/api/flow-step-messages` (CRUD — ídem)
- `/api/config/bot` GET/PUT (system_prompt ahora es por flow)

### Lógica de routing en `webhook/handler.ts`

```ts
async function routeIncomingMessage(msg, phone, phoneNumberId) {
  // 1. Encontrar instancia por phone_number_id
  const instance = await getInstanceByPhoneNumberId(phoneNumberId);
  if (!instance?.flow_id) return; // sin flow asignado, ignorar

  // 2. Obtener o crear conversación
  const convo = await getOrCreateConversation(phone, instance);

  // 3. Obtener el flow asignado (con steps)
  const flow = await getFlowWithSteps(instance.flow_id);
  if (!flow) return;

  // 4. ¿Se evalúa el trigger?
  const needsTrigger = isNewConversation(convo) || isExpired(convo, 24 * 60 * 60);

  if (needsTrigger) {
    const matched = matchesTrigger(msg.text, flow);
    if (!matched && flow.no_match_behavior === 'ignore') return;
    // Si matched o no_match_behavior === 'trigger': disparar flow
    await startFlow(flow, phone, instance, convo);
    return;
  }

  // 5. Conversación activa → respuesta IA con system_prompt del flow
  await handleAIResponse(msg.text, phone, flow.system_prompt, convo);
}

function matchesTrigger(message: string, flow: Flow): boolean {
  const normalized = normalize(message); // lowercase, sin puntuación
  const words = normalized.split(' ');

  // Opción A: contiene la primera palabra del trigger
  if (words.includes(flow.trigger_first_word)) return true;

  // Keywords adicionales
  for (const kw of flow.keywords) {
    if (normalized.includes(kw.toLowerCase())) return true;
  }

  return false;
}
```

### Actualizar `bot/flows.ts`

`resolvePrompt()` ya no necesita cascade complejo. El system_prompt viene directo del flow:

```ts
export async function handleFlow(phone, text, flow, convo) {
  const prompt = flow.system_prompt ?? `Eres un asistente de ventas. Responde con amabilidad.`;
  // ... lógica de IA existente con el prompt del flow
}
```

### Actualizar `bot/flowEngine.ts`

`startFlow()` envía el step 0 inmediatamente y programa los siguientes en `scheduled_flow_messages`. No cambia la lógica interna, solo el origen del flow (ya no viene de `flow_definitions`).

---

## Cambios de Frontend

### Tipos (`types/api.ts`)

```ts
// Tipo principal nuevo
export type Flow = {
  id: string;
  organization_id: string;
  name: string;
  trigger_phrase: string;
  trigger_first_word: string;
  keywords: string[];
  no_match_behavior: "trigger" | "ignore";
  system_prompt?: string | null;
  is_active: boolean;
  created_at?: string | null;
  updated_at?: string | null;
  steps: FlowStep[];  // FlowStep ya definido, se reutiliza
};

// Body para batch save
export type UpsertFlowBody = {
  id?: string;
  name: string;
  triggerPhrase: string;
  keywords?: string[];
  noMatchBehavior?: "trigger" | "ignore";
  systemPrompt?: string | null;
  isActive?: boolean;
  steps: UpsertFlowStepBody[];
};

export type UpsertFlowStepBody = {
  id?: string;
  position: number;
  delaySeconds: number;
  label?: string;
  messages: UpsertFlowStepMessageBody[];
};

export type UpsertFlowStepMessageBody = {
  id?: string;
  position: number;
  messageType: FlowMessageType;
  textContent?: string | null;
  mediaUrl?: string | null;
  filename?: string | null;
  caption?: string | null;
};

// Eliminar: Product, FlowDefinition, CreateFlowDefinitionBody, etc.
```

### API client (`lib/api.ts`)

Nuevos métodos:
- `getFlows(): Promise<Flow[]>`
- `getFlow(id): Promise<Flow>`
- `upsertFlow(body: UpsertFlowBody): Promise<Flow>`
- `deleteFlow(id): Promise<void>`
- `assignFlowToInstance(instanceId, flowId | null): Promise<void>`

Eliminar:
- `getProducts`, `createProduct`, `updateProduct`
- `getCampaigns`, `createCampaign`, `updateCampaign`
- `getFlowDefinitions`, `createFlowDefinition`, `updateFlowDefinition`, `deleteFlowDefinition`
- `createFlowStep`, `updateFlowStep`, `deleteFlowStep`
- `createFlowStepMessage`, `updateFlowStepMessage`, `deleteFlowStepMessage`
- `getBotConfig`, `updateBotConfig`

### Hooks (`lib/hooks.ts`)

Nuevos hooks:
```ts
useFlowsQuery()
useFlowQuery(id)
useUpsertFlowMutation()      // batch save
useDeleteFlowMutation()
useAssignFlowMutation()      // para instancias
```

Eliminar hooks de products, campaigns, flow-definitions, flow-steps, flow-step-messages, bot-config.

### Navegación (`AppLayout.tsx`)

Secciones simplificadas:

```
Operaciones
  Resumen
  Conversaciones
  Pagos
  Reportes

Automatización
  Flows
  CTWA Ads

Sistema
  WhatsApp
  Equipo
  Guía de inicio
```

- Eliminar: ProductSelector (no más "producto activo" global)
- Eliminar: Plantillas (evaluarlas — si siguen siendo útiles quedan, si no se van)
- Eliminar: Configuración (bot config ya no existe como sección separada)

### Páginas a eliminar
- `ProductsPage`
- `CampaignsPage` (si existe)
- `ConfigPage` (bot config) — o reconvertirla en otra cosa

### Página principal: `FlowsPage` (rediseñada)

**Modo lista**: cards por flow, con badge de estado (Activo / Sin asignar), número de instancias asignadas, nombre del trigger.

**Modo editor** (al hacer click en un flow o "Nuevo Flow"):

```
[← Volver a flows]

Nombre: [_______________]
Trigger: [_____________________________] 
         "Primera palabra: hola"  ← preview en tiempo real
Keywords adicionales: [tag input]
Si no hay match: ● Disparar el flow  ○ Ignorar
System prompt: [textarea]

──────────────────────────────────────
PASOS
──────────────────────────────────────
  Paso 1  [Inmediato]
    Mensaje 1: Texto ▾  [___________]
    Mensaje 2: Imagen ▾ [url/upload]
    [+ Agregar mensaje]
  
  ↓ 5 min

  Paso 2  [5min]
    Mensaje 1: Texto ▾  [___________]
    [+ Agregar mensaje]
  
  [+ Agregar paso]

──────────────────────────────────────
                    [Descartar] [💾 Guardar Flow]
```

**Estado local (draft)**:
- El editor mantiene todo el estado en React (`useState` o `useReducer`)
- Ninguna petición HTTP hasta que se presiona "Guardar Flow"
- Al guardar: una sola llamada a `upsertFlow()` con el árbol completo
- Si hay `id` → update, si no → create
- Al volver sin guardar: confirmar descarte si hay cambios

### Página: `WhatsAppPage` (instancias — actualizada)

Agregar en cada card de instancia:

```
[Instancia: +57 300 123 4567]
  Flow asignado: [Selector dropdown ▾] ← lista de flows activos
                  o "Sin flow asignado"
  [Guardar asignación]
```

El selector muestra solo flows con `is_active = true`. Permite asignar null (quitar flow).

---

## Orden de implementación

### Fase 2.1 — Backend + DB
1. Escribir script SQL `20260401_phase2_flows_redesign.sql`
2. Crear endpoint `POST/PUT /api/flows` (upsert completo en transacción)
3. Crear endpoints `GET /api/flows`, `GET /api/flows/:id`, `DELETE /api/flows/:id`
4. Crear endpoint `PUT /api/instances/:id/flow`
5. Actualizar `webhook/handler.ts` con nueva lógica de routing
6. Actualizar `bot/flows.ts` (resolvePrompt simplificado)
7. Actualizar `bot/flowEngine.ts` (recibe Flow directo en vez de FlowDefinition)
8. Eliminar endpoints de products, campaigns, flow-definitions, flow-steps, flow-step-messages
9. Eliminar endpoint de bot-config

### Fase 2.2 — Frontend tipos y API
1. Actualizar `types/api.ts` (nuevo tipo Flow, eliminar tipos viejos)
2. Actualizar `lib/api.ts` (nuevos métodos, eliminar viejos)
3. Actualizar `lib/hooks.ts` (nuevos hooks, eliminar viejos)

### Fase 2.3 — Frontend UI
1. Rediseñar `FlowsPage` con modo lista + editor draft
2. Actualizar `WhatsAppPage` con selector de flow
3. Actualizar `AppLayout.tsx` (nueva nav, quitar ProductSelector)
4. Eliminar `ProductsPage`, `ConfigPage`
5. Actualizar `ReferralsPage` (si existe, apunta a flow_id)

---

## Consideraciones y riesgos

### Datos existentes
Si hay flows, steps y mensajes creados con el modelo anterior, la migración SQL los mapea al nuevo esquema. Para proyectos sin datos de producción, se puede hacer drop + recreate directamente.

### Conversaciones activas durante migración
Al renombrar `product_id` → `flow_id` en `conversations`, las conversaciones existentes quedan sin flow asociado (se migran en el script si es posible). No genera un bug crítico — el peor caso es que el bot no responda a conversaciones viejas hasta que el usuario reabra.

### CTWA Referrals
Con el modelo anterior, un referral CTWA apuntaba a `product_id`. Ahora apunta a `flow_id`. Si un usuario llega por un anuncio CTWA, el sistema puede usar el referral para determinar qué flow usar incluso si el número tiene un flow diferente asignado (extensión futura: flow override por CTWA).

### Templates
Evaluar si las plantillas (`templates` table) siguen siendo relevantes o se eliminan. Por ahora no se mencionan en este plan — mantener hasta decisión.

---

## Archivos afectados (resumen)

| Archivo | Acción |
|---|---|
| `scripts/sql/20260401_phase2_flows_redesign.sql` | CREAR |
| `src/api/dashboard.ts` | REESCRIBIR secciones de products/campaigns/flow-definitions, AGREGAR flows CRUD + batch save |
| `src/bot/flowEngine.ts` | ACTUALIZAR firma de funciones para recibir Flow directo |
| `src/bot/flows.ts` | SIMPLIFICAR resolvePrompt |
| `src/webhook/handler.ts` | REESCRIBIR lógica de routing |
| `src/types.ts` | ACTUALIZAR ConversationState (flow_id en vez de product_id) |
| `dashboard/src/types/api.ts` | REESCRIBIR (nuevo tipo Flow, eliminar viejos) |
| `dashboard/src/lib/api.ts` | REESCRIBIR métodos |
| `dashboard/src/lib/hooks.ts` | REESCRIBIR hooks |
| `dashboard/src/pages/FlowsPage.tsx` | REESCRIBIR completo (lista + editor draft) |
| `dashboard/src/pages/WhatsAppPage.tsx` | ACTUALIZAR (agregar asignación de flow) |
| `dashboard/src/layout/AppLayout.tsx` | ACTUALIZAR (nueva nav, quitar ProductSelector) |
| `dashboard/src/pages/ProductsPage.tsx` | ELIMINAR |
| `dashboard/src/pages/ConfigPage.tsx` | ELIMINAR o reconvertir |
| `dashboard/src/lib/active-product.ts` | ELIMINAR |
