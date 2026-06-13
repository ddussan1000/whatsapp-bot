import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import type { Context } from "hono";
import { getSupabaseWithUserJwt } from "./authContext";
import { extractFirstWord, invalidateFlowCache } from "../db/flows";
import { invalidateInstanceCache } from "../db/instances";
import { getOrgAiConfig } from "../db/organizations";
import { generateRawForOrg } from "../ai/assistant";
import { log } from "../logger";

function db(c: Context) {
  return getSupabaseWithUserJwt(c);
}

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

const ErrorSchema = z.object({ error: z.string() });

const AuthHeaderSchema = z.object({
  authorization: z.string(),
  "x-organization-id": z.string().optional(),
});

const FlowStepMessageSchema = z.object({
  id: z.string(),
  step_id: z.string(),
  organization_id: z.string(),
  position: z.number(),
  message_type: z.enum(["text", "image", "document", "video", "audio"]),
  text_content: z.string().nullable().optional(),
  media_url: z.string().nullable().optional(),
  filename: z.string().nullable().optional(),
  caption: z.string().nullable().optional(),
  text_variants: z.array(z.string()).optional().default([]),
});

const FlowStepSchema = z.object({
  id: z.string(),
  flow_id: z.string(),
  organization_id: z.string(),
  position: z.number(),
  delay_seconds: z.number(),
  label: z.string().nullable().optional(),
  trigger_keywords: z.array(z.string()).optional(),
  messages: z.array(FlowStepMessageSchema).optional(),
});

const FlowSchema = z.object({
  id: z.string(),
  organization_id: z.string(),
  name: z.string(),
  trigger_phrase: z.string(),
  trigger_first_word: z.string(),
  keywords: z.array(z.string()),
  no_match_behavior: z.enum(["trigger", "ignore"]),
  system_prompt: z.string().nullable().optional(),
  message_overrides: z.record(z.string(), z.unknown()).nullable().optional(),
  is_active: z.boolean(),
  session_timeout_hours: z.number().default(24),
  updated_at: z.string().nullable().optional(),
  steps: z.array(FlowStepSchema).optional(),
});

function getSession(c: any) {
  return c.get("session") as { organizationId: string | null };
}

function orgId(c: any) {
  const id = getSession(c).organizationId;
  if (!id) throw new Error("organizationId requerido");
  return id;
}

const MAX_FLOW_DELAY_SECONDS = 86_400; // 24 horas

const UpsertFlowBodySchema = z
  .object({
    id: z.string().optional(),
    name: z.string().min(2),
    triggerPhrase: z.string().min(1),
    keywords: z.array(z.string()).default([]),
    noMatchBehavior: z.enum(["trigger", "ignore"]).default("trigger"),
    systemPrompt: z.string().nullable().optional(),
    isActive: z.boolean().default(true),
    sessionTimeoutHours: z.number().int().min(0).default(24),
    messageOverrides: z.record(z.string(), z.string()).optional(),
    steps: z
      .array(
        z.object({
          id: z.string().optional(),
          position: z.number(),
          delaySeconds: z.number().min(0).default(0),
          label: z.string().optional(),
          messages: z
            .array(
              z.object({
                id: z.string().optional(),
                position: z.number(),
                messageType: z.enum(["text", "image", "document", "video", "audio"]),
                textContent: z.string().nullable().optional(),
                textVariants: z.array(z.string()).optional().default([]),
                mediaUrl: z.string().nullable().optional(),
                filename: z.string().nullable().optional(),
                caption: z.string().nullable().optional(),
              }),
            )
            .default([]),
        }),
      )
      .default([]),
  })
  .refine(
    (data) => data.steps.reduce((sum, s) => sum + s.delaySeconds, 0) <= MAX_FLOW_DELAY_SECONDS,
    {
      message: "El tiempo acumulado de los pasos no puede superar las 24 horas",
      path: ["steps"],
    },
  );

