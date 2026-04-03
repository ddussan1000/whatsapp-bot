import { useMemo, useRef } from "react";
import { toast } from "sonner";
import { Bot, Clock, XCircle, CheckCircle2, Loader2, Info } from "lucide-react";
import { useBotConfigQuery, useUpdateBotConfigMutation } from "../lib/hooks";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";

// ── Field ─────────────────────────────────────────────────────────────────

function Field({
  label,
  description,
  hint,
  icon: Icon,
  children,
}: {
  label: string;
  description: string;
  hint?: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start gap-2">
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted">
          <Icon size={14} className="text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium leading-tight">{label}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      {children}
      {hint && (
        <div className="flex items-start gap-1.5 rounded-md bg-muted/50 px-3 py-2">
          <Info size={12} className="mt-0.5 shrink-0 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
      )}
    </div>
  );
}

// ── Section ───────────────────────────────────────────────────────────────

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-card shadow-sm">
      <div className="border-b border-border px-6 py-4">
        <h3 className="font-semibold">{title}</h3>
        <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>
      </div>
      <div className="flex flex-col gap-4 p-3 sm:gap-6 sm:p-6">{children}</div>
    </div>
  );
}

// ── ConfigPage ────────────────────────────────────────────────────────────

export function ConfigPage() {
  const { data, isLoading } = useBotConfigQuery();
  const saveMutation = useUpdateBotConfigMutation();

  const defaults = useMemo(
    () => ({
      systemPrompt: data?.systemPrompt ?? "",
      receiptPendingMessage: data?.receiptPendingMessage ?? "",
      receiptRejectedMessage: data?.receiptRejectedMessage ?? "",
      receiptConfirmedMessage: data?.receiptConfirmedMessage ?? "",
    }),
    [data]
  );

  const systemPromptRef = useRef<HTMLTextAreaElement | null>(null);
  const pendingRef = useRef<HTMLTextAreaElement | null>(null);
  const rejectedRef = useRef<HTMLTextAreaElement | null>(null);
  const confirmedRef = useRef<HTMLTextAreaElement | null>(null);

  const onSave = async () => {
    try {
      await saveMutation.mutateAsync({
        systemPrompt: systemPromptRef.current?.value ?? defaults.systemPrompt,
        receiptPendingMessage:
          pendingRef.current?.value ?? defaults.receiptPendingMessage,
        receiptRejectedMessage:
          rejectedRef.current?.value ?? defaults.receiptRejectedMessage,
        receiptConfirmedMessage:
          confirmedRef.current?.value ?? defaults.receiptConfirmedMessage,
      });
      toast.success("Configuración guardada");
    } catch {
      toast.error("No se pudo guardar la configuración");
    }
  };

  if (isLoading) {
    return (
      <section className="flex flex-col gap-4 p-3 sm:gap-6 sm:p-6">
        <div className="h-7 w-48 animate-pulse rounded bg-muted" />
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
        <div className="h-96 animate-pulse rounded-xl bg-muted" />
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4 p-3 sm:gap-6 sm:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Configuración del bot</h2>
          <p className="text-sm text-muted-foreground">
            Ajustá el comportamiento general del asistente y los mensajes
            automáticos que reciben tus clientes.
          </p>
        </div>
        <Button
          onClick={() => void onSave()}
          disabled={saveMutation.isPending}
          className="gap-2"
        >
          {saveMutation.isPending ? (
            <Loader2 size={15} className="animate-spin" />
          ) : null}
          {saveMutation.isPending ? "Guardando…" : "Guardar cambios"}
        </Button>
      </div>

      {/* Sección IA */}
      <Section
        title="Asistente de IA"
        subtitle="Define cómo responde el bot cuando un cliente escribe un mensaje que no coincide con ningún paso del flujo."
      >
        <Field
          icon={Bot}
          label="Prompt del sistema"
          description="Instrucciones base que le das al asistente. Acá definís su personalidad, tono, límites y el contexto de tu negocio."
          hint="Ejemplo: «Eres un asesor de ventas amable de Tienda X. Solo respondés consultas sobre productos y precios. No des información de competidores.»"
        >
          <Textarea
            ref={systemPromptRef}
            rows={6}
            placeholder="Eres un asistente de ventas amable. Solo respondés preguntas sobre nuestros productos y precios…"
            defaultValue={defaults.systemPrompt}
            className="resize-none font-mono text-sm"
          />
        </Field>
      </Section>

      {/* Sección Comprobantes */}
      <Section
        title="Mensajes de comprobante de pago"
        subtitle="Textos que el bot envía automáticamente al recibir y procesar una imagen de comprobante. Podés personalizar el mensaje por defecto para todos los flujos de esta organización."
      >
        <Field
          icon={CheckCircle2}
          label="Pago confirmado"
          description="Se envía cuando el comprobante es válido: tiene monto detectable y la fecha está dentro de las últimas 24 horas."
          hint="No es necesario incluir el monto, el bot ya lo registra internamente. Mantené el tono cálido y accionable."
        >
          <Textarea
            ref={confirmedRef}
            rows={3}
            placeholder="¡Gracias! Recibimos tu pago correctamente. En breve nos ponemos en contacto contigo."
            defaultValue={defaults.receiptConfirmedMessage}
            className="resize-none text-sm"
          />
        </Field>

        <Separator />

        <Field
          icon={Clock}
          label="Pago en revisión manual"
          description="Se envía cuando se detecta un monto pero no se puede leer la fecha del comprobante. Un agente deberá validarlo manualmente."
        >
          <Textarea
            ref={pendingRef}
            rows={3}
            placeholder="Gracias por tu comprobante. Lo estamos validando manualmente y te confirmaremos pronto."
            defaultValue={defaults.receiptPendingMessage}
            className="resize-none text-sm"
          />
        </Field>

        <Separator />

        <Field
          icon={XCircle}
          label="Comprobante rechazado o ilegible"
          description="Se envía cuando el comprobante tiene una fecha mayor a 24 horas, o cuando la imagen no es legible y no se puede extraer el monto."
          hint="Pedirle al cliente que reenvíe con mejor calidad o que contacte a un agente si el problema persiste."
        >
          <Textarea
            ref={rejectedRef}
            rows={3}
            placeholder="No pudimos validar tu comprobante. Verificá que la imagen sea legible y que la fecha sea de las últimas 24 horas."
            defaultValue={defaults.receiptRejectedMessage}
            className="resize-none text-sm"
          />
        </Field>
      </Section>

      {/* Footer save */}
      <div className="flex justify-end">
        <Button
          onClick={() => void onSave()}
          disabled={saveMutation.isPending}
          className="gap-2"
        >
          {saveMutation.isPending ? (
            <Loader2 size={15} className="animate-spin" />
          ) : null}
          {saveMutation.isPending ? "Guardando…" : "Guardar cambios"}
        </Button>
      </div>
    </section>
  );
}
