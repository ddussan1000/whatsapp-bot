import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useBotConfigQuery, useUpdateBotConfigMutation } from "../lib/hooks";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";

export function ConfigPage() {
  const [systemPrompt, setSystemPrompt] = useState("");
  const [keywords, setKeywords] = useState("");
  const [receiptPendingMessage, setReceiptPendingMessage] = useState("");
  const [receiptRejectedMessage, setReceiptRejectedMessage] = useState("");
  const { data } = useBotConfigQuery();
  const saveMutation = useUpdateBotConfigMutation();

  useEffect(() => {
    if (!data) return;
    setSystemPrompt(data.systemPrompt);
    setKeywords(data.keywords);
    setReceiptPendingMessage(data.receiptPendingMessage ?? "");
    setReceiptRejectedMessage(data.receiptRejectedMessage ?? "");
  }, [data]);

  const onSave = async () => {
    try {
      await saveMutation.mutateAsync({
        systemPrompt,
        keywords,
        receiptPendingMessage,
        receiptRejectedMessage,
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
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
          />
        </Card>
        <Card>
          <h3>Keywords y mensajes de comprobante</h3>
          <textarea
            rows={4}
            placeholder="precio,pago,producto,ayuda..."
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
          />
          <textarea
            rows={4}
            placeholder="Mensaje cuando hay monto, pero falta fecha (validación manual)."
            value={receiptPendingMessage}
            onChange={(e) => setReceiptPendingMessage(e.target.value)}
          />
          <textarea
            rows={4}
            placeholder="Mensaje cuando no se puede validar comprobante (sin monto o fecha >24h)."
            value={receiptRejectedMessage}
            onChange={(e) => setReceiptRejectedMessage(e.target.value)}
          />
          <Button className="save-btn" onClick={onSave} type="button">
            Guardar
          </Button>
        </Card>
      </div>
    </section>
  );
}
