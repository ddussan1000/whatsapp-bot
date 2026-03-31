import type {
  BotConfig,
  BotHealth,
  Campaign,
  ChatMessage,
  Conversation,
  CreateCampaignBody,
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

const API_URL = import.meta.env.VITE_API_URL;
const DASHBOARD_TOKEN = import.meta.env.VITE_DASHBOARD_TOKEN;
const ACTIVE_ORG_KEY = "active_organization_id";

async function buildHeaders(
  contentType = true
): Promise<Record<string, string>> {
  const session = await supabase?.auth.getSession();
  const accessToken = session?.data.session?.access_token;
  const orgId = localStorage.getItem(ACTIVE_ORG_KEY);
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
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return (await res.json()) as T;
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
  getConversations: (params?: {
    state?: string;
    search?: string;
    page?: number;
    pageSize?: number;
    sortBy?: string;
    sortDir?: "asc" | "desc";
  }) => {
    const q = new URLSearchParams();
    if (params?.state) q.set("state", params.state);
    if (params?.search) q.set("search", params.search);
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
  getConversationMessages: (id: string, page = 1, pageSize = 30) =>
    request<Paginated<ChatMessage>>(
      `/api/conversations/${id}/messages?page=${page}&pageSize=${pageSize}`
    ),
  sendConversationMessage: (id: string, payload: SendConversationMessageBody) =>
    buildHeaders(true).then((headers) =>
      fetch(`${API_URL}/api/conversations/${id}/messages`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      }).then((r) => {
        if (!r.ok) throw new Error(`API ${r.status}`);
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
  getPayments: (params?: {
    page?: number;
    pageSize?: number;
    sortBy?: string;
    sortDir?: "asc" | "desc";
  }) => {
    const q = new URLSearchParams();
    if (params?.page) q.set("page", String(params.page));
    if (params?.pageSize) q.set("pageSize", String(params.pageSize));
    if (params?.sortBy) q.set("sortBy", params.sortBy);
    if (params?.sortDir) q.set("sortDir", params.sortDir);
    return request<Paginated<Payment>>(`/api/payments?${q.toString()}`);
  },
  getBotConfig: () => request<BotConfig>("/api/config/bot"),
  updateBotConfig: (payload: UpdateBotConfigBody) =>
    buildHeaders(true).then((headers) =>
      fetch(`${API_URL}/api/config/bot`, {
        method: "PUT",
        headers,
        body: JSON.stringify(payload),
      }).then((r) => {
        if (!r.ok) throw new Error(`API ${r.status}`);
        return r.json() as Promise<UpdateBotConfigResponse>;
      })
    ),
  getSession: () => request<SessionInfo>("/api/auth/session"),
  getCurrentOrganization: () => request<OrganizationInfo>("/api/org/current"),
  getInvites: () => request<OrganizationInvite[]>("/api/org/invites"),
  createInvite: (payload: CreateInviteBody) =>
    buildHeaders(true).then((headers) =>
      fetch(`${API_URL}/api/org/invites`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      }).then((r) => {
        if (!r.ok) throw new Error(`API ${r.status}`);
        return r.json() as Promise<OrganizationInvite>;
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
        if (!r.ok) throw new Error(`API ${r.status}`);
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
        if (!r.ok) throw new Error(`API ${r.status}`);
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
        if (!r.ok) throw new Error(`API ${r.status}`);
        return r.json() as Promise<FlowV2>;
      })
    ),
  deleteFlowV2: (id: string) =>
    buildHeaders(true).then((headers) =>
      fetch(`${API_URL}/api/flows/${id}`, {
        method: "DELETE",
        headers,
      }).then((r) => {
        if (!r.ok) throw new Error(`API ${r.status}`);
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
        if (!r.ok) throw new Error(`API ${r.status}`);
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
        if (!r.ok) throw new Error(`API ${r.status}`);
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
        if (!r.ok) throw new Error(`API ${r.status}`);
        return r.json() as Promise<FlowSimulateResult>;
      })
    ),
  publishFlow: (id: string) =>
    buildHeaders(true).then((headers) =>
      fetch(`${API_URL}/api/flows/${id}/publish`, {
        method: "POST",
        headers,
      }).then((r) => {
        if (!r.ok) throw new Error(`API ${r.status}`);
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
        if (!r.ok) throw new Error(`API ${r.status}`);
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
        if (!r.ok) throw new Error(`API ${r.status}`);
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
        if (!r.ok) throw new Error(`API ${r.status}`);
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
        if (!r.ok) throw new Error(`API ${r.status}`);
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
        if (!r.ok) throw new Error(`API ${r.status}`);
        return r.json() as Promise<WhatsAppInstance>;
      })
    ),
  getInstancesWebhookConfig: () =>
    request<WebhookConfig>("/api/instances/webhook-config"),
  testInstanceHealth: (id: string) =>
    request<InstanceHealth>(`/api/instances/${id}/health`),
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
        if (!r.ok) throw new Error(`API ${r.status}`);
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
        if (!r.ok) throw new Error(`API ${r.status}`);
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
        if (!r.ok) throw new Error(`API ${r.status}`);
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
        if (!r.ok) throw new Error(`API ${r.status}`);
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
        if (!r.ok) throw new Error(`API ${r.status}`);
        return r.json() as Promise<AdminAllowlistEntry>;
      })
    ),
  deleteAdminAllowlist: (id: string) =>
    buildHeaders(true).then((headers) =>
      fetch(`${API_URL}/api/admin/allowlist/${id}`, {
        method: "DELETE",
        headers,
      }).then((r) => {
        if (!r.ok) throw new Error(`API ${r.status}`);
        return r.json() as Promise<{ ok: boolean }>;
      })
    ),

  // ── Bot health ───────────────────────────────────────────────────────────
  getBotHealth: () => request<BotHealth>("/api/bot/health"),

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
        if (!r.ok) throw new Error(`API ${r.status}`);
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
        if (!r.ok) throw new Error(`API ${r.status}`);
        return r.json() as Promise<FlowDefinition>;
      })
    ),
  deleteFlowDefinition: (id: string) =>
    buildHeaders(true).then((headers) =>
      fetch(`${API_URL}/api/flow-definitions/${id}`, {
        method: "DELETE",
        headers,
      }).then((r) => {
        if (!r.ok) throw new Error(`API ${r.status}`);
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
        if (!r.ok) throw new Error(`API ${r.status}`);
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
        if (!r.ok) throw new Error(`API ${r.status}`);
        return r.json();
      })
    ),
  deleteFlowStep: (id: string) =>
    buildHeaders(true).then((headers) =>
      fetch(`${API_URL}/api/flow-steps/${id}`, {
        method: "DELETE",
        headers,
      }).then((r) => {
        if (!r.ok) throw new Error(`API ${r.status}`);
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
        if (!r.ok) throw new Error(`API ${r.status}`);
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
        if (!r.ok) throw new Error(`API ${r.status}`);
        return r.json();
      })
    ),
  deleteFlowStepMessage: (id: string) =>
    buildHeaders(true).then((headers) =>
      fetch(`${API_URL}/api/flow-step-messages/${id}`, {
        method: "DELETE",
        headers,
      }).then((r) => {
        if (!r.ok) throw new Error(`API ${r.status}`);
        return r.json() as Promise<{ ok: boolean }>;
      })
    ),
};
