import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  MessageSquare,
  Image as ImageIcon,
  FileText,
  Video,
  Mic,
  Clock,
  Zap,
  ArrowRight,
  Plus,
  Trash2,
  BookMarked,
  Eye,
  LayoutTemplate,
  Paperclip,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  useFlowTemplatesQuery,
  useCreateFlowTemplateMutation,
  useDeleteFlowTemplateMutation,
} from "@/lib/hooks";
import type { FlowTemplate } from "@/types/api";
import { FlowEditor } from "@/components/FlowEditor";
import type { FlowEditorDraft } from "@/components/FlowEditor";
import { emptyDraft } from "@/lib/flowUtils";

// ── Types ─────────────────────────────────────────────────────────────────

type FlowTemplateDraft = FlowTemplate["draft"];
type TemplateStepDraft = FlowTemplateDraft["steps"][number];
type TemplateMsgDraft = TemplateStepDraft["messages"][number];
type MsgType = TemplateMsgDraft["messageType"];

const USER_CATEGORIES = [
  "Personalizado",
  "Ventas",
  "Soporte",
  "Marketing",
  "Servicios",
  "Otro",
];

// ── Helpers ───────────────────────────────────────────────────────────────

const MSG_META: Record<
  MsgType,
  { icon: React.ElementType; label: string; color: string }
> = {
  text: { icon: MessageSquare, label: "Texto", color: "text-blue-500" },
  image: { icon: ImageIcon, label: "Imagen", color: "text-green-500" },
  document: { icon: FileText, label: "Documento", color: "text-orange-500" },
  video: { icon: Video, label: "Video", color: "text-purple-500" },
  audio: { icon: Mic, label: "Audio", color: "text-pink-500" },
};

function msgMeta(type: string) {
  return MSG_META[type as MsgType] ?? MSG_META.text;
}

function delayLabel(seconds: number): string {
  if (seconds === 0) return "Inmediato";
  if (seconds >= 86400) return `${Math.round(seconds / 86400)}d después`;
  if (seconds >= 3600) return `${Math.round(seconds / 3600)}h después`;
  if (seconds >= 60) return `${Math.round(seconds / 60)}min después`;
  return `${seconds}s después`;
}

