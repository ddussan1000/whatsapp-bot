import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import type {
  AdReferralQueryParams,
  CreateCampaignBody,
  CreateFlowBody,
  CreateFlowDefinitionBody,
  CreateFlowStepBody,
  CreateFlowStepMessageBody,
  CreateInviteBody,
  CreateTemplateBody,
  SendConversationMessageBody,
  UpdateBotConfigBody,
  UpdateCampaignBody,
  UpdateFlowDefinitionBody,
  UpdateFlowStepBody,
  UpdateFlowStepMessageBody,
  CreateProductBody,
  UpdateProductBody,
  CreateInstanceBody,
  UpdateInstanceBody,
  CreateProductReferralBody,
  ReportsQueryParams,
  UpsertFlowBody,
  CreateFlowReferralBody,
} from "../types/api";

export function useTodayStatsQuery() {
  return useQuery({ queryKey: ["stats", "today"], queryFn: api.getTodayStats });
}

export function useRangeStatsQuery(from?: string, to?: string) {
  return useQuery({
    queryKey: ["stats", "range", from, to],
    queryFn: () => api.getRangeStats(from, to),
  });
}

export function useReportsQuery(params: ReportsQueryParams) {
  return useQuery({
    queryKey: ["stats", "reports", params],
    queryFn: () => api.getReports(params),
  });
}

export function useAdReferralsQuery(params?: AdReferralQueryParams) {
  return useQuery({
    queryKey: ["stats", "ad-referrals", params],
    queryFn: () => api.getAdReferrals(params),
  });
}

export function useConversationFiltersQuery() {
  return useQuery({
    queryKey: ["conversation-filters"],
    queryFn: api.getConversationFilters,
    staleTime: 1000 * 60 * 5,
  });
}

export function useConversationsQuery(params?: {
  state?: string;
  search?: string;
  fromAd?: boolean;
  adSourceId?: string;
  flowId?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortDir?: "asc" | "desc";
}) {
  return useQuery({
    queryKey: ["conversations", params],
    queryFn: () => api.getConversations(params),
  });
}

export function useConversationQuery(id: string) {
  return useQuery({
    queryKey: ["conversation", id],
    queryFn: () => api.getConversationById(id),
    enabled: Boolean(id),
  });
}

export function useConversationMessagesQuery(
  id: string,
  page: number,
  pageSize: number
) {
  return useQuery({
    queryKey: ["conversation-messages", id, page, pageSize],
    queryFn: () => api.getConversationMessages(id, page, pageSize),
    enabled: Boolean(id),
  });
}

export function useSendConversationMessageMutation(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: SendConversationMessageBody) =>
      api.sendConversationMessage(id, payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["conversation-messages", id] });
      void qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}

export function useUploadAndSendFileMutation(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      kind: "image" | "document";
      caption?: string;
      file: File;
    }) => api.uploadAndSendFile(id, payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["conversation-messages", id] });
      void qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}

export function useUploadFlowMediaMutation() {
  return useMutation({
    mutationFn: (file: File) => api.uploadFlowMedia(file),
  });
}

export function usePaymentsQuery(params?: {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortDir?: "asc" | "desc";
}) {
  return useQuery({
    queryKey: ["payments", params],
    queryFn: () => api.getPayments(params),
  });
}

export function useBotConfigQuery() {
  return useQuery({ queryKey: ["bot-config"], queryFn: api.getBotConfig });
}

export function useUpdateBotConfigMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateBotConfigBody) => api.updateBotConfig(payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["bot-config"] });
    },
  });
}

export function useSessionQuery() {
  return useQuery({ queryKey: ["auth", "session"], queryFn: api.getSession });
}

export function useCurrentOrgQuery() {
  return useQuery({
    queryKey: ["org", "current"],
    queryFn: api.getCurrentOrganization,
  });
}

export function useInvitesQuery() {
  return useQuery({ queryKey: ["org", "invites"], queryFn: api.getInvites });
}

export function useCreateInviteMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateInviteBody) => api.createInvite(payload),
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: ["org", "invites"] }),
  });
}

export function useCampaignsQuery() {
  return useQuery({ queryKey: ["campaigns"], queryFn: api.getCampaigns });
}

export function useCreateCampaignMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateCampaignBody) => api.createCampaign(payload),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["campaigns"] }),
  });
}

export function useUpdateCampaignMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: UpdateCampaignBody;
    }) => api.updateCampaign(id, payload),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["campaigns"] }),
  });
}

export function useFlowsQuery(params: {
  campaignId?: string;
  productId?: string;
}) {
  return useQuery({
    queryKey: ["flows", params],
    queryFn: () => api.getFlows(params),
    enabled: Boolean(params.campaignId || params.productId),
  });
}

export function useFlowsV2Query() {
  return useQuery({ queryKey: ["flows-v2"], queryFn: api.getFlowsV2 });
}

export function useFlowV2Query(id: string) {
  return useQuery({
    queryKey: ["flow-v2", id],
    queryFn: () => api.getFlowV2(id),
    enabled: Boolean(id),
  });
}

