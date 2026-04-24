import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  XCircle,
  Eye,
  EyeOff,
  Link,
  ShieldCheck,
  Copy,
  Smartphone,
  AlertTriangle,
  CircleDot,
  ExternalLink,
  Key,
  Zap,
  Clock,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useCreateInstanceMutation,
  useDiscoverInstancesMutation,
  useFlowsV2Query,
  useWebhookConfigQuery,
} from "@/lib/hooks";
import type {
  DiscoveredPhoneNumber,
  DiscoverInstancesResponse,
  AutoConfigResult,
} from "@/types/api";

// ── Constantes ────────────────────────────────────────────────────────────

const NO_FLOW_VALUE = "__none__";

const CURRENCIES = [
  { value: "COP", label: "COP — Peso colombiano" },
  { value: "USD", label: "USD — Dólar estadounidense" },
  { value: "EUR", label: "EUR — Euro" },
  { value: "MXN", label: "MXN — Peso mexicano" },
  { value: "BRL", label: "BRL — Real brasileño" },
  { value: "ARS", label: "ARS — Peso argentino" },
  { value: "CLP", label: "CLP — Peso chileno" },
  { value: "PEN", label: "PEN — Sol peruano" },
  { value: "VES", label: "VES — Bolívar venezolano" },
  { value: "GTQ", label: "GTQ — Quetzal guatemalteco" },
];

const PERM_LABELS: Record<string, string> = {
  whatsapp_business_messaging: "Enviar y recibir mensajes",
  whatsapp_business_management: "Gestionar números y suscribir webhooks",
  ads_read: "Enriquecer datos de anuncios (CTWA)",
};

// ── Estado del wizard ─────────────────────────────────────────────────────

type WizardStep = 1 | 2 | 3 | 4;

type WizardData = {
  metaToken: string;
  discovery: DiscoverInstancesResponse | null;
  selectedNumber: DiscoveredPhoneNumber | null;
  label: string;
  currency: string;
  flowId: string | null;
  appSecret: string;
  autoConfig: AutoConfigResult | null;
};

// ── Componentes utilitarios ───────────────────────────────────────────────

