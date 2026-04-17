import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Copy,
  Check,
  Workflow,
  Smartphone,
  ExternalLink,
  ShieldCheck,
  Link,
  Eye,
  EyeOff,
  CircleDot,
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
  useFlowsV2Query,
  useInstancesQuery,
  useTestInstanceHealthMutation,
  useUpdateInstanceMutation,
  useWebhookConfigQuery,
} from "@/lib/hooks";
import type { InstanceHealth } from "@/types/api";

const NO_FLOW_VALUE = "__none__";

function getInstanceHealthMessage(res: InstanceHealth): string {
  if (res.detail && res.detail.trim().length > 0) return res.detail;
  switch (res.reason) {
    case "token_expired":
      return "El token venció. Generá uno nuevo en Meta.";
    case "token_invalid":
      return "Token inválido o revocado.";
    case "insufficient_permissions":
      return "El token no tiene los permisos necesarios.";
    case "phone_number_not_found":
      return "El ID del número no existe en Meta.";
    case "app_not_subscribed":
      return "La app no está habilitada para usar WhatsApp.";
    case "rate_limited":
      return "Meta está limitando las peticiones. Intentá más tarde.";
    default:
      return "No se pudo verificar la conexión con Meta.";
  }
}

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
  const assignFlow = useAssignFlowMutation();
  const testHealth = useTestInstanceHealthMutation();

  const [label, setLabel] = useState(instance.label);
  const [metaToken, setMetaToken] = useState(instance.meta_token ?? "");
  const [displayPhone, setDisplayPhone] = useState(
    instance.display_phone_number ?? ""
  );
  const [selectedFlow, setSelectedFlow] = useState(
    instance.flow_id ?? NO_FLOW_VALUE
  );
  const [currency, setCurrency] = useState(instance.currency ?? "COP");
  const [showToken, setShowToken] = useState(false);

  const activeFlows = flows.filter((f) => f.is_active);

  const save = () => {
    updateInstance.mutate(
      {
        id: instance.id,
        payload: {
          label: label.trim() || instance.label,
          metaToken: metaToken.trim() || undefined,
          displayPhoneNumber: displayPhone.trim() || undefined,
          currency: currency || undefined,
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
          </div>
        </div>

        {/* ── Footer fijo con acciones ──────────────────────────── */}
        <div className="shrink-0 flex items-center gap-2 border-t bg-muted/30 px-6 py-4">
          <Button
            variant="outline"
            size="sm"
            loading={testHealth.isPending}
            loadingText="Verificando…"
            onClick={() =>
              testHealth.mutate(instance.id, {
                onSuccess: (res) => {
                  if (res.status === "connected")
                    toast.success("Token vigente — conexión OK.");
                  else toast.error(getInstanceHealthMessage(res));
                },
                onError: (e) => toast.error(`Error: ${(e as Error).message}`),
              })
            }
          >
            Verificar conexión
          </Button>
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

// ── InstancesPage ─────────────────────────────────────────────────────────

export function InstancesPage() {
  const navigate = useNavigate();
  const instances = useInstancesQuery();
  const flows = useFlowsV2Query();
  const [editing, setEditing] = useState<WhatsAppInstance | null>(null);

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
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEditing(instance)}
                        >
                          Editar
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Edit dialog */}
      {editing && (
        <EditDialog
          instance={editing}
          flows={flows.data ?? []}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
