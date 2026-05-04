import { useParams, useNavigate, Link } from "react-router-dom";
import { Zap, Clock, HelpCircle, Tag, CreditCard, Bot } from "lucide-react";
import { useFlowV2Query } from "@/lib/hooks";
import { emptyDraft } from "@/lib/flowUtils";
import { FlowCanvas } from "@/components/FlowCanvas";
import { PageBreadcrumb } from "@/components/PageBreadcrumb";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import type { FlowEditorDraft } from "@/lib/flowUtils";
import type { FlowV2 } from "@/types/api";

function toDraft(flow?: FlowV2): FlowEditorDraft {
  if (!flow) return emptyDraft();
  const overrides = (flow.message_overrides ?? {}) as Record<string, string>;
  return {
    id: flow.id,
    name: flow.name,
    triggerPhrase: flow.trigger_phrase,
    keywords: flow.keywords ?? [],
    noMatchBehavior: flow.no_match_behavior,
    systemPrompt: flow.system_prompt ?? "",
    isActive: flow.is_active,
    sessionTimeoutHours: flow.session_timeout_hours ?? 24,
    receiptPendingMessage: overrides.receiptPendingMessage ?? "",
    receiptRejectedMessage: overrides.receiptRejectedMessage ?? "",
    receiptConfirmedMessage: overrides.receiptConfirmedMessage ?? "",
    steps: (flow.steps ?? [])
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((s) => ({
        id: s.id,
        position: s.position,
        delaySeconds: s.delay_seconds,
        label: s.label ?? "",
        messages: (s.messages ?? [])
          .slice()
          .sort((a, b) => a.position - b.position)
          .map((m) => ({
            id: m.id,
            position: m.position,
            messageType: m.message_type,
            textContent: m.text_content ?? "",
            textVariants: m.text_variants ?? [],
            mediaUrl: m.media_url ?? "",
            filename: m.filename ?? "",
            caption: m.caption ?? "",
          })),
      })),
  };
}

function ConfigField({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </dt>
      <dd>{children}</dd>
    </div>
  );
}

export function FlowDetailPage() {
  const { flowId } = useParams<{ flowId: string }>();
  const navigate = useNavigate();
  const { data: flow, isLoading, isError } = useFlowV2Query(flowId ?? "");

  if (!flowId) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
        <p className="text-muted-foreground">ID de flujo inválido.</p>
        <Link to="/flows" className="text-primary underline text-sm">
          Volver a flujos
        </Link>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Skeleton className="h-6 w-48" />
        <div className="flex gap-6">
          <div className="w-2/5 flex flex-col gap-4">
            <Skeleton className="h-40 rounded-lg" />
            <Skeleton className="h-32 rounded-lg" />
          </div>
          <Skeleton className="flex-1 rounded-lg h-[500px]" />
        </div>
      </div>
    );
  }

  if (isError || !flow) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
        <p className="text-muted-foreground">No se pudo cargar el flujo.</p>
        <Link to="/flows" className="text-primary underline text-sm">
          Volver a flujos
        </Link>
      </div>
    );
  }

  const draft = toDraft(flow);

  const overrides = (flow.message_overrides ?? {}) as Record<string, string>;
  const overrideCount = [
    overrides.receiptPendingMessage,
    overrides.receiptRejectedMessage,
    overrides.receiptConfirmedMessage,
  ].filter(Boolean).length;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
        <PageBreadcrumb
          items={[
            { label: "Flujos", href: "/flows" },
            { label: flow.name },
          ]}
        />
        <div className="flex items-center gap-3">
          <Badge variant={flow.is_active ? "default" : "secondary"}>
            {flow.is_active ? "Activo" : "Inactivo"}
          </Badge>
          <Button size="sm" onClick={() => navigate(`/flows/${flowId}/edit`)}>
            Editar flujo
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: config info */}
        <div className="w-2/5 shrink-0 overflow-y-auto border-r p-6">
          <dl className="flex flex-col gap-5">
            <ConfigField icon={Zap} label="Frase de activación">
              {flow.trigger_phrase ? (
                <code className="font-mono text-sm bg-muted px-2 py-1 rounded">
                  {flow.trigger_phrase}
                </code>
              ) : (
                <span className="text-muted-foreground text-sm">—</span>
              )}
            </ConfigField>

            <Separator />

            <ConfigField icon={Clock} label="Sesión">
              <span className="text-sm">{flow.session_timeout_hours ?? 24} horas</span>
            </ConfigField>

            <Separator />

            <ConfigField icon={HelpCircle} label="Sin coincidencia">
              <span className="text-sm">
                {flow.no_match_behavior === "trigger"
                  ? "Disparar igual"
                  : "Ignorar"}
              </span>
            </ConfigField>

            <Separator />

            <ConfigField icon={Tag} label="Palabras clave">
              {flow.keywords && flow.keywords.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {flow.keywords.map((kw) => (
                    <Badge key={kw} variant="outline" className="text-xs">
                      {kw}
                    </Badge>
                  ))}
                </div>
              ) : (
                <span className="text-muted-foreground text-sm">—</span>
              )}
            </ConfigField>

            <Separator />

            <ConfigField icon={CreditCard} label="Mensajes de pago">
              <span className="text-sm">
                {overrideCount > 0
                  ? `${overrideCount} override${overrideCount > 1 ? "s" : ""} configurado${overrideCount > 1 ? "s" : ""}`
                  : "Usando defaults"}
              </span>
            </ConfigField>

            <Separator />

            <ConfigField icon={Bot} label="Prompt del bot">
              {flow.system_prompt ? (
                <p className="text-sm text-foreground bg-muted rounded p-2 whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
                  {flow.system_prompt}
                </p>
              ) : (
                <span className="text-muted-foreground text-sm">—</span>
              )}
            </ConfigField>
          </dl>
        </div>

        {/* Right: read-only canvas */}
        <div className="flex-1 min-h-[400px]">
          <FlowCanvas
            initialDraft={draft}
            onSave={() => {}}
            readOnly={true}
            showPaymentConfig={false}
            showMediaPicker={false}
          />
        </div>
      </div>
    </div>
  );
}
