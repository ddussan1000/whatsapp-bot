import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import type { Context } from "hono";
import { getSupabaseWithUserJwt } from "./authContext";
import { extractFirstWord } from "../db/flows";

function db(c: Context) {
  return getSupabaseWithUserJwt(c);
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
  message_type: z.enum(["text", "image", "document", "video"]),
  text_content: z.string().nullable().optional(),
  media_url: z.string().nullable().optional(),
  filename: z.string().nullable().optional(),
  caption: z.string().nullable().optional(),
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
  is_active: z.boolean(),
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

const UpsertFlowBodySchema = z.object({
  id: z.string().optional(),
  name: z.string().min(2),
  triggerPhrase: z.string().min(1),
  keywords: z.array(z.string()).default([]),
  noMatchBehavior: z.enum(["trigger", "ignore"]).default("trigger"),
  systemPrompt: z.string().nullable().optional(),
  isActive: z.boolean().default(true),
  steps: z
    .array(
      z.object({
        id: z.string().optional(),
        position: z.number(),
        delaySeconds: z.number().default(0),
        label: z.string().optional(),
        messages: z
          .array(
            z.object({
              id: z.string().optional(),
              position: z.number(),
              messageType: z.enum(["text", "image", "document", "video"]),
              textContent: z.string().nullable().optional(),
              mediaUrl: z.string().nullable().optional(),
              filename: z.string().nullable().optional(),
              caption: z.string().nullable().optional(),
            }),
          )
          .default([]),
      }),
    )
    .default([]),
});

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
          `id, organization_id, name, trigger_phrase, trigger_first_word, keywords, no_match_behavior, system_prompt, is_active, updated_at,
           steps:flow_steps(id, flow_id, organization_id, position, delay_seconds, label, trigger_keywords,
             messages:flow_step_messages(id, step_id, organization_id, position, message_type, text_content, media_url, filename, caption))`,
        )
        .eq("organization_id", orgId(c))
        .order("updated_at", { ascending: false });
      if (error) return c.json({ error: error.message }, 500);
      return c.json(data ?? [], 200);
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
          `id, organization_id, name, trigger_phrase, trigger_first_word, keywords, no_match_behavior, system_prompt, is_active, updated_at,
           steps:flow_steps(id, flow_id, organization_id, position, delay_seconds, label, trigger_keywords,
             messages:flow_step_messages(id, step_id, organization_id, position, message_type, text_content, media_url, filename, caption))`,
        )
        .eq("id", id)
        .eq("organization_id", orgId(c))
        .maybeSingle();
      if (error) return c.json({ error: error.message }, 500);
      if (!data) return c.json({ error: "Flow no encontrado" }, 404);
      return c.json(data, 200);
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
      const { data, error } = await supabase
        .from("flows")
        .select(
          `id, organization_id, name, trigger_phrase, trigger_first_word, keywords, no_match_behavior, system_prompt, is_active, updated_at,
           steps:flow_steps(id, flow_id, organization_id, position, delay_seconds, label, trigger_keywords,
             messages:flow_step_messages(id, step_id, organization_id, position, message_type, text_content, media_url, filename, caption))`,
        )
        .eq("id", String(flowId))
        .eq("organization_id", orgId(c))
        .single();
      if (error) return c.json({ error: error.message }, 500);
      return c.json(data, 200);
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
      const { error } = await supabase
        .from("whatsapp_instances")
        .update({ flow_id: body.flowId, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("organization_id", orgId(c));
      if (error) return c.json({ error: error.message }, 500);
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
}
