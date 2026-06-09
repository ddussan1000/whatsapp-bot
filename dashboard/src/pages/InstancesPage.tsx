import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Copy,
  Check,
  CheckCircle2,
  XCircle,
  Workflow,
  Smartphone,
  ExternalLink,
  ShieldCheck,
  Link,
  Eye,
  EyeOff,
  CircleDot,
  Trash2,
  AlertTriangle,
  Activity,
  BarChart2,
  Megaphone,
  Plus,
  Pencil,
  Zap,
} from "lucide-react";
import {
  InfoModal,
  InfoSection,
  InfoStep,
  InfoCode,
  InfoAlert,
} from "@/components/ui/info-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import type { WhatsAppInstance } from "@/types/api";
import {
  useAssignFlowMutation,
  useDeleteInstanceMutation,
  useFlowsV2Query,
  useInstancesQuery,
  useUpdateInstanceMutation,
  useWebhookConfigQuery,
  useInstanceMetaStatusQuery,
  useReconfigureMetaMutation,
  useSaveInstanceMetaAdsMutation,
  useValidateInstanceMetaAdsMutation,
  useInstanceExternalReportingQuery,
  useSaveInstanceExternalReportingMutation,
  useMetaDatasetsQuery,
  useCreateMetaDatasetMutation,
  useUpdateMetaDatasetMutation,
  useDeleteMetaDatasetMutation,
  useSetupCapiMutation,
} from "@/lib/hooks";
import type { MetaDataset, MetaStatusResponse, ReconfigureMetaResult } from "@/types/api";

const NO_FLOW_VALUE = "__none__";

// ── Copy button ───────────────────────────────────────────────────────────

function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      type="button"
      onClick={copy}
      className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {copied ? (
        <Check size={13} className="text-emerald-500" />
      ) : (
        <Copy size={13} />
      )}
      {label ?? (copied ? "Copiado" : "Copiar")}
    </button>
  );
}

// ── Webhook config card ───────────────────────────────────────────────────

