import type { paths } from "../lib/__gen__/api_v1";

/** Contrato completo (openapi-typescript). */
export type ApiPaths = paths;

/** Respuesta JSON 200 de un método HTTP en una ruta. */
type Json200<
  Path extends keyof paths,
  Method extends keyof paths[Path],
> = paths[Path][Method] extends {
  responses: {
    200: {
      content: {
        "application/json": infer T;
      };
    };
  };
}
  ? T
  : never;

/** Cuerpo JSON de request (cuando existe). */
type JsonRequest<
  Path extends keyof paths,
  Method extends keyof paths[Path],
> = paths[Path][Method] extends {
  requestBody: { content: { "application/json": infer B } };
}
  ? B
  : paths[Path][Method] extends {
        requestBody?: { content: { "application/json": infer B } };
      }
    ? B
    : never;

type ArrayElement<T> = T extends readonly (infer E)[] ? E : never;

/** Lista JSON 200 cuando la respuesta es un arreglo en la raíz (mejor inferencia que ArrayElement<Json200>). */
type Json200ListItem<
  Path extends keyof paths,
  Method extends keyof paths[Path],
> =
  Json200<Path, Method> extends readonly (infer Item)[]
    ? Item
    : Json200<Path, Method> extends (infer Item)[]
      ? Item
      : never;

/* ——— Respuestas GET (y algunas POST) ——— */

export type TodayStats = Json200<"/api/stats/today", "get">;
export type RangePoint = ArrayElement<Json200<"/api/stats/range", "get">>;
export type ReportsResponse = Json200<"/api/stats/reports", "get">;
export type ReportsKpis = ReportsResponse["kpis"];
export type ReportsTimePoint = ArrayElement<ReportsResponse["timeseries"]>;
export type ReportsByFlowItem = ArrayElement<ReportsResponse["byFlow"]>;
export type ReportsByInstanceItem = ArrayElement<ReportsResponse["byInstance"]>;
export type ReportsFunnelItem = ArrayElement<ReportsResponse["funnel"]>;
export type ReportsTableItem = ArrayElement<ReportsResponse["table"]["items"]>;
export type ReportsQueryParams = {
  from?: string;
  to?: string;
  instanceId?: string[];
  flowId?: string[];
  granularity?: "day" | "week" | "month";
  page?: number;
  pageSize?: number;
};

export type PaginatedConversation = Json200<"/api/conversations", "get">;
export type Conversation = ArrayElement<PaginatedConversation["items"]>;

export type PaginatedChatMessage = Json200<
  "/api/conversations/{id}/messages",
  "get"
>;
export type ChatMessage = ArrayElement<PaginatedChatMessage["items"]>;

export type PaginatedPayment = Json200<"/api/payments", "get">;
export type Payment = ArrayElement<PaginatedPayment["items"]>;

export type BotConfig = Json200<"/api/config/bot", "get"> & {
  receiptPendingMessage?: string;
  receiptRejectedMessage?: string;
};

export type SessionInfo = Json200<"/api/auth/session", "get"> & {
  isPlatformAdmin?: boolean;
  organizationId?: string | null;
};

/** Respuestas /api/admin/* (añadir a OpenAPI al regenerar) */
export type AdminOrganization = {
  id: string;
  slug: string;
  name: string;
  created_at?: string | null;
};
export type AdminAllowlistEntry = {
  id: string;
  organization_id: string;
  email: string;
  role: "owner" | "admin" | "agent" | "viewer";
  created_at?: string | null;
};
export type OrganizationInfo = Json200<"/api/org/current", "get">;
export type OrganizationMember = Json200ListItem<"/api/org/members", "get">;
export type OrganizationInvite = Json200ListItem<"/api/org/invites", "get">;

export type Campaign = Json200ListItem<"/api/campaigns", "get">;
export type FlowVersion = Json200ListItem<"/api/flows", "get">;
export type FlowSimulateResult = Json200<
  "/api/legacy/flows/{id}/simulate",
  "post"
