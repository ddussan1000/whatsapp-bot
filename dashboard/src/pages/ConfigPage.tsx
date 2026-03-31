import { useMemo, useRef } from "react";
import { toast } from "sonner";
import { useBotConfigQuery, useUpdateBotConfigMutation } from "../lib/hooks";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";

export function ConfigPage() {
  const { data } = useBotConfigQuery();
  const saveMutation = useUpdateBotConfigMutation();

  const defaults = useMemo(
    () => ({
      systemPrompt: data?.systemPrompt ?? "",
      keywords: data?.keywords ?? "",
      receiptPendingMessage: data?.receiptPendingMessage ?? "",
      receiptRejectedMessage: data?.receiptRejectedMessage ?? "",
    }),
    [data],
  );

  const systemPromptRef = useRef<HTMLTextAreaElement | null>(null);
  const keywordsRef = useRef<HTMLTextAreaElement | null>(null);
  const pendingRef = useRef<HTMLTextAreaElement | null>(null);
  const rejectedRef = useRef<HTMLTextAreaElement | null>(null);

  const onSave = async () => {
    try {
      await saveMutation.mutateAsync({
        systemPrompt: systemPromptRef.current?.value ?? defaults.systemPrompt,
        keywords: keywordsRef.current?.value ?? defaults.keywords,
        receiptPendingMessage: pendingRef.current?.value ?? defaults.receiptPendingMessage,
        receiptRejectedMessage: rejectedRef.current?.value ?? defaults.receiptRejectedMessage,
      });
      toast.success("Configuración guardada.");
    } catch {
      toast.error("Error guardando configuración.");
    }
  };

  return (
    <section>
      <h2>Configuracion del bot</h2>
      <div className="grid config-grid">
        <Card>
          <h3>System prompt</h3>
          <textarea
            rows={8}
            placeholder="Aqui podras gestionar el prompt central del asistente."
            ref={systemPromptRef}
            defaultValue={defaults.systemPrompt}
          />
        </Card>
        <Card>
          <h3>Keywords y mensajes de comprobante</h3>
          <textarea
            rows={4}
            placeholder="precio,pago,producto,ayuda..."
            ref={keywordsRef}
            defaultValue={defaults.keywords}
          />
          <textarea
            rows={4}
            placeholder="Mensaje cuando hay monto, pero falta fecha (validación manual)."
            ref={pendingRef}
            defaultValue={defaults.receiptPendingMessage}
          />
          <textarea
            rows={4}
            placeholder="Mensaje cuando no se puede validar comprobante (sin monto o fecha >24h)."
            ref={rejectedRef}
            defaultValue={defaults.receiptRejectedMessage}
          />
          <Button className="save-btn" onClick={onSave} type="button">
            Guardar
          </Button>
        </Card>
      </div>
    </section>
  );
}