function StepBubbles({ steps }: { steps: TemplateStepDraft[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {steps.map((step, i) => {
        return (
          <div key={i} className="flex items-center gap-1.5">
            {i > 0 && (
              <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                <Clock size={9} />
                {delayLabel(step.delaySeconds)}
              </span>
            )}
            <span className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium">
              <span className="text-muted-foreground">P{i + 1}</span>
              {step.messages.map((m, j) => {
                const { icon: Icon } = msgMeta(m.messageType);
                return (
                  <Icon key={j} size={10} className="text-muted-foreground" />
                );
              })}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Steps Modal ───────────────────────────────────────────────────────────

function StepsModal({
  open,
  onClose,
  templateName,
  steps,
}: {
  open: boolean;
  onClose: () => void;
  templateName: string;
  steps: TemplateStepDraft[];
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="flex max-h-[85vh] w-full max-w-lg flex-col gap-0 p-0 sm:max-w-xl">
        <DialogHeader className="shrink-0 border-b px-6 py-4">
          <DialogTitle className="text-base">{templateName}</DialogTitle>
          <p className="text-xs text-muted-foreground">
            {steps.length} paso{steps.length !== 1 ? "s" : ""}
          </p>
        </DialogHeader>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="flex flex-col gap-1">
            {steps.map((step, i) => {
              const { icon: Icon, label, color } = msgMeta("text");
              void Icon;
              void label;
              void color;
              return (
                <div key={i} className="flex flex-col">
                  {/* Delay connector */}
                  {i > 0 && (
                    <div className="flex items-center gap-3 py-2 pl-5">
                      <div className="flex flex-col items-center">
                        <div className="h-4 w-px bg-border" />
                      </div>
                      <span className="flex items-center gap-1.5 rounded-full border border-dashed bg-muted/50 px-2.5 py-1 text-[11px] text-muted-foreground">
                        <Clock size={10} />
                        {delayLabel(step.delaySeconds)}
                      </span>
                    </div>
                  )}

                  {/* Step card */}
                  <div className="flex gap-3">
                    {/* Step number */}
                    <div className="flex flex-col items-center gap-1 pt-0.5">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
                        {i + 1}
                      </span>
                      {step.messages.length > 1 && (
                        <div className="flex-1 w-px bg-border" />
                      )}
                    </div>

                    {/* Step content */}
                    <div className="flex flex-1 flex-col gap-2 pb-2 min-w-0">
                      {step.label && (
                        <p className="text-xs font-semibold text-foreground leading-none">
                          {step.label}
                        </p>
                      )}
                      {step.messages.map((m, j) => {
                        const meta = msgMeta(m.messageType);
                        const MIcon = meta.icon;
                        return (
                          <div
                            key={j}
                            className="flex gap-2 rounded-xl border bg-card p-3 shadow-sm"
                          >
                            <div className={`mt-0.5 shrink-0 ${meta.color}`}>
                              <MIcon size={13} />
                            </div>
                            <div className="flex flex-1 flex-col gap-0.5 min-w-0">
                              <span
                                className={`text-[10px] font-semibold uppercase tracking-wider ${meta.color}`}
                              >
                                {meta.label}
                              </span>
                              {m.textContent ? (
                                <p className="whitespace-pre-wrap text-sm leading-snug text-foreground wrap-break-word">
                                  {m.textContent}
                                </p>
                              ) : m.filename ? (
                                <p className="flex items-center gap-1 text-sm text-muted-foreground">
                                  <Paperclip className="h-3.5 w-3.5 shrink-0" /> {m.filename}
                                </p>
                              ) : m.caption ? (
                                <p className="text-sm text-muted-foreground italic">
                                  {m.caption}
                                </p>
                              ) : (
                                <p className="text-sm text-muted-foreground italic">
                                  [{meta.label}]
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="shrink-0 border-t px-6 py-3">
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={onClose}
          >
            Cerrar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Template Card ─────────────────────────────────────────────────────────

function TemplateCard({
  template,
  onUse,
  onDelete,
  deleteLoading,
}: {
  template: FlowTemplate;
  onUse: (t: FlowTemplate) => void;
  onDelete: (id: string) => void;
  deleteLoading: boolean;
}) {
  const [stepsOpen, setStepsOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const draft: FlowTemplateDraft = template.draft;
  const steps: TemplateStepDraft[] = draft.steps ?? [];
  const triggerPhrase = draft.triggerPhrase ?? null;
  const totalMessages = steps.reduce((acc, s) => acc + s.messages.length, 0);

  return (
    <>
      <Card className="group flex flex-col overflow-hidden transition-all hover:shadow-md hover:-translate-y-px">
        <CardHeader className="pb-3">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <BookMarked size={17} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold leading-tight text-sm truncate pr-1">
                  {template.name}
                </h3>
                <Badge
                  variant="secondary"
                  className="shrink-0 text-[10px] font-medium"
                >
                  {template.category}
                </Badge>
              </div>
              {template.description && (
                <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                  {template.description}
                </p>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex flex-1 flex-col gap-3 pt-0">
          {/* Step bubbles */}
          {steps.length > 0 ? (
            <StepBubbles steps={steps} />
          ) : (
            <p className="text-xs text-muted-foreground italic">
              Sin pasos definidos
            </p>
          )}

          {/* Meta row */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {triggerPhrase && (
              <span className="flex items-center gap-1">
                <Zap size={10} />
                <span className="font-mono">"{triggerPhrase}"</span>
              </span>
            )}
            {steps.length > 0 && (
              <span className="flex items-center gap-1">
                <MessageSquare size={10} />
                {totalMessages} mensaje{totalMessages !== 1 ? "s" : ""}
              </span>
            )}
          </div>

          {/* View steps button */}
          {steps.length > 0 && (
            <button
              type="button"
              onClick={() => setStepsOpen(true)}
              className="flex items-center gap-1 self-start text-xs text-primary/70 hover:text-primary transition-colors"
            >
              <Eye size={11} />
              Ver {steps.length} paso{steps.length !== 1 ? "s" : ""}
            </button>
          )}

          {/* Actions */}
          <div className="mt-auto flex gap-2 pt-1">
            <Button
              size="sm"
              className="flex-1 gap-1.5"
              onClick={() => onUse(template)}
            >
              Usar plantilla
              <ArrowRight size={13} />
            </Button>
            {confirmDelete ? (
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={deleteLoading}
                  onClick={() => {
                    onDelete(template.id);
                    setConfirmDelete(false);
                  }}
                >
                  Sí, eliminar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setConfirmDelete(false)}
                >
                  No
                </Button>
              </div>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="shrink-0 text-muted-foreground hover:border-destructive/50 hover:text-destructive"
                onClick={() => setConfirmDelete(true)}
                aria-label="Eliminar plantilla"
              >
                <Trash2 size={14} />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <StepsModal
        open={stepsOpen}
        onClose={() => setStepsOpen(false)}
        templateName={template.name}
        steps={steps}
      />
    </>
  );
}

// ── Create dialog ─────────────────────────────────────────────────────────

const TEMPLATE_DRAFT_KEY = "template_draft";

type TemplateDraftSave = {
  description: string;
  category: string;
  flowDraft: FlowEditorDraft;
  savedAt: number;
};

function CreateTemplateDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const createMutation = useCreateFlowTemplateMutation();
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Personalizado");
  const [editorKey, setEditorKey] = useState(0);
  const [restoredFlowDraft, setRestoredFlowDraft] =
    useState<FlowEditorDraft | null>(null);

  // Refs for stable values inside callbacks
  const descriptionRef = useRef(description);
  const categoryRef = useRef(category);
  const latestFlowDraftRef = useRef<FlowEditorDraft>(emptyDraft());
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    descriptionRef.current = description;
  }, [description]);
  useEffect(() => {
    categoryRef.current = category;
  }, [category]);

  // Save draft debounced
  const saveDraft = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      localStorage.setItem(
        TEMPLATE_DRAFT_KEY,
        JSON.stringify({
          description: descriptionRef.current,
          category: categoryRef.current,
          flowDraft: latestFlowDraftRef.current,
          savedAt: Date.now(),
        } satisfies TemplateDraftSave)
      );
    }, 800);
  }, []);

  // Show restore toast when dialog opens and a draft exists
  useEffect(() => {
    if (!open) return;
    const raw = localStorage.getItem(TEMPLATE_DRAFT_KEY);
    if (!raw) return;
    try {
      const saved = JSON.parse(raw) as TemplateDraftSave;
      const name = saved.flowDraft?.name?.trim();
      toast("Tenés un borrador de plantilla guardado", {
        id: "template-draft-restore",
        description: name
          ? `"${name}" — continuá donde dejaste`
          : "Continuá donde dejaste",
        duration: Infinity,
        action: {
          label: "Restaurar",
          onClick: () => {
            setDescription(saved.description);
            setCategory(saved.category);
            setRestoredFlowDraft(saved.flowDraft);
            setEditorKey((k) => k + 1);
            localStorage.removeItem(TEMPLATE_DRAFT_KEY);
          },
        },
        cancel: {
          label: "Descartar",
          onClick: () => localStorage.removeItem(TEMPLATE_DRAFT_KEY),
        },
      });
    } catch {
      localStorage.removeItem(TEMPLATE_DRAFT_KEY);
    }
  }, [open]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  const handleFlowDraftChange = useCallback(
    (draft: FlowEditorDraft) => {
      latestFlowDraftRef.current = draft;
      saveDraft();
    },
    [saveDraft]
  );

  const handleDescriptionChange = (value: string) => {
    setDescription(value);
    saveDraft();
  };

  const handleCategoryChange = (value: string) => {
    setCategory(value);
    saveDraft();
  };

  const handleClose = () => {
    setDescription("");
    setCategory("Personalizado");
    setRestoredFlowDraft(null);
    setEditorKey((k) => k + 1);
    latestFlowDraftRef.current = emptyDraft();
    onClose();
  };

  const handleSave = (draft: FlowEditorDraft) => {
    createMutation.mutate(
      {
        name: draft.name.trim(),
        description: description.trim() || undefined,
        category,
        draft,
      },
      {
        onSuccess: () => {
          localStorage.removeItem(TEMPLATE_DRAFT_KEY);
          toast.success("Plantilla creada");
          handleClose();
        },
        onError: () => toast.error("No se pudo crear la plantilla"),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="flex max-h-[90vh] w-full max-w-4xl sm:max-w-4xl flex-col gap-0 p-0">
        <DialogHeader className="shrink-0 border-b px-6 py-4">
          <DialogTitle>Nueva plantilla</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-5">
          {/* Template metadata (outside FlowEditor) */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 rounded-xl border bg-muted/20 p-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Descripción
              </label>
              <Textarea
                placeholder="¿Para qué sirve esta plantilla?"
                value={description}
                rows={2}
                className="resize-none"
                onChange={(e) => handleDescriptionChange(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Categoría
              </label>
              <select
                value={category}
                onChange={(e) => handleCategoryChange(e.target.value)}
                className="h-9 rounded-md border bg-background px-3 text-sm"
              >
                {USER_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Full flow editor */}
          <FlowEditor
            key={editorKey}
            initialDraft={restoredFlowDraft ?? emptyDraft()}
            onSave={handleSave}
            savePending={createMutation.isPending}
            saveLabel="Crear plantilla"
            showPaymentConfig={false}
            onDraftChange={handleFlowDraftChange}
            renderActions={() => (
              <Button variant="outline" onClick={handleClose}>
                Cancelar
              </Button>
            )}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── TemplatesPage ─────────────────────────────────────────────────────────

export function TemplatesPage() {
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState("Todos");

  const { data: templates = [], isLoading } = useFlowTemplatesQuery();
  const deleteMutation = useDeleteFlowTemplateMutation();

  const categories = [
    "Todos",
    ...Array.from(new Set(templates.map((t) => t.category))).sort(),
  ];

  const filtered =
    activeCategory === "Todos"
      ? templates
      : templates.filter((t) => t.category === activeCategory);

  const loadDraft = (draft: FlowTemplateDraft) => {
    localStorage.setItem("flow_new_draft", JSON.stringify(draft));
    window.dispatchEvent(new Event("flow_template_loaded"));
    navigate("/flows");
  };

  const handleUse = (template: FlowTemplate) => {
    loadDraft(template.draft as unknown as FlowTemplateDraft);
  };

  const handleDelete = (id: string) => {
    deleteMutation.mutate(id, {
      onError: () => toast.error("No se pudo eliminar la plantilla"),
    });
  };

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold sm:text-2xl">Plantillas</h2>
          <p className="mt-1 max-w-lg text-sm text-muted-foreground">
            Crea y reutiliza configuraciones de flujos. Usa "Guardar como
            plantilla" desde el editor para capturar un flujo existente.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => navigate("/flows")}
          >
            Flow en blanco
          </Button>
          <Button
            size="sm"
            className="gap-2"
            onClick={() => setCreateOpen(true)}
          >
            <Plus size={14} />
            <span className="hidden sm:inline">Nueva plantilla</span>
            <span className="sm:hidden">Nueva</span>
          </Button>
        </div>
      </div>

      {/* Category filter — only show when there are templates */}
      {!isLoading && templates.length > 0 && categories.length > 2 && (
        <div className="flex flex-wrap gap-2">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveCategory(cat)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                activeCategory === cat
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-muted"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex flex-col gap-3 rounded-xl border p-5">
              <div className="flex items-start gap-3">
                <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
                <div className="flex flex-1 flex-col gap-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-full" />
                </div>
              </div>
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-8 w-full mt-2" />
            </div>
          ))}
        </div>
      ) : templates.length === 0 ? (
        /* Empty state */
        <div className="flex flex-1 flex-col items-center justify-center gap-4 rounded-xl border border-dashed py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <LayoutTemplate size={24} className="text-muted-foreground" />
          </div>
          <div>
            <p className="font-medium">Sin plantillas aún</p>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">
              Crea una plantilla desde aquí o guarda un flujo existente con
              "Guardar como plantilla" en el editor.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Button
              size="sm"
              className="gap-2"
              onClick={() => setCreateOpen(true)}
            >
              <Plus size={14} />
              Nueva plantilla
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/flows")}
            >
              Ir al editor
            </Button>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed py-10 text-center">
          <p className="text-sm text-muted-foreground">
            Sin plantillas en "{activeCategory}"
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              onUse={handleUse}
              onDelete={handleDelete}
              deleteLoading={deleteMutation.isPending}
            />
          ))}
        </div>
      )}

      <CreateTemplateDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />
    </div>
  );
}
