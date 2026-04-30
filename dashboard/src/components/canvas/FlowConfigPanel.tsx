// dashboard/src/components/canvas/FlowConfigPanel.tsx
import { useState } from "react";
import { ChevronDown, ChevronUp, X, Zap, Receipt } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import type { FlowEditorDraft } from "@/lib/flowUtils";

const RECEIPT_DEFAULTS = {
  receiptPendingMessage:
    "Gracias por tu comprobante. Lo estamos validando manualmente y te confirmaremos pronto.",
  receiptRejectedMessage:
    "No pudimos validar tu comprobante. Por favor verifica que la imagen sea legible y que la fecha sea de las ultimas 24 horas.",
  receiptConfirmedMessage:
    "¡Gracias! Recibimos tu pago correctamente. En breve nos ponemos en contacto contigo.",
} as const;

type Props = {
  draft: FlowEditorDraft;
  onChange: (partial: Partial<FlowEditorDraft>) => void;
  showPaymentConfig?: boolean;
};

export function FlowConfigPanel({ draft, onChange, showPaymentConfig = true }: Props) {
  const [open, setOpen] = useState(true);
  const [keywordInput, setKeywordInput] = useState("");
  const [paymentOpen, setPaymentOpen] = useState(false);

  function addKeyword() {
    const kw = keywordInput.trim();
    if (!kw || draft.keywords.includes(kw)) { setKeywordInput(""); return; }
    onChange({ keywords: [...draft.keywords, kw] });
    setKeywordInput("");
  }

  const paymentActiveCount = (
    ["receiptPendingMessage", "receiptRejectedMessage", "receiptConfirmedMessage"] as const
  ).filter(
    (k) => draft[k]?.trim() && draft[k] !== RECEIPT_DEFAULTS[k],
  ).length;

  return (
    <div className="shrink-0 border-b border-border bg-card">
      {/* Toggle header */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-muted/30"
      >
        <Zap size={13} className="text-primary" />
        <span className="flex-1 text-sm font-semibold">Configuración del flujo</span>
        {draft.name && (
          <span className="text-sm text-muted-foreground">{draft.name}</span>
        )}
        {open ? (
          <ChevronUp size={14} className="text-muted-foreground" />
        ) : (
          <ChevronDown size={14} className="text-muted-foreground" />
        )}
      </button>

      {open && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 pb-4 lg:grid-cols-4">
          {/* Name */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Nombre del flujo
            </label>
            <Input
              value={draft.name}
              placeholder="Mi flujo"
              className="h-8 text-sm"
              onChange={(e) => onChange({ name: e.target.value })}
            />
          </div>

          {/* Trigger */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Frase de activación
            </label>
            <Input
              value={draft.triggerPhrase}
              placeholder="hola"
              className="h-8 text-sm"
              onChange={(e) => onChange({ triggerPhrase: e.target.value })}
            />
          </div>

          {/* Session timeout */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Timeout sesión (horas)
            </label>
            <Input
              type="number"
              min={0}
              max={720}
              value={draft.sessionTimeoutHours}
              className="h-8 text-sm"
              onChange={(e) =>
                onChange({
                  sessionTimeoutHours: Math.max(0, Math.min(720, parseInt(e.target.value) || 0)),
                })
              }
            />
          </div>

          {/* Active toggle */}
          <div className="flex items-end pb-1">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={draft.isActive}
                onChange={(e) => onChange({ isActive: e.target.checked })}
                className="rounded border-border"
              />
              <span className="text-sm font-medium">Flujo activo</span>
            </label>
          </div>

          {/* Keywords (spans 2 cols) */}
          <div className="col-span-2">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Palabras clave adicionales
            </label>
            <div className="flex gap-2">
              <Input
                value={keywordInput}
                placeholder="Ej: precio, info"
                className="h-8 text-sm"
                onChange={(e) => setKeywordInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    addKeyword();
                  }
                }}
              />
              <Button variant="outline" size="sm" className="h-8" onClick={addKeyword}>
                Agregar
              </Button>
            </div>
            {draft.keywords.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {draft.keywords.map((kw) => (
                  <span
                    key={kw}
                    className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium"
                  >
                    {kw}
                    <button
                      type="button"
                      onClick={() =>
                        onChange({ keywords: draft.keywords.filter((k) => k !== kw) })
                      }
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X size={10} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* No match behavior */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Sin coincidencia
            </label>
            <div className="flex gap-1.5">
              {(["trigger", "ignore"] as const).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => onChange({ noMatchBehavior: opt })}
                  className={`flex-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
                    draft.noMatchBehavior === opt
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {opt === "trigger" ? "Disparar igual" : "Ignorar"}
                </button>
              ))}
            </div>
          </div>

          {/* Payment overrides button */}
          {showPaymentConfig && (
            <div className="flex items-end">
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5"
                onClick={() => setPaymentOpen(true)}
              >
                <Receipt size={13} />
                Mensajes de pago
                {paymentActiveCount > 0 && (
                  <span className="ml-1 rounded-full bg-primary px-1.5 py-0 text-[10px] font-bold text-primary-foreground">
                    {paymentActiveCount}
                  </span>
                )}
              </Button>
            </div>
          )}

          {/* System prompt (full width) */}
          <div className="col-span-2 lg:col-span-4">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Prompt del bot (respuestas libres)
            </label>
            <Textarea
              value={draft.systemPrompt ?? ""}
              rows={2}
              className="resize-none text-sm"
              placeholder="Eres un asistente de ventas…"
              onChange={(e) => onChange({ systemPrompt: e.target.value })}
            />
          </div>
        </div>
      )}

      {/* Payment messages dialog */}
      <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Mensajes de pago</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-1">
            {(
              [
                { key: "receiptPendingMessage" as const, label: "Comprobante recibido (pendiente)" },
                { key: "receiptRejectedMessage" as const, label: "Comprobante rechazado" },
                { key: "receiptConfirmedMessage" as const, label: "Pago confirmado" },
              ]
            ).map(({ key, label }) => {
              const value = draft[key] ?? "";
              const isDefault = !value.trim() || value === RECEIPT_DEFAULTS[key];
              return (
                <div key={key} className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {label}
                    </label>
                    {!isDefault && (
                      <button
                        type="button"
                        className="text-[11px] text-muted-foreground hover:text-foreground"
                        onClick={() => onChange({ [key]: "" })}
                      >
                        Restablecer
                      </button>
                    )}
                  </div>
                  <Textarea
                    value={value}
                    rows={3}
                    className={`resize-none text-sm ${isDefault ? "border-dashed text-muted-foreground" : ""}`}
                    placeholder={RECEIPT_DEFAULTS[key]}
                    onChange={(e) => onChange({ [key]: e.target.value })}
                  />
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button onClick={() => setPaymentOpen(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
