import type {
  AdReferralQueryParams,
  AdReferralStats,
  BotConfig,
  BotHealth,
  Campaign,
  ChatMessage,
  Conversation,
  ConversationFilters,
  CreateCampaignBody,
  OrgMedia,
  OrgMediaUploadResponse,
  CreateFlowBody,
  CreateFlowDefinitionBody,
  CreateFlowStepBody,
  CreateFlowStepMessageBody,
  CreateInviteBody,
  CreateTemplateBody,
  CreateProductBody,
  UpdateProductBody,
  FlowDefinition,
  Product,
  WhatsAppInstance,
  CreateInstanceBody,
  UpdateInstanceBody,
  DiscoverInstancesBody,
  DiscoverInstancesResponse,
  ProductReferral,
  CreateProductReferralBody,
  FlowV2,
  UpsertFlowBody,
  FlowReferral,
  CreateFlowReferralBody,
  InstanceHealth,
  WebhookConfig,
  FlowSimulateResult,
  FlowVersion,
  FlowMediaUploadResponse,
  MessageTemplate,
  FlowTemplate,
  CreateFlowTemplateBody,
  Organization,
  OrganizationInfo,
  OrganizationInvite,
  Paginated,
  Payment,
  RangePoint,
  ReportsQueryParams,
  ReportsResponse,
  SendConversationMessageBody,
  SendMessageResponse,
  SessionInfo,
  AdminOrganization,
  AdminAllowlistEntry,
  TodayStats,
  UpdateBotConfigBody,
  UpdateBotConfigResponse,
  UpdateCampaignBody,
  UpdateFlowDefinitionBody,
  UpdateFlowStepBody,
  UpdateFlowStepMessageBody,
  UploadSendResponse,
} from "../types/api";
import { supabase } from "./supabase";

/** Error tipado para respuestas fallidas del API. Permite distinguir 4xx de 5xx en los componentes. */
export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

/** Parsea el body de una respuesta fallida y lanza ApiError con el mensaje del servidor. */
async function throwApiError(res: Response): Promise<never> {
  let message = `Error ${res.status}`;
  let code: string | undefined;
  try {
    const body = (await res.json()) as {
      error?: string;
      message?: string;
      code?: string;
    };
    message = body.error ?? body.message ?? message;
    code = body.code;
  } catch {
    /* body no es JSON — usar mensaje genérico */
  }
  throw new ApiError(res.status, message, code);
}

const API_URL = import.meta.env.VITE_API_URL;
const DASHBOARD_TOKEN = import.meta.env.VITE_DASHBOARD_TOKEN;

/** Clave en localStorage para enviar X-Organization-Id (admins de plataforma y contexto multi-org). */
export const ACTIVE_ORG_STORAGE_KEY = "active_organization_id";

export function getActiveOrgId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_ORG_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setActiveOrgId(id: string | null): void {
  try {
    if (id) localStorage.setItem(ACTIVE_ORG_STORAGE_KEY, id);
    else localStorage.removeItem(ACTIVE_ORG_STORAGE_KEY);
  } catch {
    /* ignore quota / private mode */
  }
}

const REQUEST_TIMEOUT_MS = 20_000;

/** Supabase getSession with a hard timeout to avoid hanging all requests. */
async function getSessionWithTimeout() {
  if (!supabase) return null;
  return Promise.race([
    supabase.auth.getSession(),
    new Promise<null>((_, reject) =>
      setTimeout(() => reject(new Error("getSession timeout")), 5_000)
    ),
  ]);
}

async function buildHeaders(
  contentType = true
): Promise<Record<string, string>> {
  let accessToken: string | undefined;
  try {
    const result = await getSessionWithTimeout();
    accessToken =
      (
        result as {
          data?: { session?: { access_token?: string } | null };
        } | null
      )?.data?.session?.access_token ?? undefined;
  } catch {
    // session timed out or errored — fall back to dashboard token
  }
  const orgId = getActiveOrgId();
  return {
    Authorization: `Bearer ${accessToken ?? DASHBOARD_TOKEN}`,
    ...(contentType ? { "Content-Type": "application/json" } : {}),
    ...(orgId ? { "X-Organization-Id": orgId } : {}),
  };
}