>;
export type MessageTemplate = Json200ListItem<"/api/templates", "get">;
export type Product = {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  is_active: boolean;
  system_prompt: string;
  dispatch_keywords: string;
  config: Record<string, unknown>;
  updated_at?: string | null;
};
export type WhatsAppInstance = {
  id: string;
  organization_id: string;
  provider: "meta";
  label: string;
  waba_id?: string | null;
  meta_app_id?: string | null;
  phone_number_id: string;
  display_phone_number?: string | null;
  meta_token?: string | null;
  flow_id?: string | null;
  is_active: boolean;
  updated_at?: string | null;
};
export type InstanceHealth = {
  ok: boolean;
  status: "connected" | "invalid_token" | "error";
  reason?:
    | "ok"
    | "token_expired"
    | "token_invalid"
    | "insufficient_permissions"
    | "phone_number_not_found"
    | "app_not_subscribed"
    | "rate_limited"
    | "unknown";
  errorCode?: number;
  errorSubcode?: number;
  detail?: string | null;
  meta?: {
    phone_number_id?: string;
    display_phone_number?: string | null;
    verified_name?: string | null;
  } | null;
};
export type WebhookConfig = {
  webhookUrl: string;
  verifyToken: string;
};
export type ProductReferral = {
  id: string;
  organization_id: string;
  product_id: string;
  ctwa_clid: string;
  source_id?: string | null;
  source_type?: string | null;
  source_url?: string | null;
  created_at?: string | null;
};

export type FlowMessageTypeV2 = "text" | "image" | "document" | "video";
export type FlowStepMessageV2 = {
  id: string;
  step_id: string;
  organization_id: string;
  position: number;
  message_type: FlowMessageTypeV2;
  text_content?: string | null;
  media_url?: string | null;
  filename?: string | null;
  caption?: string | null;
};
export type FlowStepV2 = {
  id: string;
  flow_id: string;
  organization_id: string;
  position: number;
  delay_seconds: number;
  label?: string | null;
  trigger_keywords?: string[];
  messages?: FlowStepMessageV2[];
};
export type FlowV2 = {
  id: string;
  organization_id: string;
  name: string;
  trigger_phrase: string;
  trigger_first_word: string;
  keywords: string[];
  no_match_behavior: "trigger" | "ignore";
  system_prompt?: string | null;
  message_overrides?: Record<string, unknown> | null;
  is_active: boolean;
  updated_at?: string | null;
  steps?: FlowStepV2[];
};
export type UpsertFlowBody = {
  id?: string;
  name: string;
  triggerPhrase: string;
  keywords?: string[];
  noMatchBehavior?: "trigger" | "ignore";
  systemPrompt?: string | null;
  messageOverrides?: Record<string, string>;
  isActive?: boolean;
  steps: Array<{
    id?: string;
    position: number;
    delaySeconds: number;
    label?: string;
    messages: Array<{
      id?: string;
      position: number;
      messageType: FlowMessageTypeV2;
      textContent?: string | null;
      mediaUrl?: string | null;
      filename?: string | null;
      caption?: string | null;
    }>;
  }>;
};
export type FlowReferral = {
  id: string;
  organization_id: string;
  flow_id: string;
  ctwa_clid: string;
  source_id?: string | null;
  source_type?: string | null;
  source_url?: string | null;
  created_at?: string | null;
};
export type CreateFlowReferralBody = {
  flowId: string;
  ctwaClid: string;
  sourceId?: string;
  sourceType?: string;
  sourceUrl?: string;
};

export type UploadSendResponse = Json200<
  "/api/conversations/{id}/upload",
  "post"
>;
export type FlowMediaUploadResponse = {
  ok: boolean;
  url: string;
  path: string;
  bucket: string;
  filename: string;
  mimeType: string;
};
export type SendMessageResponse = Json200<
  "/api/conversations/{id}/messages",
  "post"
>;
export type UpdateBotConfigResponse = Json200<"/api/config/bot", "put">;

/** Paginado genérico alineado con el backend. */
export type Paginated<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
};

/* ——— Cuerpos de petición (mutations) ——— */

export type CreateInviteBody = JsonRequest<"/api/org/invites", "post">;
export type CreateCampaignBody = JsonRequest<"/api/campaigns", "post"> & {
  productId?: string;
};
export type UpdateCampaignBody = JsonRequest<"/api/campaigns/{id}", "put"> & {
  productId?: string | null;
};
export type CreateFlowBody = Omit<
  JsonRequest<"/api/flows", "post">,
  "campaignId"
