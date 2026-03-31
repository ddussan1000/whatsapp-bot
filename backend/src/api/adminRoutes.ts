import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import type { Context } from "hono";
import { supabase } from "../db/supabase";
import { normalizeEmail } from "./authContext";

const ErrorSchema = z.object({ error: z.string() });

const AuthHeaderSchema = z.object({
  authorization: z.string(),
});

function getSession(c: Context) {
  return (c as { get: (k: string) => unknown }).get("session") as {
    userId: string;
    email: string | null;
    organizationId: string | null;
    role: string;
    isPlatformAdmin: boolean;
  };
}

const OrgSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  created_at: z.string().nullable().optional(),
});

const AllowlistSchema = z.object({
  id: z.string(),
  organization_id: z.string(),
  email: z.string(),
  role: z.enum(["owner", "admin", "agent", "viewer"]),
  created_at: z.string().nullable().optional(),
});

export function registerAdminRoutes(dashboardApi: OpenAPIHono) {
  dashboardApi.openapi(
    createRoute({
      method: "get",
      path: "/admin/organizations",
      request: { headers: AuthHeaderSchema },
      responses: {
        200: { description: "List", content: { "application/json": { schema: z.array(OrgSchema) } } },
        500: { description: "Error", content: { "application/json": { schema: ErrorSchema } } },
      },
    }),
    async (c) => {
      if (!supabase) return c.json({ error: "Supabase no configurado" }, 500);
      const { data, error } = await supabase.from("organizations").select("id, slug, name, created_at").order("created_at", { ascending: false });
      if (error) return c.json({ error: error.message }, 500);
      return c.json(data ?? [], 200);
    },
  );

  dashboardApi.openapi(
    createRoute({
      method: "post",
      path: "/admin/organizations",
      request: {
        headers: AuthHeaderSchema,
        body: {
          required: true,
          content: {
            "application/json": {
              schema: z.object({ name: z.string().min(1), slug: z.string().min(1) }),
            },
          },
        },
      },
      responses: {
        200: { description: "Created", content: { "application/json": { schema: OrgSchema } } },
        500: { description: "Error", content: { "application/json": { schema: ErrorSchema } } },
      },
    }),
    async (c) => {
      if (!supabase) return c.json({ error: "Supabase no configurado" }, 500);
      const body = c.req.valid("json");
      const slug = body.slug.trim().toLowerCase().replace(/\s+/g, "-");
      const { data, error } = await supabase
        .from("organizations")
        .insert({ name: body.name.trim(), slug, created_by: getSession(c).userId === "dashboard-secret" ? null : getSession(c).userId })
        .select("id, slug, name, created_at")
        .single();
      if (error) return c.json({ error: error.message }, 500);
      return c.json(data, 200);
    },
  );

  dashboardApi.openapi(
    createRoute({
      method: "patch",
      path: "/admin/organizations/{id}",
      request: {
        headers: AuthHeaderSchema,
        params: z.object({ id: z.string() }),
        body: {
          content: {
            "application/json": {
              schema: z.object({ name: z.string().optional(), slug: z.string().optional() }),
            },
          },
        },
      },
      responses: {
        200: { description: "Updated", content: { "application/json": { schema: OrgSchema } } },
        400: { description: "Bad request", content: { "application/json": { schema: ErrorSchema } } },
        404: { description: "Not found", content: { "application/json": { schema: ErrorSchema } } },
        500: { description: "Error", content: { "application/json": { schema: ErrorSchema } } },
      },
    }),
    async (c) => {
      if (!supabase) return c.json({ error: "Supabase no configurado" }, 500);
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const patch: Record<string, string> = {};
      if (body.name?.trim()) patch.name = body.name.trim();
      if (body.slug?.trim()) patch.slug = body.slug.trim().toLowerCase().replace(/\s+/g, "-");
      if (Object.keys(patch).length === 0) return c.json({ error: "Sin cambios" }, 400);
      patch.updated_at = new Date().toISOString();
      const { data, error } = await supabase.from("organizations").update(patch).eq("id", id).select("id, slug, name, created_at").single();
      if (error) return c.json({ error: error.message }, 500);
      if (!data) return c.json({ error: "No encontrado" }, 404);
      return c.json(data, 200);
    },
  );

  dashboardApi.openapi(
    createRoute({
      method: "get",
      path: "/admin/organizations/{orgId}/allowlist",
      request: { headers: AuthHeaderSchema, params: z.object({ orgId: z.string() }) },
      responses: {
        200: { description: "List", content: { "application/json": { schema: z.array(AllowlistSchema) } } },
        500: { description: "Error", content: { "application/json": { schema: ErrorSchema } } },
      },
    }),
    async (c) => {
      if (!supabase) return c.json({ error: "Supabase no configurado" }, 500);
      const { orgId } = c.req.valid("param");
      const { data, error } = await supabase
        .from("organization_signup_allowlist")
        .select("id, organization_id, email, role, created_at")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false });
      if (error) return c.json({ error: error.message }, 500);
      return c.json(data ?? [], 200);
    },
  );

  dashboardApi.openapi(
    createRoute({
      method: "post",
      path: "/admin/organizations/{orgId}/allowlist",
      request: {
        headers: AuthHeaderSchema,
        params: z.object({ orgId: z.string() }),
        body: {
          required: true,
          content: {
            "application/json": {
              schema: z.object({
                email: z.string().email(),
                role: z.enum(["owner", "admin", "agent", "viewer"]).default("owner"),
              }),
            },
          },
        },
      },
      responses: {
        200: { description: "Created", content: { "application/json": { schema: AllowlistSchema } } },
        500: { description: "Error", content: { "application/json": { schema: ErrorSchema } } },
      },
    }),
    async (c) => {
      if (!supabase) return c.json({ error: "Supabase no configurado" }, 500);
      const { orgId } = c.req.valid("param");
      const body = c.req.valid("json");
      const email = normalizeEmail(body.email);
      const { data, error } = await supabase
        .from("organization_signup_allowlist")
        .insert({ organization_id: orgId, email, role: body.role })
        .select("id, organization_id, email, role, created_at")
        .single();
      if (error) return c.json({ error: error.message }, 500);
      return c.json(data, 200);
    },
  );

  dashboardApi.openapi(
    createRoute({
      method: "delete",
      path: "/admin/allowlist/{id}",
      request: { headers: AuthHeaderSchema, params: z.object({ id: z.string() }) },
      responses: {
        200: { description: "Deleted", content: { "application/json": { schema: z.object({ ok: z.boolean() }) } } },
        500: { description: "Error", content: { "application/json": { schema: ErrorSchema } } },
      },
    }),
    async (c) => {
      if (!supabase) return c.json({ error: "Supabase no configurado" }, 500);
      const { id } = c.req.valid("param");
      const { error } = await supabase.from("organization_signup_allowlist").delete().eq("id", id);
      if (error) return c.json({ error: error.message }, 500);
      return c.json({ ok: true }, 200);
    },
  );
}
