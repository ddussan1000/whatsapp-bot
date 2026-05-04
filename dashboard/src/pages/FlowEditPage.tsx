import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { BookMarked, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { PageBreadcrumb } from "@/components/PageBreadcrumb";
import { FlowCanvas } from "@/components/FlowCanvas";
import { emptyDraft } from "@/lib/flowUtils";
import {
  useFlowV2Query,
  useUpsertFlowV2Mutation,
  useDeleteFlowV2Mutation,
  useCreateFlowTemplateMutation,
} from "@/lib/hooks";
import type { FlowEditorDraft } from "@/lib/flowUtils";
import type { FlowV2, UpsertFlowBody } from "@/types/api";

// ── Helpers ───────────────────────────────────────────────────────────────

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

const TEMPLATE_CATEGORIES = [
  "Personalizado",
  "Ventas",
  "Soporte",
  "Marketing",
  "Servicios",
  "Otro",
];

// ── Component ─────────────────────────────────────────────────────────────

export function FlowEditPage() {
  const { flowId } = useParams<{ flowId?: string }>();
  const isNew = !flowId;
  const navigate = useNavigate();

  // ── Remote data ──────────────────────────────────────────────────────────
  const { data: existingFlow, isLoading } = useFlowV2Query(flowId ?? "");

  // ── Mutations ────────────────────────────────────────────────────────────
  const upsert = useUpsertFlowV2Mutation();
  const remove = useDeleteFlowV2Mutation();
  const createTemplate = useCreateFlowTemplateMutation();

  // ── Editor state ─────────────────────────────────────────────────────────
  const [currentDraft, setCurrentDraft] = useState<FlowEditorDraft>(emptyDraft);
  const [, setDirty] = useState(false);
  const [editorKey, setEditorKey] = useState(0);

  // Autosave timer
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Delete dialog
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  // Discard dialog
  const [discardOpen, setDiscardOpen] = useState(false);
  const pendingActionRef = useRef<(() => void) | null>(null);

  // Save-as-template dialog
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [templateDescription, setTemplateDescription] = useState("");
  const [templateCategory, setTemplateCategory] = useState("Personalizado");

  // ── Initialize draft ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!isNew && existingFlow) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCurrentDraft(toDraft(existingFlow));
      setEditorKey((k) => k + 1);
      return;
    }

    if (isNew) {
      // Template bridge: check if a template was selected
      const templateRaw = localStorage.getItem("flow_new_draft");
      if (templateRaw) {
        try {
          const parsed = JSON.parse(templateRaw) as FlowEditorDraft;
          setCurrentDraft({ ...parsed, id: undefined });
          setEditorKey((k) => k + 1);
          localStorage.removeItem("flow_new_draft");
          return;
        } catch {
          localStorage.removeItem("flow_new_draft");
        }
      }

      // Autosave restore
      const savedRaw = localStorage.getItem("flow_draft");
      if (savedRaw) {
        try {
          const saved = JSON.parse(savedRaw) as FlowEditorDraft;
          toast("Borrador restaurado", {
            description: "Se encontró un borrador guardado automáticamente.",
            action: {
              label: "Descartar",
              onClick: () => {
                localStorage.removeItem("flow_draft");
                setCurrentDraft(emptyDraft());
                setEditorKey((k) => k + 1);
              },
            },
          });
          setCurrentDraft(saved);
          setEditorKey((k) => k + 1);
        } catch {
          localStorage.removeItem("flow_draft");
        }
      }
    }
  }, [isNew, existingFlow]);

  // Listen for template bridge event
  useEffect(() => {
    function handleTemplateLoaded() {
      const templateRaw = localStorage.getItem("flow_new_draft");
      if (templateRaw) {
        try {
          const parsed = JSON.parse(templateRaw) as FlowEditorDraft;
          setCurrentDraft({ ...parsed, id: undefined });
          setEditorKey((k) => k + 1);
          localStorage.removeItem("flow_new_draft");
        } catch {
          localStorage.removeItem("flow_new_draft");
        }
      }
    }
    window.addEventListener("flow_template_loaded", handleTemplateLoaded);
    return () => {
      window.removeEventListener("flow_template_loaded", handleTemplateLoaded);
    };
  }, []);

  // ── Autosave to localStorage ──────────────────────────────────────────────
  function handleDraftChange(draft: FlowEditorDraft) {
    setCurrentDraft(draft);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      localStorage.setItem("flow_draft", JSON.stringify(draft));
    }, 1500);
  }

  // ── Save handler ──────────────────────────────────────────────────────────
  function handleSave(draft: FlowEditorDraft) {
    if (!draft.name.trim()) {
      toast.error("El nombre del flujo es requerido");
      return;
    }
    if (!draft.triggerPhrase.trim()) {
      toast.error("La frase de activación es requerida");
      return;
    }

    const messageOverrides: Record<string, string> = {};
    if (draft.receiptPendingMessage?.trim())
      messageOverrides.receiptPendingMessage = draft.receiptPendingMessage.trim();
    if (draft.receiptRejectedMessage?.trim())
      messageOverrides.receiptRejectedMessage = draft.receiptRejectedMessage.trim();
    if (draft.receiptConfirmedMessage?.trim())
      messageOverrides.receiptConfirmedMessage =
        draft.receiptConfirmedMessage.trim();

    const payload: UpsertFlowBody = {
      id: draft.id,
      name: draft.name.trim(),
      triggerPhrase: draft.triggerPhrase.trim(),
      keywords: draft.keywords,
      noMatchBehavior: draft.noMatchBehavior,
      systemPrompt: draft.systemPrompt || null,
      isActive: draft.isActive,
      sessionTimeoutHours: draft.sessionTimeoutHours,
      messageOverrides:
        Object.keys(messageOverrides).length > 0 ? messageOverrides : undefined,
      steps: draft.steps.map((s, i) => ({
        id: s.id,
        position: i,
        delaySeconds: Number(s.delaySeconds || 0),
        label: s.label ?? "",
        messages: s.messages.map((m, j) => ({
          id: m.id,
          position: j,
          messageType: m.messageType,
          textContent: m.textContent || null,
          textVariants: m.textVariants?.filter(Boolean) ?? [],
          mediaUrl: m.mediaUrl || null,
          filename: m.filename || null,
          caption: m.caption || null,
        })),
      })),
    };

    upsert.mutate(payload, {
      onSuccess: (saved) => {
        localStorage.removeItem("flow_draft");
        const savedDraft = toDraft(saved);
        setCurrentDraft(savedDraft);
        setEditorKey((k) => k + 1);
        toast.success("Flow guardado");
        navigate(`/flows/${saved.id}`);
      },
    });
  }

  // ── Delete handler ────────────────────────────────────────────────────────
  function confirmDelete(id: string) {
    setDeleteTargetId(id);
    setDeleteOpen(true);
  }

  function handleDelete() {
    if (!deleteTargetId) return;
    remove.mutate(deleteTargetId, {
      onSuccess: () => {
        setDeleteOpen(false);
        navigate("/flows");
      },
    });
  }

  // ── Save as template ──────────────────────────────────────────────────────
  function openSaveTemplate(draft: FlowEditorDraft) {
    setTemplateName(draft.name || "");
    setTemplateDescription("");
    setTemplateCategory("Personalizado");
    setSaveTemplateOpen(true);
  }

  function handleSaveTemplate() {
    if (!templateName.trim()) {
      toast.error("El nombre de la plantilla es requerido");
      return;
    }
    createTemplate.mutate(
      {
        name: templateName.trim(),
        description: templateDescription.trim() || undefined,
        category: templateCategory,
        draft: currentDraft,
      },
      {
        onSuccess: () => {
          setSaveTemplateOpen(false);
          toast.success("Plantilla guardada");
        },
      }
    );
  }

  // ── Loading state (edit mode) ─────────────────────────────────────────────
  if (!isNew && isLoading) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <Skeleton className="h-5 w-56" />
        <Skeleton className="flex-1 rounded-lg h-[500px]" />
      </div>
    );
  }

  // ── Breadcrumb items ──────────────────────────────────────────────────────
  const breadcrumbItems = isNew
    ? [{ label: "Flujos", href: "/flows" }, { label: "Nuevo flujo" }]
    : [
        { label: "Flujos", href: "/flows" },
        {
          label: existingFlow?.name ?? "Flujo",
          href: `/flows/${flowId}`,
        },
        { label: "Editar" },
      ];

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="shrink-0 border-b p-3">
        <PageBreadcrumb items={breadcrumbItems} />
      </div>

      {/* Canvas */}
      <div className="flex-1 overflow-hidden">
        <FlowCanvas
          key={editorKey}
          initialDraft={currentDraft}
          onSave={handleSave}
          savePending={upsert.isPending}
          saveLabel="Guardar flujo"
          onDirtyChange={setDirty}
          onDraftChange={handleDraftChange}
          renderActions={({ draft, dirty: isDirty, resetDraft }) => (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  resetDraft();
                  localStorage.removeItem("flow_draft");
                }}
                disabled={!isDirty}
              >
                Descartar cambios
              </Button>
              <Button
                variant="outline"
                className="gap-1.5"
                disabled={!draft.name.trim()}
                onClick={() => openSaveTemplate(draft)}
              >
                <BookMarked size={14} />
                Guardar como plantilla
              </Button>
              {draft.id && (
                <Button
                  variant="ghost"
                  className="ml-auto text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => confirmDelete(draft.id!)}
                >
                  <Trash2 size={14} className="mr-1.5" />
                  Eliminar flow
                </Button>
              )}
            </>
          )}
        />
      </div>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar flujo</DialogTitle>
            <DialogDescription>
              Esta acción no se puede deshacer. El flujo y todos sus pasos serán
              eliminados permanentemente.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={remove.isPending}
            >
              {remove.isPending ? "Eliminando..." : "Eliminar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Discard changes dialog */}
      <Dialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Descartar cambios</DialogTitle>
            <DialogDescription>
              Tienes cambios sin guardar. ¿Estás seguro de que deseas
              descartarlos?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDiscardOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setDiscardOpen(false);
                pendingActionRef.current?.();
                pendingActionRef.current = null;
              }}
            >
              Descartar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Save as template dialog */}
      <Dialog open={saveTemplateOpen} onOpenChange={setSaveTemplateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Guardar como plantilla</DialogTitle>
            <DialogDescription>
              Guarda este flujo como una plantilla reutilizable.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="template-name">Nombre</Label>
              <Input
                id="template-name"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="Nombre de la plantilla"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="template-desc">Descripción</Label>
              <Textarea
                id="template-desc"
                value={templateDescription}
                onChange={(e) => setTemplateDescription(e.target.value)}
                placeholder="Describe para qué sirve esta plantilla"
                rows={3}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="template-cat">Categoría</Label>
              <Select value={templateCategory} onValueChange={setTemplateCategory}>
                <SelectTrigger id="template-cat">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TEMPLATE_CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSaveTemplateOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSaveTemplate}
              disabled={createTemplate.isPending || !templateName.trim()}
            >
              {createTemplate.isPending ? "Guardando..." : "Guardar plantilla"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