async function request<T>(path: string): Promise<T> {
  const headers = await buildHeaders(true);
  const res = await fetch(`${API_URL}${path}`, {
    headers,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) await throwApiError(res);
  return (await res.json()) as T;
}

/** Carga sesión y asegura org activa en localStorage (necesario para admins de plataforma). */
async function fetchSessionResolved(): Promise<SessionInfo> {
  let info = await request<SessionInfo>("/api/auth/session");
  if (info.organizationId) {
    setActiveOrgId(info.organizationId);
    return info;
  }
  if (info.isPlatformAdmin) {
    const orgs = await request<AdminOrganization[]>("/api/admin/organizations");
    const existing = getActiveOrgId();
    const stillValid = Boolean(existing && orgs.some((o) => o.id === existing));
    if (!stillValid && orgs.length > 0) {
      setActiveOrgId(orgs[0].id);
    }
    if (getActiveOrgId()) {
      info = await request<SessionInfo>("/api/auth/session");
    }
  }
  return info;
}

export const api = {
  getTodayStats: () => request<TodayStats>("/api/stats/today"),
  getRangeStats: (from?: string, to?: string) => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    return request<RangePoint[]>(`/api/stats/range?${params.toString()}`);
  },
  getReports: (params: ReportsQueryParams) => {
    const q = new URLSearchParams();
    if (params.from) q.set("from", params.from);
    if (params.to) q.set("to", params.to);
    if (params.instanceId && params.instanceId.length > 0)
      q.set("instanceId", params.instanceId.join(","));
    if (params.flowId && params.flowId.length > 0)
      q.set("flowId", params.flowId.join(","));
    if (params.granularity) q.set("granularity", params.granularity);
    if (params.page) q.set("page", String(params.page));
    if (params.pageSize) q.set("pageSize", String(params.pageSize));
    return request<ReportsResponse>(`/api/stats/reports?${q.toString()}`);
  },
  getConversationFilters: () =>
    request<ConversationFilters>("/api/conversations/filters"),
  getConversations: (params?: {
    state?: string;
    search?: string;
    fromAd?: boolean;
    adSourceId?: string;
    flowId?: string;
    page?: number;
    pageSize?: number;
    sortBy?: string;
    sortDir?: "asc" | "desc";
  }) => {
    const q = new URLSearchParams();
    if (params?.state) q.set("state", params.state);
    if (params?.search) q.set("search", params.search);
    if (params?.fromAd) q.set("fromAd", "true");
    if (params?.adSourceId) q.set("adSourceId", params.adSourceId);
    if (params?.flowId) q.set("flowId", params.flowId);
    if (params?.page) q.set("page", String(params.page));
    if (params?.pageSize) q.set("pageSize", String(params.pageSize));
    if (params?.sortBy) q.set("sortBy", params.sortBy);
    if (params?.sortDir) q.set("sortDir", params.sortDir);
    return request<Paginated<Conversation>>(
      `/api/conversations?${q.toString()}`
    );
  },
  getConversationById: (id: string) =>
    request<Conversation>(`/api/conversations/${id}`),
  getConversationMessages: (
    id: string,
    page = 1,
    pageSize = 30,
    sortDesc = false
  ) =>
    request<Paginated<ChatMessage>>(
      `/api/conversations/${id}/messages?page=${page}&pageSize=${pageSize}&sortDesc=${sortDesc}`
    ),
  updateConversationStage: (id: string, stage: string) =>
    buildHeaders(true).then((headers) =>
      fetch(`${API_URL}/api/conversations/${id}/stage`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ stage }),
      }).then((r) => {
        if (!r.ok) return throwApiError(r);
        return r.json() as Promise<{ ok: boolean }>;
      })
    ),
  sendConversationMessage: (id: string, payload: SendConversationMessageBody) =>
    buildHeaders(true).then((headers) =>
      fetch(`${API_URL}/api/conversations/${id}/messages`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      }).then((r) => {
        if (!r.ok) return throwApiError(r);
        return r.json() as Promise<SendMessageResponse>;
      })
    ),
  uploadAndSendFile: async (
    id: string,
    payload: { kind: "image" | "document"; caption?: string; file: File }
  ) => {
    const form = new FormData();
    form.append("kind", payload.kind);
    if (payload.caption) form.append("caption", payload.caption);
    form.append("file", payload.file, payload.file.name);
    const headers = await buildHeaders(false);
    const res = await fetch(`${API_URL}/api/conversations/${id}/upload`, {
      method: "POST",
      headers,
      body: form,
    });
    if (!res.ok) throw new Error(`API ${res.status}`);
    return (await res.json()) as UploadSendResponse;
  },
  uploadFlowMedia: async (file: File) => {
    const form = new FormData();
    form.append("file", file, file.name);
    const headers = await buildHeaders(false);
    const res = await fetch(`${API_URL}/api/files/upload`, {
      method: "POST",
      headers,
      body: form,
    });
    if (!res.ok) throw new Error(`API ${res.status}`);
    return (await res.json()) as FlowMediaUploadResponse;
  },
  sendMediaFromLibrary: (
    id: string,
    payload: { url: string; filename: string; mimeType: string }
  ) =>
    buildHeaders(true).then((headers) =>
      fetch(`${API_URL}/api/conversations/${id}/send-media`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      }).then((r) => {
        if (!r.ok) return throwApiError(r);
        return r.json() as Promise<SendMessageResponse>;
      })
    ),
  getPayments: (params?: {
    page?: number;
    pageSize?: number;
    sortBy?: string;
    sortDir?: "asc" | "desc";
    state?: string;
    flowId?: string;
    instanceId?: string;
    from?: string;
    to?: string;
    phone?: string;
  }) => {
    const q = new URLSearchParams();
    if (params?.page) q.set("page", String(params.page));
    if (params?.pageSize) q.set("pageSize", String(params.pageSize));
    if (params?.sortBy) q.set("sortBy", params.sortBy);
    if (params?.sortDir) q.set("sortDir", params.sortDir);
    if (params?.state) q.set("state", params.state);
    if (params?.flowId) q.set("flowId", params.flowId);
    if (params?.instanceId) q.set("instanceId", params.instanceId);
    if (params?.from) q.set("from", params.from);
    if (params?.to) q.set("to", params.to);
    if (params?.phone) q.set("phone", params.phone);
    return request<Paginated<Payment>>(`/api/payments?${q.toString()}`);
  },
  updatePaymentState: (id: string, state: string) =>
    buildHeaders(true).then((headers) =>
      fetch(`${API_URL}/api/payments/${id}/state`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ state }),
      }).then((r) => {
        if (!r.ok) return throwApiError(r);
        return r.json() as Promise<{ ok: boolean }>;
      })
    ),
  getBotConfig: () => request<BotConfig>("/api/config/bot"),
  updateBotConfig: (payload: UpdateBotConfigBody) =>
    buildHeaders(true).then((headers) =>
      fetch(`${API_URL}/api/config/bot`, {
        method: "PUT",
        headers,
        body: JSON.stringify(payload),
      }).then((r) => {
        if (!r.ok) return throwApiError(r);
        return r.json() as Promise<UpdateBotConfigResponse>;
      })
    ),
  validateAiProvider: (payload: {
    provider: "openai" | "gemini" | "anthropic" | "groq";
    apiKey: string;
    model: string;
  }) =>
    buildHeaders(true).then((headers) =>
      fetch(`${API_URL}/api/config/bot/validate-ai`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      }).then((r) => {
        if (!r.ok) return throwApiError(r);
        return r.json() as Promise<{ ok: boolean; error?: string }>;
      })
    ),
  getFlowTemplates: () => request<FlowTemplate[]>("/api/flow-templates"),
  createFlowTemplate: (payload: CreateFlowTemplateBody) =>
    buildHeaders(true).then((headers) =>
      fetch(`${API_URL}/api/flow-templates`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      }).then((r) => {
        if (!r.ok) return throwApiError(r);
        return r.json() as Promise<FlowTemplate>;
      })
    ),
  deleteFlowTemplate: (id: string) =>
    buildHeaders(true).then((headers) =>
      fetch(`${API_URL}/api/flow-templates/${id}`, {
        method: "DELETE",
        headers,
      }).then((r) => {
        if (!r.ok) return throwApiError(r);
        return r.json() as Promise<{ ok: boolean }>;
      })
    ),
  getSession: () => fetchSessionResolved(),
  getCurrentOrganization: () => request<OrganizationInfo>("/api/org/current"),
  updateOrganization: (payload: { name: string }) =>
    buildHeaders(true).then((headers) =>
      fetch(`${API_URL}/api/org/current`, {
        method: "PUT",
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      }).then((r) => {
        if (!r.ok) return throwApiError(r);
        return r.json() as Promise<Organization>;
      })
    ),
  getInvites: () => request<OrganizationInvite[]>("/api/org/invites"),
  createInvite: (payload: CreateInviteBody) =>
    buildHeaders(true).then((headers) =>
      fetch(`${API_URL}/api/org/invites`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      }).then((r) => {
        if (!r.ok) return throwApiError(r);
        return r.json() as Promise<OrganizationInvite>;
      })
    ),
  resendInvite: (id: string) =>
    buildHeaders(true).then((headers) =>
      fetch(`${API_URL}/api/org/invites/${id}/resend`, {
        method: "POST",
        headers,
      }).then((r) => {
        if (!r.ok) return throwApiError(r);
        return r.json() as Promise<{ ok: boolean }>;
      })
    ),
  getCampaigns: () => request<Campaign[]>("/api/campaigns"),
  createCampaign: (payload: CreateCampaignBody) =>
    buildHeaders(true).then((headers) =>
      fetch(`${API_URL}/api/campaigns`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      }).then((r) => {
        if (!r.ok) return throwApiError(r);
        return r.json() as Promise<Campaign>;
      })
    ),
  updateCampaign: (id: string, payload: UpdateCampaignBody) =>
    buildHeaders(true).then((headers) =>
      fetch(`${API_URL}/api/campaigns/${id}`, {
        method: "PUT",
        headers,
        body: JSON.stringify(payload),
      }).then((r) => {
        if (!r.ok) return throwApiError(r);
        return r.json() as Promise<Campaign>;
      })
    ),
  getFlowsV2: () => request<FlowV2[]>("/api/flows"),
  getFlowV2: (id: string) => request<FlowV2>(`/api/flows/${id}`),
  upsertFlowV2: (payload: UpsertFlowBody) =>
    buildHeaders(true).then((headers) =>
      fetch(`${API_URL}/api/flows/upsert`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      }).then((r) => {
        if (!r.ok) return throwApiError(r);
        return r.json() as Promise<FlowV2>;
      })
    ),
  deleteFlowV2: (id: string) =>
    buildHeaders(true).then((headers) =>
      fetch(`${API_URL}/api/flows/${id}`, {
        method: "DELETE",
        headers,
      }).then((r) => {
        if (!r.ok) return throwApiError(r);
        return r.json() as Promise<{ ok: boolean }>;
      })
    ),
  assignFlowToInstance: (instanceId: string, flowId: string | null) =>
    buildHeaders(true).then((headers) =>
      fetch(`${API_URL}/api/instances/${instanceId}/flow`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ flowId }),
      }).then((r) => {
        if (!r.ok) return throwApiError(r);
        return r.json() as Promise<{ ok: boolean }>;
      })
    ),
  getFlows: (params: { campaignId?: string; productId?: string }) => {
    const q = new URLSearchParams();
    if (params.campaignId) q.set("campaignId", params.campaignId);
    if (params.productId) q.set("productId", params.productId);
    return request<FlowVersion[]>(`/api/flows?${q.toString()}`);
  },
  createFlow: (payload: CreateFlowBody) =>
    buildHeaders(true).then((headers) =>
      fetch(`${API_URL}/api/flows`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      }).then((r) => {
        if (!r.ok) return throwApiError(r);
        return r.json() as Promise<FlowVersion>;
      })
    ),
  simulateFlow: (id: string, text?: string) =>
    buildHeaders(true).then((headers) =>
      fetch(`${API_URL}/api/flows/${id}/simulate`, {
        method: "POST",
        headers,
        body: JSON.stringify({ text }),
      }).then((r) => {
        if (!r.ok) return throwApiError(r);
        return r.json() as Promise<FlowSimulateResult>;
      })
    ),
  publishFlow: (id: string) =>
    buildHeaders(true).then((headers) =>
      fetch(`${API_URL}/api/flows/${id}/publish`, {
        method: "POST",
        headers,
      }).then((r) => {
        if (!r.ok) return throwApiError(r);
        return r.json() as Promise<FlowVersion>;
      })
    ),
  getTemplates: (params?: { campaignId?: string; productId?: string }) => {
    const q = new URLSearchParams();
    if (params?.campaignId) q.set("campaignId", params.campaignId);
    if (params?.productId) q.set("productId", params.productId);
    return request<MessageTemplate[]>(`/api/templates?${q.toString()}`);
  },
  createTemplate: (payload: CreateTemplateBody) =>
    buildHeaders(true).then((headers) =>
      fetch(`${API_URL}/api/templates`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      }).then((r) => {
        if (!r.ok) return throwApiError(r);
        return r.json() as Promise<MessageTemplate>;
      })
    ),
  getProducts: () => request<Product[]>("/api/products"),
  createProduct: (payload: CreateProductBody) =>
    buildHeaders(true).then((headers) =>
      fetch(`${API_URL}/api/products`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      }).then((r) => {
        if (!r.ok) return throwApiError(r);
        return r.json() as Promise<Product>;
      })
    ),
  updateProduct: (id: string, payload: UpdateProductBody) =>
    buildHeaders(true).then((headers) =>
      fetch(`${API_URL}/api/products/${id}`, {
        method: "PUT",
        headers,
        body: JSON.stringify(payload),
      }).then((r) => {
        if (!r.ok) return throwApiError(r);
        return r.json() as Promise<Product>;
      })
    ),
  getInstances: () => request<WhatsAppInstance[]>("/api/instances"),
  createInstance: (payload: CreateInstanceBody) =>
    buildHeaders(true).then((headers) =>
      fetch(`${API_URL}/api/instances`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      }).then((r) => {
        if (!r.ok) return throwApiError(r);
        return r.json() as Promise<WhatsAppInstance>;
      })
    ),
  updateInstance: (id: string, payload: UpdateInstanceBody) =>
    buildHeaders(true).then((headers) =>
      fetch(`${API_URL}/api/instances/${id}`, {
        method: "PUT",
        headers,
        body: JSON.stringify(payload),
      }).then((r) => {
        if (!r.ok) return throwApiError(r);
        return r.json() as Promise<WhatsAppInstance>;
      })
    ),
  getInstancesWebhookConfig: () =>
    request<WebhookConfig>("/api/instances/webhook-config"),
  testInstanceHealth: (id: string) =>
    request<InstanceHealth>(`/api/instances/${id}/health`),
  deleteInstance: (id: string) =>
    buildHeaders(true).then((headers) =>
      fetch(`${API_URL}/api/instances/${id}`, { method: "DELETE", headers }).then((r) => {
        if (!r.ok) return throwApiError(r);
        return r.json() as Promise<{ ok: boolean }>;
      })
    ),
  /** Descubre números de WhatsApp disponibles a partir de un token de Meta.
   *  El token se usa solo para consultar la API de Meta y NO se almacena aquí. */
  discoverInstances: (payload: DiscoverInstancesBody) =>
    buildHeaders(true).then((headers) =>
      fetch(`${API_URL}/api/instances/discover`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      }).then((r) => {
        if (!r.ok) return throwApiError(r);
        return r.json() as Promise<DiscoverInstancesResponse>;
      })
    ),
  getProductReferrals: () =>
    request<ProductReferral[]>("/api/product-referrals"),
  getFlowReferrals: () => request<FlowReferral[]>("/api/flow-referrals"),
  createProductReferral: (payload: CreateProductReferralBody) =>
    buildHeaders(true).then((headers) =>
      fetch(`${API_URL}/api/product-referrals`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      }).then((r) => {
        if (!r.ok) return throwApiError(r);
        return r.json() as Promise<ProductReferral>;
      })
    ),
  createFlowReferral: (payload: CreateFlowReferralBody) =>
    buildHeaders(true).then((headers) =>
      fetch(`${API_URL}/api/flow-referrals`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      }).then((r) => {
        if (!r.ok) return throwApiError(r);
        return r.json() as Promise<FlowReferral>;
      })
    ),
  getAdminOrganizations: () =>
    request<AdminOrganization[]>("/api/admin/organizations"),
  createAdminOrganization: (payload: { name: string; slug: string }) =>
    buildHeaders(true).then((headers) =>
      fetch(`${API_URL}/api/admin/organizations`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      }).then((r) => {
        if (!r.ok) return throwApiError(r);
        return r.json() as Promise<AdminOrganization>;
      })
    ),
  updateAdminOrganization: (
    id: string,
    payload: { name?: string; slug?: string }
  ) =>
    buildHeaders(true).then((headers) =>
      fetch(`${API_URL}/api/admin/organizations/${id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify(payload),
      }).then((r) => {
        if (!r.ok) return throwApiError(r);
        return r.json() as Promise<AdminOrganization>;
      })
    ),
  getAdminAllowlist: (orgId: string) =>
    request<AdminAllowlistEntry[]>(
      `/api/admin/organizations/${orgId}/allowlist`
    ),
  addAdminAllowlist: (
    orgId: string,
    payload: { email: string; role?: "owner" | "admin" | "agent" | "viewer" }
  ) =>
    buildHeaders(true).then((headers) =>
      fetch(`${API_URL}/api/admin/organizations/${orgId}/allowlist`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      }).then((r) => {
        if (!r.ok) return throwApiError(r);
        return r.json() as Promise<AdminAllowlistEntry>;
      })
    ),
  deleteAdminAllowlist: (id: string) =>
    buildHeaders(true).then((headers) =>
      fetch(`${API_URL}/api/admin/allowlist/${id}`, {
        method: "DELETE",
        headers,
      }).then((r) => {
        if (!r.ok) return throwApiError(r);
        return r.json() as Promise<{ ok: boolean }>;
      })
    ),

  getAdReferrals: (params?: AdReferralQueryParams) => {
    const q = new URLSearchParams();
    if (params?.from) q.set("from", params.from);
    if (params?.to) q.set("to", params.to);
    if (params?.flowId && params.flowId.length > 0)
      q.set("flowId", params.flowId.join(","));
    return request<AdReferralStats>(`/api/stats/ad-referrals?${q.toString()}`);
  },

  // ── Bot health ───────────────────────────────────────────────────────────
  getBotHealth: () => request<BotHealth>("/api/bot/health"),

  // ── Media library ────────────────────────────────────────────────────────
  getOrgMedia: (params?: {
    mediaType?: "image" | "video" | "document";
    page?: number;
    pageSize?: number;
  }) => {
    const q = new URLSearchParams();
    if (params?.mediaType) q.set("mediaType", params.mediaType);
    if (params?.page) q.set("page", String(params.page));
    if (params?.pageSize) q.set("pageSize", String(params.pageSize));
    return request<Paginated<OrgMedia>>(`/api/media?${q.toString()}`);
  },
  uploadOrgMedia: async (file: File) => {
    const form = new FormData();
    form.append("file", file, file.name);
    const headers = await buildHeaders(false);
    const res = await fetch(`${API_URL}/api/media/upload`, {
      method: "POST",
      headers,
      body: form,
    });
    if (!res.ok) throw new Error(`API ${res.status}`);
    return (await res.json()) as OrgMediaUploadResponse;
  },
  deleteOrgMedia: (id: string) =>
    buildHeaders(true).then((headers) =>
      fetch(`${API_URL}/api/media/${id}`, { method: "DELETE", headers }).then(
        (r) => {
          if (!r.ok) return throwApiError(r);
          return r.json() as Promise<{ ok: boolean }>;
        }
      )
    ),

  // ── Flow definitions ─────────────────────────────────────────────────────
  getFlowDefinitions: (params?: { productId?: string }) => {
    const q = new URLSearchParams();
    if (params?.productId) q.set("productId", params.productId);
    return request<FlowDefinition[]>(`/api/flow-definitions?${q.toString()}`);
  },
  createFlowDefinition: (payload: CreateFlowDefinitionBody) =>
    buildHeaders(true).then((headers) =>
      fetch(`${API_URL}/api/flow-definitions`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      }).then((r) => {
        if (!r.ok) return throwApiError(r);
        return r.json() as Promise<FlowDefinition>;
      })
    ),
  updateFlowDefinition: (id: string, payload: UpdateFlowDefinitionBody) =>
    buildHeaders(true).then((headers) =>
      fetch(`${API_URL}/api/flow-definitions/${id}`, {
        method: "PUT",
        headers,
        body: JSON.stringify(payload),
      }).then((r) => {
        if (!r.ok) return throwApiError(r);
        return r.json() as Promise<FlowDefinition>;
      })
    ),
  deleteFlowDefinition: (id: string) =>
    buildHeaders(true).then((headers) =>
      fetch(`${API_URL}/api/flow-definitions/${id}`, {
        method: "DELETE",
        headers,
      }).then((r) => {
        if (!r.ok) return throwApiError(r);
        return r.json() as Promise<{ ok: boolean }>;
      })
    ),

  // ── Flow steps ───────────────────────────────────────────────────────────
  createFlowStep: (payload: CreateFlowStepBody) =>
    buildHeaders(true).then((headers) =>
      fetch(`${API_URL}/api/flow-steps`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      }).then((r) => {
        if (!r.ok) return throwApiError(r);
        return r.json();
      })
    ),
  updateFlowStep: (id: string, payload: UpdateFlowStepBody) =>
    buildHeaders(true).then((headers) =>
      fetch(`${API_URL}/api/flow-steps/${id}`, {
        method: "PUT",
        headers,
        body: JSON.stringify(payload),
      }).then((r) => {
        if (!r.ok) return throwApiError(r);
        return r.json();
      })
    ),
  deleteFlowStep: (id: string) =>
    buildHeaders(true).then((headers) =>
      fetch(`${API_URL}/api/flow-steps/${id}`, {
        method: "DELETE",
        headers,
      }).then((r) => {
        if (!r.ok) return throwApiError(r);
        return r.json() as Promise<{ ok: boolean }>;
      })
    ),

  // ── Flow step messages ───────────────────────────────────────────────────
  createFlowStepMessage: (payload: CreateFlowStepMessageBody) =>
    buildHeaders(true).then((headers) =>
      fetch(`${API_URL}/api/flow-step-messages`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      }).then((r) => {
        if (!r.ok) return throwApiError(r);
        return r.json();
      })
    ),
  updateFlowStepMessage: (id: string, payload: UpdateFlowStepMessageBody) =>
    buildHeaders(true).then((headers) =>
      fetch(`${API_URL}/api/flow-step-messages/${id}`, {
        method: "PUT",
        headers,
        body: JSON.stringify(payload),
      }).then((r) => {
        if (!r.ok) return throwApiError(r);
        return r.json();
      })
    ),
  deleteFlowStepMessage: (id: string) =>
    buildHeaders(true).then((headers) =>
      fetch(`${API_URL}/api/flow-step-messages/${id}`, {
        method: "DELETE",
        headers,
      }).then((r) => {
        if (!r.ok) return throwApiError(r);
        return r.json() as Promise<{ ok: boolean }>;
      })
    ),
};