export function useUpsertFlowV2Mutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpsertFlowBody) => api.upsertFlowV2(payload),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["flows-v2"] }),
  });
}

export function useDeleteFlowV2Mutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteFlowV2(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["flows-v2"] }),
  });
}

export function useCreateFlowMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateFlowBody) => api.createFlow(payload),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["flows"] }),
  });
}

export function usePublishFlowMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.publishFlow(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["flows"] }),
  });
}

export function useTemplatesQuery(params?: {
  campaignId?: string;
  productId?: string;
}) {
  return useQuery({
    queryKey: ["templates", params],
    queryFn: () => api.getTemplates(params),
  });
}

export function useCreateTemplateMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateTemplateBody) => api.createTemplate(payload),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["templates"] }),
  });
}

export function useProductsQuery() {
  return useQuery({ queryKey: ["products"], queryFn: api.getProducts });
}

export function useCreateProductMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateProductBody) => api.createProduct(payload),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["products"] }),
  });
}

export function useUpdateProductMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateProductBody }) =>
      api.updateProduct(id, payload),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["products"] }),
  });
}

export function useInstancesQuery() {
  return useQuery({ queryKey: ["instances"], queryFn: api.getInstances });
}
export function useWebhookConfigQuery() {
  return useQuery({
    queryKey: ["instances", "webhook-config"],
    queryFn: api.getInstancesWebhookConfig,
  });
}

export function useCreateInstanceMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateInstanceBody) => api.createInstance(payload),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["instances"] }),
  });
}

export function useUpdateInstanceMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: UpdateInstanceBody;
    }) => api.updateInstance(id, payload),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["instances"] }),
  });
}

export function useAssignFlowMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      instanceId,
      flowId,
    }: {
      instanceId: string;
      flowId: string | null;
    }) => api.assignFlowToInstance(instanceId, flowId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["instances"] }),
  });
}
export function useTestInstanceHealthMutation() {
  return useMutation({
    mutationFn: (id: string) => api.testInstanceHealth(id),
  });
}

export function useProductReferralsQuery() {
  return useQuery({
    queryKey: ["product-referrals"],
    queryFn: api.getProductReferrals,
  });
}

export function useCreateProductReferralMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateProductReferralBody) =>
      api.createProductReferral(payload),
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: ["product-referrals"] }),
  });
}

export function useFlowReferralsQuery() {
  return useQuery({
    queryKey: ["flow-referrals"],
    queryFn: api.getFlowReferrals,
  });
}

export function useCreateFlowReferralMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateFlowReferralBody) =>
      api.createFlowReferral(payload),
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: ["flow-referrals"] }),
  });
}

// ── Bot health ────────────────────────────────────────────────────────────

export function useBotHealthQuery() {
  return useQuery({
    queryKey: ["bot-health"],
    queryFn: api.getBotHealth,
    refetchInterval: 30_000,
  });
}

// ── Flow definitions ──────────────────────────────────────────────────────

export function useFlowDefinitionsQuery(params?: { productId?: string }) {
  return useQuery({
    queryKey: ["flow-definitions", params],
    queryFn: () => api.getFlowDefinitions(params),
  });
}

export function useCreateFlowDefinitionMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateFlowDefinitionBody) =>
      api.createFlowDefinition(payload),
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: ["flow-definitions"] }),
  });
}

export function useUpdateFlowDefinitionMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: UpdateFlowDefinitionBody;
    }) => api.updateFlowDefinition(id, payload),
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: ["flow-definitions"] }),
  });
}

export function useDeleteFlowDefinitionMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteFlowDefinition(id),
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: ["flow-definitions"] }),
  });
}

// ── Flow steps ────────────────────────────────────────────────────────────

export function useCreateFlowStepMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateFlowStepBody) => api.createFlowStep(payload),
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: ["flow-definitions"] }),
  });
}

export function useUpdateFlowStepMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: UpdateFlowStepBody;
    }) => api.updateFlowStep(id, payload),
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: ["flow-definitions"] }),
  });
}

export function useDeleteFlowStepMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteFlowStep(id),
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: ["flow-definitions"] }),
  });
}

// ── Flow step messages ────────────────────────────────────────────────────

export function useCreateFlowStepMessageMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateFlowStepMessageBody) =>
      api.createFlowStepMessage(payload),
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: ["flow-definitions"] }),
  });
}

export function useUpdateFlowStepMessageMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: UpdateFlowStepMessageBody;
    }) => api.updateFlowStepMessage(id, payload),
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: ["flow-definitions"] }),
  });
}

export function useDeleteFlowStepMessageMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteFlowStepMessage(id),
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: ["flow-definitions"] }),
  });
}

// ── Media library ──────────────────────────────────────────────────────────

export function useOrgMediaQuery(params?: {
  mediaType?: "image" | "video" | "document";
  page?: number;
  pageSize?: number;
}) {
  return useQuery({
    queryKey: ["org-media", params],
    queryFn: () => api.getOrgMedia(params),
  });
}

export function useUploadOrgMediaMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => api.uploadOrgMedia(file),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["org-media"] }),
  });
}

export function useDeleteOrgMediaMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteOrgMedia(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["org-media"] }),
  });
}
