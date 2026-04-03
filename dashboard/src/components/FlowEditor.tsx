import { useState } from "react";
import {
  MessageSquare,
  Image as ImageIcon,
  FileText,
  Video,
  Plus,
  Trash2,
  Library,
  Clock,
  ChevronDown,
  ChevronUp,
  GripVertical,
  X,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { MediaPickerModal } from "@/components/ui/media-picker-modal";

// ── Exported types ─────────────────────────────────────────────────────────

export type FlowMessageType = "text" | "image" | "document" | "video";

export type FlowEditorMessage = {
  id?: string;
  position: number;
  messageType: FlowMessageType;
  textContent?: string | null;
  mediaUrl?: string | null;
  filename?: string | null;
  caption?: string | null;
};

export type FlowEditorStep = {
  id?: string;
  position: number;
  delaySeconds: number;
  label?: string;
  messages: FlowEditorMessage[];
};

export type FlowEditorDraft = {
  id?: string;
  name: string;
  triggerPhrase: string;
  keywords: string[];
  noMatchBehavior: "trigger" | "ignore";
  systemPrompt?: string | null;
  isActive: boolean;
  sessionTimeoutHours: number;
  steps: FlowEditorStep[];
  receiptPendingMessage?: string;
  receiptRejectedMessage?: string;
  receiptConfirmedMessage?: string;
};

export function emptyDraft(): FlowEditorDraft {
  return {
    name: "",
    triggerPhrase: "",
    keywords: [],
    noMatchBehavior: "trigger",
    systemPrompt: "",
    isActive: true,
    sessionTimeoutHours: 24,
    steps: [],
    receiptPendingMessage: "",
    receiptRejectedMessage: "",
    receiptConfirmedMessage: "",
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────

export function extractTriggerWord(phrase: string): string {
  return (
    phrase
      .toLowerCase()
      .replace(/[.,!?¿¡;:'"()-]/g, "")
      .trim()
      .split(/\s+/)[0] ?? ""
  );
}

type DelayUnit = "seg" | "min" | "hrs";

function secondsToDisplay(s: number): { value: number; unit: DelayUnit } {
  if (s === 0) return { value: 0, unit: "seg" };
  if (s >= 3600 && s % 3600 === 0) return { value: s / 3600, unit: "hrs" };
  if (s >= 60 && s % 60 === 0) return { value: s / 60, unit: "min" };
  return { value: s, unit: "seg" };
}

function displayToSeconds(value: number, unit: DelayUnit): number {
  if (unit === "hrs") return value * 3600;
  if (unit === "min") return value * 60;
  return value;
}

function delayLabel(seconds: number): string {
  if (seconds === 0) return "Inmediato";
  const { value, unit } = secondsToDisplay(seconds);
  return `${value} ${unit}`;
}

const MSG_TYPES: {
  type: FlowMessageType;
  label: string;
  icon: React.ElementType;
  color: string;
}[] = [
  { type: "text", label: "Texto", icon: MessageSquare, color: "text-blue-500" },
  { type: "image", label: "Imagen", icon: ImageIcon, color: "text-green-500" },
  {
    type: "document",
    label: "Documento",
    icon: FileText,
    color: "text-orange-500",
  },
  { type: "video", label: "Video", icon: Video, color: "text-purple-500" },
];

function msgConfig(type: FlowMessageType) {
  return MSG_TYPES.find((t) => t.type === type) ?? MSG_TYPES[0];
}

// ── MessageTypePopover ────────────────────────────────────────────────────

function MessageTypePopover({
  value,
  onChange,
}: {
  value: FlowMessageType;
  onChange: (v: FlowMessageType) => void;
}) {
  const [open, setOpen] = useState(false);
  const cfg = msgConfig(value);
  const Icon = cfg.icon;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`flex items-center gap-1.5 rounded-md border bg-background px-2.5 py-1.5 text-sm font-medium transition-colors hover:bg-muted ${cfg.color}`}
        >
          <Icon size={13} />
          {cfg.label}
          <ChevronDown size={11} className="text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-44 p-1.5">
        {MSG_TYPES.map((t) => {
          const TIcon = t.icon;
          return (
            <button
              key={t.type}
              type="button"
              className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted ${t.type === value ? "bg-muted font-medium" : ""}`}
              onClick={() => {
                onChange(t.type);
                setOpen(false);
              }}
            >
              <TIcon size={13} className={t.color} />
              {t.label}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}

// ── MessageRow ────────────────────────────────────────────────────────────

function MessageRow({
  msg,
  index,
  uploadPending,
  onTypeChange,
  onTextChange,
  onCaptionChange,
  onUploadClick,
  onDelete,
}: {
  msg: FlowEditorMessage;
  index: number;
  uploadPending: boolean;
  onTypeChange: (v: FlowMessageType) => void;
  onTextChange: (v: string) => void;
  onCaptionChange: (v: string) => void;
  onUploadClick: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="group relative flex gap-3 rounded-lg border bg-background p-3">
      <div className="flex flex-col items-center gap-1 pt-0.5">
        <GripVertical size={14} className="text-muted-foreground/40" />
        <span className="text-[10px] font-bold text-muted-foreground/50">
          {index + 1}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2">
        <div className="flex items-center gap-2">
          <MessageTypePopover value={msg.messageType} onChange={onTypeChange} />
          <span className="flex-1" />
          <button
            type="button"
            className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-destructive group-hover:opacity-100"
            onClick={onDelete}
          >
            <X size={14} />
          </button>
        </div>

        {msg.messageType === "text" ? (
          <Textarea
            placeholder="Escribe el mensaje de texto…"
            value={msg.textContent ?? ""}
            rows={2}
            className="resize-none text-base"
            onChange={(e) => onTextChange(e.target.value)}
          />
        ) : (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={onUploadClick}
              disabled={uploadPending}
              className="flex items-center gap-2 rounded-lg border-2 border-dashed border-muted-foreground/25 px-4 py-3 text-base text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-50"
            >
              <Library size={15} className="shrink-0" />
              {uploadPending ? (
                <span>Cargando…</span>
              ) : msg.filename ? (
                <span className="max-w-[200px] truncate font-medium text-foreground">
                  {msg.filename}
                </span>
              ) : (
                <span>
                  Seleccionar {msgConfig(msg.messageType).label.toLowerCase()}
                </span>
              )}
            </button>
            {(msg.messageType === "image" || msg.messageType === "video") && (
              <Input
                placeholder="Descripción (opcional)"
                value={msg.caption ?? ""}
                className="text-base"
                onChange={(e) => onCaptionChange(e.target.value)}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── StepConnector ─────────────────────────────────────────────────────────

function StepConnector({
  delaySeconds,
  stepIndex,
  onChange,
}: {
  delaySeconds: number;
  stepIndex: number;
  onChange: (seconds: number) => void;
}) {
  const { value: dispValue, unit: dispUnit } = secondsToDisplay(delaySeconds);
  const [editing, setEditing] = useState(false);
  const [localVal, setLocalVal] = useState(String(dispValue));
  const [localUnit, setLocalUnit] = useState<DelayUnit>(dispUnit);

  const commit = () => {
    onChange(displayToSeconds(Number(localVal) || 0, localUnit));
    setEditing(false);
  };

  if (stepIndex === 0) return null;

  return (
    <div className="flex flex-col items-center py-1">
      <div className="h-3 w-px bg-border" />
      <div className="group w-full max-w-[220px] rounded-lg border bg-card shadow-sm transition-shadow hover:shadow-md">
        <div className="flex items-center gap-2 px-3 py-2">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-amber-600">
            <Clock size={12} />
          </div>
          <div className="flex flex-1 flex-col gap-0.5 min-w-0">
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Esperar
            </span>
            {editing ? (
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  min={0}
                  value={localVal}
                  onChange={(e) => setLocalVal(e.target.value)}
                  className="h-6 w-14 px-1.5 text-sm"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commit();
                    if (e.key === "Escape") setEditing(false);
                  }}
                />
                <select
                  value={localUnit}
                  onChange={(e) => setLocalUnit(e.target.value as DelayUnit)}
                  className="h-6 rounded border bg-background px-1 text-sm text-foreground"
                >
                  <option value="seg">seg</option>
                  <option value="min">min</option>
                  <option value="hrs">hrs</option>
                </select>
                <Button size="sm" className="h-6 px-2 text-sm" onClick={commit}>
                  OK
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  const { value, unit } = secondsToDisplay(delaySeconds);
                  setLocalVal(String(value));
                  setLocalUnit(unit);
                  setEditing(true);
                }}
                className="flex items-center gap-1 text-left"
              >
                <span className="text-base font-semibold text-foreground">
                  {delayLabel(delaySeconds)}
                </span>
                <span className="text-[10px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
                  (editar)
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
      <div className="h-3 w-px bg-border" />
    </div>
  );
}

// ── StepCard ──────────────────────────────────────────────────────────────

function StepCard({
  step,
  stepIndex,
  uploadTarget,
  onUpdate,
  onDelete,
  onAddMessage,
  onDeleteMessage,
  onMessageTypeChange,
  onMessageTextChange,
  onMessageCaptionChange,
  onUploadClick,
  onDelayChange,
}: {
  step: FlowEditorStep;
  stepIndex: number;
  uploadTarget: { step: number; msg: number } | null;
  onUpdate: (step: FlowEditorStep) => void;
  onDelete: () => void;
  onAddMessage: () => void;
  onDeleteMessage: (msgIdx: number) => void;
  onMessageTypeChange: (msgIdx: number, type: FlowMessageType) => void;
  onMessageTextChange: (msgIdx: number, text: string) => void;
  onMessageCaptionChange: (msgIdx: number, caption: string) => void;
  onUploadClick: (msgIdx: number) => void;
  onDelayChange: (seconds: number) => void;
}) {
  return (
    <div className="flex flex-col">
      <StepConnector
        delaySeconds={step.delaySeconds}
        stepIndex={stepIndex}
        onChange={onDelayChange}
      />

      <div className="rounded-xl border bg-card shadow-sm">
        <div className="flex items-center gap-3 border-b bg-muted/30 px-4 py-2.5 rounded-t-xl">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
            {stepIndex + 1}
          </span>
          <Input
            placeholder="Nombre del paso (opcional)"
            value={step.label ?? ""}
            className="h-7 flex-1 border-0 bg-transparent px-1 text-base font-medium shadow-none focus-visible:ring-0"
            onChange={(e) => onUpdate({ ...step, label: e.target.value })}
          />
          <button
            type="button"
            className="ml-auto rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            onClick={onDelete}
            title="Eliminar paso"
          >
            <Trash2 size={14} />
          </button>
        </div>

        <div className="flex flex-col gap-2 p-4">
          {step.messages.length === 0 ? (
            <p className="py-4 text-center text-base text-muted-foreground">
              Sin mensajes — agrega uno abajo
            </p>
          ) : (
            step.messages.map((msg, j) => (
              <MessageRow
                key={`${msg.id ?? "new"}-${j}`}
                msg={msg}
                index={j}
                uploadPending={
                  uploadTarget?.step === stepIndex && uploadTarget?.msg === j
                }
                onTypeChange={(v) => onMessageTypeChange(j, v)}
                onTextChange={(v) => onMessageTextChange(j, v)}
                onCaptionChange={(v) => onMessageCaptionChange(j, v)}
                onUploadClick={() => onUploadClick(j)}
                onDelete={() => onDeleteMessage(j)}
              />
            ))
          )}
          <button
            type="button"
            onClick={onAddMessage}
            className="mt-1 flex items-center gap-1.5 self-start rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Plus size={13} />
            Agregar mensaje
          </button>
        </div>
      </div>
    </div>
  );
}

// ── FlowEditor ────────────────────────────────────────────────────────────

export type FlowEditorActionsContext = {
  draft: FlowEditorDraft;
  dirty: boolean;
  resetDraft: () => void;
};

type FlowEditorProps = {
  initialDraft: FlowEditorDraft;
  onSave: (draft: FlowEditorDraft) => void;
  savePending?: boolean;
  saveLabel?: string;
  showPaymentConfig?: boolean;
  showMediaPicker?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
  /** Render extra buttons next to "Guardar". Receives current draft + dirty state. */
  renderActions?: (ctx: FlowEditorActionsContext) => React.ReactNode;
};

export function FlowEditor({
  initialDraft,
  onSave,
  savePending = false,
  saveLabel = "Guardar",
  showPaymentConfig = true,
  showMediaPicker = true,
  onDirtyChange,
  renderActions,
}: FlowEditorProps) {
  const [draft, setDraftRaw] = useState<FlowEditorDraft>(initialDraft);
  const [dirty, setDirtyRaw] = useState(false);
  const [configOpen, setConfigOpen] = useState(true);
  const [keywordInput, setKeywordInput] = useState("");
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [uploadTarget, setUploadTarget] = useState<{
    step: number;
    msg: number;
  } | null>(null);

  const setDraft = (updater: (d: FlowEditorDraft) => FlowEditorDraft) => {
    setDraftRaw(updater);
    if (!dirty) {
      setDirtyRaw(true);
      onDirtyChange?.(true);
    }
  };

  const resetDraft = () => {
    setDraftRaw(initialDraft);
    setDirtyRaw(false);
    onDirtyChange?.(false);
  };

  const patch = (partial: Partial<FlowEditorDraft>) =>
    setDraft((d) => ({ ...d, ...partial }));

  const patchStep = (i: number, partial: Partial<FlowEditorStep>) =>
    setDraft((d) => {
      const steps = [...d.steps];
      steps[i] = { ...steps[i], ...partial };
      return { ...d, steps };
    });

  const patchMessage = (
    i: number,
    j: number,
    partial: Partial<FlowEditorMessage>
  ) =>
    setDraft((d) => {
      const steps = [...d.steps];
      const msgs = [...steps[i].messages];
      msgs[j] = { ...msgs[j], ...partial };
      steps[i] = { ...steps[i], messages: msgs };
      return { ...d, steps };
    });

  const addStep = () =>
    setDraft((d) => ({
      ...d,
      steps: [
        ...d.steps,
        {
          position: d.steps.length,
          delaySeconds: d.steps.length === 0 ? 0 : 300,
          label: "",
          messages: [],
        },
      ],
    }));

  const deleteStep = (i: number) =>
    setDraft((d) => ({ ...d, steps: d.steps.filter((_, idx) => idx !== i) }));

  const addMessage = (stepIndex: number) =>
    setDraft((d) => {
      const steps = d.steps.map((step, idx) => {
        if (idx !== stepIndex) return step;
        return {
          ...step,
          messages: [
            ...step.messages,
            {
              position: step.messages.length,
              messageType: "text" as const,
              textContent: "",
            },
          ],
        };
      });
      return { ...d, steps };
    });

  const deleteMessage = (stepIndex: number, msgIndex: number) =>
    setDraft((d) => {
      const steps = [...d.steps];
      steps[stepIndex] = {
        ...steps[stepIndex],
        messages: steps[stepIndex].messages.filter(
          (_, idx) => idx !== msgIndex
        ),
      };
      return { ...d, steps };
    });

  const addKeyword = () => {
    const kw = keywordInput.trim();
    if (!kw || draft.keywords.includes(kw)) {
      setKeywordInput("");
      return;
    }
    patch({ keywords: [...draft.keywords, kw] });
    setKeywordInput("");
  };

  const triggerWord = extractTriggerWord(draft.triggerPhrase);

  const _rawTargetType =
    uploadTarget !== null
      ? draft.steps[uploadTarget.step]?.messages[uploadTarget.msg]?.messageType
      : undefined;
  const currentTargetType: "image" | "video" | "document" | undefined =
    _rawTargetType === "image" ||
    _rawTargetType === "video" ||
    _rawTargetType === "document"
      ? _rawTargetType
      : undefined;

  return (
    <div className="flex flex-col gap-4">
      {/* Media picker */}
      {showMediaPicker && (
        <MediaPickerModal
          open={mediaPickerOpen}
          onClose={() => {
            setMediaPickerOpen(false);
            setUploadTarget(null);
          }}
          allowedType={currentTargetType}
          onSelect={(result) => {
            if (uploadTarget) {
              patchMessage(uploadTarget.step, uploadTarget.msg, {
                mediaUrl: result.url,
                filename: result.filename,
              });
            }
            setMediaPickerOpen(false);
            setUploadTarget(null);
          }}
        />
      )}

      {/* Config panel */}
      <div className="rounded-xl border bg-card shadow-sm">
        <button
          type="button"
          className="flex w-full items-center gap-3 px-4 py-3 text-left"
          onClick={() => setConfigOpen((o) => !o)}
        >
          <span className="font-medium">Configuración del flow</span>
          {draft.name && (
            <span className="text-base text-muted-foreground">
              {draft.name}
            </span>
          )}
          <span className="ml-auto text-muted-foreground">
            {configOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </span>
        </button>

        {configOpen && (
          <div className="flex flex-col gap-4 border-t px-4 py-4">
            {/* Name + active toggle */}
            <div className="flex gap-3">
              <div className="flex flex-1 flex-col gap-1.5">
                <label className="text-sm font-medium text-muted-foreground">
                  Nombre del flow
                </label>
                <Input
                  placeholder="Ej: Consulta de precios"
                  value={draft.name}
                  onChange={(e) => patch({ name: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-muted-foreground">
                  Estado
                </label>
                <button
                  type="button"
                  onClick={() => patch({ isActive: !draft.isActive })}
                  className={`h-9 rounded-md border px-3 text-sm font-medium transition-colors ${
                    draft.isActive
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
                      : "border-border bg-muted text-muted-foreground"
                  }`}
                >
                  {draft.isActive ? "Activo" : "Inactivo"}
                </button>
              </div>
            </div>

            {/* Trigger */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-muted-foreground">
                Frase de trigger
              </label>
              <Input
                placeholder='Ej: "Hola, quiero más información"'
                value={draft.triggerPhrase}
                onChange={(e) => patch({ triggerPhrase: e.target.value })}
              />
              {triggerWord && (
                <p className="text-sm text-muted-foreground">
                  Activará cuando el mensaje contenga:{" "}
                  <span className="font-mono font-medium text-foreground">
                    "{triggerWord}"
                  </span>
                </p>
              )}
            </div>

            {/* Keywords */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-muted-foreground">
                Palabras clave adicionales
              </label>
              <div className="flex gap-2">
                <Input
                  placeholder="Ej: precio, info, cotizar"
                  value={keywordInput}
                  onChange={(e) => setKeywordInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      addKeyword();
                    }
                  }}
                />
                <Button variant="outline" size="sm" onClick={addKeyword}>
                  Agregar
                </Button>
              </div>
              {draft.keywords.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {draft.keywords.map((kw) => (
                    <span
                      key={kw}
                      className="flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-sm font-medium"
                    >
                      {kw}
                      <button
                        type="button"
                        onClick={() =>
                          patch({
                            keywords: draft.keywords.filter((k) => k !== kw),
                          })
                        }
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <X size={11} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* No match behavior */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-muted-foreground">
                Si no hay coincidencia con el trigger
              </label>
              <div className="flex gap-2">
                {(["trigger", "ignore"] as const).map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => patch({ noMatchBehavior: opt })}
                    className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
                      draft.noMatchBehavior === opt
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {opt === "trigger"
                      ? "Disparar el flow igual"
                      : "No hacer nada"}
                  </button>
                ))}
              </div>
            </div>

            {/* System prompt */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-muted-foreground">
                Prompt del bot (respuestas libres)
              </label>
              <Textarea
                placeholder="Ej: Eres un asistente de ventas de [empresa]. Responde de forma amable y concisa..."
                value={draft.systemPrompt ?? ""}
                rows={3}
                className="resize-none"
                onChange={(e) => patch({ systemPrompt: e.target.value })}
              />
              <p className="text-sm text-muted-foreground">
                Sobreescribe el prompt global del bot solo para este flujo.
                Déjalo vacío para usar el predeterminado.
              </p>
            </div>

            {/* Payment overrides */}
            {showPaymentConfig && (
              <div className="flex flex-col gap-3 rounded-lg border border-dashed p-4">
                <div>
                  <p className="text-sm font-medium">
                    Mensajes de pago (opcionales)
                  </p>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Sobreescriben los mensajes globales de comprobante solo para
                    este flujo.
                  </p>
                </div>
                {[
                  {
                    label: "Comprobante recibido (en revisión)",
                    key: "receiptPendingMessage" as const,
                  },
                  {
                    label: "Pago confirmado",
                    key: "receiptConfirmedMessage" as const,
                  },
                  {
                    label: "Comprobante rechazado",
                    key: "receiptRejectedMessage" as const,
                  },
                ].map(({ label, key }) => (
                  <div key={key} className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                      {label}
                    </label>
                    <Textarea
                      placeholder="Dejar vacío para usar el mensaje predeterminado…"
                      value={draft[key] ?? ""}
                      rows={2}
                      className="resize-none text-base"
                      onChange={(e) => patch({ [key]: e.target.value })}
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Session timeout */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-muted-foreground">
                Ventana de sesión (horas)
              </label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  max={720}
                  value={draft.sessionTimeoutHours}
                  className="w-24"
                  onChange={(e) =>
                    patch({
                      sessionTimeoutHours: Math.max(
                        0,
                        parseInt(e.target.value, 10) || 0
                      ),
                    })
                  }
                />
                <span className="text-base text-muted-foreground">horas</span>
                {draft.sessionTimeoutHours === 0 && (
                  <span className="text-sm text-amber-600">
                    Siempre re-inicia el flow
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                Si el usuario escribe después de{" "}
                {draft.sessionTimeoutHours === 0
                  ? "cualquier tiempo"
                  : `${draft.sessionTimeoutHours}h`}
                , se inicia una nueva sesión.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Steps */}
      <div className="flex flex-col gap-0">
        <div className="flex items-center justify-between px-1 pb-3">
          <h3 className="text-base font-semibold">
            Pasos del flow
            {draft.steps.length > 0 && (
              <span className="ml-2 font-normal text-muted-foreground">
                ({draft.steps.length})
              </span>
            )}
          </h3>
        </div>

        {draft.steps.length === 0 ? (
          <div className="rounded-xl border border-dashed p-8 text-center">
            <Zap size={28} className="mx-auto mb-2 text-muted-foreground/40" />
            <p className="text-base text-muted-foreground">
              Sin pasos configurados.
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Cada paso puede tener uno o más mensajes y un delay antes de
              enviarse.
            </p>
          </div>
        ) : (
          <div className="flex flex-col">
            {draft.steps.map((step, i) => (
              <StepCard
                key={`${step.id ?? "new"}-${i}`}
                step={step}
                stepIndex={i}
                uploadTarget={uploadTarget}
                onUpdate={(s) => patchStep(i, s)}
                onDelete={() => deleteStep(i)}
                onAddMessage={() => addMessage(i)}
                onDeleteMessage={(j) => deleteMessage(i, j)}
                onMessageTypeChange={(j, type) =>
                  patchMessage(i, j, {
                    messageType: type,
                    textContent: "",
                    mediaUrl: "",
                    filename: "",
                    caption: "",
                  })
                }
                onMessageTextChange={(j, text) =>
                  patchMessage(i, j, { textContent: text })
                }
                onMessageCaptionChange={(j, caption) =>
                  patchMessage(i, j, { caption })
                }
                onUploadClick={(j) => {
                  setUploadTarget({ step: i, msg: j });
                  setMediaPickerOpen(true);
                }}
                onDelayChange={(secs) => patchStep(i, { delaySeconds: secs })}
              />
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={addStep}
          className="mt-4 flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-muted-foreground/20 py-3 text-base text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
        >
          <Plus size={15} />
          Agregar paso
        </button>
      </div>

      {/* Action bar */}
      <Separator />
      <div className="flex flex-wrap items-center gap-2 pb-2">
        <Button
          onClick={() => onSave(draft)}
          disabled={
            savePending || !draft.name.trim() || !draft.triggerPhrase.trim()
          }
          loading={savePending}
          loadingText="Guardando…"
        >
          {saveLabel}
        </Button>
        {renderActions?.({ draft, dirty, resetDraft })}
      </div>
    </div>
  );
}
