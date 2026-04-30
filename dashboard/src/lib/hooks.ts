import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { api } from "./api";
import { supabase } from "./supabase";
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
  DiscoverInstancesBody,
  CreateProductReferralBody,
  ReportsQueryParams,
  UpsertFlowBody,
  CreateFlowReferralBody,
  CreateInstanceResponse,
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
  hasUnread?: boolean;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortDir?: "asc" | "desc";
}) {
  return useQuery({
    queryKey: ["conversations", params],
    queryFn: () => api.getConversations(params),
    staleTime: 120_000,
    placeholderData: keepPreviousData,
  });
}

export function useConversationQuery(id: string) {
  return useQuery({
    queryKey: ["conversation", id],
    queryFn: () => api.getConversationById(id),
    enabled: Boolean(id),
    staleTime: 120_000,
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

export function useTriggerFlowMutation(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ flowId, stepId }: { flowId: string; stepId?: string }) =>
      api.triggerFlow(id, flowId, stepId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["conversation", id] });
      void qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}

export function useStopFlowMutation(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.stopFlow(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["conversation", id] });
      void qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}

export function useUpdateConversationStageMutation(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (stage: string) => api.updateConversationStage(id, stage),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["conversation", id] });
      void qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}

export function useUploadAndSendFileMutation(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      kind: "image" | "document" | "audio";
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

export function useSendMediaFromLibraryMutation(conversationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      url: string;
      filename: string;
      mimeType: string;
    }) => api.sendMediaFromLibrary(conversationId, payload),
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: ["conversation-messages", conversationId],
      });
      void qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}

export function usePaymentsQuery(params?: {
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
}) {
  return useQuery({
    queryKey: ["payments", params],
    queryFn: () => api.getPayments(params),
    staleTime: 120_000,
  });
}

export function useUpdatePaymentStateMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, state }: { id: string; state: string }) =>
      api.updatePaymentState(id, state),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["payments"] }),
  });
}

export function useUpdatePaymentAmountMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      amount,
      currency,
    }: {
      id: string;
      amount: number;
      currency?: string;
    }) => api.updatePaymentAmount(id, amount, currency),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["payments"] }),
  });
}

export function useCreatePaymentMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Parameters<typeof api.createPayment>[0]) =>
      api.createPayment(data),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["payments"] }),
  });
}

export function useMarkConversationReadMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.markConversationRead(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["conversations"] }),
  });
}

export function useBotConfigQuery() {
  return useQuery({
    queryKey: ["bot-config"],
    queryFn: api.getBotConfig,
    staleTime: 60_000,
  });
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

export function useValidateAiMutation() {
  return useMutation({
    mutationFn: (payload: {
      provider: "openai" | "gemini" | "anthropic" | "groq";
      apiKey: string;
      model: string;
    }) => api.validateAiProvider(payload),
  });
}

export function useFlowTemplatesQuery() {
  return useQuery({
    queryKey: ["flow-templates"],
    queryFn: api.getFlowTemplates,
  });
}

export function useCreateFlowTemplateMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.createFlowTemplate,
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: ["flow-templates"] }),
  });
}

export function useDeleteFlowTemplateMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.deleteFlowTemplate,
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: ["flow-templates"] }),
  });
}

export function useSyncMetaSpendMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { instanceId: string; from: string; to: string }) =>
      api.syncMetaAdSpend(payload.instanceId, {
        from: payload.from,
        to: payload.to,
      }),
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: ["stats", "reports"] }),
  });
}

export function useSessionQuery() {
  return useQuery({ queryKey: ["auth", "session"], queryFn: api.getSession, staleTime: 5 * 60_000 });
}

export function useSupabaseUser() {
  return useQuery({
    queryKey: ["supabase", "user"],
    queryFn: async () => {
      // getSession reads from localStorage (no network). getUser() always hits /auth/v1/user.
      const { data } = (await supabase?.auth.getSession()) ?? {};
      return data?.session?.user ?? null;
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function useCurrentOrgQuery() {
  return useQuery({
    queryKey: ["org", "current"],
    queryFn: api.getCurrentOrganization,
    staleTime: 60_000,
  });
}

export function useUpdateOrgMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { name?: string; timezone?: string }) =>
      api.updateOrganization(payload),
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: ["org", "current"] }),
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

export function useResendInviteMutation() {
  return useMutation({
    mutationFn: (id: string) => api.resendInvite(id),
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
  return useQuery({
    queryKey: ["flows-v2"],
    queryFn: api.getFlowsV2,
    staleTime: 60_000,
  });
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
  return useQuery({
    queryKey: ["instances"],
    queryFn: api.getInstances,
    staleTime: 60_000,
  });
}
export function useWebhookConfigQuery() {
  return useQuery({
    queryKey: ["instances", "webhook-config"],
    queryFn: api.getInstancesWebhookConfig,
  });
}

export function useCreateInstanceMutation() {
  const qc = useQueryClient();
  return useMutation<CreateInstanceResponse, Error, CreateInstanceBody>({
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
export function useDeleteInstanceMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteInstance(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["instances"] }),
  });
}

export function useInstanceMetaStatusQuery(id: string | null) {
  return useQuery({
    queryKey: ["instances", id, "meta-status"],
    queryFn: () => api.getInstanceMetaStatus(id!),
    enabled: Boolean(id),
    staleTime: 30_000,
  });
}
export function useReconfigureMetaMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.reconfigureMeta(id),
    onSuccess: (_data, id) => {
      void qc.invalidateQueries({ queryKey: ["instances", id, "meta-status"] });
    },
  });
}

export function useSaveInstanceMetaAdsMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, accountId }: { id: string; accountId: string }) =>
      api.saveInstanceMetaAds(id, accountId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["instances"] }),
  });
}

export function useValidateInstanceMetaAdsMutation() {
  return useMutation({
    mutationFn: (id: string) => api.validateInstanceMetaAds(id),
  });
}

export function useInstanceExternalReportingQuery(id: string | null) {
  return useQuery({
    queryKey: ["instances", id, "external-reporting"],
    queryFn: () => api.getInstanceExternalReporting(id!),
    enabled: Boolean(id),
    staleTime: 60_000,
  });
}

export function useSaveInstanceExternalReportingMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: { api_key: string; base_url: string };
    }) => api.saveInstanceExternalReporting(id, payload),
    onSuccess: (_data, { id }) => {
      void qc.invalidateQueries({ queryKey: ["instances"] });
      void qc.invalidateQueries({
        queryKey: ["instances", id, "external-reporting"],
      });
    },
  });
}

export function useInstanceExternalAccountsQuery(id: string | null) {
  return useQuery({
    queryKey: ["instances", id, "external-accounts"],
    queryFn: () => api.getInstanceExternalAccounts(id!),
    enabled: Boolean(id),
    staleTime: 120_000,
  });
}

export function useExportToReportingMutation() {
  return useMutation({
    mutationFn: (payload: {
      date: string;
      instance_id: string;
      account_name: string;
      currency: string;
      include_meta_spend: boolean;
    }) => api.exportToReporting(payload),
  });
}

/** Descubre los números de WhatsApp disponibles para un token de Meta.
 *  El resultado es efímero (no se cachea) — solo se usa durante el wizard de creación. */
export function useDiscoverInstancesMutation() {
  return useMutation({
    mutationFn: (payload: DiscoverInstancesBody) =>
      api.discoverInstances(payload),
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
  mediaType?: "image" | "video" | "document" | "audio";
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