function WebhookConfigCard() {
  const { data, isLoading } = useWebhookConfigQuery();
  const [showToken, setShowToken] = useState(false);

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <ShieldCheck size={18} className="text-primary" />
          <CardTitle className="text-base">
            Configuración del webhook para Meta
          </CardTitle>
        </div>
        <p className="text-sm text-muted-foreground">
          Copiá estos datos y pegálos en{" "}
          <span className="font-medium text-foreground">
            Meta Business → WhatsApp → Configuración → Webhooks
          </span>
          . Es un paso único, solo se hace la primera vez.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <>
            {/* Webhook URL */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5">
                <Link size={13} className="text-muted-foreground" />
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  URL del Webhook
                </span>
              </div>
              <div className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2">
                <code className="flex-1 text-sm break-all">
                  {data?.webhookUrl ?? "—"}
                </code>
                <CopyButton value={data?.webhookUrl ?? ""} />
              </div>
              <p className="text-xs text-muted-foreground">
                En Meta, el campo se llama <em>Callback URL</em>.
              </p>
            </div>

            {/* Verify token */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5">
                <ShieldCheck size={13} className="text-muted-foreground" />
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Token de verificación
                </span>
              </div>
              <div className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2">
                <code className="flex-1 text-sm">
                  {showToken
                    ? (data?.verifyToken ?? "—")
                    : "•".repeat(Math.min(data?.verifyToken?.length ?? 8, 24))}
                </code>
                <button
                  type="button"
                  onClick={() => setShowToken((v) => !v)}
                  className="rounded p-1 text-muted-foreground hover:bg-muted"
                >
                  {showToken ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
                <CopyButton value={data?.verifyToken ?? ""} />
              </div>
              <p className="text-xs text-muted-foreground">
                En Meta, el campo se llama <em>Verify Token</em>.
              </p>
            </div>

            <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              <ExternalLink size={12} className="shrink-0" />
              Después de pegar los datos en Meta, seleccioná los eventos{" "}
              <strong className="text-foreground">messages</strong> y{" "}
              <strong className="text-foreground">messaging_postbacks</strong>.
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── Field with label ──────────────────────────────────────────────────────

function Field({
  label,
  hint,
  children,
  optional,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  optional?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline gap-1.5">
        <Label className="text-xs font-semibold">{label}</Label>
        {optional && (
          <span className="text-[10px] text-muted-foreground">(opcional)</span>
        )}
      </div>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

// ── Edit dialog ───────────────────────────────────────────────────────────

function EditDialog({
  instance,
  flows,
  onClose,
}: {
  instance: WhatsAppInstance;
  flows: { id: string; name: string; is_active: boolean }[];
  onClose: () => void;
}) {
  const updateInstance = useUpdateInstanceMutation();
  const setupCapi = useSetupCapiMutation();
  const assignFlow = useAssignFlowMutation();
  const saveMetaAds = useSaveInstanceMetaAdsMutation();
  const validateMetaAds = useValidateInstanceMetaAdsMutation();
  const externalReportingQ = useInstanceExternalReportingQuery(instance.id);
  const saveExternalReporting = useSaveInstanceExternalReportingMutation();
  const { data: datasets = [] } = useMetaDatasetsQuery();

  const [metaAdsAccountId, setMetaAdsAccountId] = useState(
    instance.meta_ads_account_id ?? ""
  );
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>(
    instance.meta_dataset_id ?? "__none__"
  );
  const [metaAdsValidation, setMetaAdsValidation] = useState<{
    ok: boolean;
    error?: string;
  } | null>(null);

  const [extReportingApiKey, setExtReportingApiKey] = useState("");
  const [extReportingBaseUrlDraft, setExtReportingBaseUrlDraft] = useState<
    string | null
  >(null);
  const extReportingBaseUrl =
    extReportingBaseUrlDraft ?? externalReportingQ.data?.base_url ?? "";
  const [showExtApiKey, setShowExtApiKey] = useState(false);

  const [label, setLabel] = useState(instance.label);
  const [metaToken, setMetaToken] = useState(instance.meta_token ?? "");
  const [displayPhone, setDisplayPhone] = useState(
    instance.display_phone_number ?? ""
  );
  const [selectedFlow, setSelectedFlow] = useState(
    instance.flow_id ?? NO_FLOW_VALUE
  );
  const [currency, setCurrency] = useState(instance.currency ?? "COP");
  const [highAmountThreshold, setHighAmountThreshold] = useState(
    instance.high_amount_threshold != null
      ? String(instance.high_amount_threshold)
      : ""
  );
  const [showToken, setShowToken] = useState(false);

  const activeFlows = flows.filter((f) => f.is_active);

  const save = () => {
    const thresholdRaw = highAmountThreshold.trim();
    const thresholdNum = thresholdRaw ? Number(thresholdRaw) : null;
    if (thresholdNum !== null && (isNaN(thresholdNum) || thresholdNum <= 0)) {
      toast.error("El umbral debe ser un número positivo");
      return;
    }

    updateInstance.mutate(
      {
        id: instance.id,
        payload: {
          label: label.trim() || instance.label,
          metaToken: metaToken.trim() || undefined,
          displayPhoneNumber: displayPhone.trim() || undefined,
          currency: currency || undefined,
          highAmountThreshold: thresholdNum,
        },
      },
      {
        onSuccess: () => {
          assignFlow.mutate(
            {
              instanceId: instance.id,
              flowId: selectedFlow === NO_FLOW_VALUE ? null : selectedFlow,
            },
            {
              onSuccess: () => {
                toast.success("Configuración guardada.");
                onClose();
              },
              onError: () =>
                toast.error(
                  "Se guardó el número, pero falló la asignación del flow."
                ),
            }
          );
        },
        onError: (e) => toast.error(`Error guardando: ${(e as Error).message}`),
      }
    );
  };

  const isSaving = updateInstance.isPending || assignFlow.isPending;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      {/*
       * flex flex-col + max-h-[90dvh]:  limita la altura al 90% del viewport dinámico.
       * p-0 gap-0:  el padding lo manejan las secciones internas para que el scroll
       *             no corte el contenido contra el borde del diálogo.
       */}
      <DialogContent className="flex flex-col gap-0 p-0 sm:max-w-2xl max-h-[90dvh]">
        {/* ── Cabecera fija ─────────────────────────────────────── */}
        <DialogHeader className="shrink-0 border-b px-6 py-4">
          <DialogTitle>Editar número de WhatsApp</DialogTitle>
          <DialogDescription>
            {instance.display_phone_number
              ? `Configuración de ${instance.display_phone_number}`
              : `Configuración de ${instance.label}`}
          </DialogDescription>
        </DialogHeader>

        {/* ── Cuerpo scrollable ─────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="flex flex-col gap-5">
            {/* Identificación */}
            <div className="flex flex-col gap-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Identificación
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  label="Nombre del número"
                  hint="Solo para reconocerlo en el panel, no lo ve el cliente."
                >
                  <Input
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="Ej: Línea principal, Ventas, Soporte…"
                  />
                </Field>
                <Field
                  label="Número de teléfono"
                  hint="Con formato internacional. Ej: +57 300 123 4567"
                  optional
                >
                  <Input
                    value={displayPhone}
                    onChange={(e) => setDisplayPhone(e.target.value)}
                    placeholder="+57 300 123 4567"
                  />
                </Field>
              </div>
            </div>

            <Separator />

            {/* Credenciales de Meta */}
            <div className="flex flex-col gap-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Credenciales de Meta
              </p>
              <Field
                label="ID del número (Phone Number ID)"
                hint="Identificador único que Meta asignó a este número. No se puede cambiar."
              >
                <Input
                  value={instance.phone_number_id}
                  readOnly
                  className="bg-muted text-muted-foreground font-mono text-xs"
                />
              </Field>
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold">Token de acceso</span>
                  <InfoModal title="¿Dónde obtengo el token?" iconOnly>
                    <InfoSection title="Tipos de token">
                      <p>
                        Hay 3 tipos. Para producción usá siempre el{" "}
                        <strong>System User Token</strong>:
                      </p>
                    </InfoSection>
                    <div className="flex flex-col gap-2 text-xs">
                      {[
                        {
                          type: "Token temporal",
                          dur: "1–2 horas",
                          ok: false,
                          desc: "Solo para pruebas rápidas en el panel de Meta.",
                        },
                        {
                          type: "Token de larga duración",
                          dur: "60 días",
                          ok: false,
                          desc: "Hay que renovarlo manualmente cada 2 meses.",
                        },
                        {
                          type: "System User Token",
                          dur: "No vence",
                          ok: true,
                          desc: "Recomendado para producción.",
                        },
                      ].map((t) => (
                        <div
                          key={t.type}
                          className={`rounded-lg border p-2.5 ${t.ok ? "border-emerald-200 bg-emerald-50 dark:bg-emerald-900/10" : "border-muted bg-muted/30"}`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-semibold">{t.type}</span>
                            <span className="text-muted-foreground">
                              {t.dur}
                            </span>
                          </div>
                          <p className="text-muted-foreground mt-0.5">
                            {t.desc}
                          </p>
                        </div>
                      ))}
                    </div>
                    <InfoSection title="Cómo obtener el System User Token">
                      <div className="flex flex-col gap-2 mt-1">
                        <InfoStep n={1}>
                          Entrá a <strong>business.facebook.com</strong> →
                          Configuración del negocio.
                        </InfoStep>
                        <InfoStep n={2}>
                          En el menú izquierdo:{" "}
                          <strong>Usuarios → Usuarios del sistema</strong>. Creá
                          un usuario del sistema con rol{" "}
                          <InfoCode>Admin</InfoCode>.
                        </InfoStep>
                        <InfoStep n={3}>
                          Hacé click en <strong>Generar token</strong>,
                          seleccioná tu app y activá los permisos:{" "}
                          <InfoCode>whatsapp_business_messaging</InfoCode>,{" "}
                          <InfoCode>whatsapp_business_management</InfoCode> y{" "}
                          <InfoCode>ads_read</InfoCode>.
                        </InfoStep>
                        <InfoStep n={4}>
                          Copiá el token generado y pegálo acá.{" "}
                          <strong>No vence.</strong>
                        </InfoStep>
                      </div>
                    </InfoSection>
                    <InfoAlert>
                      Sin <InfoCode>whatsapp_business_messaging</InfoCode> el
                      bot no puede enviar mensajes ni descargar imágenes de
                      comprobantes.
                    </InfoAlert>
                  </InfoModal>
                </div>
                <div className="flex gap-2">
                  <Input
                    type={showToken ? "text" : "password"}
                    value={metaToken}
                    onChange={(e) => setMetaToken(e.target.value)}
                    placeholder="EAAP…"
                    className="flex-1 font-mono text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken((v) => !v)}
                    className="rounded-md border bg-background px-2 text-muted-foreground hover:bg-muted"
                  >
                    {showToken ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Token permanente de Meta. Lo encontrás en Meta for Developers
                  → tu app → WhatsApp → API Setup.
                </p>
              </div>
            </div>

            <Separator />

            {/* Configuración de pagos */}
            <div className="flex flex-col gap-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Configuración de pagos
              </p>
              <Field
                label="Moneda"
                hint="Divisa que usan los pagos recibidos en este número. Se usa para interpretar los comprobantes correctamente."
              >
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar moneda" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="COP">COP — Peso colombiano</SelectItem>
                    <SelectItem value="USD">
                      USD — Dólar estadounidense
                    </SelectItem>
                    <SelectItem value="EUR">EUR — Euro</SelectItem>
                    <SelectItem value="MXN">MXN — Peso mexicano</SelectItem>
                    <SelectItem value="BRL">BRL — Real brasileño</SelectItem>
                    <SelectItem value="ARS">ARS — Peso argentino</SelectItem>
                    <SelectItem value="CLP">CLP — Peso chileno</SelectItem>
                    <SelectItem value="PEN">PEN — Sol peruano</SelectItem>
                    <SelectItem value="VES">
                      VES — Bolívar venezolano
                    </SelectItem>
                    <SelectItem value="GTQ">
                      GTQ — Quetzal guatemalteco
                    </SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field
                label="Umbral monto alto"
                hint={`Pagos con monto superior a este valor van a revisión manual en lugar de confirmarse automáticamente. Déjalo vacío para no aplicar límite.`}
              >
                <div className="relative">
                  <input
                    type="number"
                    min={0}
                    placeholder={`Sin límite`}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    value={highAmountThreshold}
                    onChange={(e) => setHighAmountThreshold(e.target.value)}
                  />
                  {currency && (
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                      {currency}
                    </span>
                  )}
                </div>
              </Field>
            </div>

            <Separator />

            {/* Flow activo */}
            <div className="flex flex-col gap-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Flow activo
              </p>
              <Field
                label="Flow asignado"
                hint="El flow que va a usar este número para responder automáticamente a los clientes."
              >
                <Select value={selectedFlow} onValueChange={setSelectedFlow}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sin flow asignado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_FLOW_VALUE}>
                      <span className="text-muted-foreground">
                        Sin flow — el bot no responde
                      </span>
                    </SelectItem>
                    {activeFlows.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        <span className="flex items-center gap-2">
                          <CircleDot size={11} className="text-emerald-500" />
                          {f.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <Separator />

            {/* Meta Ads */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Megaphone size={14} className="text-muted-foreground" />
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Meta Ads
                </p>
                {instance.meta_ads_account_id && (
                  <span className="ml-auto rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                    {instance.meta_ads_account_id}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Usa el token de Meta de esta instancia. El token debe tener el
                permiso{" "}
                <code className="rounded bg-muted px-1 font-mono text-[11px]">
                  ads_read
                </code>
                .
              </p>
              <Field label="ID de cuenta publicitaria" hint="Ej: act_123456789">
                <Input
                  value={metaAdsAccountId}
                  onChange={(e) => {
                    setMetaAdsAccountId(e.target.value);
                    setMetaAdsValidation(null);
                  }}
                  placeholder="act_123456789"
                  className="font-mono text-sm"
                />
              </Field>
              {metaAdsValidation && (
                <div
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${
                    metaAdsValidation.ok
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-400"
                      : "border-destructive/30 bg-destructive/10 text-destructive"
                  }`}
                >
                  {metaAdsValidation.ok ? (
                    <Check size={13} />
                  ) : (
                    <AlertTriangle size={13} />
                  )}
                  {metaAdsValidation.ok
                    ? "Conexión verificada correctamente"
                    : (metaAdsValidation.error ?? "Error al verificar")}
                </div>
              )}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={
                    !metaAdsAccountId.trim() ||
                    saveMetaAds.isPending ||
                    validateMetaAds.isPending
                  }
                  loading={saveMetaAds.isPending}
                  loadingText="Guardando…"
                  onClick={() =>
                    saveMetaAds.mutate(
                      { id: instance.id, accountId: metaAdsAccountId.trim() },
                      {
                        onSuccess: () => toast.success("ID de cuenta guardado"),
                        onError: (e) => toast.error((e as Error).message),
                      }
                    )
                  }
                >
                  Guardar ID
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={
                    !(instance.meta_ads_account_id || saveMetaAds.isSuccess) ||
                    validateMetaAds.isPending
                  }
                  loading={validateMetaAds.isPending}
                  loadingText="Verificando…"
                  onClick={() =>
                    validateMetaAds.mutate(instance.id, {
                      onSuccess: (res) => setMetaAdsValidation(res),
                      onError: (e) =>
                        setMetaAdsValidation({
                          ok: false,
                          error: (e as Error).message,
                        }),
                    })
                  }
                >
                  Verificar permisos
                </Button>
              </div>
            </div>

            <Separator />

            {/* Conversiones API (CAPI) */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Zap size={14} className="text-muted-foreground" />
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Conversiones API (CAPI)
                </p>
                {instance.meta_dataset_id && (
                  <span className="ml-auto rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                    Activo
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Reporta compras confirmadas a Meta para optimizar tus campañas CTWA. Creá los
                datasets en la sección de abajo y asigná uno a este número.
              </p>
              {instance.waba_id && !instance.meta_dataset_id && (
                <Button
                  variant="default"
                  size="sm"
                  className="self-start"
                  loading={setupCapi.isPending}
                  loadingText="Configurando…"
                  onClick={() =>
                    setupCapi.mutate(instance.id, {
                      onSuccess: (data) => {
                        if (data.ok) toast.success(data.alreadyExisted ? "CAPI ya estaba configurado" : "CAPI configurado correctamente");
                        else toast.error("No se pudo configurar CAPI. Verificá el token de la instancia.");
                      },
                      onError: (e) => toast.error((e as Error).message),
                    })
                  }
                >
                  Configurar automáticamente
                </Button>
              )}
              <Field label="Dataset de conversiones">
                <Select
                  value={selectedDatasetId}
                  onValueChange={setSelectedDatasetId}
                >
                  <SelectTrigger className="text-sm">
                    <SelectValue placeholder="Sin dataset" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sin dataset</SelectItem>
                    {datasets.map((ds) => (
                      <SelectItem key={ds.id} value={ds.id}>
                        <span className="flex items-center gap-2">
                          {ds.label}
                          <code className="text-[10px] text-muted-foreground font-mono">
                            {ds.dataset_id}
                          </code>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Button
                variant="outline"
                size="sm"
                className="self-start"
                loading={updateInstance.isPending}
                loadingText="Guardando…"
                onClick={() =>
                  updateInstance.mutate(
                    {
                      id: instance.id,
                      payload: {
                        metaDatasetId:
                          selectedDatasetId === "__none__" ? null : selectedDatasetId,
                      },
                    },
                    {
                      onSuccess: () => toast.success("Dataset de conversiones guardado"),
                      onError: (e) => toast.error((e as Error).message),
                    },
                  )
                }
              >
                Guardar dataset
              </Button>
            </div>

            <Separator />

            {/* Sistema de Reportes Externo */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <BarChart2 size={14} className="text-muted-foreground" />
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Sistema de Reportes Externo
                </p>
                {instance.external_reporting_configured && (
                  <span className="ml-auto rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                    Configurado
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-3">
                <Field label="URL base" hint="Ej: https://mi-plataforma.com">
                  <Input
                    value={extReportingBaseUrl}
                    onChange={(e) =>
                      setExtReportingBaseUrlDraft(e.target.value)
                    }
                    placeholder="https://mi-plataforma.com"
                  />
                </Field>
                <Field
                  label="API Key"
                  hint={
                    instance.external_reporting_configured
                      ? "Configurada — dejá vacío para mantener la actual"
                      : "Ingresá la API key del sistema externo"
                  }
                >
                  <div className="flex gap-2">
                    <Input
                      type={showExtApiKey ? "text" : "password"}
                      value={extReportingApiKey}
                      onChange={(e) => setExtReportingApiKey(e.target.value)}
                      placeholder={
                        instance.external_reporting_configured
                          ? "•••••• (configurada)"
                          : "api_key…"
                      }
                      className="flex-1 font-mono text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowExtApiKey((v) => !v)}
                      className="rounded-md border bg-background px-2 text-muted-foreground hover:bg-muted"
                    >
                      {showExtApiKey ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </Field>
                <Button
                  variant="outline"
                  size="sm"
                  className="self-start"
                  disabled={
                    !extReportingBaseUrl.trim() ||
                    (!extReportingApiKey.trim() &&
                      !instance.external_reporting_configured) ||
                    saveExternalReporting.isPending
                  }
                  loading={saveExternalReporting.isPending}
                  loadingText="Guardando…"
                  onClick={() => {
                    if (
                      !extReportingApiKey.trim() &&
                      instance.external_reporting_configured
                    ) {
                      toast.info("No hubo cambios en la API key");
                      return;
                    }
                    saveExternalReporting.mutate(
                      {
                        id: instance.id,
                        payload: {
                          api_key: extReportingApiKey,
                          base_url: extReportingBaseUrl.trim(),
                        },
                      },
                      {
                        onSuccess: () =>
                          toast.success("Configuración de reportes guardada"),
                        onError: (e) => toast.error((e as Error).message),
                      }
                    );
                  }}
                >
                  Guardar configuración
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* ── Footer fijo con acciones ──────────────────────────── */}
        <div className="shrink-0 flex items-center gap-2 border-t bg-muted/30 px-6 py-4">
          <div className="ml-auto flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={isSaving}>
              Cancelar
            </Button>
            <Button onClick={save} loading={isSaving} loadingText="Guardando…">
              Guardar cambios
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Dataset dialog (create / edit) ────────────────────────────────────────

function DatasetDialog({
  dataset,
  onClose,
}: {
  dataset?: MetaDataset;
  onClose: () => void;
}) {
  const isEdit = Boolean(dataset);
  const create = useCreateMetaDatasetMutation();
  const update = useUpdateMetaDatasetMutation();

  const [label, setLabel] = useState(dataset?.label ?? "");
  const [datasetId, setDatasetId] = useState(dataset?.dataset_id ?? "");
  const [accessToken, setAccessToken] = useState("");
  const [showToken, setShowToken] = useState(false);

  const isPending = create.isPending || update.isPending;

  const handleSave = () => {
    if (!label.trim() || !datasetId.trim()) return;
    if (!isEdit && !accessToken.trim()) return;

    if (isEdit && dataset) {
      const payload: { label?: string; datasetId?: string; accessToken?: string } = {};
      if (label !== dataset.label) payload.label = label.trim();
      if (datasetId !== dataset.dataset_id) payload.datasetId = datasetId.trim();
      if (accessToken.trim()) payload.accessToken = accessToken.trim();
      update.mutate(
        { id: dataset.id, payload },
        {
          onSuccess: () => { toast.success("Dataset actualizado y verificado ✓"); onClose(); },
          onError: (e) => toast.error((e as Error).message),
        },
      );
    } else {
      create.mutate(
        { label: label.trim(), datasetId: datasetId.trim(), accessToken: accessToken.trim() },
        {
          onSuccess: () => { toast.success("Dataset creado y verificado ✓"); onClose(); },
          onError: (e) => toast.error((e as Error).message),
        },
      );
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar dataset CAPI" : "Nuevo dataset CAPI"}</DialogTitle>
          <DialogDescription>
            El token se verifica con Meta antes de guardar.{" "}
            {isEdit && dataset?.access_token_configured && "Dejá el token vacío para mantener el actual."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <Field label="Nombre interno" hint="Para identificarlo en el dashboard">
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Ej: Campañas CTWA — Negocio Principal"
            />
          </Field>

          <Field
            label="Dataset ID"
            hint="Número de 15–16 dígitos de Events Manager"
          >
            <Input
              value={datasetId}
              onChange={(e) => setDatasetId(e.target.value)}
              placeholder="123456789012345"
              className="font-mono text-sm"
            />
          </Field>

          <Field
            label="System User Token"
            hint={
              isEdit && dataset?.access_token_configured
                ? "Configurado — ingresá uno nuevo para reemplazarlo"
                : "Token del System User con permiso ads_management"
            }
          >
            <div className="flex gap-2">
              <Input
                type={showToken ? "text" : "password"}
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                placeholder={
                  isEdit && dataset?.access_token_configured
                    ? "••••••••  (vacío = sin cambios)"
                    : "EAA..."
                }
                className="font-mono text-sm"
              />
              <Button
                variant="ghost"
                size="icon-sm"
                type="button"
                onClick={() => setShowToken((v) => !v)}
              >
                {showToken ? <EyeOff size={14} /> : <Eye size={14} />}
              </Button>
            </div>
          </Field>

          <div className="rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            <p className="font-medium text-foreground mb-1">¿Dónde obtener estos datos?</p>
            <ol className="list-decimal list-inside space-y-0.5">
              <li>Events Manager → tu dataset → copiar ID</li>
              <li>Business Manager → Usuarios → System Users → generar token con <code className="bg-muted px-1 rounded">ads_management</code></li>
            </ol>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={
              isPending ||
              !label.trim() ||
              !datasetId.trim() ||
              (!isEdit && !accessToken.trim())
            }
            loading={isPending}
            loadingText="Verificando con Meta…"
          >
            <Check size={14} className="mr-1.5" />
            Guardar y verificar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Meta Datasets card ────────────────────────────────────────────────────

function MetaDatasetsCard() {
  const { data: datasets = [], isLoading } = useMetaDatasetsQuery();
  const deleteDataset = useDeleteMetaDatasetMutation();
  const [editing, setEditing] = useState<MetaDataset | undefined>(undefined);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<MetaDataset | null>(null);

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap size={16} className="text-muted-foreground" />
              <CardTitle>Conversiones API (CAPI)</CardTitle>
            </div>
            <Button size="sm" variant="outline" onClick={() => setCreating(true)} className="gap-1.5">
              <Plus size={14} />
              Nuevo dataset
            </Button>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Conecta tus anuncios Click-to-WhatsApp con las compras confirmadas en el bot. Cada dataset
            se vincula a uno o más números de WhatsApp desde el diálogo de edición.
          </p>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex flex-col gap-2">
              {[1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : datasets.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <Zap size={28} className="text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                Sin datasets configurados. Creá uno para empezar a reportar compras a Meta.
              </p>
              <Button variant="outline" size="sm" onClick={() => setCreating(true)} className="gap-1.5">
                <Plus size={13} />
                Crear primer dataset
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Dataset ID</TableHead>
                  <TableHead>Token</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {datasets.map((ds) => (
                  <TableRow key={ds.id}>
                    <TableCell className="font-medium">{ds.label}</TableCell>
                    <TableCell>
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
                        {ds.dataset_id}
                      </code>
                    </TableCell>
                    <TableCell>
                      {ds.access_token_configured ? (
                        <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 size={12} />
                          Configurado
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-destructive">
                          <XCircle size={12} />
                          Sin token
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setEditing(ds)}
                          className="text-muted-foreground hover:text-primary"
                        >
                          <Pencil size={14} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setConfirmDelete(ds)}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {creating && <DatasetDialog onClose={() => setCreating(false)} />}
      {editing && <DatasetDialog dataset={editing} onClose={() => setEditing(undefined)} />}

      {/* Confirm delete */}
      {confirmDelete && (
        <Dialog open onOpenChange={(o) => !o && setConfirmDelete(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Eliminar dataset</DialogTitle>
              <DialogDescription>
                Se eliminará <strong>{confirmDelete.label}</strong>. Los números vinculados a este dataset
                dejarán de reportar compras a Meta. Esta acción no se puede deshacer.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmDelete(null)}>
                Cancelar
              </Button>
              <Button
                variant="destructive"
                loading={deleteDataset.isPending}
                loadingText="Eliminando…"
                onClick={() =>
                  deleteDataset.mutate(confirmDelete.id, {
                    onSuccess: () => { toast.success("Dataset eliminado"); setConfirmDelete(null); },
                    onError: (e) => toast.error((e as Error).message),
                  })
                }
              >
                <Trash2 size={14} className="mr-1.5" />
                Eliminar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

// ── Meta status modal ─────────────────────────────────────────────────────

function ConfigStatus({
  value,
  label,
  nullNote,
}: {
  value: boolean | null;
  label: string;
  nullNote?: string;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      {value === null ? (
        <span className="text-muted-foreground text-xs">{nullNote ?? "—"}</span>
      ) : value ? (
        <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
      ) : (
        <XCircle className="h-4 w-4 text-destructive" />
      )}
    </div>
  );
}

function MetaStatusModal({
  instance,
  onClose,
}: {
  instance: WhatsAppInstance;
  onClose: () => void;
}) {
  const { data, isLoading, isError } = useInstanceMetaStatusQuery(instance.id);
  const reconfigure = useReconfigureMetaMutation();
  const [reconfResult, setReconfResult] =
    useState<ReconfigureMetaResult | null>(null);

  const PERM_LABELS: Record<string, string> = {
    whatsapp_business_messaging: "Enviar y recibir mensajes",
    whatsapp_business_management: "Gestionar números y suscribir webhooks",
    ads_read: "Enriquecer datos de anuncios (CTWA)",
  };

  const tokenBadge = (status: MetaStatusResponse | undefined) => {
    if (!status) return null;
    if (status.tokenType === "system_user") {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-400">
          <Check size={11} />
          Permanente (System User)
        </span>
      );
    }
    if (status.tokenType === "user") {
      const expiry =
        status.expiresAt > 0
          ? new Date(status.expiresAt * 1000).toLocaleDateString("es", {
              day: "2-digit",
              month: "long",
              year: "numeric",
            })
          : null;
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-400">
          Personal{expiry ? ` · vence ${expiry}` : ""}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
        Tipo desconocido
      </span>
    );
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Estado de la conexión</DialogTitle>
          <DialogDescription>
            {instance.display_phone_number ?? instance.label}
          </DialogDescription>
        </DialogHeader>

        {isLoading && (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        )}

        {isError && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
            <AlertTriangle size={15} className="shrink-0" />
            No se pudo obtener el estado de Meta.
          </div>
        )}

        {data && (
          <div className="flex flex-col gap-5">
            {/* Token section */}
            <div className="flex flex-col gap-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Token de acceso
              </p>
              <div>{tokenBadge(data)}</div>
              <div className="flex flex-col gap-2">
                {data.permissions.map((perm) => (
                  <div
                    key={perm.name}
                    className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${
                      perm.granted
                        ? "border-muted bg-muted/30"
                        : "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20"
                    }`}
                  >
                    <span
                      className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${perm.granted ? "bg-emerald-500" : "bg-amber-500"}`}
                    />
                    <div>
                      <code className="font-mono font-semibold">
                        {perm.name}
                      </code>
                      <p className="mt-0.5 text-muted-foreground">
                        {PERM_LABELS[perm.name] ?? ""}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            {/* Meta configuration section */}
            <div className="flex flex-col gap-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Configuración Meta
              </p>
              <div className="flex flex-col gap-2 rounded-xl border bg-card p-4">
                <ConfigStatus
                  value={data.wabaSubscribed}
                  label="WABA suscripta"
                  nullNote="Sin WABA ID configurado"
                />
                <ConfigStatus
                  value={data.webhookConfigured}
                  label="Webhook URL"
                  nullNote="Sin App Secret"
                />
                <ConfigStatus
                  value={data.messagesSubscribed}
                  label="Campo messages"
                  nullNote="Sin App Secret"
                />
              </div>
              {data.webhookConfigured === null && (
                <p className="text-xs text-muted-foreground">
                  Configurá el App Secret para verificar el webhook
                  automáticamente.
                </p>
              )}
              {data.webhookUrl && (
                <div className="flex flex-col gap-1">
                  <p className="text-xs text-muted-foreground">
                    URL configurada en Meta:
                  </p>
                  <code className="break-all rounded bg-muted px-2 py-1 text-xs">
                    {data.webhookUrl}
                  </code>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Resultado de re-configuración */}
        {reconfResult && (
          <div className="flex flex-col gap-2 rounded-xl border bg-muted/40 p-4 text-sm">
            <p className="font-semibold text-foreground">
              Resultado de la configuración
            </p>

            {/* Errores */}
            {reconfResult.errors.length > 0 && (
              <div className="flex flex-col gap-1.5">
                {reconfResult.errors.map((e, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
                  >
                    <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                    {e}
                  </div>
                ))}
              </div>
            )}

            {/* Pasos saltados */}
            {reconfResult.skipped.length > 0 && (
              <div className="flex flex-col gap-1.5">
                {reconfResult.skipped.map((s, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300"
                  >
                    <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                    {s}
                  </div>
                ))}
              </div>
            )}

            {/* Checklist de resultados */}
            <div className="flex flex-col gap-1 rounded-lg border bg-card px-3 py-2">
              {[
                { label: "WABA suscripta", value: reconfResult.wabaSubscribed },
                { label: "Webhook URL", value: reconfResult.webhookConfigured },
                {
                  label: "Campo messages",
                  value: reconfResult.messagesSubscribed,
                },
              ].map(({ label, value }) => (
                <div
                  key={label}
                  className="flex items-center justify-between text-xs"
                >
                  <span className="text-muted-foreground">{label}</span>
                  {value === null ? (
                    <span className="text-muted-foreground">—</span>
                  ) : value ? (
                    <span className="font-medium text-emerald-600 dark:text-emerald-400">
                      Configurado
                    </span>
                  ) : (
                    <span className="font-medium text-destructive">Falló</span>
                  )}
                </div>
              ))}
            </div>

            {reconfResult.errors.length === 0 &&
              reconfResult.skipped.length === 0 && (
                <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  Todo configurado correctamente.
                </p>
              )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cerrar
          </Button>
          <Button
            onClick={() =>
              reconfigure.mutate(instance.id, {
                onSuccess: (res) => setReconfResult(res),
                onError: (e) => toast.error((e as Error).message),
              })
            }
            loading={reconfigure.isPending}
            loadingText="Configurando…"
            disabled={reconfigure.isPending}
          >
            Re-configurar Meta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Delete confirmation dialog ────────────────────────────────────────────

function DeleteDialog({
  instance,
  onClose,
}: {
  instance: WhatsAppInstance;
  onClose: () => void;
}) {
  const deleteInstance = useDeleteInstanceMutation();
  const hasFlow = Boolean(instance.flow_id);

  const handleDelete = () => {
    deleteInstance.mutate(instance.id, {
      onSuccess: () => {
        toast.success("Instancia eliminada.");
        onClose();
      },
      onError: (e) => toast.error((e as Error).message),
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Eliminar número de WhatsApp</DialogTitle>
          <DialogDescription>
            Estás por eliminar{" "}
            <span className="font-semibold text-foreground">
              {instance.display_phone_number ?? instance.label}
            </span>
            . Esta acción no se puede deshacer.
          </DialogDescription>
        </DialogHeader>

        {hasFlow ? (
          <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-900/20">
            <AlertTriangle
              size={16}
              className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400"
            />
            <div className="text-sm">
              <p className="font-semibold text-amber-800 dark:text-amber-300">
                Tiene un flow activo asignado
              </p>
              <p className="mt-0.5 text-amber-700 dark:text-amber-400">
                Para eliminar esta instancia primero desasignale el flow desde
                "Editar". Si la borrás con un flow activo, los clientes que
                estén en conversación dejarán de recibir respuestas.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-3 rounded-lg border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            <span>
              Se eliminará la instancia y sus credenciales de Meta. Las
              conversaciones y pagos existentes no se borran.
            </span>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
            disabled={deleteInstance.isPending}
          >
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={hasFlow || deleteInstance.isPending}
            loading={deleteInstance.isPending}
            loadingText="Eliminando…"
          >
            <Trash2 size={14} className="mr-1.5" />
            Eliminar instancia
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── InstancesPage ─────────────────────────────────────────────────────────

export function InstancesPage() {
  const navigate = useNavigate();
  const instances = useInstancesQuery();
  const flows = useFlowsV2Query();
  const [editing, setEditing] = useState<WhatsAppInstance | null>(null);
  const [deleting, setDeleting] = useState<WhatsAppInstance | null>(null);
  const [viewingStatus, setViewingStatus] = useState<WhatsAppInstance | null>(
    null
  );

  const flowMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of flows.data ?? []) m.set(f.id, f.name);
    return m;
  }, [flows.data]);

  return (
    <div className="flex flex-col gap-4 p-3 sm:gap-6 sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Números de WhatsApp</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Gestioná los números conectados a la plataforma y asignales un flow.
          </p>
        </div>
        <Button onClick={() => navigate("/instances/create")} className="gap-2">
          <Smartphone size={15} />
          Agregar número
        </Button>
      </div>

      {/* Webhook config */}
      <WebhookConfigCard />

      {/* Instances table */}
      <Card>
        <CardHeader>
          <CardTitle>Números registrados</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Número</TableHead>
                <TableHead>Moneda</TableHead>
                <TableHead>Flow activo</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {instances.isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (instances.data ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center">
                    <Smartphone
                      size={32}
                      className="mx-auto mb-2 text-muted-foreground/40"
                    />
                    <p className="text-sm text-muted-foreground">
                      Todavía no tenés números configurados.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={() => navigate("/instances/create")}
                    >
                      Agregar el primero
                    </Button>
                  </TableCell>
                </TableRow>
              ) : (
                (instances.data ?? []).map((instance) => {
                  const flowName = instance.flow_id
                    ? flowMap.get(instance.flow_id)
                    : null;
                  return (
                    <TableRow key={instance.id}>
                      <TableCell className="font-medium">
                        {instance.label}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {instance.display_phone_number ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono text-xs">
                          {instance.currency ?? "COP"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {flowName ? (
                          <span className="flex items-center gap-1.5 text-sm">
                            <Workflow size={13} className="text-emerald-500" />
                            {flowName}
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                            <Workflow size={13} className="opacity-30" />
                            Sin flow
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={instance.is_active ? "default" : "outline"}
                        >
                          {instance.is_active ? "Activo" : "Inactivo"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setEditing(instance)}
                          >
                            Editar
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="text-muted-foreground hover:text-primary"
                            onClick={() => setViewingStatus(instance)}
                          >
                            <Activity size={14} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => setDeleting(instance)}
                          >
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* CAPI Datasets */}
      <MetaDatasetsCard />

      {/* Edit dialog */}
      {editing && (
        <EditDialog
          instance={editing}
          flows={flows.data ?? []}
          onClose={() => setEditing(null)}
        />
      )}

      {/* Delete dialog */}
      {deleting && (
        <DeleteDialog instance={deleting} onClose={() => setDeleting(null)} />
      )}

      {/* Meta status modal */}
      {viewingStatus && (
        <MetaStatusModal
          instance={viewingStatus}
          onClose={() => setViewingStatus(null)}
        />
      )}
    </div>
  );
}