export function registerFlowRoutes(dashboardApi: OpenAPIHono) {
  dashboardApi.openapi(
    createRoute({
      method: "get",
      path: "/flows",
      request: { headers: AuthHeaderSchema },
      responses: {
        200: { description: "Flows", content: { "application/json": { schema: z.array(FlowSchema) } } },
        500: { description: "Error", content: { "application/json": { schema: ErrorSchema } } },
      },
    }),
    async (c) => {
      const supabase = db(c);
      if (!supabase) return c.json([], 200);
      const { data, error } = await supabase
        .from("flows")
        .select(
          `id, organization_id, name, trigger_phrase, trigger_first_word, keywords, no_match_behavior, system_prompt, message_overrides, is_active, session_timeout_hours, updated_at,
           steps:flow_steps(id, flow_id, organization_id, position, delay_seconds, label, trigger_keywords,
             messages:flow_step_messages(id, step_id, organization_id, position, message_type, text_content, media_url, filename, caption, text_variants))`,
        )
        .eq("organization_id", orgId(c))
        .order("updated_at", { ascending: false });
      if (error) return c.json({ error: error.message }, 500);
      const sorted = (data ?? []).map((f) => ({
        ...f,
        steps: (f.steps ?? [])
          .sort((a: any, b: any) => a.position - b.position)
          .map((s: any) => ({
            ...s,
            messages: (s.messages ?? []).sort((a: any, b: any) => a.position - b.position),
          })),
      }));
      return c.json(sorted, 200);
    },
  );

  dashboardApi.openapi(
    createRoute({
      method: "get",
      path: "/flows/{id}",
      request: { headers: AuthHeaderSchema, params: z.object({ id: z.string() }) },
      responses: {
        200: { description: "Flow", content: { "application/json": { schema: FlowSchema } } },
        404: { description: "Not found", content: { "application/json": { schema: ErrorSchema } } },
        500: { description: "Error", content: { "application/json": { schema: ErrorSchema } } },
      },
    }),
    async (c) => {
      const supabase = db(c);
      if (!supabase) return c.json({ error: "Supabase no configurado" }, 500);
      const { id } = c.req.valid("param");
      const { data, error } = await supabase
        .from("flows")
        .select(
          `id, organization_id, name, trigger_phrase, trigger_first_word, keywords, no_match_behavior, system_prompt, message_overrides, is_active, session_timeout_hours, updated_at,
           steps:flow_steps(id, flow_id, organization_id, position, delay_seconds, label, trigger_keywords,
             messages:flow_step_messages(id, step_id, organization_id, position, message_type, text_content, media_url, filename, caption, text_variants))`,
        )
        .eq("id", id)
        .eq("organization_id", orgId(c))
        .maybeSingle();
      if (error) return c.json({ error: error.message }, 500);
      if (!data) return c.json({ error: "Flow no encontrado" }, 404);
      const sorted = {
        ...data,
        steps: (data.steps ?? [])
          .sort((a: any, b: any) => a.position - b.position)
          .map((s: any) => ({
            ...s,
            messages: (s.messages ?? []).sort((a: any, b: any) => a.position - b.position),
          })),
      };
      return c.json(sorted, 200);
    },
  );

  dashboardApi.openapi(
    createRoute({
      method: "post",
      path: "/flows/upsert",
      request: {
        headers: AuthHeaderSchema,
        body: { required: true, content: { "application/json": { schema: UpsertFlowBodySchema } } },
      },
      responses: {
        200: { description: "Flow", content: { "application/json": { schema: FlowSchema } } },
        500: { description: "Error", content: { "application/json": { schema: ErrorSchema } } },
      },
    }),
    async (c) => {
      const supabase = db(c);
      if (!supabase) return c.json({ error: "Supabase no configurado" }, 500);
      const body = c.req.valid("json");
      const payload = {
        ...body,
        organizationId: orgId(c),
        triggerFirstWord: extractFirstWord(body.triggerPhrase),
      };
      const { data: flowId, error: rpcError } = await supabase.rpc("upsert_flow_tree", { payload });
      if (rpcError) return c.json({ error: rpcError.message }, 500);
      if (flowId) await invalidateFlowCache(String(flowId));
      const { data, error } = await supabase
        .from("flows")
        .select(
          `id, organization_id, name, trigger_phrase, trigger_first_word, keywords, no_match_behavior, system_prompt, message_overrides, is_active, session_timeout_hours, updated_at,
           steps:flow_steps(id, flow_id, organization_id, position, delay_seconds, label, trigger_keywords,
             messages:flow_step_messages(id, step_id, organization_id, position, message_type, text_content, media_url, filename, caption, text_variants))`,
        )
        .eq("id", String(flowId))
        .eq("organization_id", orgId(c))
        .single();
      if (error) return c.json({ error: error.message }, 500);
      const sortedFlow = {
        ...data,
        steps: (data.steps ?? [])
          .sort((a: any, b: any) => a.position - b.position)
          .map((s: any) => ({
            ...s,
            messages: (s.messages ?? []).sort((a: any, b: any) => a.position - b.position),
          })),
      };
      return c.json(sortedFlow, 200);
    },
  );

  dashboardApi.openapi(
    createRoute({
      method: "delete",
      path: "/flows/{id}",
      request: { headers: AuthHeaderSchema, params: z.object({ id: z.string() }) },
      responses: {
        200: { description: "Deleted", content: { "application/json": { schema: z.object({ ok: z.boolean() }) } } },
        500: { description: "Error", content: { "application/json": { schema: ErrorSchema } } },
      },
    }),
    async (c) => {
      const supabase = db(c);
      if (!supabase) return c.json({ error: "Supabase no configurado" }, 500);
      const { id } = c.req.valid("param");
      const { error } = await supabase.from("flows").delete().eq("id", id).eq("organization_id", orgId(c));
      if (error) return c.json({ error: error.message }, 500);
      await invalidateFlowCache(id);
      return c.json({ ok: true }, 200);
    },
  );

  dashboardApi.openapi(
    createRoute({
      method: "put",
      path: "/instances/{id}/flow",
      request: {
        headers: AuthHeaderSchema,
        params: z.object({ id: z.string() }),
        body: {
          required: true,
          content: { "application/json": { schema: z.object({ flowId: z.string().nullable() }) } },
        },
      },
      responses: {
        200: { description: "Updated", content: { "application/json": { schema: z.object({ ok: z.boolean() }) } } },
        500: { description: "Error", content: { "application/json": { schema: ErrorSchema } } },
      },
    }),
    async (c) => {
      const supabase = db(c);
      if (!supabase) return c.json({ error: "Supabase no configurado" }, 500);
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const { data: inst, error } = await supabase
        .from("whatsapp_instances")
        .update({ flow_id: body.flowId, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("organization_id", orgId(c))
        .select("phone_number_id")
        .maybeSingle();
      if (error) return c.json({ error: error.message }, 500);
      if (inst?.phone_number_id) await invalidateInstanceCache(inst.phone_number_id);
      return c.json({ ok: true }, 200);
    },
  );

  dashboardApi.openapi(
    createRoute({
      method: "get",
      path: "/flow-referrals",
      request: { headers: AuthHeaderSchema },
      responses: {
        200: {
          description: "Flow referrals",
          content: {
            "application/json": {
              schema: z.array(
                z.object({
                  id: z.string(),
                  organization_id: z.string(),
                  flow_id: z.string(),
                  ctwa_clid: z.string(),
                  source_id: z.string().nullable().optional(),
                  source_type: z.string().nullable().optional(),
                  source_url: z.string().nullable().optional(),
                  created_at: z.string().nullable().optional(),
                }),
              ),
            },
          },
        },
        500: { description: "Error", content: { "application/json": { schema: ErrorSchema } } },
      },
    }),
    async (c) => {
      const supabase = db(c);
      if (!supabase) return c.json([], 200);
      const { data, error } = await supabase
        .from("flow_referrals")
        .select("id, organization_id, flow_id, ctwa_clid, source_id, source_type, source_url, created_at")
        .eq("organization_id", orgId(c))
        .order("created_at", { ascending: false });
      if (error) return c.json({ error: error.message }, 500);
      return c.json(data ?? [], 200);
    },
  );

  dashboardApi.openapi(
    createRoute({
      method: "post",
      path: "/flow-referrals",
      request: {
        headers: AuthHeaderSchema,
        body: {
          required: true,
          content: {
            "application/json": {
              schema: z.object({
                flowId: z.string(),
                ctwaClid: z.string().min(4),
                sourceId: z.string().optional(),
                sourceType: z.string().optional(),
                sourceUrl: z.string().optional(),
              }),
            },
          },
        },
      },
      responses: {
        200: {
          description: "Created",
          content: {
            "application/json": {
              schema: z.object({
                id: z.string(),
                organization_id: z.string(),
                flow_id: z.string(),
                ctwa_clid: z.string(),
                source_id: z.string().nullable().optional(),
                source_type: z.string().nullable().optional(),
                source_url: z.string().nullable().optional(),
                created_at: z.string().nullable().optional(),
              }),
            },
          },
        },
        500: { description: "Error", content: { "application/json": { schema: ErrorSchema } } },
      },
    }),
    async (c) => {
      const supabase = db(c);
      if (!supabase) return c.json({ error: "Supabase no configurado" }, 500);
      const body = c.req.valid("json");
      const { data, error } = await supabase
        .from("flow_referrals")
        .upsert(
          {
            organization_id: orgId(c),
            flow_id: body.flowId,
            ctwa_clid: body.ctwaClid,
            source_id: body.sourceId ?? null,
            source_type: body.sourceType ?? null,
            source_url: body.sourceUrl ?? null,
          },
          { onConflict: "organization_id,ctwa_clid" },
        )
        .select("id, organization_id, flow_id, ctwa_clid, source_id, source_type, source_url, created_at")
        .single();
      if (error) return c.json({ error: error.message }, 500);
      return c.json(data, 200);
    },
  );

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
                  .array(z.object({
                    index: z.number().int(),
                    text: z.string().min(1),
                    existingVariants: z.array(z.string()).optional().default([]),
                  }))
                  .min(1)
                  .max(100),
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
        "Eres un redactor experto en mensajes de WhatsApp para ventas. " +
        'Recibís un objeto JSON {"messages": Array<{text: string, existingVariants: string[]}>} con los mensajes de un bot. ' +
        'Respondé SOLO con un objeto JSON {"variants": string[]} donde variants tiene EXACTAMENTE el mismo largo y el mismo orden que messages, ' +
        "y cada elemento es una PARÁFRASIS del mensaje original: mismo significado, tono, intención y estructura, con otras palabras. " +
        "IMPORTANTE: para cada mensaje, el campo existingVariants lista las versiones alternativas ya existentes — tu nueva paráfrasis " +
        "NO debe ser igual ni muy similar a ninguna de ellas; usá palabras y estructura claramente distintas. " +
        "Conservá emojis, saltos de línea y cualquier placeholder como {{nombre}} o {nombre} sin modificarlos. " +
        "No agregues texto fuera del objeto JSON.";

      // Generate in batches so long flows never hit the provider's single-response output ceiling.
      const BATCH_SIZE = 5;
      const messageObjects = messages.map((m) => ({
        text: m.text,
        existingVariants: m.existingVariants ?? [],
      }));
      const allVariants: string[] = [];

      for (let start = 0; start < messageObjects.length; start += BATCH_SIZE) {
        const batch = messageObjects.slice(start, start + BATCH_SIZE);
        const user = JSON.stringify({ messages: batch });
        const inputChars = batch.reduce((n, m) => n + m.text.length, 0);
        const maxTokens = Math.min(8000, Math.max(1500, inputChars + 800));

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
          if (msg.startsWith("AI_PROVIDER_ERROR:")) {
            const [, statusStr, ...bodyParts] = msg.split(":");
            log.error(
              { orgId: orgId(c), providerStatus: statusStr, providerBody: bodyParts.join(":").slice(0, 500) },
              "generate-variants: AI provider HTTP error",
            );
            return c.json({ error: "El proveedor de IA rechazó la solicitud. Verificá tu API key y cuota." }, 502);
          }
          log.error({ orgId: orgId(c), err: msg }, "generate-variants: unexpected error");
          return c.json({ error: "Fallo inesperado al generar variante." }, 502);
        }
        if (!raw) return c.json({ error: "El proveedor de IA no devolvió respuesta." }, 502);

        const part = extractVariants(raw);
        if (!part) {
          log.error({ orgId: orgId(c), rawLen: raw.length }, "generate-variants: unparseable AI response");
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
    },
  );
}
