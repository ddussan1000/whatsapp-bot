import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Bot,
  XCircle,
  CheckCircle2,
  Loader2,
  Info,
  Key,
  Zap,
} from "lucide-react";
import {
  useBotConfigQuery,
  useUpdateBotConfigMutation,
  useValidateAiMutation,
} from "../lib/hooks";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { UpdateBotConfigBody } from "../types/api";

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

const MODEL_PLACEHOLDERS: Record<string, string> = {
  openai: "gpt-4o-mini",
  gemini: "gemini-2.0-flash-lite",
  anthropic: "claude-3-5-haiku-latest",
  groq: "llama-3.3-70b-versatile",
  deepseek: "deepseek-chat",
  openrouter: "openai/gpt-4o-mini",
};

export function ConfigPage() {
  const { data, isLoading } = useBotConfigQuery();
  const saveMutation = useUpdateBotConfigMutation();
  const validateAiMutation = useValidateAiMutation();

  // Existing fields (uncontrolled refs)
  const systemPromptRef = useRef<HTMLTextAreaElement | null>(null);
  const rejectedRef = useRef<HTMLTextAreaElement | null>(null);
  const confirmedRef = useRef<HTMLTextAreaElement | null>(null);

  // New AI config (controlled state) — synced from server data via prev-value comparison
  const [prevData, setPrevData] = useState(data);
  const [aiEnabled, setAiEnabled] = useState(data?.ai_enabled ?? true);
  const [aiProvider, setAiProvider] = useState<string>(
    data?.ai_provider ?? "none"
  );
  const [aiApiKey, setAiApiKey] = useState("");
  const [aiModel, setAiModel] = useState(data?.ai_model ?? "");
  const [aiSystemPrompt, setAiSystemPrompt] = useState(
    data?.ai_system_prompt ?? ""
  );
  if (prevData !== data && data) {
    setPrevData(data);
    setAiEnabled(data.ai_enabled ?? true);
    setAiProvider(data.ai_provider ?? "none");
    setAiModel(data.ai_model ?? "");
    setAiSystemPrompt(data.ai_system_prompt ?? "");
  }

  const defaults = useMemo(
    () => ({
      systemPrompt: data?.systemPrompt ?? "",
      receiptRejectedMessage: data?.receiptRejectedMessage ?? "",
      receiptConfirmedMessage: data?.receiptConfirmedMessage ?? "",
    }),
    [data]
  );

  const onValidateAi = async () => {
    if (!aiProvider || aiProvider === "none") {
      toast.error("Seleccioná un proveedor");
      return;
    }
    if (!aiApiKey) {
      if (data?.ai_api_key_configured) {
        toast.info("Para verificar, ingresá la API key nuevamente");
      } else {
        toast.error("Ingresá una API key");
      }
      return;
    }
    const model = aiModel || MODEL_PLACEHOLDERS[aiProvider] || "";
    if (!model) {
      toast.error("Ingresá un modelo");
      return;
    }
    try {
      const result = await validateAiMutation.mutateAsync({
        provider: aiProvider as "openai" | "gemini" | "anthropic" | "groq" | "deepseek" | "openrouter",
        apiKey: aiApiKey,
        model,
      });
      if (result.ok) {
        toast.success("Conexión verificada correctamente");
      } else {
        toast.error(
          `Error de conexión: ${result.error ?? "respuesta inválida"}`
        );
      }
    } catch {
      toast.error("No se pudo verificar la conexión");
    }
  };

  const onSave = async () => {
    const payload: UpdateBotConfigBody = {
      systemPrompt: systemPromptRef.current?.value ?? defaults.systemPrompt,
      receiptRejectedMessage:
        rejectedRef.current?.value ?? defaults.receiptRejectedMessage,
      receiptConfirmedMessage:
        confirmedRef.current?.value ?? defaults.receiptConfirmedMessage,
      ai_enabled: aiEnabled,
      ai_provider: (aiProvider === "none" ? null : aiProvider || null) as
        | "openai"
        | "gemini"
        | "anthropic"
        | "groq"
        | "deepseek"
        | "openrouter"
        | null
        | undefined,
      ai_model: aiModel || null,
      ai_system_prompt: aiSystemPrompt || null,
    };
    // Only send ai_api_key if user typed something new
    if (aiApiKey) {
      payload.ai_api_key = aiApiKey;
    }
    try {
      await saveMutation.mutateAsync(payload);
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
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
        <div className="h-96 animate-pulse rounded-xl bg-muted" />
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4 p-3 sm:gap-6 sm:p-6">
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

      {/* Sección IA - configuración general */}
      <Section
        title="Respuestas con IA post-flujo"
        subtitle="Cuando un cliente termina de ejecutar un flujo y sigue escribiendo, el bot puede responderle con IA."
      >
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div>
            <p className="font-medium text-sm">Activar respuestas con IA</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Si está desactivado, el bot ignorará los mensajes que lleguen
              fuera de los pasos del flujo
            </p>
          </div>
          <Switch checked={aiEnabled} onCheckedChange={setAiEnabled} />
        </div>

        <Field
          icon={Bot}
          label="Prompt del sistema"
          description="Instrucciones base para el asistente. Acá definís su personalidad, tono y contexto de tu negocio."
          hint="Ejemplo: «Eres un asesor de ventas amable de Tienda X. Solo respondés consultas sobre productos y precios.»"
        >
          <Textarea
            ref={systemPromptRef}
            rows={6}
            placeholder="Eres un asistente de ventas amable. Solo respondés preguntas sobre nuestros productos y precios…"
            defaultValue={defaults.systemPrompt}
            className="resize-none font-mono text-sm"
            disabled={!aiEnabled}
          />
        </Field>
      </Section>

      {/* Sección proveedor IA propio */}
      <Section
        title="Proveedor de IA"
        subtitle="Configurá tu propia API key. Se usa para las respuestas con IA post-flujo y también para funciones como generar variantes de mensajes con IA en el editor de flujos. Podés configurarlo aunque las respuestas automáticas estén desactivadas."
      >
        <Field
          icon={Zap}
          label="Proveedor"
          description="Proveedor de IA a usar. Cada proveedor requiere su propia API key. Independiente del interruptor de respuestas automáticas."
        >
          <Select
            value={aiProvider}
            onValueChange={setAiProvider}
          >
            <SelectTrigger>
              <SelectValue placeholder="Seleccioná un proveedor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">
                Sin proveedor
              </SelectItem>
              <SelectItem value="openai">OpenAI (GPT)</SelectItem>
              <SelectItem value="gemini">Gemini (Google)</SelectItem>
              <SelectItem value="anthropic">Anthropic (Claude)</SelectItem>
              <SelectItem value="groq">Groq (Llama)</SelectItem>
              <SelectItem value="deepseek">DeepSeek</SelectItem>
              <SelectItem value="openrouter">OpenRouter</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        {aiProvider && aiProvider !== "none" && (
          <>
            <Field
              icon={Key}
              label="API Key"
              description="Tu clave de API del proveedor elegido. Se guarda encriptada y nunca se muestra en texto plano."
            >
              <Input
                type="password"
                value={aiApiKey}
                onChange={(e) => setAiApiKey(e.target.value)}
                placeholder={
                  data?.ai_api_key_configured
                    ? "••••••• (configurada — dejar vacío para mantener)"
                    : "sk-..."
                }
                autoComplete="new-password"
              />
            </Field>

            <Field
              icon={Bot}
              label="Modelo"
              description={`Modelo específico a usar. Dejá vacío para usar el modelo por defecto (${MODEL_PLACEHOLDERS[aiProvider] ?? "modelo predeterminado"}).`}
            >
              <Input
                value={aiModel}
                onChange={(e) => setAiModel(e.target.value)}
                placeholder={
                  MODEL_PLACEHOLDERS[aiProvider] ?? "nombre-del-modelo"
                }
              />
            </Field>

            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void onValidateAi()}
                disabled={validateAiMutation.isPending}
                className="gap-2"
              >
                {validateAiMutation.isPending ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Zap size={13} />
                )}
                {validateAiMutation.isPending
                  ? "Verificando…"
                  : "Verificar conexión"}
              </Button>
            </div>
          </>
        )}

        <Field
          icon={Bot}
          label="Prompt adicional (opcional)"
          description="Complementa o sobreescribe el prompt del sistema para las respuestas post-flujo. Dejá vacío para usar el prompt definido arriba."
        >
          <Textarea
            value={aiSystemPrompt}
            onChange={(e) => setAiSystemPrompt(e.target.value)}
            rows={4}
            placeholder="Dejá vacío para usar el prompt del sistema definido arriba…"
            className="resize-none font-mono text-sm"
            disabled={!aiEnabled}
          />
        </Field>
      </Section>

      {/* Sección Comprobantes */}
      <Section
        title="Mensajes de comprobante de pago"
        subtitle="Textos que el bot envía automáticamente al recibir y procesar una imagen de comprobante."
      >
        <Field
          icon={CheckCircle2}
          label="Pago confirmado"
          description="Se envía cuando el comprobante es válido: tiene monto detectable y la fecha está dentro de las últimas 24 horas."
          hint="No es necesario incluir el monto, el bot ya lo registra internamente."
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
          icon={XCircle}
          label="Comprobante con error"
          description="Se envía cuando el comprobante está vencido, no se puede leer o tiene datos incompletos. El agente lo revisará manualmente."
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
