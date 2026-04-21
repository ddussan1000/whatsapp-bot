import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import type { Context } from "hono";
import { supabase } from "../db/supabase";
import { listMessagesByConversation } from "../db/messages";
import { sendMessage } from "../bot/sender";
import { uploadMediaToMeta } from "../bot/media";
import { resolveSession } from "./authContext";
import { registerAdminRoutes } from "./adminRoutes";
import { registerFlowRoutes } from "./flowRoutes";
import { env } from "../config/env";
import { getPublicOrigin } from "../http/publicOrigin";
import {
  uploadOrgFlowMedia,
  uploadOrgMedia,
  deleteFromSupabaseStorage,
} from "../storage/supabaseStorage";
import {
  uploadOrgFlowMediaR2,
  uploadOrgMediaR2,
  deleteFromR2,
} from "../storage/r2Storage";
import { sendEmail } from "../email/resend";
import { buildInviteEmail } from "../email/templates/invite";
import { encrypt, safeDecrypt } from "../crypto/encrypt";
import { validateAiProvider } from "../ai/assistant";
import { log } from "../logger";
import { invalidateInstanceCache } from "../db/instances";

function todayStartIso(timezone = "America/Bogota") {
  // Get today's local date string in the given timezone, then find the UTC equivalent
  // of midnight there. Works with half-hour offsets (e.g. India UTC+5:30) too.
  const localDate = new Date().toLocaleDateString("en-CA", { timeZone: timezone });
  const utcMidnight = new Date(`${localDate}T00:00:00Z`);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(utcMidnight)
    .split(":")
    .map(Number);
  const localMin = (parts[0] ?? 0) * 60 + (parts[1] ?? 0);
  const offsetMin = localMin === 0 ? 0 : localMin < 720 ? -localMin : 1440 - localMin;
  return new Date(utcMidnight.getTime() + offsetMin * 60_000).toISOString();
}

function splitCsv(input?: string) {
  if (!input) return [];
  return input
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

type Session = {
  userId: string;
  email: string | null;
  organizationId: string | null;
  role: "owner" | "admin" | "agent" | "viewer";
  isPlatformAdmin: boolean;
};

function getSession(c: Context): Session {
  return (c as any).get("session") as Session;
}

/** Solo rutas tenant (tras middleware de organización). */
function orgId(c: Context): string {
  const s = getSession(c);
  if (!s.organizationId) throw new Error("organizationId requerido");
  return s.organizationId;
}

const ErrorSchema = z.object({ error: z.string() });
const TodayStatsSchema = z.object({
  total: z.number(),
  count: z.number(),
  average: z.number(),
});
const RangePointSchema = z.object({ date: z.string(), total: z.number() });
const ReportsKpiSchema = z.object({
  revenueTotal: z.number(),
  salesCount: z.number(),
  avgTicket: z.number(),
  conversationsCount: z.number(),
  conversionRate: z.number(),
});
const ReportsTimePointSchema = z.object({
  bucket: z.string(),
  revenue: z.number(),
  sales: z.number(),
  conversations: z.number(),
});
const ReportsGroupSchema = z.object({
  id: z.string(),
  label: z.string(),
  revenue: z.number(),
  sales: z.number(),
});
const ReportsFunnelItemSchema = z.object({
  stage: z.string(),
  count: z.number(),
});
const ReportsTableItemSchema = z.object({
  paymentId: z.string(),
  validatedAt: z.string().nullable().optional(),
  amount: z.number(),
  currency: z.string().nullable().optional(),
  phone: z.string(),
  flowId: z.string().nullable().optional(),
  flowName: z.string().nullable().optional(),
  instanceId: z.string().nullable().optional(),
  instanceLabel: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
});
const ReportsResponseSchema = z.object({
  kpis: ReportsKpiSchema,
  timeseries: z.array(ReportsTimePointSchema),
  byFlow: z.array(ReportsGroupSchema),
  byInstance: z.array(ReportsGroupSchema),
  funnel: z.array(ReportsFunnelItemSchema),
  table: z.object({
    items: z.array(ReportsTableItemSchema),
    page: z.number(),
    pageSize: z.number(),
    total: z.number(),
  }),
});
const AdSourceSchema = z.object({
  source_id: z.string().nullable(),
  headline: z.string().nullable(),
  ad_name: z.string().nullable(),
  campaign_name: z.string().nullable(),
  adset_name: z.string().nullable(),
  created_at: z.string().nullable(),
});

const ConversationSchema = z.object({
  id: z.string(),
  phone: z.string(),
  contact_name: z.string().nullable().optional(),
  stage: z.string(),
  flow_id: z.string().nullable().optional(),
  flow_name: z.string().nullable().optional(),
  started_at: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional(),
  ad_name: z.string().nullable().optional(),
  ad_source: AdSourceSchema.nullable().optional(),
  last_message_text: z.string().nullable().optional(),
  last_message_direction: z.enum(["inbound", "outbound"]).nullable().optional(),
  unread_count: z.number().optional(),
});
const PAYMENT_STATES = [
  "pending_manual_review",
  "validated",
  "rejected",
] as const;

const PaymentSchema = z.object({
  id: z.string(),
  phone: z.string(),
  flow_id: z.string().nullable().optional(),
  flow_name: z.string().nullable().optional(),
  whatsapp_instance_id: z.string().nullable().optional(),
  instance_label: z.string().nullable().optional(),
  amount: z.number().nullable().optional(),
  currency: z.string().nullable().optional(),
  receipt_date: z.string().nullable().optional(),
  state: z.enum(PAYMENT_STATES).nullable().optional(),
  validated_at: z.string().nullable().optional(),
});
const ChatMessageSchema = z.object({
  id: z.string(),
  conversation_id: z.string().nullable().optional(),
  phone: z.string(),
  direction: z.enum(["inbound", "outbound"]),
  message_type: z.string(),
  text_body: z.string().nullable().optional(),
  media_url: z.string().nullable().optional(),
  payload: z.record(z.string(), z.unknown()).nullable().optional(),
  meta_message_id: z.string().nullable().optional(),
  delivery_status: z.string().nullable().optional(),
  delivered_at: z.string().nullable().optional(),
  created_at: z.string().nullable().optional(),
});

const UploadResponseSchema = z.object({
  ok: z.boolean(),
  metaMediaId: z.string().optional(),
  mimeType: z.string(),
  kind: z.enum(["image", "document", "audio"]),
  filename: z.string().optional(),
});
const FlowMediaUploadResponseSchema = z.object({
  ok: z.boolean(),
  url: z.string(),
  path: z.string(),
  bucket: z.string(),
  filename: z.string(),
  mimeType: z.string(),
});

const paginatedSchema = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    items: z.array(item),
    page: z.number(),
    pageSize: z.number(),
    total: z.number(),
  });

const AuthHeaderSchema = z.object({
  authorization: z
    .string()
    .openapi({ example: "Bearer <supabase_access_token|dashboard_secret>" }),
  "x-organization-id": z.string().optional(),
});

export const dashboardApi = new OpenAPIHono();

dashboardApi.use("/*", async (c, next) => {
  if (c.req.method === "OPTIONS") return c.body(null, 204);
  const session = await resolveSession(c);
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  (c as any).set("session", session);
  await next();
});

dashboardApi.use("/admin/*", async (c, next) => {
  const session = getSession(c);
  if (!session.isPlatformAdmin) return c.json({ error: "Forbidden" }, 403);
  await next();
});

dashboardApi.use("/*", async (c, next) => {
  const path = c.req.path;
  // Con app.route("/api", dashboardApi), c.req.path incluye el prefijo /api (p. ej. /api/auth/session).
  const isAuthSession =
    path === "/auth/session" || path.endsWith("/auth/session");
  const isAdminRoute =
    path.startsWith("/admin") || path.startsWith("/api/admin");
  if (isAuthSession) return await next();
  if (isAdminRoute) return await next();
  const session = getSession(c);
  if (!session.organizationId) {
    if (!Boolean(session.isPlatformAdmin)) {
      return c.json(
        {
          error: "Forbidden",
          reason: "missing_organization",
          detail:
            "La sesión no tiene organización. Si usas la anon key en el backend, configura SUPABASE_SERVICE_ROLE_KEY o asegúrate de que organization_members sea legible. Si eres admin de plataforma, envía el header X-Organization-Id.",
        },
        403,
      );
    }
    return c.json(
      { error: "Selecciona organización (header X-Organization-Id)" },
      400,
    );
  }
  await next();
});

dashboardApi.use("/products/*", async (c) =>
  c.json({ error: "Legacy endpoint retirado en Fase 2" }, 410),
);
dashboardApi.use("/products", async (c) =>
  c.json({ error: "Legacy endpoint retirado en Fase 2" }, 410),
);
dashboardApi.use("/product-referrals/*", async (c) =>
  c.json({ error: "Legacy endpoint retirado en Fase 2" }, 410),
);
dashboardApi.use("/product-referrals", async (c) =>
  c.json({ error: "Legacy endpoint retirado en Fase 2" }, 410),
);
dashboardApi.use("/campaigns/*", async (c) =>
  c.json({ error: "Legacy endpoint retirado en Fase 2" }, 410),
);
dashboardApi.use("/campaigns", async (c) =>
  c.json({ error: "Legacy endpoint retirado en Fase 2" }, 410),
);
dashboardApi.use("/flow-definitions/*", async (c) =>
  c.json({ error: "Legacy endpoint retirado en Fase 2" }, 410),
);
dashboardApi.use("/flow-definitions", async (c) =>
  c.json({ error: "Legacy endpoint retirado en Fase 2" }, 410),
);
dashboardApi.use("/flow-steps/*", async (c) =>
  c.json({ error: "Legacy endpoint retirado en Fase 2" }, 410),
);
dashboardApi.use("/flow-steps", async (c) =>
  c.json({ error: "Legacy endpoint retirado en Fase 2" }, 410),
);
dashboardApi.use("/flow-step-messages/*", async (c) =>
  c.json({ error: "Legacy endpoint retirado en Fase 2" }, 410),
);
dashboardApi.use("/flow-step-messages", async (c) =>
  c.json({ error: "Legacy endpoint retirado en Fase 2" }, 410),
);

registerAdminRoutes(dashboardApi);
registerFlowRoutes(dashboardApi);