function WizardSteps({ current }: { current: WizardStep }) {
  const steps = ["Token", "Número", "Detalles", "Listo"];
  return (
    <div className="flex items-center gap-0">
      {steps.map((label, i) => {
        const n = (i + 1) as WizardStep;
        const done = n < current;
        const active = n === current;
        return (
          <React.Fragment key={n}>
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                  done
                    ? "bg-primary text-primary-foreground"
                    : active
                      ? "border-2 border-primary text-primary"
                      : "border border-muted-foreground/40 text-muted-foreground/60"
                }`}
              >
                {done ? <Check size={13} /> : n}
              </div>
              <span
                className={`hidden text-[11px] sm:block ${
                  active
                    ? "font-medium text-foreground"
                    : "text-muted-foreground/60"
                }`}
              >
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={`mb-5 h-px flex-1 mx-2 transition-colors ${
                  done ? "bg-primary" : "bg-border"
                }`}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function CopyButton({ value }: { value: string }) {
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
        <Check size={12} className="text-emerald-500" />
      ) : (
        <Copy size={12} />
      )}
      {copied ? "Copiado" : "Copiar"}
    </button>
  );
}

function PermBadge({ perm, missing }: { perm: string; missing: boolean }) {
  return (
    <div
      className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${
        missing
          ? "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20"
          : "border-muted bg-muted/30"
      }`}
    >
      <span
        className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${missing ? "bg-amber-500" : "bg-emerald-500"}`}
      />
      <div>
        <code className="font-mono font-semibold">{perm}</code>
        <p className="mt-0.5 text-muted-foreground">
          {PERM_LABELS[perm] ?? ""}
        </p>
      </div>
    </div>
  );
}

// ── Paso 1: Token ─────────────────────────────────────────────────────────

function TokenStep({
  onDiscovered,
}: {
  onDiscovered: (token: string, result: DiscoverInstancesResponse) => void;
}) {
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  // Fallback: cuando discovery devuelve 0 números, pedimos el WABA ID manual
  const [showWabaFallback, setShowWabaFallback] = useState(false);
  const [wabaId, setWabaId] = useState("");
  const discover = useDiscoverInstancesMutation();

  const handleDiscover = (manualWabaId?: string) => {
    if (!token.trim()) return;
    setShowWabaFallback(false);
    discover.mutate(
      { metaToken: token.trim(), wabaId: manualWabaId?.trim() || undefined },
      {
        onSuccess: (result) => {
          if (result.phoneNumbers.length === 0 && !manualWabaId) {
            // Auto-discovery falló: mostrar fallback de WABA ID
            setShowWabaFallback(true);
          } else {
            onDiscovered(token.trim(), result);
          }
        },
        onError: () => {
          /* error se muestra inline */
        },
      }
    );
  };

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-5">
      <div>
        <h3 className="text-lg font-semibold">
          Pegá tu token de acceso de Meta
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Con un solo token detectamos automáticamente todos tus números de
          WhatsApp disponibles.
        </p>
      </div>

      {/* Input del token */}
      <div className="flex flex-col gap-1.5">
        <Label className="text-sm font-semibold">Token de acceso</Label>
        <div className="flex gap-2">
          <Input
            type={showToken ? "text" : "password"}
            value={token}
            onChange={(e) => {
              setToken(e.target.value);
              setShowWabaFallback(false);
            }}
            onKeyDown={(e) =>
              e.key === "Enter" && token.trim() && handleDiscover()
            }
            placeholder="EAAP…"
            className="flex-1 font-mono text-sm"
            autoFocus
          />
          <button
            type="button"
            onClick={() => setShowToken((v) => !v)}
            className="rounded-md border bg-background px-2.5 text-muted-foreground hover:bg-muted"
          >
            {showToken ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          El token se usa solo para consultar Meta. No se almacena hasta que
          creés la instancia.
        </p>
      </div>

      {/* Error inline */}
      {discover.isError && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <span>{(discover.error as Error).message}</span>
        </div>
      )}

      {/* Fallback: WABA ID manual cuando auto-discovery no encuentra números */}
      {showWabaFallback && (
        <div className="flex flex-col gap-4 rounded-xl border bg-card p-5">
          {/* Encabezado */}
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <ShieldCheck size={17} className="text-primary" />
            </div>
            <div>
              <p className="font-semibold text-foreground">
                Token verificado — un paso más
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Tu token es válido y tiene todos los permisos. La API de Meta no
                expone los números directamente para algunos System Users; es
                normal y se resuelve ingresando el ID de tu cuenta de WhatsApp
                Business.
              </p>
            </div>
          </div>

          <Separator />

          {/* Pasos para encontrar el WABA ID */}
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Cómo obtener tu WABA ID
            </p>
            <ol className="flex flex-col gap-2.5">
              {[
                <>
                  Abrí{" "}
                  <span className="font-medium text-foreground">
                    business.facebook.com
                  </span>{" "}
                  e ingresá con tu cuenta.
                </>,
                <>
                  En el menú lateral izquierdo, hacé click en{" "}
                  <span className="font-medium text-foreground">
                    Configuración del negocio
                  </span>
                  .
                </>,
                <>
                  Navegá a{" "}
                  <span className="font-medium text-foreground">
                    Cuentas → Cuentas de WhatsApp Business
                  </span>
                  .
                </>,
                <>
                  Seleccioná tu cuenta. El{" "}
                  <span className="font-medium text-foreground">
                    ID de la cuenta
                  </span>{" "}
                  aparece debajo del nombre (ej:{" "}
                  <code className="rounded bg-muted px-1 text-[11px]">
                    123456789012345
                  </code>
                  ).
                </>,
              ].map((step, i) => (
                <li
                  key={i}
                  className="flex gap-2.5 text-sm text-muted-foreground"
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-foreground">
                    {i + 1}
                  </span>
                  <span className="leading-5">{step}</span>
                </li>
              ))}
            </ol>
          </div>

          <Separator />

          {/* Input del WABA ID */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-sm font-semibold">
              ID de cuenta de WhatsApp Business
            </Label>
            <div className="flex gap-2">
              <Input
                value={wabaId}
                onChange={(e) => setWabaId(e.target.value)}
                onKeyDown={(e) =>
                  e.key === "Enter" && wabaId.trim() && handleDiscover(wabaId)
                }
                placeholder="123456789012345"
                className="flex-1 font-mono text-sm"
                autoFocus
              />
              <Button
                onClick={() => handleDiscover(wabaId)}
                loading={discover.isPending}
                loadingText="Buscando…"
                disabled={!wabaId.trim() || discover.isPending}
              >
                Buscar números
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Solo se usa para consultar tus números de WhatsApp. No se almacena
              hasta que creés la instancia.
            </p>
          </div>

          {/* Link para volver */}
          <button
            type="button"
            onClick={() => {
              setShowWabaFallback(false);
              discover.reset();
            }}
            className="self-start text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            Probar con otro token
          </button>
        </div>
      )}

      {!showWabaFallback && (
        <Button
          onClick={() => handleDiscover()}
          loading={discover.isPending}
          loadingText="Consultando Meta…"
          disabled={!token.trim() || discover.isPending}
          className="w-full"
          size="lg"
        >
          <Zap size={15} className="mr-2" />
          Descubrir números automáticamente
        </Button>
      )}

      {/* ── Ayuda colapsable ─────────────────────────────────── */}
      <div className="rounded-xl border">
        <button
          type="button"
          onClick={() => setShowHelp((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <span className="flex items-center gap-2">
            <Key size={14} />
            ¿Cómo obtengo el token?
          </span>
          <ChevronDown
            size={15}
            className={`transition-transform duration-200 ${showHelp ? "rotate-180" : ""}`}
          />
        </button>

        {showHelp && (
          <div className="border-t px-4 pb-4 pt-3">
            <div className="flex flex-col gap-5 text-sm">
              {/* System User Token */}
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <Badge variant="default" className="text-[10px]">
                    Recomendado para producción
                  </Badge>
                </div>
                <p className="font-medium mb-2">System User Token — no vence</p>
                <ol className="flex flex-col gap-2 text-muted-foreground">
                  {[
                    <>
                      Entrá a{" "}
                      <span className="font-medium text-foreground">
                        business.facebook.com
                      </span>{" "}
                      → Configuración del negocio.
                    </>,
                    <>
                      Menú izquierdo:{" "}
                      <span className="font-medium text-foreground">
                        Usuarios → Usuarios del sistema
                      </span>
                      . Creá un usuario con rol{" "}
                      <code className="rounded bg-muted px-1 text-xs">
                        Admin
                      </code>
                      .
                    </>,
                    <>
                      Hacé click en{" "}
                      <span className="font-medium text-foreground">
                        Generar token
                      </span>
                      , seleccioná tu app y activá los 3 permisos de abajo.
                    </>,
                    <>
                      Copiá el token y pegálo arriba. <strong>No vence.</strong>
                    </>,
                  ].map((step, i) => (
                    <li key={i} className="flex gap-2.5">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">
                        {i + 1}
                      </span>
                      <span className="leading-5">{step}</span>
                    </li>
                  ))}
                </ol>
              </div>

              <Separator />

              {/* Token temporal */}
              <div>
                <div className="mb-1.5 flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">
                    Solo para pruebas
                  </Badge>
                </div>
                <p className="font-medium mb-1">
                  Token temporal — vence en 24 h
                </p>
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">
                    Meta for Developers
                  </span>{" "}
                  → tu app → WhatsApp → API Setup → "Temporary access token".
                  Sirve para descubrir números pero te avisaremos al guardar.
                </p>
              </div>

              <Separator />

              {/* Permisos requeridos */}
              <div>
                <p className="font-medium mb-2">
                  Permisos que debe tener el token
                </p>
                <div className="flex flex-col gap-1.5">
                  {Object.keys(PERM_LABELS).map((p) => (
                    <PermBadge key={p} perm={p} missing={false} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Paso 2: Selección de número ───────────────────────────────────────────

function PhoneSelectStep({
  discovery,
  onSelect,
  onBack,
}: {
  discovery: DiscoverInstancesResponse;
  onSelect: (number: DiscoveredPhoneNumber) => void;
  onBack: () => void;
}) {
  const [selected, setSelected] = useState<DiscoveredPhoneNumber | null>(null);

  // Calcular estado del token
  const isSystemUser = discovery.tokenType === "system_user";
  const isPermanent = discovery.expiresAt === 0;
  const expiryDate =
    discovery.expiresAt > 0
      ? new Date(discovery.expiresAt * 1000).toLocaleDateString("es", {
          day: "2-digit",
          month: "long",
          year: "numeric",
        })
      : null;
  const hasMissingPerms = discovery.missingPermissions.length > 0;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
      {/* Estado del token */}
      <div className="flex flex-col gap-3">
        <h3 className="text-lg font-semibold">
          Seleccioná el número a conectar
        </h3>

        <div className="flex flex-wrap gap-2">
          {/* Tipo de token */}
          {isSystemUser ? (
            <div className="flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-400">
              <Check size={11} />
              Token permanente (System User)
            </div>
          ) : discovery.tokenType === "user" ? (
            <div className="flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-400">
              <Clock size={11} />
              Token personal — vence{expiryDate ? ` el ${expiryDate}` : ""}
            </div>
          ) : null}
        </div>

        {/* Advertencia si el token vence */}
        {!isPermanent && discovery.tokenType === "user" && (
          <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            <div>
              <span className="font-semibold">Este token vence.</span> Podés
              continuar, pero cuando expire el bot dejará de funcionar. Para
              producción, generá un{" "}
              <span className="font-semibold">System User Token</span> (no
              vence) siguiendo los pasos del paso anterior.
            </div>
          </div>
        )}

        {/* Advertencia si faltan permisos */}
        {hasMissingPerms && (
          <div className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 dark:border-amber-800 dark:bg-amber-900/20">
            <div className="flex items-center gap-2 text-sm font-semibold text-amber-800 dark:text-amber-300">
              <AlertTriangle size={15} />
              Al token le faltan permisos
            </div>
            <div className="flex flex-col gap-1.5">
              {discovery.missingPermissions.map((p) => (
                <PermBadge key={p} perm={p} missing />
              ))}
            </div>
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Podés continuar pero algunas funciones no van a operar
              correctamente. Regenerá el token con todos los permisos.
            </p>
          </div>
        )}
      </div>

      {/* Lista de números */}
      {discovery.phoneNumbers.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-12 text-center">
          <Smartphone size={36} className="text-muted-foreground/30" />
          <div>
            <p className="font-medium text-foreground">
              No se encontraron números
            </p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              El token es válido pero no tiene números de WhatsApp asociados.
              Asegurate de que la cuenta tenga al menos un número registrado en
              WhatsApp Business.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={onBack}>
            Volver e intentar con otro token
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          <p className="text-sm text-muted-foreground">
            Se encontraron{" "}
            <span className="font-semibold text-foreground">
              {discovery.phoneNumbers.length} número
              {discovery.phoneNumbers.length !== 1 ? "s" : ""}
            </span>{" "}
            asociados a este token.
          </p>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {discovery.phoneNumbers.map((pn) => {
              const isSelected = selected?.id === pn.id;
              return (
                <button
                  key={pn.id}
                  type="button"
                  onClick={() => setSelected(pn)}
                  className={`flex items-start gap-3 rounded-xl border p-4 text-left transition-all hover:border-primary/50 hover:bg-primary/5 ${
                    isSelected
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border bg-card"
                  }`}
                >
                  <div
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                      isSelected
                        ? "border-primary bg-primary"
                        : "border-muted-foreground/40"
                    }`}
                  >
                    {isSelected && (
                      <Check size={11} className="text-primary-foreground" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-foreground">
                      {pn.verifiedName || "Número sin nombre"}
                    </p>
                    <p className="mt-0.5 font-mono text-sm text-muted-foreground">
                      {pn.displayPhoneNumber}
                    </p>
                    <p className="mt-1 truncate rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                      WABA: {pn.wabaId}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Navegación */}
      {discovery.phoneNumbers.length > 0 && (
        <div className="flex items-center justify-between pt-2">
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft size={14} className="mr-1.5" />
            Volver
          </Button>
          <Button
            onClick={() => selected && onSelect(selected)}
            disabled={!selected}
          >
            Continuar con este número
            <Check size={14} className="ml-1.5" />
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Paso 3: Detalles + webhook ────────────────────────────────────────────

function DetailsStep({
  selectedNumber,
  onConfirm,
  onBack,
}: {
  selectedNumber: DiscoveredPhoneNumber;
  onConfirm: (data: {
    label: string;
    currency: string;
    flowId: string | null;
    appSecret: string;
  }) => void;
  onBack: () => void;
}) {
  const [label, setLabel] = useState(
    selectedNumber.verifiedName || selectedNumber.displayPhoneNumber
  );
  const [currency, setCurrency] = useState("COP");
  const [flowId, setFlowId] = useState(NO_FLOW_VALUE);
  const [appSecret, setAppSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [showVerifyToken, setShowVerifyToken] = useState(false);
  const [showWebhook, setShowWebhook] = useState(true);
  const [showConfirm, setShowConfirm] = useState(false);

  const flows = useFlowsV2Query();
  const webhookConfig = useWebhookConfigQuery();

  const handleCreate = () => {
    if (!appSecret.trim()) {
      setShowConfirm(true);
    } else {
      onConfirm({
        label: label.trim(),
        currency,
        flowId: flowId === NO_FLOW_VALUE ? null : flowId,
        appSecret: appSecret.trim(),
      });
    }
  };
  const activeFlows = (flows.data ?? []).filter((f) => f.is_active);

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
      <div>
        <h3 className="text-lg font-semibold">Completá los detalles</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Número:{" "}
          <span className="font-medium text-foreground">
            {selectedNumber.displayPhoneNumber}
          </span>
          {selectedNumber.verifiedName && (
            <span className="text-muted-foreground">
              {" "}
              · {selectedNumber.verifiedName}
            </span>
          )}
        </p>
      </div>

      {/* Nombre */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline gap-1.5">
          <Label className="text-sm font-semibold">Nombre del número</Label>
          <span className="text-xs text-destructive">Requerido</span>
        </div>
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Ej: Línea principal, Ventas, Soporte…"
        />
        <p className="text-xs text-muted-foreground">
          Solo para reconocerlo en el panel. El cliente no lo ve.
        </p>
      </div>

      {/* Moneda + Flow en grid compacto */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label className="text-sm font-semibold">Moneda</Label>
          <Select value={currency} onValueChange={setCurrency}>
            <SelectTrigger>
              <SelectValue placeholder="Seleccionar moneda" />
            </SelectTrigger>
            <SelectContent>
              {CURRENCIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Divisa de los pagos en este número.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline gap-1.5">
            <Label className="text-sm font-semibold">Flow activo</Label>
            <span className="text-xs text-muted-foreground">(opcional)</span>
          </div>
          {flows.isLoading ? (
            <Skeleton className="h-9 w-full" />
          ) : (
            <Select value={flowId} onValueChange={setFlowId}>
              <SelectTrigger>
                <SelectValue placeholder="Sin flow" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_FLOW_VALUE}>
                  <span className="text-muted-foreground">Sin flow</span>
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
          )}
          <p className="text-xs text-muted-foreground">
            Podés asignarlo después.
          </p>
        </div>
      </div>

      {/* App Secret */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline gap-1.5">
          <Label className="text-sm font-semibold">App Secret</Label>
          <span className="text-xs text-muted-foreground">(recomendado)</span>
        </div>
        <div className="flex gap-2">
          <Input
            type={showSecret ? "text" : "password"}
            value={appSecret}
            onChange={(e) => setAppSecret(e.target.value)}
            placeholder="abc123…"
            className="flex-1 font-mono text-sm"
          />
          <button
            type="button"
            onClick={() => setShowSecret((v) => !v)}
            className="rounded-md border bg-background px-2.5 text-muted-foreground hover:bg-muted"
          >
            {showSecret ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">
            Meta for Developers → tu app → App Settings → Basic → App Secret.
          </span>{" "}
          Necesario para configurar el webhook automáticamente y verificar que
          cada mensaje realmente viene de Meta.
        </p>
      </div>

      {/* Webhook — automático si hay App Secret, manual si no */}
      {appSecret.trim() ? (
        <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-800 dark:bg-emerald-900/20">
          <Zap
            size={15}
            className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400"
          />
          <div className="text-sm">
            <p className="font-semibold text-emerald-800 dark:text-emerald-300">
              Webhook se configurará automáticamente
            </p>
            <p className="mt-0.5 text-xs text-emerald-700 dark:text-emerald-400">
              Al crear la instancia registraremos la URL del webhook, el verify
              token y el campo{" "}
              <code className="rounded bg-emerald-100 px-1 dark:bg-emerald-900/40">
                messages
              </code>{" "}
              en Meta por vos.
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-primary/20 bg-primary/5">
          <button
            type="button"
            onClick={() => setShowWebhook((v) => !v)}
            className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium"
          >
            <span className="flex items-center gap-2">
              <ShieldCheck size={14} className="text-primary" />
              Configuración manual del webhook
            </span>
            <ChevronDown
              size={15}
              className={`text-muted-foreground transition-transform duration-200 ${showWebhook ? "rotate-180" : ""}`}
            />
          </button>

          {showWebhook && (
            <div className="border-t px-4 pb-4 pt-3">
              <p className="mb-3 text-xs text-muted-foreground">
                Sin App Secret el webhook hay que configurarlo a mano en{" "}
                <span className="font-medium text-foreground">
                  Meta for Developers → tu app → WhatsApp → Configuration →
                  Webhooks
                </span>
                .
              </p>
              {webhookConfig.isLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-9 w-full" />
                  <Skeleton className="h-9 w-full" />
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1">
                    <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <Link size={11} />
                      Callback URL
                    </span>
                    <div className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2">
                      <code className="flex-1 break-all text-xs">
                        {webhookConfig.data?.webhookUrl ?? "—"}
                      </code>
                      <CopyButton
                        value={webhookConfig.data?.webhookUrl ?? ""}
                      />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <ShieldCheck size={11} />
                      Verify Token
                    </span>
                    <div className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2">
                      <code className="flex-1 text-xs">
                        {showVerifyToken
                          ? (webhookConfig.data?.verifyToken ?? "—")
                          : "•".repeat(
                              Math.min(
                                webhookConfig.data?.verifyToken?.length ?? 8,
                                20
                              )
                            )}
                      </code>
                      <button
                        type="button"
                        onClick={() => setShowVerifyToken((v) => !v)}
                        className="rounded p-1 text-muted-foreground hover:bg-muted"
                      >
                        {showVerifyToken ? (
                          <EyeOff size={13} />
                        ) : (
                          <Eye size={13} />
                        )}
                      </button>
                      <CopyButton
                        value={webhookConfig.data?.verifyToken ?? ""}
                      />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Después de pegar, suscribite al evento{" "}
                    <code className="rounded bg-background px-1.5 py-0.5">
                      messages
                    </code>
                    .
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Navegación */}
      <div className="flex items-center justify-between pt-1">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft size={14} className="mr-1.5" />
          Volver
        </Button>
        <Button onClick={handleCreate} disabled={!label.trim()} size="lg">
          Crear instancia
        </Button>
      </div>

      {/* Confirmación sin App Secret */}
      <Dialog
        open={showConfirm}
        onOpenChange={(o) => !o && setShowConfirm(false)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>¿Continuar sin App Secret?</DialogTitle>
            <DialogDescription>
              Sin App Secret la instancia se crea, pero algunas configuraciones
              deberás hacerlas a mano.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2">
            <div className="flex items-start gap-2.5 rounded-lg border bg-muted/40 px-3.5 py-3 text-sm">
              <Check size={14} className="mt-0.5 shrink-0 text-emerald-500" />
              <span className="text-muted-foreground">
                <span className="font-medium text-foreground">WABA</span> — se
                suscribirá automáticamente al crear.
              </span>
            </div>
            <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm dark:border-amber-800 dark:bg-amber-900/20">
              <AlertTriangle
                size={14}
                className="mt-0.5 shrink-0 text-amber-500"
              />
              <span className="text-amber-800 dark:text-amber-300">
                <span className="font-medium">Webhook</span> — deberás
                configurarlo manualmente en{" "}
                <span className="font-medium">
                  Meta for Developers → tu app → WhatsApp → Configuration →
                  Webhooks
                </span>
                .
              </span>
            </div>
            <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm dark:border-amber-800 dark:bg-amber-900/20">
              <AlertTriangle
                size={14}
                className="mt-0.5 shrink-0 text-amber-500"
              />
              <span className="text-amber-800 dark:text-amber-300">
                <span className="font-medium">Verificación de firma</span> — los
                mensajes entrantes no se verificarán criptográficamente (menor
                seguridad).
              </span>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirm(false)}>
              Agregar App Secret
            </Button>
            <Button
              variant="default"
              onClick={() => {
                setShowConfirm(false);
                onConfirm({
                  label: label.trim(),
                  currency,
                  flowId: flowId === NO_FLOW_VALUE ? null : flowId,
                  appSecret: "",
                });
              }}
            >
              Continuar sin App Secret
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Paso 4: Confirmación ──────────────────────────────────────────────────

function AutoConfigChecklist({
  autoConfig,
}: {
  autoConfig: AutoConfigResult | null;
}) {
  const webhookConfig = useWebhookConfigQuery();
  const [showManual, setShowManual] = useState(false);
  const [showVerifyToken, setShowVerifyToken] = useState(false);

  if (!autoConfig) {
    return (
      <div className="flex flex-col gap-2 rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">
        <p>Cargando resultado de la auto-configuración…</p>
      </div>
    );
  }

  const allOk =
    autoConfig.wabaSubscribed &&
    autoConfig.webhookConfigured &&
    autoConfig.messagesSubscribed;
  const webhookFailed =
    !autoConfig.webhookConfigured || !autoConfig.messagesSubscribed;

  function StatusIcon({ value }: { value: boolean | null }) {
    if (value === null) return <span className="text-muted-foreground">—</span>;
    if (value)
      return (
        <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
      );
    return <XCircle className="h-4 w-4 text-destructive" />;
  }

  const items = [
    { label: "WABA suscripta al app", value: autoConfig.wabaSubscribed },
    { label: "Webhook URL registrada", value: autoConfig.webhookConfigured },
    { label: "Campo messages activo", value: autoConfig.messagesSubscribed },
  ];

  return (
    <div className="flex flex-col gap-3">
      <h4 className="font-semibold">Auto-configuración en Meta</h4>

      <div className="flex flex-col gap-2 rounded-xl border bg-card p-4">
        {items.map((item) => (
          <div
            key={item.label}
            className="flex items-center justify-between text-sm"
          >
            <span className="text-muted-foreground">{item.label}</span>
            <StatusIcon value={item.value} />
          </div>
        ))}
      </div>

      {autoConfig.errors.length > 0 && (
        <div className="flex flex-col gap-1">
          {autoConfig.errors.map((err, i) => (
            <p key={i} className="text-xs text-destructive">
              {err}
            </p>
          ))}
        </div>
      )}

      {allOk && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300">
          <Check size={15} />
          Todo listo — podés empezar a recibir mensajes
        </div>
      )}

      {!allOk && webhookFailed && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">
            El webhook requiere el App Secret. Podés configurarlo manualmente en
            Meta for Developers.
          </p>
          <button
            type="button"
            onClick={() => setShowManual((v) => !v)}
            className="self-start flex items-center gap-1.5 text-xs text-primary underline-offset-2 hover:underline"
          >
            <ChevronDown
              size={13}
              className={`transition-transform duration-200 ${showManual ? "rotate-180" : ""}`}
            />
            {showManual ? "Ocultar pasos manuales" : "Ver pasos manuales"}
          </button>

          {showManual && (
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="pt-4">
                <ol className="flex flex-col gap-4 text-sm">
                  {[
                    <>
                      Entrá a{" "}
                      <span className="font-medium text-foreground">
                        Meta for Developers
                      </span>{" "}
                      → tu app → WhatsApp → Configuration → Webhooks.
                      <a
                        href="https://developers.facebook.com/apps"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-1.5 inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
                      >
                        Abrir Meta for Developers
                        <ExternalLink size={11} />
                      </a>
                    </>,
                    <>
                      Hacé click en{" "}
                      <span className="font-medium text-foreground">Edit</span>{" "}
                      y pegá la{" "}
                      <span className="font-medium text-foreground">
                        Callback URL
                      </span>
                      :
                      {webhookConfig.data?.webhookUrl && (
                        <div className="mt-1.5 flex items-center gap-2 rounded border bg-background px-2.5 py-1.5">
                          <code className="flex-1 break-all text-xs">
                            {webhookConfig.data.webhookUrl}
                          </code>
                          <CopyButton value={webhookConfig.data.webhookUrl} />
                        </div>
                      )}
                    </>,
                    <>
                      Pegá el{" "}
                      <span className="font-medium text-foreground">
                        Verify Token
                      </span>
                      :
                      {webhookConfig.data?.verifyToken && (
                        <div className="mt-1.5 flex items-center gap-2 rounded border bg-background px-2.5 py-1.5">
                          <code className="flex-1 text-xs">
                            {showVerifyToken
                              ? webhookConfig.data.verifyToken
                              : "•".repeat(
                                  Math.min(
                                    webhookConfig.data.verifyToken.length,
                                    20
                                  )
                                )}
                          </code>
                          <button
                            type="button"
                            onClick={() => setShowVerifyToken((v) => !v)}
                            className="rounded p-1 text-muted-foreground hover:bg-muted"
                          >
                            {showVerifyToken ? (
                              <EyeOff size={12} />
                            ) : (
                              <Eye size={12} />
                            )}
                          </button>
                          <CopyButton value={webhookConfig.data.verifyToken} />
                        </div>
                      )}
                    </>,
                    <>
                      En{" "}
                      <span className="font-medium text-foreground">
                        Webhook Fields
                      </span>
                      , suscribite al evento{" "}
                      <code className="rounded bg-muted px-1.5 py-0.5">
                        messages
                      </code>
                      . Hacé click en{" "}
                      <span className="font-medium text-foreground">
                        Subscribe
                      </span>
                      .
                    </>,
                  ].map((step, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-bold text-primary">
                        {i + 1}
                      </span>
                      <span className="leading-6">{step}</span>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function SuccessStep({
  selectedNumber,
  label,
  currency,
  autoConfig,
}: {
  selectedNumber: DiscoveredPhoneNumber;
  label: string;
  currency: string;
  autoConfig: AutoConfigResult | null;
}) {
  const navigate = useNavigate();

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      {/* Header de éxito */}
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
          <Check size={32} className="text-emerald-600 dark:text-emerald-400" />
        </div>
        <div>
          <h3 className="text-xl font-semibold">¡Número conectado!</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{label}</span> fue
            registrado correctamente.
          </p>
        </div>
      </div>

      {/* Resumen */}
      <Card>
        <CardContent className="pt-4">
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            {[
              { label: "Número", value: selectedNumber.displayPhoneNumber },
              {
                label: "Nombre verificado",
                value: selectedNumber.verifiedName || "—",
              },
              { label: "Nombre en panel", value: label },
              { label: "Moneda", value: currency },
              { label: "Phone Number ID", value: selectedNumber.id },
              { label: "WABA ID", value: selectedNumber.wabaId },
            ].map((item) => (
              <div key={item.label}>
                <p className="text-xs text-muted-foreground">{item.label}</p>
                <p className="font-medium font-mono text-xs text-foreground truncate">
                  {item.value}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Auto-configuración */}
      <AutoConfigChecklist autoConfig={autoConfig} />

      <Button
        size="lg"
        onClick={() => navigate("/instances")}
        className="w-full"
      >
        <Smartphone size={15} className="mr-2" />
        Ir a Números de WhatsApp
      </Button>
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────

export function InstanceCreatePage() {
  const navigate = useNavigate();
  const createInstance = useCreateInstanceMutation();

  const [step, setStep] = useState<WizardStep>(1);
  const [wizardData, setWizardData] = useState<WizardData>({
    metaToken: "",
    discovery: null,
    selectedNumber: null,
    label: "",
    currency: "COP",
    flowId: null,
    appSecret: "",
    autoConfig: null,
  });

  const handleDiscovered = (
    token: string,
    result: DiscoverInstancesResponse
  ) => {
    setWizardData((d) => ({ ...d, metaToken: token, discovery: result }));
    setStep(2);
  };

  const handleNumberSelected = (number: DiscoveredPhoneNumber) => {
    setWizardData((d) => ({ ...d, selectedNumber: number }));
    setStep(3);
  };

  const handleConfirm = ({
    label,
    currency,
    flowId,
    appSecret,
  }: {
    label: string;
    currency: string;
    flowId: string | null;
    appSecret: string;
  }) => {
    const pn = wizardData.selectedNumber!;
    createInstance.mutate(
      {
        label,
        phoneNumberId: pn.id,
        metaToken: wizardData.metaToken,
        wabaId: pn.wabaId,
        displayPhoneNumber: pn.displayPhoneNumber,
        appSecret: appSecret || undefined,
        currency,
        isActive: true,
        flowId: flowId || undefined,
      },
      {
        onSuccess: (res) => {
          setWizardData((d) => ({
            ...d,
            label,
            currency,
            flowId,
            appSecret,
            autoConfig: res.autoConfig,
          }));
          setStep(4);
        },
        onError: (e) => toast.error(`Error al crear: ${(e as Error).message}`),
      }
    );
  };

  return (
    <div className="flex flex-col gap-6 p-3 sm:p-6">
      {/* Header */}
      <div>
        <button
          type="button"
          onClick={() => navigate("/instances")}
          className="mb-3 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={14} />
          Volver a WhatsApp
        </button>
        <h2 className="text-2xl font-semibold">Agregar número de WhatsApp</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Solo necesitás tu token de acceso de Meta. El resto lo detectamos
          automáticamente.
        </p>
      </div>

      {/* Wizard */}
      <Card className="mx-auto w-full max-w-2xl">
        <CardHeader className="pb-4">
          <WizardSteps current={step} />
        </CardHeader>

        <Separator />

        <CardContent className="pt-6">
          {/* Loading state al crear */}
          {createInstance.isPending && (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <p className="text-sm text-muted-foreground">
                Creando instancia…
              </p>
            </div>
          )}

          {!createInstance.isPending && (
            <>
              {step === 1 && <TokenStep onDiscovered={handleDiscovered} />}

              {step === 2 && wizardData.discovery && (
                <PhoneSelectStep
                  discovery={wizardData.discovery}
                  onSelect={handleNumberSelected}
                  onBack={() => setStep(1)}
                />
              )}

              {step === 3 && wizardData.selectedNumber && (
                <DetailsStep
                  selectedNumber={wizardData.selectedNumber}
                  onConfirm={handleConfirm}
                  onBack={() => setStep(2)}
                />
              )}

              {step === 4 && wizardData.selectedNumber && (
                <SuccessStep
                  selectedNumber={wizardData.selectedNumber}
                  label={wizardData.label}
                  currency={wizardData.currency}
                  autoConfig={wizardData.autoConfig}
                />
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