> & {
  campaignId?: string;
  productId?: string;
};
export type SimulateFlowBody = JsonRequest<
  "/api/legacy/flows/{id}/simulate",
  "post"
>;
export type CreateTemplateBody = JsonRequest<"/api/templates", "post"> & {
  productId?: string;
};
export type SendConversationMessageBody = JsonRequest<
  "/api/conversations/{id}/messages",
  "post"
>;
export type UpdateBotConfigBody = JsonRequest<"/api/config/bot", "put"> & {
  receiptPendingMessage?: string;
  receiptRejectedMessage?: string;
};
export type CreateProductBody = {
  name: string;
  slug: string;
  systemPrompt?: string;
  dispatchKeywords?: string;
  isActive?: boolean;
};
export type UpdateProductBody = Partial<CreateProductBody>;
export type CreateInstanceBody = {
  label: string;
  phoneNumberId: string;
  metaToken?: string;
  wabaId?: string;
  metaAppId?: string;
  displayPhoneNumber?: string;
  isActive?: boolean;
};
export type UpdateInstanceBody = Partial<CreateInstanceBody> & {
  metaToken?: string | null;
};
export type CreateProductReferralBody = {
  productId: string;
  ctwaClid: string;
  sourceId?: string;
  sourceType?: string;
  sourceUrl?: string;
};

export type OrgRole = SessionInfo["role"];

// ── Flow engine types (not in generated OpenAPI yet) ──────────────────────

export type FlowMessageType = "text" | "image" | "document" | "video";
export type FlowDefinitionType = "keyword" | "sequential";

export type FlowStepMessage = {
  id: string;
  step_id: string;
  organization_id: string;
  position: number;
  message_type: FlowMessageType;
  text_content?: string | null;
  media_url?: string | null;
  filename?: string | null;
  caption?: string | null;
  created_at?: string | null;
};

export type FlowStep = {
  id: string;
  flow_id: string;
  organization_id: string;
  position: number;
  delay_seconds: number;
  trigger_keywords: string[];
  label?: string | null;
  updated_at?: string | null;
  messages: FlowStepMessage[];
};

export type FlowDefinition = {
  id: string;
  organization_id: string;
  product_id?: string | null;
  name: string;
  flow_type: FlowDefinitionType;
  is_active: boolean;
  created_at?: string | null;
  updated_at?: string | null;
  steps: FlowStep[];
};

export type BotHealth = {
  status: "active" | "no_instance" | "no_product" | "error";
  lastActivity: string | null;
  messageCount24h: number;
  detail: string | null;
};

// Mutation body types
export type CreateFlowDefinitionBody = {
  name: string;
  flowType: FlowDefinitionType;
  productId?: string;
  isActive?: boolean;
};

export type UpdateFlowDefinitionBody = {
  name?: string;
  isActive?: boolean;
  productId?: string | null;
};

export type CreateFlowStepBody = {
  flowId: string;
  label?: string;
  position?: number;
  delaySeconds?: number;
  triggerKeywords?: string[];
};

export type UpdateFlowStepBody = {
  label?: string | null;
  position?: number;
  delaySeconds?: number;
  triggerKeywords?: string[];
};

export type CreateFlowStepMessageBody = {
  stepId: string;
  position?: number;
  messageType?: FlowMessageType;
  textContent?: string | null;
  mediaUrl?: string | null;
  filename?: string | null;
  caption?: string | null;
};

export type UpdateFlowStepMessageBody = Partial<
  Omit<CreateFlowStepMessageBody, "stepId">
>;

// ── Ad Referral Stats ─────────────────────────────────────────────────────

export type AdReferralItem = {
  sourceId: string | null;
  headline: string | null;
  clicks: number;
  uniqueLeads: number;
  conversions: number;
  revenue: number;
  conversionRate: number;
};

export type AdReferralStats = {
  items: AdReferralItem[];
  totals: {
    clicks: number;
    uniqueLeads: number;
    conversions: number;
    revenue: number;
    conversionRate: number;
  };
};

export type AdReferralQueryParams = {
  from?: string;
  to?: string;
  flowId?: string[];
};