dashboardApi.openapi(
  createRoute({
    method: "post",
    path: "/files/upload",
    request: {
      headers: AuthHeaderSchema,
      body: {
        required: true,
        content: {
          "multipart/form-data": {
            schema: z.object({
              file: z.any().openapi({ type: "string", format: "binary" }),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Flow media uploaded",
        content: {
          "application/json": { schema: FlowMediaUploadResponseSchema },
        },
      },
      400: {
        description: "Bad request",
        content: { "application/json": { schema: ErrorSchema } },
      },
      413: {
        description: "Archivo demasiado grande",
        content: { "application/json": { schema: ErrorSchema } },
      },
      500: {
        description: "Error",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  }),
  async (c) => {
    if (env.STORAGE_MODE !== "supabase" && env.STORAGE_MODE !== "r2") {
      return c.json(
        { error: "Configura STORAGE_MODE=r2 o STORAGE_MODE=supabase para subir media de flows" },
        400,
      );
    }
    if (env.STORAGE_MODE === "supabase" && !supabase) return c.json({ error: "Supabase no configurado" }, 500);
    const form = await c.req.formData();
    const file = form.get("file");
    if (!(file instanceof File))
      return c.json({ error: "Archivo invalido" }, 400);
    const bytes = await file.arrayBuffer();
    const MAX_FLOW_MEDIA_BYTES = 50 * 1024 * 1024; // 50 MB
    if (bytes.byteLength > MAX_FLOW_MEDIA_BYTES) {
      return c.json({ error: "El archivo supera el límite de 50 MB" }, 413);
    }
    const buffer = Buffer.from(bytes);
    const filename = file.name || "asset.bin";
    const contentType = file.type || "application/octet-stream";
    const uploaded = env.STORAGE_MODE === "r2"
      ? await uploadOrgFlowMediaR2({ organizationId: orgId(c), filename, buffer, contentType })
      : await uploadOrgFlowMedia({ organizationId: orgId(c), bucket: env.SUPABASE_STORAGE_BUCKET_FLOW_MEDIA, filename, buffer, contentType });
    return c.json(
      {
        ok: true,
        url: uploaded.publicUrl,
        path: "key" in uploaded ? uploaded.key : uploaded.path,
        bucket: env.STORAGE_MODE === "r2" ? env.R2_BUCKET_NAME : env.SUPABASE_STORAGE_BUCKET_FLOW_MEDIA,
        filename,
        mimeType: contentType,
      },
      200,
    );
  },
);

dashboardApi.openapi(
  createRoute({
    method: "get",
    path: "/stats/today",
    request: { headers: AuthHeaderSchema },
    responses: {
      200: {
        description: "Today stats",
        content: { "application/json": { schema: TodayStatsSchema } },
      },
      500: {
        description: "Error",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  }),
  async (c) => {
    if (!supabase) return c.json({ total: 0, count: 0, average: 0 }, 200);
    const session = getSession(c);
    const { data: org } = await supabase
      .from("organizations")
      .select("timezone")
      .eq("id", orgId(c))
      .maybeSingle();
    const { data, error } = await supabase
      .from("payments")
      .select("amount, product")
      .eq("organization_id", orgId(c))
      .gte("validated_at", todayStartIso(org?.timezone ?? "America/Bogota"));
    if (error) return c.json({ error: error.message }, 500);
    const total = (data ?? []).reduce(
      (sum, row) => sum + Number(row.amount ?? 0),
      0,
    );
    const count = data?.length ?? 0;
    const average = count > 0 ? total / count : 0;
    return c.json({ total, count, average }, 200);
  },
);

dashboardApi.openapi(
  createRoute({
    method: "get",
    path: "/stats/reports",
    request: {
      headers: AuthHeaderSchema,
      query: z.object({
        from: z.string().optional(),
        to: z.string().optional(),
        instanceId: z
          .string()
          .optional()
          .openapi({ description: "CSV of instance IDs" }),
        flowId: z
          .string()
          .optional()
          .openapi({ description: "CSV of flow IDs" }),
        granularity: z.enum(["day", "week", "month"]).default("day"),
        page: z.coerce.number().default(1),
        pageSize: z.coerce.number().default(20),
      }),
    },
    responses: {
      200: {
        description: "Reports analytics",
        content: { "application/json": { schema: ReportsResponseSchema } },
      },
      500: {
        description: "Error",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  }),
  async (c) => {
    if (!supabase) {
      return c.json(
        {
          kpis: {
            revenueTotal: 0,
            salesCount: 0,
            avgTicket: 0,
            conversationsCount: 0,
            conversionRate: 0,
          },
          timeseries: [],
          byFlow: [],
          byInstance: [],
          funnel: [],
          table: { items: [], page: 1, pageSize: 20, total: 0 },
        },
        200,
      );
    }

    const { from, to, instanceId, flowId, granularity, page, pageSize } =
      c.req.valid("query");
    const fromDate = from
      ? new Date(from)
      : new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const toDate = to ? new Date(to) : new Date();
    const fromIso = fromDate.toISOString();
    const toIso = toDate.toISOString();
    const instanceIds = splitCsv(instanceId);
    const flowIds = splitCsv(flowId);
    const organizationId = orgId(c);
    const { data, error } = await supabase.rpc("get_reports_analytics", {
      p_organization_id: organizationId,
      p_from: fromIso,
      p_to: toIso,
      p_instance_ids: instanceIds.length > 0 ? instanceIds : null,
      p_flow_ids: flowIds.length > 0 ? flowIds : null,
      p_granularity: granularity,
      p_page: page,
      p_page_size: pageSize,
    });
    if (error) return c.json({ error: error.message }, 500);

    return c.json(
      data ?? {
        kpis: {
          revenueTotal: 0,
          salesCount: 0,
          avgTicket: 0,
          conversationsCount: 0,
          conversionRate: 0,
        },
        timeseries: [],
        byFlow: [],
        byInstance: [],
        funnel: [],
        table: { items: [], page, pageSize, total: 0 },
      },
      200,
    );
  },
);

const AdReferralItemSchema = z.object({
  sourceId: z.string().nullable(),
  headline: z.string().nullable(),
  clicks: z.number(),
  uniqueLeads: z.number(),
  conversions: z.number(),
  revenue: z.number(),
  conversionRate: z.number(),
});

const AdReferralStatsSchema = z.object({
  items: z.array(AdReferralItemSchema),
  totals: z.object({
    clicks: z.number(),
    uniqueLeads: z.number(),
    conversions: z.number(),
    revenue: z.number(),
    conversionRate: z.number(),
  }),
});

dashboardApi.openapi(
  createRoute({
    method: "get",
    path: "/stats/ad-referrals",
    request: {
      headers: AuthHeaderSchema,
      query: z.object({
        from: z.string().optional(),
        to: z.string().optional(),
        flowId: z
          .string()
          .optional()
          .openapi({ description: "CSV of flow IDs" }),
      }),
    },
    responses: {
      200: {
        description: "Ad referral stats",
        content: { "application/json": { schema: AdReferralStatsSchema } },
      },
      500: {
        description: "Error",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  }),
  async (c) => {
    if (!supabase) {
      return c.json(
        {
          items: [],
          totals: {
            clicks: 0,
            uniqueLeads: 0,
            conversions: 0,
            revenue: 0,
            conversionRate: 0,
          },
        },
        200,
      );
    }

    const { from, to, flowId } = c.req.valid("query");
    const organizationId = orgId(c);
    const fromDate = from
      ? new Date(from)
      : new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const toDate = to ? new Date(to) : new Date();

    let clickQuery = supabase
      .from("ad_click_logs")
      .select("source_id, headline, ad_name, phone, flow_id, created_at")
      .eq("organization_id", organizationId)
      .gte("created_at", fromDate.toISOString())
      .lte("created_at", toDate.toISOString());

    const flowIds = splitCsv(flowId);
    if (flowIds.length > 0) {
      clickQuery = clickQuery.in("flow_id", flowIds);
    }

    const { data: clicks, error: clickErr } = await clickQuery;
    if (clickErr) return c.json({ error: clickErr.message }, 500);

    const adPhones = new Set((clicks ?? []).map((c) => c.phone));
    const phoneList = [...adPhones];

    let adPayments: { phone: string; amount: unknown; flow_id: string | null; state: string }[] = [];
    if (phoneList.length > 0) {
      let payQuery = supabase
        .from("payments")
        .select("phone, amount, flow_id, state")
        .eq("organization_id", organizationId)
        .in("state", ["validated", "pending_manual_review"])
        .in("phone", phoneList);

      if (flowIds.length > 0) {
        payQuery = payQuery.in("flow_id", flowIds);
      }

      const { data: payments, error: payErr } = await payQuery;
      if (payErr) return c.json({ error: payErr.message }, 500);
      adPayments = payments ?? [];
    }

    type AdGroup = {
      sourceId: string | null;
      headline: string | null;
      phones: Set<string>;
      clicks: number;
    };

    const byAd = new Map<string, AdGroup>();
    for (const click of clicks ?? []) {
      const key = click.source_id ?? "__none__";
      let group = byAd.get(key);
      if (!group) {
        group = {
          sourceId: click.source_id,
          headline: (click.ad_name as string | null) ?? click.headline,
          phones: new Set(),
          clicks: 0,
        };
        byAd.set(key, group);
      }
      group.clicks++;
      group.phones.add(click.phone);
    }

    const payByPhone = new Map<string, { count: number; revenue: number }>();
    for (const p of adPayments) {
      const existing = payByPhone.get(p.phone) ?? { count: 0, revenue: 0 };
      existing.count++;
      existing.revenue += Number(p.amount ?? 0);
      payByPhone.set(p.phone, existing);
    }

    const items: Array<{
      sourceId: string | null;
      headline: string | null;
      clicks: number;
      uniqueLeads: number;
      conversions: number;
      revenue: number;
      conversionRate: number;
    }> = [];

    let totalClicks = 0;
    let totalLeads = 0;
    let totalConversions = 0;
    let totalRevenue = 0;

    for (const group of byAd.values()) {
      let conversions = 0;
      let revenue = 0;
      for (const phone of group.phones) {
        const pData = payByPhone.get(phone);
        if (pData) {
          conversions += pData.count;
          revenue += pData.revenue;
        }
      }
      const uniqueLeads = group.phones.size;
      items.push({
        sourceId: group.sourceId,
        headline: group.headline,
        clicks: group.clicks,
        uniqueLeads,
        conversions,
        revenue,
        conversionRate: uniqueLeads > 0 ? conversions / uniqueLeads : 0,
      });
      totalClicks += group.clicks;
      totalLeads += uniqueLeads;
      totalConversions += conversions;
      totalRevenue += revenue;
    }

    items.sort((a, b) => b.clicks - a.clicks);

    return c.json(
      {
        items,
        totals: {
          clicks: totalClicks,
          uniqueLeads: totalLeads,
          conversions: totalConversions,
          revenue: totalRevenue,
          conversionRate: totalLeads > 0 ? totalConversions / totalLeads : 0,
        },
      },
      200,
    );
  },
);

const MembershipSchema = z.object({
  organization_id: z.string(),
  role: z.enum(["owner", "admin", "agent", "viewer"]),
});

const OrganizationSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  timezone: z.string().default("America/Bogota"),
});

const InviteSchema = z.object({
  id: z.string(),
  email: z.string(),
  role: z.enum(["owner", "admin", "agent", "viewer"]),
  status: z.string(),
  expires_at: z.string(),
  created_at: z.string(),
});

const CampaignSchema = z.object({
  id: z.string(),
  organization_id: z.string(),
  name: z.string(),
  status: z.enum(["draft", "active", "paused", "archived"]),
  channel: z.string(),
  product_id: z.string().nullable().optional(),
  product: z.string().nullable().optional(),
  system_prompt: z.string(),
  dispatch_keywords: z.string(),
  config: z.record(z.string(), z.unknown()),
  updated_at: z.string(),
});

const FlowVersionSchema = z.object({
  id: z.string(),
  campaign_id: z.string(),
  version_number: z.number(),
  status: z.enum(["draft", "published", "archived"]),
  notes: z.string().nullable().optional(),
  published_at: z.string().nullable().optional(),
  updated_at: z.string(),
});

const TemplateSchema = z.object({
  id: z.string(),
  flow_id: z.string().nullable().optional(),
  name: z.string(),
  category: z.string(),
  kind: z.enum(["text", "image", "document", "link"]),
  content: z.string(),
  media_url: z.string().nullable().optional(),
  variables: z.array(z.string()),
  is_active: z.boolean(),
  updated_at: z.string(),
});

const ProductSchema = z.object({
  id: z.string(),
  organization_id: z.string(),
  name: z.string(),
  slug: z.string(),
  is_active: z.boolean(),
  system_prompt: z.string(),
  dispatch_keywords: z.string(),
  config: z.record(z.string(), z.unknown()),
  updated_at: z.string().nullable().optional(),
});

const InstanceSchema = z.object({
  id: z.string(),
  organization_id: z.string(),
  provider: z.enum(["meta"]),
  label: z.string(),
  waba_id: z.string().nullable().optional(),
  meta_app_id: z.string().nullable().optional(),
  phone_number_id: z.string(),
  display_phone_number: z.string().nullable().optional(),
  meta_token: z.string().nullable().optional(),
  flow_id: z.string().nullable().optional(),
  is_active: z.boolean(),
  currency: z.string().default("COP"),
  updated_at: z.string().nullable().optional(),
});

const AutoConfigResultSchema = z.object({
  wabaSubscribed: z.boolean(),
  webhookConfigured: z.boolean(),
  messagesSubscribed: z.boolean(),
  errors: z.array(z.string()),
});

const MetaStatusSchema = z.object({
  tokenType: z.enum(["user", "system_user", "unknown"]),
  expiresAt: z.number(),
  permissions: z.array(z.object({ name: z.string(), granted: z.boolean() })),
  wabaSubscribed: z.boolean().nullable(),
  webhookConfigured: z.boolean().nullable(),
  messagesSubscribed: z.boolean().nullable(),
  webhookUrl: z.string().nullable(),
});

const InstanceHealthSchema = z.object({
  ok: z.boolean(),
  status: z.enum(["connected", "invalid_token", "error"]),
  reason: z
    .enum([
      "ok",
      "token_expired",
      "token_invalid",
      "insufficient_permissions",
      "phone_number_not_found",
      "app_not_subscribed",
      "rate_limited",
      "unknown",
    ])
    .optional(),
  errorCode: z.number().optional(),
  errorSubcode: z.number().optional(),
  detail: z.string().nullable().optional(),
  meta: z
    .object({
      phone_number_id: z.string().optional(),
      display_phone_number: z.string().nullable().optional(),
      verified_name: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
});

const WebhookConfigSchema = z.object({
  webhookUrl: z.string(),
  verifyToken: z.string(),
});

// ── Meta token discovery ──────────────────────────────────────────────────

const DiscoveredPhoneNumberSchema = z.object({
  id: z.string(),
  displayPhoneNumber: z.string(),
  verifiedName: z.string(),
  wabaId: z.string(),
});

const DiscoverInstancesResponseSchema = z.object({
  phoneNumbers: z.array(DiscoveredPhoneNumberSchema),
  /** "user" = token personal (vence), "system_user" = permanente, "unknown" = no se pudo determinar */
  tokenType: z.enum(["user", "system_user", "unknown"]),
  /** Unix timestamp de vencimiento. 0 = no vence. */
  expiresAt: z.number(),
  /** Permisos requeridos que le faltan al token. */
  missingPermissions: z.array(z.string()),
});

const ProductReferralSchema = z.object({
  id: z.string(),
  organization_id: z.string(),
  product_id: z.string(),
  ctwa_clid: z.string(),
  source_id: z.string().nullable().optional(),
  source_type: z.string().nullable().optional(),
  source_url: z.string().nullable().optional(),
  created_at: z.string().nullable().optional(),
});

async function resolveCampaignId(
  organizationId: string,
  input: { campaignId?: string; productId?: string },
) {
  if (input.campaignId) return input.campaignId;
  if (!input.productId || !supabase) return null;
  const { data } = await supabase
    .from("campaigns")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("product_id", input.productId)
    .maybeSingle();
  return data?.id ?? null;
}

dashboardApi.openapi(
  createRoute({
    method: "get",
    path: "/auth/session",
    request: { headers: AuthHeaderSchema },
    responses: {
      200: {
        description: "Current session",
        content: {
          "application/json": {
            schema: z.object({
              userId: z.string(),
              email: z.string().nullable(),
              organizationId: z.string().nullable(),
              role: z.enum(["owner", "admin", "agent", "viewer"]),
              isPlatformAdmin: z.boolean(),
            }),
          },
        },
      },
    },
  }),
  async (c) => c.json(getSession(c), 200),
);

dashboardApi.openapi(
  createRoute({
    method: "get",
    path: "/org/current",
    request: { headers: AuthHeaderSchema },
    responses: {
      200: {
        description: "Current organization",
        content: {
          "application/json": {
            schema: z.object({
              organization: OrganizationSchema,
              membership: MembershipSchema,
            }),
          },
        },
      },
      404: {
        description: "Not found",
        content: { "application/json": { schema: ErrorSchema } },
      },
      500: {
        description: "Error",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  }),
  async (c) => {
    if (!supabase) return c.json({ error: "Supabase no configurado" }, 500);
    const session = getSession(c);
    const { data: organization, error } = await supabase
      .from("organizations")
      .select("id, slug, name, timezone")
      .eq("id", orgId(c))
      .maybeSingle();
    if (error) return c.json({ error: error.message }, 500);
    if (!organization)
      return c.json({ error: "Organizacion no encontrada" }, 404);
    return c.json(
      {
        organization,
        membership: {
          organization_id: orgId(c),
          role: session.role,
        },
      },
      200,
    );
  },
);

dashboardApi.openapi(
  createRoute({
    method: "put",
    path: "/org/current",
    request: {
      headers: AuthHeaderSchema,
      body: {
        content: {
          "application/json": {
            schema: z.object({
              name: z.string().min(2).optional(),
              timezone: z.string().optional(),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Updated organization",
        content: { "application/json": { schema: OrganizationSchema } },
      },
      403: {
        description: "Forbidden",
        content: { "application/json": { schema: ErrorSchema } },
      },
      500: {
        description: "Error",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  }),
  async (c) => {
    if (!supabase) return c.json({ error: "Supabase no configurado" }, 500);
    const session = getSession(c);
    if (!["owner", "admin"].includes(session.role ?? "")) {
      return c.json(
        {
          error:
            "Solo el propietario o administrador puede editar la organización",
        },
        403,
      );
    }
    const body = c.req.valid("json");
    const updates: Record<string, string> = {};
    if (body.name) updates.name = body.name;
    if (body.timezone) updates.timezone = body.timezone;
    const { data, error } = await supabase
      .from("organizations")
      .update(updates)
      .eq("id", orgId(c))
      .select("id, slug, name, timezone")
      .maybeSingle();
    if (error) return c.json({ error: error.message }, 500);
    return c.json(data!, 200);
  },
);

// ── POST /instances/discover ──────────────────────────────────────────────
// Recibe un token de Meta y auto-descubre los números de WhatsApp disponibles.
// También detecta el tipo de token (permanente vs temporal) y permisos faltantes.
// El token se usa solo en esta llamada y NO se almacena.

dashboardApi.openapi(
  createRoute({
    method: "post",
    path: "/instances/discover",
    request: {
      headers: AuthHeaderSchema,
      body: {
        required: true,
        content: {
          "application/json": {
            schema: z.object({
              metaToken: z.string().min(10),
              wabaId: z.string().optional(),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Números de WhatsApp descubiertos",
        content: {
          "application/json": { schema: DiscoverInstancesResponseSchema },
        },
      },
      400: {
        description: "Token inválido o sin permisos suficientes",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  }),
  async (c) => {
    const { metaToken, wabaId: manualWabaId } = c.req.valid("json");

    const REQUIRED_PERMS = [
      "whatsapp_business_messaging",
      "whatsapp_business_management",
      "ads_read",
    ];

    console.log("[discover] Iniciando descubrimiento de números...");

    // ── 1. Inspeccionar el token via debug_token (auto-inspección) ────────
    const debugUrl = `https://graph.facebook.com/v19.0/debug_token?input_token=${encodeURIComponent(metaToken)}&access_token=${encodeURIComponent(metaToken)}`;
    console.log("[discover] Llamando debug_token...");
    const debugRes = await fetch(debugUrl).catch((e) => {
      console.error("[discover] debug_token fetch error:", e);
      return null;
    });

    let tokenType: "user" | "system_user" | "unknown" = "unknown";
    let expiresAt = 0;
    let missingPermissions: string[] = [];
    let granularWabaIds: string[] = [];
    let userId: string | undefined;

    if (debugRes?.ok) {
      const body = (await debugRes.json()) as {
        data?: {
          type?: string;
          expires_at?: number;
          is_valid?: boolean;
          user_id?: string;
          error?: { message?: string; code?: number };
          scopes?: string[];
          granular_scopes?: { scope: string; target_ids?: string[] }[];
        };
        error?: { message?: string };
      };

      console.log("[discover] debug_token response:", JSON.stringify(body, null, 2));

      if (body.error || body.data?.is_valid === false) {
        const msg =
          body.error?.message ??
          body.data?.error?.message ??
          "Token inválido o sin permisos suficientes.";
        console.log("[discover] Token inválido:", msg);
        return c.json({ error: msg }, 400);
      }

      const d = body.data!;

      if (d.type === "SYSTEM_USER") tokenType = "system_user";
      else if (d.type === "USER") tokenType = "user";

      expiresAt = d.expires_at ?? 0;
      userId = d.user_id;
      const scopes = d.scopes ?? [];
      missingPermissions = REQUIRED_PERMS.filter((p) => !scopes.includes(p));

      console.log("[discover] tokenType:", tokenType, "| expiresAt:", expiresAt);
      console.log("[discover] scopes:", scopes);
      console.log("[discover] missingPermissions:", missingPermissions);

      // granular_scopes trae los WABA IDs cuando la auto-inspección los retorna
      const granular = d.granular_scopes ?? [];
      console.log("[discover] granular_scopes:", JSON.stringify(granular));
      const wbmScope = granular.find(
        (s) => s.scope === "whatsapp_business_management",
      );
      granularWabaIds = wbmScope?.target_ids ?? [];
      console.log("[discover] WABA IDs desde granular_scopes:", granularWabaIds);
    } else {
      console.log("[discover] debug_token HTTP status:", debugRes?.status, "— fallback a /me");
      const meRes = await fetch(
        "https://graph.facebook.com/v19.0/me?fields=id",
        { headers: { Authorization: `Bearer ${metaToken}` } },
      ).catch(() => null);

      if (!meRes?.ok) {
        const raw = await meRes?.json().catch(() => null) as { error?: { message?: string } } | null;
        console.log("[discover] /me también falló:", raw);
        const message = raw?.error?.message ?? "Token inválido o sin permisos suficientes.";
        return c.json({ error: message }, 400);
      }
      console.log("[discover] /me OK, continuando sin datos de debug_token");
    }

    // ── 2. Descubrir números de teléfono ─────────────────────────────────

    const phoneNumbers: {
      id: string;
      displayPhoneNumber: string;
      verifiedName: string;
      wabaId: string;
    }[] = [];

    /** Obtiene los números de un WABA y los agrega al array. */
    const fetchPhoneNumbers = async (wabaId: string) => {
      const url = `https://graph.facebook.com/v19.0/${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name`;
      console.log(`[discover] Obteniendo números para WABA ${wabaId}:`, url);
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${metaToken}` },
      }).catch((e) => {
        console.error(`[discover] Error fetch phone_numbers WABA ${wabaId}:`, e);
        return null;
      });
      if (!res?.ok) {
        const errBody = await res?.json().catch(() => null);
        console.log(`[discover] phone_numbers HTTP ${res?.status} para WABA ${wabaId}:`, errBody);
        return;
      }
      const data = (await res.json()) as {
        data?: {
          id: string;
          display_phone_number?: string;
          verified_name?: string;
        }[];
      };
      console.log(`[discover] Números encontrados en WABA ${wabaId}:`, JSON.stringify(data.data));
      for (const pn of data.data ?? []) {
        phoneNumbers.push({
          id: pn.id,
          displayPhoneNumber: pn.display_phone_number ?? pn.id,
          verifiedName: pn.verified_name ?? "",
          wabaId,
        });
      }
    };

    /** Intenta obtener WABAs de una lista de negocios y busca números en cada uno. */
    const fetchWabasFromBusinesses = async (bizIds: string[]) => {
      for (const bizId of bizIds) {
        const wabaUrl = `https://graph.facebook.com/v19.0/${bizId}/owned_whatsapp_business_accounts?fields=id,name`;
        console.log(`[discover] GET owned_waba para negocio ${bizId}:`, wabaUrl);
        const wabaRes = await fetch(wabaUrl, {
          headers: { Authorization: `Bearer ${metaToken}` },
        }).catch(() => null);
        if (!wabaRes?.ok) {
          const e = await wabaRes?.json().catch(() => null);
          console.log(`[discover] owned_waba HTTP ${wabaRes?.status} negocio ${bizId}:`, e);
          continue;
        }
        const wabaData = (await wabaRes.json()) as { data?: { id: string; name?: string }[] };
        console.log(`[discover] WABAs para negocio ${bizId}:`, JSON.stringify(wabaData.data));
        await Promise.all((wabaData.data ?? []).map((w) => fetchPhoneNumbers(w.id)));
      }
    };

    if (manualWabaId) {
      // ── Ruta 0: WABA ID ingresado manualmente por el usuario ───────────
      // Cuando el auto-discovery no puede traversar la jerarquía de businesses
      // (System Users con configuración específica), el usuario provee el WABA ID
      // directamente desde Meta Business Suite.
      console.log("[discover] Ruta 0: WABA ID manual:", manualWabaId);
      await fetchPhoneNumbers(manualWabaId);

    } else if (granularWabaIds.length > 0) {
      // ── Ruta A: WABA IDs desde granular_scopes ─────────────────────────
      // Disponible cuando debug_token se llama con App Access Token.
      // En auto-inspección Meta no suele retornar target_ids, pero si los hay los usamos.
      console.log("[discover] Ruta A: usando WABA IDs de granular_scopes");
      await Promise.all(granularWabaIds.map(fetchPhoneNumbers));

    } else {
      // ── Ruta B: /me/businesses → owned_waba → phone_numbers ────────────
      // Funciona para User Tokens con acceso a negocios.
      console.log("[discover] Ruta B: GET /me/businesses");
      const bizRes = await fetch(
        "https://graph.facebook.com/v19.0/me/businesses?fields=id,name",
        { headers: { Authorization: `Bearer ${metaToken}` } },
      ).catch(() => null);

      const bizData = bizRes?.ok
        ? ((await bizRes.json()) as { data?: { id: string; name?: string }[] })
        : null;
      console.log(`[discover] /me/businesses HTTP ${bizRes?.status}:`, JSON.stringify(bizData?.data));

      const bizIds = bizData?.data?.map((b) => b.id) ?? [];
      if (bizIds.length > 0) {
        await fetchWabasFromBusinesses(bizIds);
      }

      // ── Ruta C: /{userId}/businesses (System Users) ────────────────────
      // System Users no aparecen en /me/businesses pero sí en /{userId}/businesses.
      if (phoneNumbers.length === 0 && userId) {
        console.log(`[discover] Ruta C: GET /${userId}/businesses`);
        const userBizRes = await fetch(
          `https://graph.facebook.com/v19.0/${userId}/businesses?fields=id,name`,
          { headers: { Authorization: `Bearer ${metaToken}` } },
        ).catch(() => null);
        const userBizData = userBizRes?.ok
          ? ((await userBizRes.json()) as { data?: { id: string; name?: string }[] })
          : null;
        console.log(`[discover] /${userId}/businesses HTTP ${userBizRes?.status}:`, JSON.stringify(userBizData?.data));
        const userBizIds = userBizData?.data?.map((b) => b.id) ?? [];
        if (userBizIds.length > 0) await fetchWabasFromBusinesses(userBizIds);
      }

      // ── Ruta D: /{userId}/assigned_whatsapp_business_accounts ─────────
      // System Users con WABAs asignados directamente (sin pasar por businesses).
      // Esta es la ruta principal para System Users de producción.
      if (phoneNumbers.length === 0 && userId) {
        console.log(`[discover] Ruta D: GET /${userId}/assigned_whatsapp_business_accounts`);
        const assignedRes = await fetch(
          `https://graph.facebook.com/v19.0/${userId}/assigned_whatsapp_business_accounts?fields=id,name`,
          { headers: { Authorization: `Bearer ${metaToken}` } },
        ).catch(() => null);
        const assignedData = assignedRes?.ok
          ? ((await assignedRes.json()) as { data?: { id: string; name?: string }[] })
          : null;
        console.log(`[discover] /${userId}/assigned_whatsapp_business_accounts HTTP ${assignedRes?.status}:`, JSON.stringify(assignedData?.data));
        await Promise.all((assignedData?.data ?? []).map((w) => fetchPhoneNumbers(w.id)));
      }

      // ── Ruta E: /me/whatsapp_business_accounts ─────────────────────────
      // Fallback: algunos tokens tienen acceso directo via /me.
      if (phoneNumbers.length === 0) {
        console.log("[discover] Ruta E: GET /me/whatsapp_business_accounts");
        const directRes = await fetch(
          "https://graph.facebook.com/v19.0/me/whatsapp_business_accounts?fields=id,name",
          { headers: { Authorization: `Bearer ${metaToken}` } },
        ).catch(() => null);
        const directData = directRes?.ok
          ? ((await directRes.json()) as { data?: { id: string }[] })
          : null;
        console.log(`[discover] /me/whatsapp_business_accounts HTTP ${directRes?.status}:`, JSON.stringify(directData?.data));
        await Promise.all((directData?.data ?? []).map((w) => fetchPhoneNumbers(w.id)));
      }

      // ── Ruta F: query anidada /me?fields=businesses{waba{phone_numbers}} ─
      // Último recurso: query GraphQL anidada que traversa todo en una sola llamada.
      if (phoneNumbers.length === 0) {
        console.log("[discover] Ruta F: query anidada /me?fields=businesses{...}");
        const nestedUrl =
          "https://graph.facebook.com/v19.0/me?fields=businesses{id,name,owned_whatsapp_business_accounts{id,name}}";
        const nestedRes = await fetch(nestedUrl, {
          headers: { Authorization: `Bearer ${metaToken}` },
        }).catch(() => null);
        const nestedData = nestedRes?.ok ? ((await nestedRes.json()) as {
          businesses?: {
            data?: {
              id: string;
              owned_whatsapp_business_accounts?: { data?: { id: string }[] };
            }[];
          };
        }) : null;
        console.log(`[discover] Ruta F - query anidada HTTP ${nestedRes?.status}:`, JSON.stringify(nestedData));
        for (const biz of nestedData?.businesses?.data ?? []) {
          await Promise.all(
            (biz.owned_whatsapp_business_accounts?.data ?? []).map((w) =>
              fetchPhoneNumbers(w.id),
            ),
          );
        }
      }
    }

    console.log("[discover] Resultado final — phoneNumbers:", phoneNumbers.length, "| tokenType:", tokenType);
    return c.json({ phoneNumbers, tokenType, expiresAt, missingPermissions }, 200);
  },
);

dashboardApi.openapi(
  createRoute({
    method: "get",
    path: "/instances/webhook-config",
    request: { headers: AuthHeaderSchema },
    responses: {
      200: {
        description: "Webhook config",
        content: { "application/json": { schema: WebhookConfigSchema } },
      },
    },
  }),
  async (c) => {
    const org = orgId(c);
    const origin = getPublicOrigin(c);

    let verifyToken = "";

    // Prefer the org-specific token stored in DB
    if (supabase) {
      const { data } = await supabase
        .from("organizations")
        .select("verify_token")
        .eq("id", org)
        .maybeSingle();
      if (data?.verify_token) verifyToken = data.verify_token;
    }

    return c.json(
      {
        webhookUrl: `${origin}/webhook`,
        verifyToken,
      },
      200,
    );
  },
);

dashboardApi.openapi(
  createRoute({
    method: "get",
    path: "/instances/{id}/health",
    request: {
      headers: AuthHeaderSchema,
      params: z.object({ id: z.string() }),
    },
    responses: {
      200: {
        description: "Instance health",
        content: { "application/json": { schema: InstanceHealthSchema } },
      },
      404: {
        description: "Not found",
        content: { "application/json": { schema: ErrorSchema } },
      },
      500: {
        description: "Error",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  }),
  async (c) => {
    if (!supabase) return c.json({ error: "Supabase no configurado" }, 500);
    const { id } = c.req.valid("param");
    const { data: instance, error } = await supabase
      .from("whatsapp_instances")
      .select("id, phone_number_id, meta_token")
      .eq("id", id)
      .eq("organization_id", orgId(c))
      .maybeSingle<{
        id: string;
        phone_number_id: string;
        meta_token: string | null;
      }>();
    if (error) return c.json({ error: error.message }, 500);
    if (!instance) return c.json({ error: "Instancia no encontrada" }, 404);
    const token = await safeDecrypt(instance.meta_token);
    if (!token) {
      return c.json(
        {
          ok: false,
          status: "error" as const,
          reason: "unknown" as const,
          detail: "No hay token configurado",
          meta: null,
        },
        200,
      );
    }
    try {
      const res = await fetch(
        `https://graph.facebook.com/v19.0/${instance.phone_number_id}?fields=display_phone_number,verified_name`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (!res.ok) {
        const raw = await res.text();
        let detail = "No se pudo validar el token con Meta.";
        let reason:
          | "token_expired"
          | "token_invalid"
          | "insufficient_permissions"
          | "phone_number_not_found"
          | "app_not_subscribed"
          | "rate_limited"
          | "unknown" = "unknown";
        let errorCode: number | undefined;
        let errorSubcode: number | undefined;
        try {
          const parsed = JSON.parse(raw) as {
            error?: { message?: string; code?: number; error_subcode?: number };
          };
          const code = parsed.error?.code;
          const subcode = parsed.error?.error_subcode;
          const message = parsed.error?.message?.toLowerCase() ?? "";
          errorCode = code;
          errorSubcode = subcode;
          if (code === 190 && subcode === 463) {
            reason = "token_expired";
            detail =
              "El token de acceso expiró. Genera uno nuevo y actualízalo.";
          } else if (code === 190) {
            reason = "token_invalid";
            detail =
              "Token inválido o revocado. Verifica el access token en Meta.";
          } else if (code === 10 || code === 200) {
            reason = "insufficient_permissions";
            detail =
              "El token no tiene permisos suficientes para WhatsApp Cloud API.";
          } else if (
            code === 4 ||
            code === 17 ||
            code === 613 ||
            message.includes("rate limit")
          ) {
            reason = "rate_limited";
            detail =
              "Meta está limitando peticiones temporalmente. Intenta de nuevo en unos minutos.";
          } else if (
            message.includes("unsupported get request") ||
            message.includes("nonexisting field")
          ) {
            reason = "phone_number_not_found";
            detail =
              "El Phone Number ID no existe o no pertenece a este token.";
          } else if (
            message.includes("application does not have the capability")
          ) {
            reason = "app_not_subscribed";
            detail =
              "La app no tiene habilitada la capacidad de WhatsApp o no está suscrita al producto.";
          } else if (parsed.error?.message) {
            detail = parsed.error.message;
          }
        } catch (err) {
          log.warn({ err }, "dashboard: error parseando respuesta de error de Meta");
          detail = "Meta devolvió un error al validar el token.";
        }
        return c.json(
          {
            ok: false,
            status: "invalid_token" as const,
            reason,
            errorCode,
            errorSubcode,
            detail,
            meta: null,
          },
          200,
        );
      }
      const meta = (await res.json()) as {
        id?: string;
        display_phone_number?: string;
        verified_name?: string;
      };
      return c.json(
        {
          ok: true,
          status: "connected" as const,
          reason: "ok" as const,
          detail: "Conectado y funcional",
          meta: {
            phone_number_id: meta.id ?? instance.phone_number_id,
            display_phone_number: meta.display_phone_number ?? null,
            verified_name: meta.verified_name ?? null,
          },
        },
        200,
      );
    } catch (e) {
      return c.json(
        {
          ok: false,
          status: "error" as const,
          reason: "unknown" as const,
          detail: (e as Error).message,
          meta: null,
        },
        200,
      );
    }
  },
);

dashboardApi.openapi(
  createRoute({
    method: "get",
    path: "/instances",
    request: { headers: AuthHeaderSchema },
    responses: {
      200: {
        description: "WhatsApp instances",
        content: { "application/json": { schema: z.array(InstanceSchema) } },
      },
      500: {
        description: "Error",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  }),
  async (c) => {
    if (!supabase) return c.json([], 200);
    const session = getSession(c);
    const { data, error } = await supabase
      .from("whatsapp_instances")
      .select(
        "id, organization_id, provider, label, waba_id, meta_app_id, phone_number_id, display_phone_number, meta_token, app_secret, flow_id, is_active, currency, updated_at",
      )
      .eq("organization_id", orgId(c))
      .order("created_at", { ascending: false });
    if (error) return c.json({ error: error.message }, 500);
    const masked = (data ?? []).map((inst: Record<string, unknown>) => ({
      ...inst,
      meta_token: inst.meta_token ? "configured" : null,
      app_secret: inst.app_secret ? "configured" : null,
    })) as unknown as z.infer<typeof InstanceSchema>[];
    return c.json(masked, 200);
  },
);

dashboardApi.openapi(
  createRoute({
    method: "post",
    path: "/instances",
    request: {
      headers: AuthHeaderSchema,
      body: {
        required: true,
        content: {
          "application/json": {
            schema: z.object({
              label: z.string().min(2),
              phoneNumberId: z.string().min(3),
              metaToken: z.string().optional(),
              appSecret: z.string().optional(),
              wabaId: z.string().optional(),
              metaAppId: z.string().optional(),
              displayPhoneNumber: z.string().optional(),
              isActive: z.boolean().default(true),
              currency: z.string().default("COP"),
              flowId: z.string().optional(),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Instance created with Meta auto-configuration results",
        content: {
          "application/json": {
            schema: z.object({ instance: InstanceSchema, autoConfig: AutoConfigResultSchema }),
          },
        },
      },
      500: {
        description: "Error",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  }),
  async (c) => {
    if (!supabase) return c.json({ error: "Supabase no configurado" }, 500);
    const session = getSession(c);
    const body = c.req.valid("json");
    const org = orgId(c);

    const { data, error } = await supabase
      .from("whatsapp_instances")
      .insert({
        organization_id: org,
        provider: "meta",
        label: body.label,
        phone_number_id: body.phoneNumberId,
        meta_token: body.metaToken ? await encrypt(body.metaToken) : null,
        app_secret: body.appSecret ? await encrypt(body.appSecret) : null,
        waba_id: body.wabaId ?? null,
        meta_app_id: body.metaAppId ?? null,
        display_phone_number: body.displayPhoneNumber ?? null,
        is_active: body.isActive,
        currency: body.currency ?? "COP",
      })
      .select(
        "id, organization_id, provider, label, waba_id, meta_app_id, phone_number_id, display_phone_number, meta_token, app_secret, flow_id, is_active, currency, updated_at",
      )
      .single();

    if (error) return c.json({ error: error.message }, 500);

    const maskedInstance = {
      ...data!,
      meta_token: data!.meta_token ? "configured" : null,
      app_secret: data!.app_secret ? "configured" : null,
    } as unknown as z.infer<typeof InstanceSchema>;

    // ── Auto-configuración de Meta ────────────────────────────────────────
    const autoConfig: z.infer<typeof AutoConfigResultSchema> = {
      wabaSubscribed: false,
      webhookConfigured: false,
      messagesSubscribed: false,
      errors: [],
    };

    const metaToken = body.metaToken;
    const appSecret = body.appSecret;
    const wabaId = body.wabaId;

    if (metaToken) {
      // Obtener verify token de la org
      let verifyToken = "";
      const { data: orgData } = await supabase
        .from("organizations")
        .select("verify_token")
        .eq("id", org)
        .maybeSingle();
      if (orgData?.verify_token) verifyToken = orgData.verify_token;

      const origin = getPublicOrigin(c);
      const webhookUrl = `${origin}/webhook`;

      // 1. Suscribir WABA al app
      if (wabaId) {
        const wabaRes = await fetch(
          `https://graph.facebook.com/v19.0/${wabaId}/subscribed_apps`,
          { method: "POST", headers: { Authorization: `Bearer ${metaToken}` } },
        ).catch(() => null);
        if (wabaRes?.ok) {
          autoConfig.wabaSubscribed = true;
        } else {
          const errBody = await wabaRes?.json().catch(() => null) as { error?: { message?: string } } | null;
          autoConfig.errors.push(`WABA subscription: ${errBody?.error?.message ?? "Error desconocido"}`);
        }
      }

      // 2. Configurar webhook via App Access Token (requiere appSecret)
      if (appSecret && verifyToken) {
        // Obtener app_id desde debug_token
        const debugRes = await fetch(
          `https://graph.facebook.com/v19.0/debug_token?input_token=${encodeURIComponent(metaToken)}&access_token=${encodeURIComponent(metaToken)}`,
        ).catch(() => null);
        const debugData = debugRes?.ok
          ? (await debugRes.json() as { data?: { app_id?: string } })
          : null;
        const appId = debugData?.data?.app_id;

        if (appId) {
          const appToken = `${appId}|${appSecret}`;

          // POST /{app_id}/subscriptions — registra webhook URL + campo messages
          const subUrl = new URL(`https://graph.facebook.com/v19.0/${appId}/subscriptions`);
          subUrl.searchParams.set("object", "whatsapp_business_account");
          subUrl.searchParams.set("callback_url", webhookUrl);
          subUrl.searchParams.set("verify_token", verifyToken);
          subUrl.searchParams.set("fields", "messages");
          subUrl.searchParams.set("access_token", appToken);

          const subRes = await fetch(subUrl.toString(), { method: "POST" }).catch(() => null);
          if (subRes?.ok) {
            const subData = await subRes.json() as { success?: boolean };
            if (subData.success) {
              autoConfig.webhookConfigured = true;
              autoConfig.messagesSubscribed = true;
            } else {
              autoConfig.errors.push("Webhook no pudo verificarse con Meta.");
            }
          } else {
            const errBody = await subRes?.json().catch(() => null) as { error?: { message?: string } } | null;
            autoConfig.errors.push(`Webhook config: ${errBody?.error?.message ?? "Error desconocido"}`);
          }
        }
      }
    }

    // Asignar flow si se proveyó
    if (body.flowId && data) {
      await supabase
        .from("whatsapp_instances")
        .update({ flow_id: body.flowId })
        .eq("id", data.id)
        .eq("organization_id", org);
    }

    return c.json({ instance: maskedInstance, autoConfig }, 200);
  },
);

dashboardApi.openapi(
  createRoute({
    method: "put",
    path: "/instances/{id}",
    request: {
      headers: AuthHeaderSchema,
      params: z.object({ id: z.string() }),
      body: {
        required: true,
        content: {
          "application/json": {
            schema: z.object({
              label: z.string().optional(),
              metaToken: z.string().nullable().optional(),
              appSecret: z.string().nullable().optional(),
              wabaId: z.string().nullable().optional(),
              metaAppId: z.string().nullable().optional(),
              displayPhoneNumber: z.string().nullable().optional(),
              isActive: z.boolean().optional(),
              currency: z.string().nullable().optional(),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Instance updated",
        content: { "application/json": { schema: InstanceSchema } },
      },
      500: {
        description: "Error",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  }),
  async (c) => {
    if (!supabase) return c.json({ error: "Supabase no configurado" }, 500);
    const session = getSession(c);
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const patch = {
      ...(body.label !== undefined ? { label: body.label } : {}),
      ...(body.metaToken !== undefined
        ? { meta_token: body.metaToken ? await encrypt(body.metaToken) : null }
        : {}),
      ...(body.appSecret !== undefined
        ? { app_secret: body.appSecret ? await encrypt(body.appSecret) : null }
        : {}),
      ...(body.wabaId !== undefined ? { waba_id: body.wabaId } : {}),
      ...(body.metaAppId !== undefined ? { meta_app_id: body.metaAppId } : {}),
      ...(body.displayPhoneNumber !== undefined
        ? { display_phone_number: body.displayPhoneNumber }
        : {}),
      ...(body.isActive !== undefined ? { is_active: body.isActive } : {}),
      ...(body.currency !== undefined ? { currency: body.currency } : {}),
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from("whatsapp_instances")
      .update(patch)
      .eq("id", id)
      .eq("organization_id", orgId(c))
      .select(
        "id, organization_id, provider, label, waba_id, meta_app_id, phone_number_id, display_phone_number, meta_token, app_secret, flow_id, is_active, currency, updated_at",
      )
      .single();
    if (error) return c.json({ error: error.message }, 500);
    if (data?.phone_number_id) await invalidateInstanceCache(data.phone_number_id);
    const maskedUpdate = (data
      ? {
          ...data,
          meta_token: data.meta_token ? "configured" : null,
          app_secret: data.app_secret ? "configured" : null,
        }
      : data) as unknown as z.infer<typeof InstanceSchema>;
    return c.json(maskedUpdate, 200);
  },
);

// ── GET /instances/{id}/meta-status ──────────────────────────────────────

dashboardApi.openapi(
  createRoute({
    method: "get",
    path: "/instances/{id}/meta-status",
    request: {
      headers: AuthHeaderSchema,
      params: z.object({ id: z.string() }),
    },
    responses: {
      200: {
        description: "Meta status for this instance",
        content: { "application/json": { schema: MetaStatusSchema } },
      },
      500: {
        description: "Error",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  }),
  async (c) => {
    if (!supabase) return c.json({ error: "Supabase no configurado" }, 500);
    const { id } = c.req.valid("param");
    const org = orgId(c);
    const origin = getPublicOrigin(c);

    const { data: instance, error: fetchError } = await supabase
      .from("whatsapp_instances")
      .select("id, waba_id, meta_token, app_secret")
      .eq("id", id)
      .eq("organization_id", org)
      .maybeSingle();

    if (fetchError || !instance) return c.json({ error: "Instancia no encontrada" }, 500);

    const REQUIRED_PERMS = [
      "whatsapp_business_messaging",
      "whatsapp_business_management",
      "ads_read",
    ];

    const result: z.infer<typeof MetaStatusSchema> = {
      tokenType: "unknown",
      expiresAt: 0,
      permissions: REQUIRED_PERMS.map((name) => ({ name, granted: false })),
      wabaSubscribed: null,
      webhookConfigured: null,
      messagesSubscribed: null,
      webhookUrl: null,
    };

    const rawToken = instance.meta_token ? await safeDecrypt(instance.meta_token) : null;
    if (!rawToken) return c.json(result, 200);

    // 1. debug_token — tipo, expiración, permisos
    const debugRes = await fetch(
      `https://graph.facebook.com/v19.0/debug_token?input_token=${encodeURIComponent(rawToken)}&access_token=${encodeURIComponent(rawToken)}`,
    ).catch(() => null);

    let appId: string | undefined;
    if (debugRes?.ok) {
      const body = await debugRes.json() as {
        data?: {
          type?: string;
          expires_at?: number;
          scopes?: string[];
          app_id?: string;
        };
      };
      const d = body.data;
      if (d) {
        if (d.type === "SYSTEM_USER") result.tokenType = "system_user";
        else if (d.type === "USER") result.tokenType = "user";
        result.expiresAt = d.expires_at ?? 0;
        appId = d.app_id;
        const scopes = d.scopes ?? [];
        result.permissions = REQUIRED_PERMS.map((name) => ({
          name,
          granted: scopes.includes(name),
        }));
      }
    }

    // 2. WABA subscription
    if (instance.waba_id) {
      const wabaRes = await fetch(
        `https://graph.facebook.com/v19.0/${instance.waba_id}/subscribed_apps`,
        { headers: { Authorization: `Bearer ${rawToken}` } },
      ).catch(() => null);
      if (wabaRes?.ok) {
        const wabaData = await wabaRes.json() as { data?: { id: string }[] };
        result.wabaSubscribed = (wabaData.data ?? []).some((a) => a.id === appId);
      } else {
        result.wabaSubscribed = false;
      }
    }

    // 3. Webhook configuration (requires appSecret)
    const rawSecret = instance.app_secret ? await safeDecrypt(instance.app_secret) : null;
    if (rawSecret && appId) {
      const appToken = `${appId}|${rawSecret}`;
      const subRes = await fetch(
        `https://graph.facebook.com/v19.0/${appId}/subscriptions?access_token=${encodeURIComponent(appToken)}`,
      ).catch(() => null);
      if (subRes?.ok) {
        const subData = await subRes.json() as {
          data?: { object: string; callback_url?: string; fields?: { name: string }[] }[];
        };
        const wabaObj = (subData.data ?? []).find((s) => s.object === "whatsapp_business_account");
        const webhookUrl = `${origin}/webhook`;
        result.webhookUrl = wabaObj?.callback_url ?? null;
        result.webhookConfigured = wabaObj?.callback_url === webhookUrl;
        result.messagesSubscribed = (wabaObj?.fields ?? []).some((f) => f.name === "messages");
      }
    }

    return c.json(result, 200);
  },
);

// ── POST /instances/{id}/reconfigure-meta ────────────────────────────────
// Re-ejecuta la auto-configuración de Meta para una instancia existente.
// Usa el token y app_secret almacenados. Devuelve un resultado detallado
// indicando qué se pudo configurar, qué se saltó y por qué.

const ReconfigureResultSchema = z.object({
  tokenValid: z.boolean(),
  missingPermissions: z.array(z.string()),
  wabaSubscribed: z.boolean().nullable(),   // null = saltado (sin wabaId)
  webhookConfigured: z.boolean().nullable(), // null = saltado (sin appSecret)
  messagesSubscribed: z.boolean().nullable(),
  skipped: z.array(z.string()),  // razones por las que se saltaron pasos
  errors: z.array(z.string()),
});

dashboardApi.openapi(
  createRoute({
    method: "post",
    path: "/instances/{id}/reconfigure-meta",
    request: {
      headers: AuthHeaderSchema,
      params: z.object({ id: z.string() }),
    },
    responses: {
      200: {
        description: "Resultado de la re-configuración",
        content: { "application/json": { schema: ReconfigureResultSchema } },
      },
      500: {
        description: "Error",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  }),
  async (c) => {
    if (!supabase) return c.json({ error: "Supabase no configurado" }, 500);
    const { id } = c.req.valid("param");
    const org = orgId(c);
    const origin = getPublicOrigin(c);

    const REQUIRED_PERMS = [
      "whatsapp_business_messaging",
      "whatsapp_business_management",
      "ads_read",
    ];

    const result: z.infer<typeof ReconfigureResultSchema> = {
      tokenValid: false,
      missingPermissions: [],
      wabaSubscribed: null,
      webhookConfigured: null,
      messagesSubscribed: null,
      skipped: [],
      errors: [],
    };

    // Obtener instancia
    const { data: instance, error: fetchError } = await supabase
      .from("whatsapp_instances")
      .select("id, waba_id, meta_token, app_secret")
      .eq("id", id)
      .eq("organization_id", org)
      .maybeSingle();

    if (fetchError || !instance) return c.json({ error: "Instancia no encontrada" }, 500);

    // Verificar que hay token
    const rawToken = instance.meta_token ? await safeDecrypt(instance.meta_token) : null;
    if (!rawToken) {
      result.skipped.push("No hay token configurado en esta instancia. Editala y agregá un token de acceso de Meta.");
      return c.json(result, 200);
    }

    // Validar token y obtener app_id + permisos
    const debugRes = await fetch(
      `https://graph.facebook.com/v19.0/debug_token?input_token=${encodeURIComponent(rawToken)}&access_token=${encodeURIComponent(rawToken)}`,
    ).catch(() => null);

    if (!debugRes?.ok) {
      result.errors.push("No se pudo conectar con la API de Meta para validar el token.");
      return c.json(result, 200);
    }

    const debugData = (await debugRes.json()) as {
      data?: {
        is_valid?: boolean;
        app_id?: string;
        scopes?: string[];
        error?: { message?: string };
      };
      error?: { message?: string };
    };

    if (debugData.error || debugData.data?.is_valid === false) {
      result.errors.push(
        debugData.error?.message ??
        debugData.data?.error?.message ??
        "El token no es válido o venció. Generá uno nuevo en Meta.",
      );
      return c.json(result, 200);
    }

    result.tokenValid = true;
    const appId = debugData.data?.app_id;
    const scopes = debugData.data?.scopes ?? [];
    result.missingPermissions = REQUIRED_PERMS.filter((p) => !scopes.includes(p));

    if (result.missingPermissions.length > 0) {
      result.errors.push(
        `Al token le faltan permisos: ${result.missingPermissions.join(", ")}. Regeneralo en Meta con todos los permisos.`,
      );
      // No retornamos — intentamos lo que se pueda con los permisos que hay
    }

    // Obtener verify token de la org
    let verifyToken = "";
    const { data: orgData } = await supabase
      .from("organizations")
      .select("verify_token")
      .eq("id", org)
      .maybeSingle();
    if (orgData?.verify_token) verifyToken = orgData.verify_token;

    // ── Paso 1: Suscribir WABA ────────────────────────────────────────────
    if (!instance.waba_id) {
      result.skipped.push("Suscripción WABA saltada: la instancia no tiene WABA ID configurado.");
    } else {
      const wabaRes = await fetch(
        `https://graph.facebook.com/v19.0/${instance.waba_id}/subscribed_apps`,
        { method: "POST", headers: { Authorization: `Bearer ${rawToken}` } },
      ).catch(() => null);

      if (wabaRes?.ok) {
        result.wabaSubscribed = true;
      } else {
        const errBody = await wabaRes?.json().catch(() => null) as { error?: { message?: string } } | null;
        result.wabaSubscribed = false;
        result.errors.push(`WABA subscription: ${errBody?.error?.message ?? "Error al suscribir la cuenta de WhatsApp Business."}`);
      }
    }

    // ── Paso 2: Configurar webhook ────────────────────────────────────────
    const rawSecret = instance.app_secret ? await safeDecrypt(instance.app_secret) : null;

    if (!rawSecret) {
      result.skipped.push("Webhook saltado: la instancia no tiene App Secret configurado. Editala y agregá el App Secret para configurar el webhook automáticamente.");
    } else if (!appId) {
      result.skipped.push("Webhook saltado: no se pudo obtener el App ID desde el token.");
    } else if (!verifyToken) {
      result.skipped.push("Webhook saltado: la organización no tiene un Verify Token configurado.");
    } else {
      const appToken = `${appId}|${rawSecret}`;
      const webhookUrl = `${origin}/webhook`;

      const subUrl = new URL(`https://graph.facebook.com/v19.0/${appId}/subscriptions`);
      subUrl.searchParams.set("object", "whatsapp_business_account");
      subUrl.searchParams.set("callback_url", webhookUrl);
      subUrl.searchParams.set("verify_token", verifyToken);
      subUrl.searchParams.set("fields", "messages");
      subUrl.searchParams.set("access_token", appToken);

      const subRes = await fetch(subUrl.toString(), { method: "POST" }).catch(() => null);

      if (subRes?.ok) {
        const subData = await subRes.json() as { success?: boolean };
        if (subData.success) {
          result.webhookConfigured = true;
          result.messagesSubscribed = true;
        } else {
          result.webhookConfigured = false;
          result.messagesSubscribed = false;
          result.errors.push("Meta no pudo verificar el webhook. Asegurate de que la URL sea accesible públicamente.");
        }
      } else {
        const errBody = await subRes?.json().catch(() => null) as { error?: { message?: string } } | null;
        result.webhookConfigured = false;
        result.messagesSubscribed = false;
        result.errors.push(`Webhook config: ${errBody?.error?.message ?? "Error al configurar el webhook."}`);
      }
    }

    return c.json(result, 200);
  },
);

// ── DELETE /instances/{id} ────────────────────────────────────────────────
// Elimina una instancia. Rechaza si tiene un flow activo asignado para evitar
// dejar conversaciones huérfanas.

dashboardApi.openapi(
  createRoute({
    method: "delete",
    path: "/instances/{id}",
    request: {
      headers: AuthHeaderSchema,
      params: z.object({ id: z.string() }),
    },
    responses: {
      200: {
        description: "Instance deleted",
        content: { "application/json": { schema: z.object({ ok: z.boolean() }) } },
      },
      409: {
        description: "La instancia tiene un flow activo asignado",
        content: { "application/json": { schema: ErrorSchema } },
      },
      500: {
        description: "Error",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  }),
  async (c) => {
    if (!supabase) return c.json({ error: "Supabase no configurado" }, 500);
    const { id } = c.req.valid("param");
    const org = orgId(c);

    // Verificar que pertenece a la org y obtener flow_id
    const { data: instance, error: fetchError } = await supabase
      .from("whatsapp_instances")
      .select("id, flow_id")
      .eq("id", id)
      .eq("organization_id", org)
      .maybeSingle();

    if (fetchError) return c.json({ error: fetchError.message }, 500);
    if (!instance) return c.json({ error: "Instancia no encontrada" }, 500);

    // Bloquear si tiene un flow asignado
    if (instance.flow_id) {
      return c.json(
        { error: "Esta instancia tiene un flow activo asignado. Desasignalo antes de eliminarla." },
        409,
      );
    }

    const { error: deleteError } = await supabase
      .from("whatsapp_instances")
      .delete()
      .eq("id", id)
      .eq("organization_id", org);

    if (deleteError) return c.json({ error: deleteError.message }, 500);
    return c.json({ ok: true }, 200);
  },
);

dashboardApi.openapi(
  createRoute({
    method: "get",
    path: "/products",
    request: { headers: AuthHeaderSchema },
    responses: {
      200: {
        description: "Products",
        content: { "application/json": { schema: z.array(ProductSchema) } },
      },
      500: {
        description: "Error",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  }),
  async (c) => {
    if (!supabase) return c.json([], 200);
    const session = getSession(c);
    const { data, error } = await supabase
      .from("products")
      .select(
        "id, organization_id, name, slug, is_active, system_prompt, dispatch_keywords, config, updated_at",
      )
      .eq("organization_id", orgId(c))
      .order("updated_at", { ascending: false });
    if (error) return c.json({ error: error.message }, 500);
    return c.json(data ?? [], 200);
  },
);

dashboardApi.openapi(
  createRoute({
    method: "post",
    path: "/products",
    request: {
      headers: AuthHeaderSchema,
      body: {
        required: true,
        content: {
          "application/json": {
            schema: z.object({
              name: z.string().min(2),
              slug: z.string().min(2),
              systemPrompt: z.string().default(""),
              dispatchKeywords: z.string().default(""),
              isActive: z.boolean().default(true),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Product created",
        content: { "application/json": { schema: ProductSchema } },
      },
      500: {
        description: "Error",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  }),
  async (c) => {
    if (!supabase) return c.json({ error: "Supabase no configurado" }, 500);
    const session = getSession(c);
    const body = c.req.valid("json");
    const { data, error } = await supabase
      .from("products")
      .insert({
        organization_id: orgId(c),
        name: body.name,
        slug: body.slug,
        is_active: body.isActive,
        system_prompt: body.systemPrompt,
        dispatch_keywords: body.dispatchKeywords,
      })
      .select(
        "id, organization_id, name, slug, is_active, system_prompt, dispatch_keywords, config, updated_at",
      )
      .single();
    if (error) return c.json({ error: error.message }, 500);
    // Auto-create linked campaign so the bot works without extra steps (P1 fix)
    await supabase.from("campaigns").upsert(
      {
        organization_id: orgId(c),
        product_id: data.id,
        name: `${body.name}`,
        status: body.isActive ? "active" : "draft",
        channel: "whatsapp",
        system_prompt: body.systemPrompt ?? "",
        dispatch_keywords: body.dispatchKeywords ?? "",
      },
      { onConflict: "organization_id,product_id" },
    );
    return c.json(data, 200);
  },
);

dashboardApi.openapi(
  createRoute({
    method: "put",
    path: "/products/{id}",
    request: {
      headers: AuthHeaderSchema,
      params: z.object({ id: z.string() }),
      body: {
        required: true,
        content: {
          "application/json": {
            schema: z.object({
              name: z.string().optional(),
              slug: z.string().optional(),
              systemPrompt: z.string().optional(),
              dispatchKeywords: z.string().optional(),
              isActive: z.boolean().optional(),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Product updated",
        content: { "application/json": { schema: ProductSchema } },
      },
      500: {
        description: "Error",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  }),
  async (c) => {
    if (!supabase) return c.json({ error: "Supabase no configurado" }, 500);
    const session = getSession(c);
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const patch = {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.slug !== undefined ? { slug: body.slug } : {}),
      ...(body.systemPrompt !== undefined
        ? { system_prompt: body.systemPrompt }
        : {}),
      ...(body.dispatchKeywords !== undefined
        ? { dispatch_keywords: body.dispatchKeywords }
        : {}),
      ...(body.isActive !== undefined ? { is_active: body.isActive } : {}),
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from("products")
      .update(patch)
      .eq("id", id)
      .eq("organization_id", orgId(c))
      .select(
        "id, organization_id, name, slug, is_active, system_prompt, dispatch_keywords, config, updated_at",
      )
      .single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json(data, 200);
  },
);

dashboardApi.openapi(
  createRoute({
    method: "get",
    path: "/product-referrals",
    request: { headers: AuthHeaderSchema },
    responses: {
      200: {
        description: "CTWA mapping",
        content: {
          "application/json": { schema: z.array(ProductReferralSchema) },
        },
      },
      500: {
        description: "Error",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  }),
  async (c) => {
    if (!supabase) return c.json([], 200);
    const session = getSession(c);
    const { data, error } = await supabase
      .from("product_referrals")
      .select(
        "id, organization_id, product_id, ctwa_clid, source_id, source_type, source_url, created_at",
      )
      .eq("organization_id", orgId(c))
      .order("created_at", { ascending: false });
    if (error) return c.json({ error: error.message }, 500);
    return c.json(data ?? [], 200);
  },
);

dashboardApi.openapi(
  createRoute({
    method: "post",
    path: "/product-referrals",
    request: {
      headers: AuthHeaderSchema,
      body: {
        required: true,
        content: {
          "application/json": {
            schema: z.object({
              productId: z.string(),
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
        description: "CTWA mapping created",
        content: { "application/json": { schema: ProductReferralSchema } },
      },
      500: {
        description: "Error",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  }),
  async (c) => {
    if (!supabase) return c.json({ error: "Supabase no configurado" }, 500);
    const session = getSession(c);
    const body = c.req.valid("json");
    const { data, error } = await supabase
      .from("product_referrals")
      .upsert(
        {
          organization_id: orgId(c),
          product_id: body.productId,
          ctwa_clid: body.ctwaClid,
          source_id: body.sourceId ?? null,
          source_type: body.sourceType ?? null,
          source_url: body.sourceUrl ?? null,
        },
        { onConflict: "organization_id,ctwa_clid" },
      )
      .select(
        "id, organization_id, product_id, ctwa_clid, source_id, source_type, source_url, created_at",
      )
      .single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json(data, 200);
  },
);

dashboardApi.openapi(
  createRoute({
    method: "get",
    path: "/org/members",
    request: { headers: AuthHeaderSchema },
    responses: {
      200: {
        description: "Organization members",
        content: {
          "application/json": {
            schema: z.array(MembershipSchema.extend({ user_id: z.string() })),
          },
        },
      },
      500: {
        description: "Error",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  }),
  async (c) => {
    if (!supabase) return c.json([], 200);
    const session = getSession(c);
    const { data, error } = await supabase
      .from("organization_members")
      .select("organization_id, role, user_id")
      .eq("organization_id", orgId(c))
      .order("created_at", { ascending: true });
    if (error) return c.json({ error: error.message }, 500);
    return c.json(data ?? [], 200);
  },
);

dashboardApi.openapi(
  createRoute({
    method: "get",
    path: "/org/invites",
    request: { headers: AuthHeaderSchema },
    responses: {
      200: {
        description: "Organization invites",
        content: { "application/json": { schema: z.array(InviteSchema) } },
      },
      500: {
        description: "Error",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  }),
  async (c) => {
    if (!supabase) return c.json([], 200);
    const session = getSession(c);
    const { data, error } = await supabase
      .from("organization_invites")
      .select("id, email, role, status, expires_at, created_at")
      .eq("organization_id", orgId(c))
      .order("created_at", { ascending: false });
    if (error) return c.json({ error: error.message }, 500);
    return c.json(data ?? [], 200);
  },
);

dashboardApi.openapi(
  createRoute({
    method: "post",
    path: "/org/invites",
    request: {
      headers: AuthHeaderSchema,
      body: {
        required: true,
        content: {
          "application/json": {
            schema: z.object({
              email: z.string().email(),
              role: z
                .enum(["owner", "admin", "agent", "viewer"])
                .default("agent"),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Invite created",
        content: { "application/json": { schema: InviteSchema } },
      },
      400: {
        description: "Bad request",
        content: { "application/json": { schema: ErrorSchema } },
      },
      500: {
        description: "Error",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  }),
  async (c) => {
    if (!supabase) return c.json({ error: "Supabase no configurado" }, 500);
    const session = getSession(c);
    if (!["owner", "admin"].includes(session.role))
      return c.json({ error: "Permiso insuficiente" }, 400);
    const body = c.req.valid("json");
    const token = crypto.randomUUID();
    const { data, error } = await supabase
      .from("organization_invites")
      .insert({
        organization_id: orgId(c),
        email: body.email.toLowerCase(),
        role: body.role,
        token,
        invited_by:
          session.userId === "dashboard-secret" ? null : session.userId,
      })
      .select("id, email, role, status, expires_at, created_at")
      .single();
    if (error) return c.json({ error: error.message }, 500);

    // Enviar email de invitación (fire-and-forget — no bloquea la respuesta)
    void (async () => {
      const orgRes = await supabase
        .from("organizations")
        .select("name")
        .eq("id", orgId(c))
        .single();
      const orgName = orgRes.data?.name ?? "tu organización";
      const dashboardUrl =
        env.DASHBOARD_PUBLIC_URL || getPublicOrigin(c).replace(/\/api$/, "");
      const { subject, html } = buildInviteEmail({
        orgName,
        role: body.role,
        inviterEmail: session.email,
        dashboardUrl,
      });
      await sendEmail({ to: body.email.toLowerCase(), subject, html });
    })();

    return c.json(data, 200);
  },
);

dashboardApi.openapi(
  createRoute({
    method: "post",
    path: "/org/invites/{id}/resend",
    request: {
      headers: AuthHeaderSchema,
      params: z.object({ id: z.string() }),
    },
    responses: {
      200: {
        description: "Email reenviado",
        content: {
          "application/json": { schema: z.object({ ok: z.boolean() }) },
        },
      },
      400: {
        description: "Bad request",
        content: { "application/json": { schema: ErrorSchema } },
      },
      404: {
        description: "No encontrado",
        content: { "application/json": { schema: ErrorSchema } },
      },
      500: {
        description: "Error",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  }),
  async (c) => {
    if (!supabase) return c.json({ error: "Supabase no configurado" }, 500);
    const session = getSession(c);
    if (!["owner", "admin"].includes(session.role))
      return c.json({ error: "Permiso insuficiente" }, 400);
    const { id } = c.req.valid("param");

    const { data: invite, error } = await supabase
      .from("organization_invites")
      .select("id, email, role, status")
      .eq("id", id)
      .eq("organization_id", orgId(c))
      .single();
    if (error || !invite)
      return c.json({ error: "Invitación no encontrada" }, 404);
    if (invite.status === "accepted")
      return c.json({ error: "La invitación ya fue aceptada" }, 400);

    const orgRes = await supabase
      .from("organizations")
      .select("name")
      .eq("id", orgId(c))
      .single();
    const orgName = orgRes.data?.name ?? "tu organización";
    const dashboardUrl =
      env.DASHBOARD_PUBLIC_URL || getPublicOrigin(c).replace(/\/api$/, "");
    const { subject, html } = buildInviteEmail({
      orgName,
      role: invite.role,
      inviterEmail: session.email,
      dashboardUrl,
    });
    await sendEmail({ to: invite.email, subject, html });

    return c.json({ ok: true }, 200);
  },
);

dashboardApi.openapi(
  createRoute({
    method: "get",
    path: "/campaigns",
    request: { headers: AuthHeaderSchema },
    responses: {
      200: {
        description: "Campaigns",
        content: { "application/json": { schema: z.array(CampaignSchema) } },
      },
      500: {
        description: "Error",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  }),
  async (c) => {
    if (!supabase) return c.json([], 200);
    const session = getSession(c);
    const { data, error } = await supabase
      .from("campaigns")
      .select(
        "id, organization_id, name, status, channel, product_id, product, system_prompt, dispatch_keywords, config, updated_at",
      )
      .eq("organization_id", orgId(c))
      .order("updated_at", { ascending: false });
    if (error) return c.json({ error: error.message }, 500);
    return c.json(data ?? [], 200);
  },
);

dashboardApi.openapi(
  createRoute({
    method: "post",
    path: "/campaigns",
    request: {
      headers: AuthHeaderSchema,
      body: {
        required: true,
        content: {
          "application/json": {
            schema: z.object({
              name: z.string().min(2),
              status: z
                .enum(["draft", "active", "paused", "archived"])
                .default("draft"),
              product: z.string().optional(),
              productId: z.string().optional(),
              systemPrompt: z.string().default(""),
              dispatchKeywords: z.string().default(""),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Campaign created",
        content: { "application/json": { schema: CampaignSchema } },
      },
      500: {
        description: "Error",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  }),
  async (c) => {
    if (!supabase) return c.json({ error: "Supabase no configurado" }, 500);
    const session = getSession(c);
    const body = c.req.valid("json");
    const { data, error } = await supabase
      .from("campaigns")
      .insert({
        organization_id: orgId(c),
        name: body.name,
        status: body.status,
        channel: "whatsapp",
        product: body.product ?? null,
        product_id: body.productId ?? null,
        system_prompt: body.systemPrompt,
        dispatch_keywords: body.dispatchKeywords,
        created_by:
          session.userId === "dashboard-secret" ? null : session.userId,
      })
      .select(
        "id, organization_id, name, status, channel, product_id, product, system_prompt, dispatch_keywords, config, updated_at",
      )
      .single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json(data, 200);
  },
);

dashboardApi.openapi(
  createRoute({
    method: "put",
    path: "/campaigns/{id}",
    request: {
      headers: AuthHeaderSchema,
      params: z.object({ id: z.string() }),
      body: {
        required: true,
        content: {
          "application/json": {
            schema: z.object({
              name: z.string().optional(),
              status: z
                .enum(["draft", "active", "paused", "archived"])
                .optional(),
              product: z.string().nullable().optional(),
              productId: z.string().nullable().optional(),
              systemPrompt: z.string().optional(),
              dispatchKeywords: z.string().optional(),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Campaign updated",
        content: { "application/json": { schema: CampaignSchema } },
      },
      500: {
        description: "Error",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  }),
  async (c) => {
    if (!supabase) return c.json({ error: "Supabase no configurado" }, 500);
    const session = getSession(c);
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const patch = {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.status !== undefined ? { status: body.status } : {}),
      ...(body.product !== undefined ? { product: body.product } : {}),
      ...(body.productId !== undefined ? { product_id: body.productId } : {}),
      ...(body.systemPrompt !== undefined
        ? { system_prompt: body.systemPrompt }
        : {}),
      ...(body.dispatchKeywords !== undefined
        ? { dispatch_keywords: body.dispatchKeywords }
        : {}),
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from("campaigns")
      .update(patch)
      .eq("id", id)
      .eq("organization_id", orgId(c))
      .select(
        "id, organization_id, name, status, channel, product_id, product, system_prompt, dispatch_keywords, config, updated_at",
      )
      .single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json(data, 200);
  },
);

dashboardApi.openapi(
  createRoute({
    method: "get",
    path: "/legacy/flows",
    request: {
      headers: AuthHeaderSchema,
      query: z.object({
        campaignId: z.string().optional(),
        productId: z.string().optional(),
      }),
    },
    responses: {
      200: {
        description: "Flow versions",
        content: { "application/json": { schema: z.array(FlowVersionSchema) } },
      },
      500: {
        description: "Error",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  }),
  async (c) => {
    if (!supabase) return c.json([], 200);
    const session = getSession(c);
    const { campaignId, productId } = c.req.valid("query");
    const targetCampaignId = await resolveCampaignId(orgId(c), {
      campaignId,
      productId,
    });
    if (!targetCampaignId) return c.json([], 200);
    const { data, error } = await supabase
      .from("flow_versions")
      .select(
        "id, campaign_id, version_number, status, notes, published_at, updated_at",
      )
      .eq("organization_id", orgId(c))
      .eq("campaign_id", targetCampaignId)
      .order("version_number", { ascending: false });
    if (error) return c.json({ error: error.message }, 500);
    return c.json(data ?? [], 200);
  },
);

dashboardApi.openapi(
  createRoute({
    method: "post",
    path: "/legacy/flows",
    request: {
      headers: AuthHeaderSchema,
      body: {
        required: true,
        content: {
          "application/json": {
            schema: z.object({
              campaignId: z.string().optional(),
              productId: z.string().optional(),
              notes: z.string().optional(),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Flow version created",
        content: { "application/json": { schema: FlowVersionSchema } },
      },
      500: {
        description: "Error",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  }),
  async (c) => {
    if (!supabase) return c.json({ error: "Supabase no configurado" }, 500);
    const session = getSession(c);
    const body = c.req.valid("json");
    const resolvedCampaignId = await resolveCampaignId(orgId(c), {
      campaignId: body.campaignId,
      productId: body.productId,
    });
    if (!resolvedCampaignId)
      return c.json({ error: "Campaign no encontrada para ese producto" }, 500);
    const { data: latest } = await supabase
      .from("flow_versions")
      .select("version_number")
      .eq("organization_id", orgId(c))
      .eq("campaign_id", resolvedCampaignId)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextVersion = (latest?.version_number ?? 0) + 1;
    const { data, error } = await supabase
      .from("flow_versions")
      .insert({
        organization_id: orgId(c),
        campaign_id: resolvedCampaignId,
        version_number: nextVersion,
        status: "draft",
        notes: body.notes ?? null,
        created_by:
          session.userId === "dashboard-secret" ? null : session.userId,
      })
      .select(
        "id, campaign_id, version_number, status, notes, published_at, updated_at",
      )
      .single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json(data, 200);
  },
);

dashboardApi.openapi(
  createRoute({
    method: "post",
    path: "/legacy/flows/{id}/simulate",
    request: {
      headers: AuthHeaderSchema,
      params: z.object({ id: z.string() }),
      body: {
        required: false,
        content: {
          "application/json": {
            schema: z.object({
              text: z.string().optional(),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Flow simulation response",
        content: {
          "application/json": {
            schema: z.object({
              matched: z.boolean(),
              response: z.string(),
              source: z.string(),
            }),
          },
        },
      },
      404: {
        description: "Not found",
        content: { "application/json": { schema: ErrorSchema } },
      },
      500: {
        description: "Error",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  }),
  async (c) => {
    if (!supabase) return c.json({ error: "Supabase no configurado" }, 500);
    const session = getSession(c);
    const { id } = c.req.valid("param");
    const payload = (await c.req.json().catch(() => ({}))) as { text?: string };
    const { data: flowVersion, error } = await supabase
      .from("flow_versions")
      .select("id, campaign_id, status")
      .eq("id", id)
      .eq("organization_id", orgId(c))
      .maybeSingle();
    if (error) return c.json({ error: error.message }, 500);
    if (!flowVersion) return c.json({ error: "Flujo no encontrado" }, 404);
    return c.json(
      {
        matched: Boolean(payload.text && payload.text.trim().length > 0),
        response: payload.text
          ? `Preview para: ${payload.text}`
          : "Preview de flujo sin texto.",
        source: flowVersion.status,
      },
      200,
    );
  },
);

dashboardApi.openapi(
  createRoute({
    method: "post",
    path: "/legacy/flows/{id}/publish",
    request: {
      headers: AuthHeaderSchema,
      params: z.object({ id: z.string() }),
    },
    responses: {
      200: {
        description: "Flow published",
        content: { "application/json": { schema: FlowVersionSchema } },
      },
      500: {
        description: "Error",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  }),
  async (c) => {
    if (!supabase) return c.json({ error: "Supabase no configurado" }, 500);
    const session = getSession(c);
    const { id } = c.req.valid("param");
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("flow_versions")
      .update({ status: "published", published_at: now, updated_at: now })
      .eq("id", id)
      .eq("organization_id", orgId(c))
      .select(
        "id, campaign_id, version_number, status, notes, published_at, updated_at",
      )
      .single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json(data, 200);
  },
);

dashboardApi.openapi(
  createRoute({
    method: "get",
    path: "/templates",
    request: {
      headers: AuthHeaderSchema,
      query: z.object({ flowId: z.string().optional() }),
    },
    responses: {
      200: {
        description: "Message templates",
        content: { "application/json": { schema: z.array(TemplateSchema) } },
      },
      500: {
        description: "Error",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  }),
  async (c) => {
    if (!supabase) return c.json([], 200);
    const session = getSession(c);
    const { flowId } = c.req.valid("query");
    let query = supabase
      .from("message_templates")
      .select(
        "id, flow_id, name, category, kind, content, media_url, variables, is_active, updated_at",
      )
      .eq("organization_id", orgId(c))
      .order("updated_at", { ascending: false });
    if (flowId) query = query.eq("flow_id", flowId);
    const { data, error } = await query;
    if (error) return c.json({ error: error.message }, 500);
    const normalized = (data ?? []).map((item) => ({
      ...item,
      variables: Array.isArray(item.variables)
        ? item.variables.map(String)
        : [],
    }));
    return c.json(normalized, 200);
  },
);

dashboardApi.openapi(
  createRoute({
    method: "post",
    path: "/templates",
    request: {
      headers: AuthHeaderSchema,
      body: {
        required: true,
        content: {
          "application/json": {
            schema: z.object({
              flowId: z.string().optional(),
              name: z.string().min(2),
              category: z.string().default("general"),
              kind: z
                .enum(["text", "image", "document", "link"])
                .default("text"),
              content: z.string().default(""),
              mediaUrl: z.string().optional(),
              variables: z.array(z.string()).default([]),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Template created",
        content: { "application/json": { schema: TemplateSchema } },
      },
      500: {
        description: "Error",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  }),
  async (c) => {
    if (!supabase) return c.json({ error: "Supabase no configurado" }, 500);
    const session = getSession(c);
    const body = c.req.valid("json");
    const { data, error } = await supabase
      .from("message_templates")
      .insert({
        organization_id: orgId(c),
        flow_id: body.flowId ?? null,
        name: body.name,
        category: body.category,
        kind: body.kind,
        content: body.content,
        media_url: body.mediaUrl ?? null,
        variables: body.variables,
        created_by:
          session.userId === "dashboard-secret" ? null : session.userId,
      })
      .select(
        "id, flow_id, name, category, kind, content, media_url, variables, is_active, updated_at",
      )
      .single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json(
      {
        ...data,
        variables: Array.isArray(data.variables)
          ? data.variables.map(String)
          : [],
      },
      200,
    );
  },
);

// ── Flow templates (user-created) ────────────────────────────────────────

const FlowTemplateDraftMessageSchema = z.object({
  position: z.number(),
  messageType: z.enum(["text", "image", "document", "video", "audio"]),
  textContent: z.string().nullable().optional(),
  mediaUrl: z.string().nullable().optional(),
  filename: z.string().nullable().optional(),
  caption: z.string().nullable().optional(),
});

const FlowTemplateDraftStepSchema = z.object({
  position: z.number(),
  delaySeconds: z.number(),
  label: z.string().optional(),
  messages: z.array(FlowTemplateDraftMessageSchema),
});

const FlowTemplateDraftSchema = z.object({
  name: z.string(),
  triggerPhrase: z.string(),
  keywords: z.array(z.string()),
  noMatchBehavior: z.enum(["trigger", "ignore"]),
  systemPrompt: z.string().nullable().optional(),
  isActive: z.boolean(),
  sessionTimeoutHours: z.number().optional(),
  steps: z.array(FlowTemplateDraftStepSchema),
  receiptPendingMessage: z.string().optional(),
  receiptRejectedMessage: z.string().optional(),
  receiptConfirmedMessage: z.string().optional(),
});

const FlowTemplateSchema = z.object({
  id: z.string(),
  organization_id: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  category: z.string(),
  draft: FlowTemplateDraftSchema,
  created_by: z.string().nullable().optional(),
  created_at: z.string(),
  updated_at: z.string(),
});

dashboardApi.openapi(
  createRoute({
    method: "get",
    path: "/flow-templates",
    request: { headers: AuthHeaderSchema },
    responses: {
      200: {
        description: "Flow templates",
        content: {
          "application/json": { schema: z.array(FlowTemplateSchema) },
        },
      },
    },
  }),
  async (c) => {
    if (!supabase) return c.json([], 200);
    const { data } = await supabase
      .from("flow_templates")
      .select(
        "id, organization_id, name, description, category, draft, created_by, created_at, updated_at",
      )
      .eq("organization_id", orgId(c))
      .order("created_at", { ascending: false });
    return c.json(data ?? [], 200);
  },
);

dashboardApi.openapi(
  createRoute({
    method: "post",
    path: "/flow-templates",
    request: {
      headers: AuthHeaderSchema,
      body: {
        required: true,
        content: {
          "application/json": {
            schema: z.object({
              name: z.string().min(1),
              description: z.string().optional(),
              category: z.string().default("Personalizado"),
              draft: FlowTemplateDraftSchema,
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Created",
        content: { "application/json": { schema: FlowTemplateSchema } },
      },
      500: {
        description: "Error",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  }),
  async (c) => {
    if (!supabase) return c.json({ error: "Supabase no configurado" }, 500);
    const session = getSession(c);
    const body = c.req.valid("json");
    const { data, error } = await supabase
      .from("flow_templates")
      .insert({
        organization_id: orgId(c),
        name: body.name,
        description: body.description ?? null,
        category: body.category,
        draft: body.draft,
        created_by:
          session.userId === "dashboard-secret" ? null : session.userId,
      })
      .select(
        "id, organization_id, name, description, category, draft, created_by, created_at, updated_at",
      )
      .single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json(data, 200);
  },
);

dashboardApi.openapi(
  createRoute({
    method: "delete",
    path: "/flow-templates/{id}",
    request: {
      headers: AuthHeaderSchema,
      params: z.object({ id: z.string() }),
    },
    responses: {
      200: {
        description: "Deleted",
        content: {
          "application/json": { schema: z.object({ ok: z.boolean() }) },
        },
      },
      500: {
        description: "Error",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  }),
  async (c) => {
    if (!supabase) return c.json({ error: "Supabase no configurado" }, 500);
    const { id } = c.req.valid("param");
    const { error } = await supabase
      .from("flow_templates")
      .delete()
      .eq("id", id)
      .eq("organization_id", orgId(c));
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ ok: true }, 200);
  },
);

dashboardApi.openapi(
  createRoute({
    method: "get",
    path: "/stats/range",
    request: {
      headers: AuthHeaderSchema,
      query: z.object({
        from: z.string().optional(),
        to: z.string().optional(),
      }),
    },
    responses: {
      200: {
        description: "Range stats",
        content: { "application/json": { schema: z.array(RangePointSchema) } },
      },
      500: {
        description: "Error",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  }),
  async (c) => {
    if (!supabase) return c.json([], 200);
    const session = getSession(c);
    const { from, to } = c.req.valid("query");
    let query = supabase
      .from("payments")
      .select("validated_at, amount")
      .eq("organization_id", orgId(c))
      .order("validated_at", { ascending: true });
    if (from) query = query.gte("validated_at", from);
    if (to) query = query.lte("validated_at", to);
    const { data, error } = await query;
    if (error) return c.json({ error: error.message }, 500);
    const grouped = new Map<string, number>();
    for (const row of data ?? []) {
      const date = new Date(String(row.validated_at))
        .toISOString()
        .slice(0, 10);
      grouped.set(date, (grouped.get(date) ?? 0) + Number(row.amount ?? 0));
    }
    return c.json(
      Array.from(grouped.entries()).map(([date, total]) => ({ date, total })),
      200,
    );
  },
);

// ── Conversation filter options ───────────────────────────────────────────

const ConversationFiltersSchema = z.object({
  flows: z.array(z.object({ id: z.string(), name: z.string() })),
  ads: z.array(
    z.object({
      source_id: z.string(),
      ad_name: z.string().nullable(),
      campaign_name: z.string().nullable(),
    }),
  ),
});

dashboardApi.openapi(
  createRoute({
    method: "get",
    path: "/conversations/filters",
    request: { headers: AuthHeaderSchema },
    responses: {
      200: {
        description: "Filter options",
        content: { "application/json": { schema: ConversationFiltersSchema } },
      },
    },
  }),
  async (c) => {
    if (!supabase) return c.json({ flows: [], ads: [] }, 200);
    const organization = orgId(c);

    // Distinct flows that have at least one conversation
    const { data: flowRows } = await supabase
      .from("conversations")
      .select("flow_id, flow_name")
      .eq("organization_id", organization)
      .not("flow_id", "is", null);

    const seenFlows = new Map<string, string>();
    for (const r of flowRows ?? []) {
      if (r.flow_id && !seenFlows.has(r.flow_id)) {
        seenFlows.set(
          r.flow_id as string,
          (r.flow_name as string) ?? (r.flow_id as string),
        );
      }
    }
    const flows = Array.from(seenFlows.entries()).map(([id, name]) => ({
      id,
      name,
    }));

    // Distinct ads that have click logs
    const { data: adRows } = await supabase
      .from("ad_click_logs")
      .select("source_id, ad_name, campaign_name")
      .eq("organization_id", organization)
      .not("source_id", "is", null);

    const seenAds = new Map<
      string,
      { ad_name: string | null; campaign_name: string | null }
    >();
    for (const r of adRows ?? []) {
      if (r.source_id && !seenAds.has(r.source_id as string)) {
        seenAds.set(r.source_id as string, {
          ad_name: r.ad_name as string | null,
          campaign_name: r.campaign_name as string | null,
        });
      }
    }
    const ads = Array.from(seenAds.entries()).map(([source_id, meta]) => ({
      source_id,
      ...meta,
    }));

    return c.json({ flows, ads }, 200);
  },
);

dashboardApi.openapi(
  createRoute({
    method: "get",
    path: "/conversations",
    request: {
      headers: AuthHeaderSchema,
      query: z.object({
        state: z.string().optional(),
        search: z.string().optional(),
        fromAd: z.coerce.boolean().optional(),
        adSourceId: z.string().optional(),
        flowId: z.string().optional(),
        page: z.coerce.number().default(1),
        pageSize: z.coerce.number().default(20),
        sortBy: z.string().default("updated_at"),
        sortDir: z.enum(["asc", "desc"]).default("desc"),
      }),
    },
    responses: {
      200: {
        description: "Paginated conversations",
        content: {
          "application/json": { schema: paginatedSchema(ConversationSchema) },
        },
      },
      500: {
        description: "Error",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  }),
  async (c) => {
    if (!supabase)
      return c.json(
        {
          items: [] as z.infer<typeof ConversationSchema>[],
          page: 1,
          pageSize: 20,
          total: 0,
        },
        200,
      );
    const {
      state,
      search,
      fromAd,
      adSourceId,
      flowId,
      page,
      pageSize,
      sortBy,
      sortDir,
    } = c.req.valid("query");
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const organization = orgId(c);

    // Resolve phones from ad_click_logs when filtering by ad
    let adPhones: string[] | null = null;
    if (adSourceId) {
      const { data: adRows } = await supabase
        .from("ad_click_logs")
        .select("phone")
        .eq("organization_id", organization)
        .eq("source_id", adSourceId);
      adPhones = [...new Set((adRows ?? []).map((r) => r.phone as string))];
      if (adPhones.length === 0)
        return c.json(
          {
            items: [] as z.infer<typeof ConversationSchema>[],
            page,
            pageSize,
            total: 0,
          },
          200,
        );
    } else if (fromAd) {
      const { data: adRows } = await supabase
        .from("ad_click_logs")
        .select("phone")
        .eq("organization_id", organization);
      adPhones = [...new Set((adRows ?? []).map((r) => r.phone as string))];
      if (adPhones.length === 0)
        return c.json(
          {
            items: [] as z.infer<typeof ConversationSchema>[],
            page,
            pageSize,
            total: 0,
          },
          200,
        );
    }

    let query = supabase
      .from("conversations")
      .select(
        "id, phone, contact_name, stage, flow_id, flow_name, started_at, updated_at",
      )
      .eq("organization_id", organization)
      .order(sortBy, { ascending: sortDir === "asc" })
      .range(from, to);
    if (state) query = query.eq("stage", state);
    if (search) query = query.ilike("phone", `%${search}%`);
    if (flowId) query = query.eq("flow_id", flowId);
    if (adPhones) query = query.in("phone", adPhones);
    const { data, error } = await query;
    if (error) return c.json({ error: error.message }, 500);

    // Batch-fetch most recent ad click per phone to show ad name in list
    const phones = (data ?? []).map(
      (c) => (c as Record<string, unknown>).phone as string,
    );
    let adNameByPhone: Map<string, string | null> = new Map();
    if (phones.length > 0) {
      const { data: adRows } = await supabase
        .from("ad_click_logs")
        .select("phone, ad_name, headline")
        .eq("organization_id", organization)
        .in("phone", phones)
        .order("created_at", { ascending: false });
      for (const row of adRows ?? []) {
        const p = row.phone as string;
        if (!adNameByPhone.has(p)) {
          adNameByPhone.set(
            p,
            (row.ad_name as string | null) ??
              (row.headline as string | null) ??
              null,
          );
        }
      }
    }

    // Batch-fetch last message and unread count per conversation
    type MsgRow = {
      conversation_id: string;
      text_body: string | null;
      direction: string;
      message_type: string;
      created_at: string;
    };
    let lastMsgByConvId = new Map<string, MsgRow>();
    let unreadByConvId = new Map<string, number>();

    if ((data ?? []).length > 0) {
      const convIds = (data ?? []).map(
        (conv) => (conv as Record<string, unknown>).id as string,
      );

      const { data: msgRows } = await supabase
        .from("messages")
        .select("conversation_id, text_body, direction, message_type, created_at")
        .in("conversation_id", convIds)
        .order("created_at", { ascending: false });

      for (const row of (msgRows ?? []) as unknown as MsgRow[]) {
        if (!lastMsgByConvId.has(row.conversation_id)) {
          lastMsgByConvId.set(row.conversation_id, row);
        }
      }

      // Compute unread per conv: inbound messages since last outbound
      const allMsgs = ((msgRows ?? []) as unknown as MsgRow[]).sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );
      for (const cid of convIds) {
        const convMsgs = allMsgs.filter((m) => m.conversation_id === cid);
        const lastOutboundIdx = convMsgs.map((m) => m.direction).lastIndexOf("outbound");
        const unread =
          lastOutboundIdx === -1
            ? convMsgs.filter((m) => m.direction === "inbound").length
            : convMsgs.slice(lastOutboundIdx + 1).filter((m) => m.direction === "inbound").length;
        unreadByConvId.set(cid, unread);
      }
    }

    const items: z.infer<typeof ConversationSchema>[] = (data ?? []).map(
      (conv) => {
        const c = conv as Record<string, unknown>;
        const convId = c.id as string;
        const lastMsg = lastMsgByConvId.get(convId);
        const lastMsgText = lastMsg?.text_body?.trim() || null;
        return {
          id: convId,
          phone: c.phone as string,
          stage: c.stage as string,
          contact_name: (c.contact_name as string | null) ?? null,
          flow_id: (c.flow_id as string | null) ?? null,
          flow_name: (c.flow_name as string | null) ?? null,
          started_at: (c.started_at as string | null) ?? null,
          updated_at: (c.updated_at as string | null) ?? null,
          ad_name: adNameByPhone.get(c.phone as string) ?? null,
          last_message_text: lastMsgText,
          last_message_direction: lastMsg
            ? (lastMsg.direction as "inbound" | "outbound")
            : null,
          unread_count: unreadByConvId.get(convId) ?? 0,
        };
      },
    );

    let countQuery = supabase
      .from("conversations")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", organization);
    if (state) countQuery = countQuery.eq("stage", state);
    if (search) countQuery = countQuery.ilike("phone", `%${search}%`);
    if (flowId) countQuery = countQuery.eq("flow_id", flowId);
    if (adPhones) countQuery = countQuery.in("phone", adPhones);
    const { count } = await countQuery;
    return c.json({ items, page, pageSize, total: count ?? items.length }, 200);
  },
);

dashboardApi.openapi(
  createRoute({
    method: "get",
    path: "/conversations/{id}",
    request: {
      headers: AuthHeaderSchema,
      params: z.object({ id: z.string() }),
    },
    responses: {
      200: {
        description: "Conversation detail",
        content: { "application/json": { schema: ConversationSchema } },
      },
      404: {
        description: "Not found",
        content: { "application/json": { schema: ErrorSchema } },
      },
      500: {
        description: "Error",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  }),
  async (c) => {
    if (!supabase) return c.json({ error: "Supabase no configurado" }, 500);
    const { id } = c.req.valid("param");
    const organization = orgId(c);
    const { data, error } = await supabase
      .from("conversations")
      .select(
        "id, phone, contact_name, stage, flow_id, flow_name, started_at, updated_at",
      )
      .eq("id", id)
      .eq("organization_id", organization)
      .maybeSingle();
    if (error) return c.json({ error: error.message }, 500);
    if (!data) return c.json({ error: "Conversacion no encontrada" }, 404);
    // Enrich with ad source if available
    const { data: adRow } = await supabase
      .from("ad_click_logs")
      .select(
        "source_id, headline, ad_name, campaign_name, adset_name, created_at",
      )
      .eq("organization_id", organization)
      .eq("phone", data.phone)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return c.json({ ...data, ad_source: adRow ?? null }, 200);
  },
);

dashboardApi.openapi(
  createRoute({
    method: "put",
    path: "/conversations/{id}/stage",
    request: {
      headers: AuthHeaderSchema,
      params: z.object({ id: z.string() }),
      body: {
        required: true,
        content: {
          "application/json": { schema: z.object({ stage: z.string() }) },
        },
      },
    },
    responses: {
      200: {
        description: "Updated",
        content: {
          "application/json": { schema: z.object({ ok: z.boolean() }) },
        },
      },
      404: {
        description: "Not found",
        content: { "application/json": { schema: ErrorSchema } },
      },
      500: {
        description: "Error",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  }),
  async (c) => {
    if (!supabase) return c.json({ error: "Supabase no configurado" }, 500);
    const { id } = c.req.valid("param");
    const { stage } = c.req.valid("json");
    const organization = orgId(c);
    const { error } = await supabase
      .from("conversations")
      .update({ stage, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("organization_id", organization);
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ ok: true }, 200);
  },
);

dashboardApi.openapi(
  createRoute({
    method: "get",
    path: "/conversations/{id}/messages",
    request: {
      headers: AuthHeaderSchema,
      params: z.object({ id: z.string() }),
      query: z.object({
        page: z.coerce.number().default(1),
        pageSize: z.coerce.number().default(30),
        sortDesc: z.coerce.boolean().default(false),
      }),
    },
    responses: {
      200: {
        description: "Paginated messages",
        content: {
          "application/json": { schema: paginatedSchema(ChatMessageSchema) },
        },
      },
      500: {
        description: "Error",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const { page, pageSize, sortDesc } = c.req.valid("query");
    const session = getSession(c);
    try {
      const { items, total } = await listMessagesByConversation(
        orgId(c),
        id,
        page,
        pageSize,
        sortDesc,
      );
      return c.json({ items, page, pageSize, total }, 200);
    } catch (error) {
      return c.json({ error: (error as Error).message }, 500);
    }
  },
);

dashboardApi.openapi(
  createRoute({
    method: "post",
    path: "/conversations/{id}/messages",
    request: {
      headers: AuthHeaderSchema,
      params: z.object({ id: z.string() }),
      body: {
        required: true,
        content: {
          "application/json": {
            schema: z.object({
              type: z.enum(["text", "image", "document", "audio"]),
              text: z.string().optional(),
              mediaUrl: z.string().optional(),
              caption: z.string().optional(),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Sent",
        content: {
          "application/json": { schema: z.object({ ok: z.boolean() }) },
        },
      },
      404: {
        description: "Not found",
        content: { "application/json": { schema: ErrorSchema } },
      },
      500: {
        description: "Error",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  }),
  async (c) => {
    if (!supabase) return c.json({ error: "Supabase no configurado" }, 500);
    const session = getSession(c);
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const { data: conversation } = await supabase
      .from("conversations")
      .select("id, phone, whatsapp_instance_id")
      .eq("id", id)
      .eq("organization_id", orgId(c))
      .maybeSingle();
    if (!conversation)
      return c.json({ error: "Conversacion no encontrada" }, 404);
    let metaPhoneNumberId: string | null = null;
    if (conversation.whatsapp_instance_id) {
      const { data: instance } = await supabase
        .from("whatsapp_instances")
        .select("phone_number_id")
        .eq("id", conversation.whatsapp_instance_id)
        .eq("organization_id", orgId(c))
        .maybeSingle();
      metaPhoneNumberId = instance?.phone_number_id ?? null;
    }

    if (body.type === "text") {
      await sendMessage(
        conversation.phone,
        { type: "text", text: { body: body.text ?? "" } },
        { metaPhoneNumberId, organizationId: orgId(c) },
      );
    } else if (body.type === "image") {
      await sendMessage(
        conversation.phone,
        {
          type: "image",
          image: { link: body.mediaUrl, caption: body.caption ?? "" },
        },
        { metaPhoneNumberId, organizationId: orgId(c) },
      );
    } else if (body.type === "audio") {
      await sendMessage(
        conversation.phone,
        { type: "audio", audio: { link: body.mediaUrl } },
        { metaPhoneNumberId, organizationId: orgId(c) },
      );
    } else {
      await sendMessage(
        conversation.phone,
        {
          type: "document",
          document: {
            link: body.mediaUrl,
            caption: body.caption ?? "",
            filename: "archivo",
          },
        },
        { metaPhoneNumberId, organizationId: orgId(c) },
      );
    }
    return c.json({ ok: true }, 200);
  },
);

dashboardApi.openapi(
  createRoute({
    method: "post",
    path: "/conversations/{id}/upload",
    request: {
      headers: AuthHeaderSchema,
      params: z.object({ id: z.string() }),
      body: {
        required: true,
        content: {
          "multipart/form-data": {
            schema: z.object({
              kind: z.enum(["image", "document", "audio"]).default("document"),
              caption: z.string().optional(),
              file: z.any().openapi({ type: "string", format: "binary" }),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Uploaded and sent",
        content: { "application/json": { schema: UploadResponseSchema } },
      },
      404: {
        description: "Not found",
        content: { "application/json": { schema: ErrorSchema } },
      },
      400: {
        description: "Bad request",
        content: { "application/json": { schema: ErrorSchema } },
      },
      413: {
        description: "Archivo demasiado grande",
        content: { "application/json": { schema: ErrorSchema } },
      },
      500: {
        description: "Error",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  }),
  async (c) => {
    if (!supabase) return c.json({ error: "Supabase no configurado" }, 500);
    const session = getSession(c);
    const { id } = c.req.valid("param");

    const { data: conversation } = await supabase
      .from("conversations")
      .select("id, phone, whatsapp_instance_id")
      .eq("id", id)
      .eq("organization_id", orgId(c))
      .maybeSingle();
    if (!conversation)
      return c.json({ error: "Conversacion no encontrada" }, 404);
    let metaPhoneNumberId: string | null = null;
    if (conversation.whatsapp_instance_id) {
      const { data: instance } = await supabase
        .from("whatsapp_instances")
        .select("phone_number_id")
        .eq("id", conversation.whatsapp_instance_id)
        .eq("organization_id", orgId(c))
        .maybeSingle();
      metaPhoneNumberId = instance?.phone_number_id ?? null;
    }

    const form = await c.req.formData();
    const kind =
      (form.get("kind")?.toString() as "image" | "document" | "audio") ?? "document";
    const caption = form.get("caption")?.toString() ?? "";
    const file = form.get("file");
    if (!(file instanceof File))
      return c.json({ error: "Archivo invalido" }, 400);

    const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
    const MAX_AUDIO_BYTES = 16 * 1024 * 1024; // 16 MB
    const MAX_DOC_BYTES = 50 * 1024 * 1024; // 50 MB
    const maxBytes =
      kind === "image"
        ? MAX_IMAGE_BYTES
        : kind === "audio"
          ? MAX_AUDIO_BYTES
          : MAX_DOC_BYTES;
    if (file.size > maxBytes) {
      const limitMb = maxBytes / (1024 * 1024);
      return c.json(
        { error: `El archivo supera el límite de ${limitMb} MB para ${kind}` },
        413,
      );
    }

    const mimeType =
      file.type ||
      (kind === "image"
        ? "image/jpeg"
        : kind === "audio"
          ? "audio/mpeg"
          : "application/octet-stream");
    const metaMediaId = await uploadMediaToMeta(file, mimeType, {
      metaPhoneNumberId,
      organizationId: orgId(c),
    });

    if (kind === "image") {
      await sendMessage(
        conversation.phone,
        {
          type: "image",
          image: { id: metaMediaId, caption },
        },
        { metaPhoneNumberId, organizationId: orgId(c) },
      );
    } else if (kind === "audio") {
      await sendMessage(
        conversation.phone,
        { type: "audio", audio: { id: metaMediaId } },
        { metaPhoneNumberId, organizationId: orgId(c) },
      );
    } else {
      await sendMessage(
        conversation.phone,
        {
          type: "document",
          document: {
            id: metaMediaId,
            caption,
            filename: file.name || "archivo",
          },
        },
        { metaPhoneNumberId, organizationId: orgId(c) },
      );
    }

    return c.json(
      {
        ok: true,
        metaMediaId,
        mimeType,
        kind,
        filename: file.name || undefined,
      },
      200,
    );
  },
);

dashboardApi.openapi(
  createRoute({
    method: "post",
    path: "/conversations/{id}/send-media",
    request: {
      headers: AuthHeaderSchema,
      params: z.object({ id: z.string() }),
      body: {
        required: true,
        content: {
          "application/json": {
            schema: z.object({
              url: z.string().url(),
              filename: z.string(),
              mimeType: z.string(),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Media enviada",
        content: {
          "application/json": {
            schema: z.object({ ok: z.boolean(), messageId: z.string().nullable().optional() }),
          },
        },
      },
      404: {
        description: "Conversación no encontrada",
        content: { "application/json": { schema: ErrorSchema } },
      },
      500: {
        description: "Error",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  }),
  async (c) => {
    if (!supabase) return c.json({ error: "Supabase no configurado" }, 500);
    const { id } = c.req.valid("param");
    const { url, filename, mimeType } = c.req.valid("json");
    const organization = orgId(c);

    const { data: conversation } = await supabase
      .from("conversations")
      .select("id, phone, whatsapp_instance_id")
      .eq("id", id)
      .eq("organization_id", organization)
      .maybeSingle();
    if (!conversation) return c.json({ error: "Conversacion no encontrada" }, 404);

    let metaPhoneNumberId: string | null = null;
    if (conversation.whatsapp_instance_id) {
      const { data: instance } = await supabase
        .from("whatsapp_instances")
        .select("phone_number_id")
        .eq("id", conversation.whatsapp_instance_id)
        .eq("organization_id", organization)
        .maybeSingle();
      metaPhoneNumberId = instance?.phone_number_id ?? null;
    }

    let waType: "image" | "video" | "document";
    if (mimeType.startsWith("image/")) {
      waType = "image";
    } else if (mimeType.startsWith("video/")) {
      waType = "video";
    } else {
      waType = "document";
    }

    const mediaPayload =
      waType === "image"
        ? { type: "image", image: { link: url } }
        : waType === "video"
          ? { type: "video", video: { link: url } }
          : { type: "document", document: { link: url, filename } };

    await sendMessage(conversation.phone, mediaPayload, {
      metaPhoneNumberId,
      organizationId: organization,
      conversationId: id,
    });

    return c.json({ ok: true }, 200);
  },
);

dashboardApi.openapi(
  createRoute({
    method: "get",
    path: "/payments",
    request: {
      headers: AuthHeaderSchema,
      query: z.object({
        page: z.coerce.number().default(1),
        pageSize: z.coerce.number().default(20),
        sortBy: z.string().default("validated_at"),
        sortDir: z.enum(["asc", "desc"]).default("desc"),
        state: z.enum(PAYMENT_STATES).optional(),
        flowId: z.string().optional(),
        instanceId: z.string().optional(),
        from: z.string().optional(),
        to: z.string().optional(),
        phone: z.string().optional(),
      }),
    },
    responses: {
      200: {
        description: "Paginated payments",
        content: {
          "application/json": { schema: paginatedSchema(PaymentSchema) },
        },
      },
      500: {
        description: "Error",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  }),
  async (c) => {
    if (!supabase)
      return c.json(
        {
          items: [] as z.infer<typeof PaymentSchema>[],
          page: 1,
          pageSize: 20,
          total: 0,
        },
        200,
      );
    const {
      page,
      pageSize,
      sortBy,
      sortDir,
      state,
      flowId,
      instanceId,
      from: fromDate,
      to: toDate,
      phone,
    } = c.req.valid("query");
    const rangeFrom = (page - 1) * pageSize;
    const rangeTo = rangeFrom + pageSize - 1;
    const organization = orgId(c);

    const selectCols = [
      "id, phone, flow_id, whatsapp_instance_id, amount, currency, receipt_date, state, validated_at",
      "flows(name)",
      "whatsapp_instances(label)",
    ].join(", ");

    let query = supabase
      .from("payments")
      .select(selectCols)
      .eq("organization_id", organization)
      .order(sortBy, { ascending: sortDir === "asc" })
      .range(rangeFrom, rangeTo);
    if (state) query = query.eq("state", state);
    if (flowId) query = query.eq("flow_id", flowId);
    if (instanceId) query = query.eq("whatsapp_instance_id", instanceId);
    if (fromDate) query = query.gte("validated_at", fromDate);
    if (toDate) query = query.lte("validated_at", toDate);
    if (phone) query = query.eq("phone", phone);

    const { data, error } = await query;
    if (error) return c.json({ error: error.message }, 500);

    let countQuery = supabase
      .from("payments")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", organization);
    if (state) countQuery = countQuery.eq("state", state);
    if (flowId) countQuery = countQuery.eq("flow_id", flowId);
    if (instanceId)
      countQuery = countQuery.eq("whatsapp_instance_id", instanceId);
    if (fromDate) countQuery = countQuery.gte("validated_at", fromDate);
    if (toDate) countQuery = countQuery.lte("validated_at", toDate);
    if (phone) countQuery = countQuery.eq("phone", phone);
    const { count } = await countQuery;

    const items: z.infer<typeof PaymentSchema>[] = (
      (data ?? []) as unknown as Record<string, unknown>[]
    ).map((p) => ({
      id: p.id as string,
      phone: p.phone as string,
      flow_id: (p.flow_id as string | null) ?? null,
      flow_name: (p.flows as { name?: string } | null)?.name ?? null,
      whatsapp_instance_id: (p.whatsapp_instance_id as string | null) ?? null,
      instance_label:
        (p.whatsapp_instances as { label?: string } | null)?.label ?? null,
      amount: (p.amount as number | null) ?? null,
      currency: (p.currency as string | null) ?? null,
      receipt_date: (p.receipt_date as string | null) ?? null,
      state: (p.state as (typeof PAYMENT_STATES)[number] | null) ?? null,
      validated_at: (p.validated_at as string | null) ?? null,
    }));

    return c.json({ items, page, pageSize, total: count ?? items.length }, 200);
  },
);

dashboardApi.openapi(
  createRoute({
    method: "put",
    path: "/payments/{id}/state",
    request: {
      headers: AuthHeaderSchema,
      params: z.object({ id: z.string() }),
      body: {
        required: true,
        content: {
          "application/json": {
            schema: z.object({
              state: z.enum(["pending_manual_review", "validated", "rejected"]),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Estado actualizado",
        content: { "application/json": { schema: z.object({ ok: z.boolean() }) } },
      },
      404: {
        description: "No encontrado",
        content: { "application/json": { schema: ErrorSchema } },
      },
      500: {
        description: "Error",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  }),
  async (c) => {
    if (!supabase) return c.json({ error: "Supabase no configurado" }, 500);
    const { id } = c.req.valid("param");
    const { state } = c.req.valid("json");
    const organization = orgId(c);

    const { data: existing } = await supabase
      .from("payments")
      .select("id")
      .eq("id", id)
      .eq("organization_id", organization)
      .maybeSingle();

    if (!existing) return c.json({ error: "Pago no encontrado" }, 404);

    const { error } = await supabase
      .from("payments")
      .update({
        state,
        validated_at: state === "validated" ? new Date().toISOString() : null,
      })
      .eq("id", id)
      .eq("organization_id", organization);

    if (error) return c.json({ error: error.message }, 500);
    return c.json({ ok: true }, 200);
  },
);

const DEFAULT_BOT_CONFIG = {
  systemPrompt: "Eres un asistente de ventas por WhatsApp.",
  keywords: "precio,pago,producto,ayuda",
  receiptPendingMessage:
    "Gracias por tu comprobante. Lo estamos validando manualmente y te confirmaremos pronto.",
  receiptRejectedMessage:
    "No pudimos validar tu comprobante. Por favor verifica que la imagen sea legible y que la fecha sea de las ultimas 24 horas.",
  receiptConfirmedMessage:
    "¡Gracias! Recibimos tu pago correctamente. En breve nos ponemos en contacto contigo.",
};

// Validate AI provider credentials — MUST be registered before GET /config/bot
dashboardApi.openapi(
  createRoute({
    method: "post",
    path: "/config/bot/validate-ai",
    request: {
      headers: AuthHeaderSchema,
      body: {
        required: true,
        content: {
          "application/json": {
            schema: z.object({
              provider: z.enum(["openai", "gemini", "anthropic", "groq"]),
              apiKey: z.string().min(1),
              model: z.string().min(1),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Validation result",
        content: {
          "application/json": {
            schema: z.object({ ok: z.boolean(), error: z.string().optional() }),
          },
        },
      },
    },
  }),
  async (c) => {
    const { provider, apiKey, model } = c.req.valid("json");
    const result = await validateAiProvider(provider, apiKey, model);
    return c.json(result, 200);
  },
);

dashboardApi.openapi(
  createRoute({
    method: "get",
    path: "/config/bot",
    request: { headers: AuthHeaderSchema },
    responses: {
      200: {
        description: "Bot config",
        content: {
          "application/json": {
            schema: z.object({
              systemPrompt: z.string(),
              keywords: z.string(),
              receiptPendingMessage: z.string(),
              receiptRejectedMessage: z.string(),
              receiptConfirmedMessage: z.string(),
              ai_enabled: z.boolean().optional(),
              ai_provider: z.string().nullable().optional(),
              ai_api_key_configured: z.boolean().optional(),
              ai_model: z.string().nullable().optional(),
              ai_system_prompt: z.string().nullable().optional(),
            }),
          },
        },
      },
    },
  }),
  async (c) => {
    if (!supabase) return c.json({ ...DEFAULT_BOT_CONFIG, ai_enabled: true, ai_provider: null, ai_api_key_configured: false, ai_model: null, ai_system_prompt: null }, 200);
    const { data: orgData } = await supabase
      .from("organizations")
      .select("bot_config, ai_enabled, ai_provider, ai_api_key, ai_model, ai_system_prompt")
      .eq("id", orgId(c))
      .maybeSingle();
    const cfg = (orgData?.bot_config ?? {}) as Record<string, string>;
    return c.json({
      systemPrompt: cfg.systemPrompt ?? DEFAULT_BOT_CONFIG.systemPrompt,
      keywords: cfg.keywords ?? DEFAULT_BOT_CONFIG.keywords,
      receiptPendingMessage: cfg.receiptPendingMessage ?? DEFAULT_BOT_CONFIG.receiptPendingMessage,
      receiptRejectedMessage: cfg.receiptRejectedMessage ?? DEFAULT_BOT_CONFIG.receiptRejectedMessage,
      receiptConfirmedMessage: cfg.receiptConfirmedMessage ?? DEFAULT_BOT_CONFIG.receiptConfirmedMessage,
      ai_enabled: (orgData?.ai_enabled as boolean) ?? true,
      ai_provider: (orgData?.ai_provider as string | null) ?? null,
      ai_api_key_configured: !!(orgData?.ai_api_key),
      ai_model: (orgData?.ai_model as string | null) ?? null,
      ai_system_prompt: (orgData?.ai_system_prompt as string | null) ?? null,
    }, 200);
  },
);

dashboardApi.openapi(
  createRoute({
    method: "put",
    path: "/config/bot",
    request: {
      headers: AuthHeaderSchema,
      body: {
        required: true,
        content: {
          "application/json": {
            schema: z.object({
              systemPrompt: z.string().optional(),
              keywords: z.string().optional(),
              receiptPendingMessage: z.string().optional(),
              receiptRejectedMessage: z.string().optional(),
              receiptConfirmedMessage: z.string().optional(),
              ai_enabled: z.boolean().optional(),
              ai_provider: z.enum(["openai", "gemini", "anthropic", "groq"]).nullable().optional(),
              ai_api_key: z.string().nullable().optional(),
              ai_model: z.string().nullable().optional(),
              ai_system_prompt: z.string().nullable().optional(),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Updated config",
        content: {
          "application/json": {
            schema: z.object({
              ok: z.boolean(),
              config: z.object({
                systemPrompt: z.string(),
                keywords: z.string(),
                receiptPendingMessage: z.string(),
                receiptRejectedMessage: z.string(),
                receiptConfirmedMessage: z.string(),
              }),
            }),
          },
        },
      },
    },
  }),
  async (c) => {
    if (!supabase) return c.json({ ok: false, config: DEFAULT_BOT_CONFIG }, 200);
    const body = c.req.valid("json");
    // Read current config first so we can merge
    const { data: org } = await supabase
      .from("organizations")
      .select("bot_config")
      .eq("id", orgId(c))
      .maybeSingle();
    const current = (org?.bot_config ?? {}) as Record<string, string>;
    const updated = {
      ...current,
      ...(body.systemPrompt !== undefined ? { systemPrompt: body.systemPrompt } : {}),
      ...(body.keywords !== undefined ? { keywords: body.keywords } : {}),
      ...(body.receiptPendingMessage !== undefined ? { receiptPendingMessage: body.receiptPendingMessage } : {}),
      ...(body.receiptRejectedMessage !== undefined ? { receiptRejectedMessage: body.receiptRejectedMessage } : {}),
      ...(body.receiptConfirmedMessage !== undefined ? { receiptConfirmedMessage: body.receiptConfirmedMessage } : {}),
    };
    await supabase.from("organizations").update({ bot_config: updated }).eq("id", orgId(c));

    // Update AI config columns
    const orgUpdates: Record<string, unknown> = {};
    if (body.ai_enabled !== undefined) orgUpdates.ai_enabled = body.ai_enabled;
    if (body.ai_provider !== undefined) orgUpdates.ai_provider = body.ai_provider;
    if (body.ai_api_key !== undefined) {
      orgUpdates.ai_api_key = body.ai_api_key ? await encrypt(body.ai_api_key) : null;
    }
    if (body.ai_model !== undefined) orgUpdates.ai_model = body.ai_model;
    if (body.ai_system_prompt !== undefined) orgUpdates.ai_system_prompt = body.ai_system_prompt;
    if (Object.keys(orgUpdates).length > 0) {
      await supabase.from("organizations").update(orgUpdates).eq("id", orgId(c));
    }

    return c.json({
      ok: true,
      config: {
        systemPrompt: updated.systemPrompt ?? DEFAULT_BOT_CONFIG.systemPrompt,
        keywords: updated.keywords ?? DEFAULT_BOT_CONFIG.keywords,
        receiptPendingMessage: updated.receiptPendingMessage ?? DEFAULT_BOT_CONFIG.receiptPendingMessage,
        receiptRejectedMessage: updated.receiptRejectedMessage ?? DEFAULT_BOT_CONFIG.receiptRejectedMessage,
        receiptConfirmedMessage: updated.receiptConfirmedMessage ?? DEFAULT_BOT_CONFIG.receiptConfirmedMessage,
      },
    }, 200);
  },
);

// ── Bot health endpoint ───────────────────────────────────────────────────
const BotHealthSchema = z.object({
  status: z.enum(["active", "no_instance", "no_product", "error"]),
  lastActivity: z.string().nullable(),
  messageCount24h: z.number(),
  detail: z.string().nullable(),
});

dashboardApi.openapi(
  createRoute({
    method: "get",
    path: "/bot/health",
    request: { headers: AuthHeaderSchema },
    responses: {
      200: {
        description: "Bot health",
        content: { "application/json": { schema: BotHealthSchema } },
      },
      500: {
        description: "Error",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  }),
  async (c) => {
    if (!supabase)
      return c.json(
        {
          status: "error" as const,
          lastActivity: null,
          messageCount24h: 0,
          detail: "Supabase no configurado",
        },
        200,
      );

    const org = orgId(c);

    // Check instances
    const { data: instances } = await supabase
      .from("whatsapp_instances")
      .select("id")
      .eq("organization_id", org)
      .eq("is_active", true)
      .limit(1);
    if (!instances?.length) {
      return c.json(
        {
          status: "no_instance" as const,
          lastActivity: null,
          messageCount24h: 0,
          detail: "No hay instancia de WhatsApp activa",
        },
        200,
      );
    }

    // Check active products
    const { data: products } = await supabase
      .from("products")
      .select("id")
      .eq("organization_id", org)
      .eq("is_active", true)
      .limit(1);
    if (!products?.length) {
      return c.json(
        {
          status: "no_product" as const,
          lastActivity: null,
          messageCount24h: 0,
          detail: "No hay producto activo",
        },
        200,
      );
    }

    // Recent activity
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: msgs, count } = await supabase
      .from("messages")
      .select("created_at", { count: "exact" })
      .eq("organization_id", org)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1);

    return c.json(
      {
        status: "active" as const,
        lastActivity: msgs?.[0]?.created_at ?? null,
        messageCount24h: count ?? 0,
        detail: null,
      },
      200,
    );
  },
);

// ── Flow definitions CRUD ─────────────────────────────────────────────────
const FlowDefinitionSchema = z.object({
  id: z.string(),
  organization_id: z.string(),
  product_id: z.string().nullable().optional(),
  name: z.string(),
  flow_type: z.enum(["keyword", "sequential"]),
  is_active: z.boolean(),
  created_at: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional(),
});

const FlowStepSchema = z.object({
  id: z.string(),
  flow_id: z.string(),
  organization_id: z.string(),
  position: z.number(),
  delay_seconds: z.number(),
  trigger_keywords: z.array(z.string()),
  label: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional(),
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
  created_at: z.string().nullable().optional(),
});

const FlowDefinitionFullSchema = FlowDefinitionSchema.extend({
  steps: z
    .array(FlowStepSchema.extend({ messages: z.array(FlowStepMessageSchema) }))
    .optional(),
});

// GET /flow-definitions
dashboardApi.openapi(
  createRoute({
    method: "get",
    path: "/flow-definitions",
    request: {
      headers: AuthHeaderSchema,
      query: z.object({ productId: z.string().optional() }),
    },
    responses: {
      200: {
        description: "Flow definitions",
        content: {
          "application/json": { schema: z.array(FlowDefinitionFullSchema) },
        },
      },
      500: {
        description: "Error",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  }),
  async (c) => {
    if (!supabase) return c.json([], 200);
    const { productId } = c.req.valid("query");
    let q = supabase
      .from("flow_definitions")
      .select(
        `id, organization_id, product_id, name, flow_type, is_active, created_at, updated_at,
        steps:flow_steps(id, flow_id, organization_id, position, delay_seconds, trigger_keywords, label, updated_at,
          messages:flow_step_messages(id, step_id, organization_id, position, message_type, text_content, media_url, filename, caption, created_at))`,
      )
      .eq("organization_id", orgId(c))
      .order("created_at", { ascending: false });
    if (productId) q = q.eq("product_id", productId);
    const { data, error } = await q;
    if (error) return c.json({ error: error.message }, 500);
    return c.json(data ?? [], 200);
  },
);

// POST /flow-definitions
dashboardApi.openapi(
  createRoute({
    method: "post",
    path: "/flow-definitions",
    request: {
      headers: AuthHeaderSchema,
      body: {
        required: true,
        content: {
          "application/json": {
            schema: z.object({
              name: z.string().min(2),
              flowType: z.enum(["keyword", "sequential"]),
              productId: z.string().optional(),
              isActive: z.boolean().default(true),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Created",
        content: { "application/json": { schema: FlowDefinitionSchema } },
      },
      500: {
        description: "Error",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  }),
  async (c) => {
    if (!supabase) return c.json({ error: "Supabase no configurado" }, 500);
    const body = c.req.valid("json");
    const session = getSession(c);
    const { data, error } = await supabase
      .from("flow_definitions")
      .insert({
        organization_id: orgId(c),
        product_id: body.productId ?? null,
        name: body.name,
        flow_type: body.flowType,
        is_active: body.isActive,
        created_by:
          session.userId === "dashboard-secret" ? null : session.userId,
      })
      .select(
        "id, organization_id, product_id, name, flow_type, is_active, created_at, updated_at",
      )
      .single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json(data, 200);
  },
);

// PUT /flow-definitions/:id
dashboardApi.openapi(
  createRoute({
    method: "put",
    path: "/flow-definitions/{id}",
    request: {
      headers: AuthHeaderSchema,
      params: z.object({ id: z.string() }),
      body: {
        required: true,
        content: {
          "application/json": {
            schema: z.object({
              name: z.string().optional(),
              isActive: z.boolean().optional(),
              productId: z.string().nullable().optional(),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Updated",
        content: { "application/json": { schema: FlowDefinitionSchema } },
      },
      500: {
        description: "Error",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  }),
  async (c) => {
    if (!supabase) return c.json({ error: "Supabase no configurado" }, 500);
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const patch = {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.isActive !== undefined ? { is_active: body.isActive } : {}),
      ...(body.productId !== undefined ? { product_id: body.productId } : {}),
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from("flow_definitions")
      .update(patch)
      .eq("id", id)
      .eq("organization_id", orgId(c))
      .select(
        "id, organization_id, product_id, name, flow_type, is_active, created_at, updated_at",
      )
      .single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json(data, 200);
  },
);

// DELETE /flow-definitions/:id
dashboardApi.openapi(
  createRoute({
    method: "delete",
    path: "/flow-definitions/{id}",
    request: {
      headers: AuthHeaderSchema,
      params: z.object({ id: z.string() }),
    },
    responses: {
      200: {
        description: "Deleted",
        content: {
          "application/json": { schema: z.object({ ok: z.boolean() }) },
        },
      },
      500: {
        description: "Error",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  }),
  async (c) => {
    if (!supabase) return c.json({ error: "Supabase no configurado" }, 500);
    const { id } = c.req.valid("param");
    const { error } = await supabase
      .from("flow_definitions")
      .delete()
      .eq("id", id)
      .eq("organization_id", orgId(c));
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ ok: true }, 200);
  },
);

// ── Flow steps CRUD ───────────────────────────────────────────────────────

// POST /flow-steps
dashboardApi.openapi(
  createRoute({
    method: "post",
    path: "/flow-steps",
    request: {
      headers: AuthHeaderSchema,
      body: {
        required: true,
        content: {
          "application/json": {
            schema: z.object({
              flowId: z.string(),
              label: z.string().optional(),
              position: z.number().default(0),
              delaySeconds: z.number().default(0),
              triggerKeywords: z.array(z.string()).default([]),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Created",
        content: { "application/json": { schema: FlowStepSchema } },
      },
      500: {
        description: "Error",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  }),
  async (c) => {
    if (!supabase) return c.json({ error: "Supabase no configurado" }, 500);
    const body = c.req.valid("json");
    const { data, error } = await supabase
      .from("flow_steps")
      .insert({
        flow_id: body.flowId,
        organization_id: orgId(c),
        position: body.position,
        delay_seconds: body.delaySeconds,
        trigger_keywords: body.triggerKeywords,
        label: body.label ?? null,
      })
      .select(
        "id, flow_id, organization_id, position, delay_seconds, trigger_keywords, label, updated_at",
      )
      .single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json(data, 200);
  },
);

// PUT /flow-steps/:id
dashboardApi.openapi(
  createRoute({
    method: "put",
    path: "/flow-steps/{id}",
    request: {
      headers: AuthHeaderSchema,
      params: z.object({ id: z.string() }),
      body: {
        required: true,
        content: {
          "application/json": {
            schema: z.object({
              label: z.string().nullable().optional(),
              position: z.number().optional(),
              delaySeconds: z.number().optional(),
              triggerKeywords: z.array(z.string()).optional(),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Updated",
        content: { "application/json": { schema: FlowStepSchema } },
      },
      500: {
        description: "Error",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  }),
  async (c) => {
    if (!supabase) return c.json({ error: "Supabase no configurado" }, 500);
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const patch = {
      ...(body.label !== undefined ? { label: body.label } : {}),
      ...(body.position !== undefined ? { position: body.position } : {}),
      ...(body.delaySeconds !== undefined
        ? { delay_seconds: body.delaySeconds }
        : {}),
      ...(body.triggerKeywords !== undefined
        ? { trigger_keywords: body.triggerKeywords }
        : {}),
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from("flow_steps")
      .update(patch)
      .eq("id", id)
      .eq("organization_id", orgId(c))
      .select(
        "id, flow_id, organization_id, position, delay_seconds, trigger_keywords, label, updated_at",
      )
      .single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json(data, 200);
  },
);

// DELETE /flow-steps/:id
dashboardApi.openapi(
  createRoute({
    method: "delete",
    path: "/flow-steps/{id}",
    request: {
      headers: AuthHeaderSchema,
      params: z.object({ id: z.string() }),
    },
    responses: {
      200: {
        description: "Deleted",
        content: {
          "application/json": { schema: z.object({ ok: z.boolean() }) },
        },
      },
      500: {
        description: "Error",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  }),
  async (c) => {
    if (!supabase) return c.json({ error: "Supabase no configurado" }, 500);
    const { id } = c.req.valid("param");
    const { error } = await supabase
      .from("flow_steps")
      .delete()
      .eq("id", id)
      .eq("organization_id", orgId(c));
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ ok: true }, 200);
  },
);

// ── Flow step messages CRUD ───────────────────────────────────────────────

// POST /flow-step-messages
dashboardApi.openapi(
  createRoute({
    method: "post",
    path: "/flow-step-messages",
    request: {
      headers: AuthHeaderSchema,
      body: {
        required: true,
        content: {
          "application/json": {
            schema: z.object({
              stepId: z.string(),
              position: z.number().default(0),
              messageType: z
                .enum(["text", "image", "document", "video", "audio"])
                .default("text"),
              textContent: z.string().nullable().optional(),
              mediaUrl: z.string().nullable().optional(),
              filename: z.string().nullable().optional(),
              caption: z.string().nullable().optional(),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Created",
        content: { "application/json": { schema: FlowStepMessageSchema } },
      },
      500: {
        description: "Error",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  }),
  async (c) => {
    if (!supabase) return c.json({ error: "Supabase no configurado" }, 500);
    const body = c.req.valid("json");
    const { data, error } = await supabase
      .from("flow_step_messages")
      .insert({
        step_id: body.stepId,
        organization_id: orgId(c),
        position: body.position,
        message_type: body.messageType,
        text_content: body.textContent ?? null,
        media_url: body.mediaUrl ?? null,
        filename: body.filename ?? null,
        caption: body.caption ?? null,
      })
      .select(
        "id, step_id, organization_id, position, message_type, text_content, media_url, filename, caption, created_at",
      )
      .single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json(data, 200);
  },
);

// PUT /flow-step-messages/:id
dashboardApi.openapi(
  createRoute({
    method: "put",
    path: "/flow-step-messages/{id}",
    request: {
      headers: AuthHeaderSchema,
      params: z.object({ id: z.string() }),
      body: {
        required: true,
        content: {
          "application/json": {
            schema: z.object({
              position: z.number().optional(),
              messageType: z
                .enum(["text", "image", "document", "video", "audio"])
                .optional(),
              textContent: z.string().nullable().optional(),
              mediaUrl: z.string().nullable().optional(),
              filename: z.string().nullable().optional(),
              caption: z.string().nullable().optional(),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Updated",
        content: { "application/json": { schema: FlowStepMessageSchema } },
      },
      500: {
        description: "Error",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  }),
  async (c) => {
    if (!supabase) return c.json({ error: "Supabase no configurado" }, 500);
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const patch = {
      ...(body.position !== undefined ? { position: body.position } : {}),
      ...(body.messageType !== undefined
        ? { message_type: body.messageType }
        : {}),
      ...(body.textContent !== undefined
        ? { text_content: body.textContent }
        : {}),
      ...(body.mediaUrl !== undefined ? { media_url: body.mediaUrl } : {}),
      ...(body.filename !== undefined ? { filename: body.filename } : {}),
      ...(body.caption !== undefined ? { caption: body.caption } : {}),
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from("flow_step_messages")
      .update(patch)
      .eq("id", id)
      .eq("organization_id", orgId(c))
      .select(
        "id, step_id, organization_id, position, message_type, text_content, media_url, filename, caption, created_at",
      )
      .single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json(data, 200);
  },
);

// ── Media Library ─────────────────────────────────────────────────────────

const OrgMediaSchema = z.object({
  id: z.string(),
  organization_id: z.string(),
  filename: z.string(),
  original_name: z.string(),
  media_type: z.enum(["image", "video", "document"]),
  mime_type: z.string(),
  size_bytes: z.number().nullable().optional(),
  storage_path: z.string(),
  public_url: z.string(),
  created_at: z.string().nullable().optional(),
});

const OrgMediaUploadResponseSchema = z.object({
  ok: z.boolean(),
  media: OrgMediaSchema,
});

function mimeToMediaType(mimeType: string): "image" | "video" | "document" | "audio" {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  return "document";
}

// GET /media
dashboardApi.openapi(
  createRoute({
    method: "get",
    path: "/media",
    request: {
      headers: AuthHeaderSchema,
      query: z.object({
        mediaType: z.enum(["image", "video", "document", "audio"]).optional(),
        page: z.coerce.number().default(1),
        pageSize: z.coerce.number().default(50),
      }),
    },
    responses: {
      200: {
        description: "Org media list",
        content: {
          "application/json": { schema: paginatedSchema(OrgMediaSchema) },
        },
      },
      500: {
        description: "Error",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  }),
  async (c) => {
    if (!supabase) return c.json({ error: "Supabase no configurado" }, 500);
    const { mediaType, page, pageSize } = c.req.valid("query");
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    let q = supabase
      .from("org_media")
      .select("*", { count: "exact" })
      .eq("organization_id", orgId(c))
      .order("created_at", { ascending: false })
      .range(from, to);
    if (mediaType) q = q.eq("media_type", mediaType);
    const { data, error, count } = await q;
    if (error) return c.json({ error: error.message }, 500);
    return c.json(
      { items: data ?? [], page, pageSize, total: count ?? 0 },
      200,
    );
  },
);

// POST /media/upload
dashboardApi.openapi(
  createRoute({
    method: "post",
    path: "/media/upload",
    request: {
      headers: AuthHeaderSchema,
      body: {
        required: true,
        content: {
          "multipart/form-data": {
            schema: z.object({
              file: z.any().openapi({ type: "string", format: "binary" }),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Media uploaded",
        content: {
          "application/json": { schema: OrgMediaUploadResponseSchema },
        },
      },
      400: {
        description: "Bad request",
        content: { "application/json": { schema: ErrorSchema } },
      },
      500: {
        description: "Error",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  }),
  async (c) => {
    if (!supabase) return c.json({ error: "Supabase no configurado" }, 500);
    if (env.STORAGE_MODE !== "supabase" && env.STORAGE_MODE !== "r2") {
      return c.json(
        { error: "Configura STORAGE_MODE=r2 o STORAGE_MODE=supabase para subir media" },
        400,
      );
    }
    const form = await c.req.formData();
    const file = form.get("file");
    if (!(file instanceof File))
      return c.json({ error: "Archivo invalido" }, 400);
    const bytes = await file.arrayBuffer();
    const mimeType = file.type || "application/octet-stream";
    const mediaType = mimeToMediaType(mimeType);
    const filename = file.name || "asset.bin";
    const buffer = Buffer.from(bytes);
    const uploaded = env.STORAGE_MODE === "r2"
      ? await uploadOrgMediaR2({ organizationId: orgId(c), filename, buffer, contentType: mimeType })
      : await uploadOrgMedia({ organizationId: orgId(c), bucket: env.SUPABASE_STORAGE_BUCKET_FLOW_MEDIA, filename, buffer, contentType: mimeType });
    const storagePath = "key" in uploaded ? uploaded.key : uploaded.path;
    const { data, error } = await supabase
      .from("org_media")
      .insert({
        organization_id: orgId(c),
        filename: storagePath.split("/").pop() ?? filename,
        original_name: filename,
        media_type: mediaType,
        mime_type: mimeType,
        size_bytes: bytes.byteLength,
        storage_path: storagePath,
        public_url: uploaded.publicUrl,
      })
      .select()
      .single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ ok: true, media: data }, 200);
  },
);

// DELETE /media/:id
dashboardApi.openapi(
  createRoute({
    method: "delete",
    path: "/media/{id}",
    request: {
      headers: AuthHeaderSchema,
      params: z.object({ id: z.string() }),
    },
    responses: {
      200: {
        description: "Deleted",
        content: {
          "application/json": { schema: z.object({ ok: z.boolean() }) },
        },
      },
      404: {
        description: "Not found",
        content: { "application/json": { schema: ErrorSchema } },
      },
      500: {
        description: "Error",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  }),
  async (c) => {
    if (!supabase) return c.json({ error: "Supabase no configurado" }, 500);
    const { id } = c.req.valid("param");
    const { data: row, error: fetchErr } = await supabase
      .from("org_media")
      .select("storage_path")
      .eq("id", id)
      .eq("organization_id", orgId(c))
      .maybeSingle();
    if (fetchErr) return c.json({ error: fetchErr.message }, 500);
    if (!row) return c.json({ error: "No encontrado" }, 404);
    // Delete from storage (best effort — don't block DB delete on storage error)
    try {
      if (env.STORAGE_MODE === "r2") {
        await deleteFromR2(row.storage_path);
      } else {
        await deleteFromSupabaseStorage({ bucket: env.SUPABASE_STORAGE_BUCKET_FLOW_MEDIA, path: row.storage_path });
      }
    } catch (err) {
      log.warn({ err, storagePath: row.storage_path }, "dashboard: error borrando archivo de storage, continuando con eliminación de BD");
    }
    const { error } = await supabase
      .from("org_media")
      .delete()
      .eq("id", id)
      .eq("organization_id", orgId(c));
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ ok: true }, 200);
  },
);

// DELETE /flow-step-messages/:id
dashboardApi.openapi(
  createRoute({
    method: "delete",
    path: "/flow-step-messages/{id}",
    request: {
      headers: AuthHeaderSchema,
      params: z.object({ id: z.string() }),
    },
    responses: {
      200: {
        description: "Deleted",
        content: {
          "application/json": { schema: z.object({ ok: z.boolean() }) },
        },
      },
      500: {
        description: "Error",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  }),
  async (c) => {
    if (!supabase) return c.json({ error: "Supabase no configurado" }, 500);
    const { id } = c.req.valid("param");
    const { error } = await supabase
      .from("flow_step_messages")
      .delete()
      .eq("id", id)
      .eq("organization_id", orgId(c));
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ ok: true }, 200);
  },
);
