import { useEffect, useRef, useState, useCallback } from "react";
import { Plus, Trash2, BookMarked, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FlowCanvas } from "@/components/FlowCanvas";
import type { FlowEditorDraft } from "@/components/FlowCanvas";
import { emptyDraft } from "@/lib/flowUtils";
import type { FlowV2 } from "@/types/api";
import {
  useDeleteFlowV2Mutation,
  useFlowsV2Query,
  useUpsertFlowV2Mutation,
  useCreateFlowTemplateMutation,
} from "@/lib/hooks";
import { toast } from "sonner";
import type { UpsertFlowBody } from "@/types/api";

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

// ── FlowsPage ─────────────────────────────────────────────────────────────

export function FlowsPage() {
  const flows = useFlowsV2Query();
  const upsert = useUpsertFlowV2Mutation();
  const remove = useDeleteFlowV2Mutation();
  const createTemplate = useCreateFlowTemplateMutation();

  const [selected, setSelected] = useState<string>("");
  const [currentDraft, setCurrentDraft] =
    useState<FlowEditorDraft>(emptyDraft());
  const [dirty, setDirty] = useState(false);
  const [editorKey, setEditorKey] = useState(0); // forces FlowEditor remount on flow switch

  // Save-as-template dialog state
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [templateDescription, setTemplateDescription] = useState("");
  const [templateCategory, setTemplateCategory] = useState("Personalizado");

  // Discard-changes confirmation dialog
  const [discardOpen, setDiscardOpen] = useState(false);
  const pendingActionRef = useRef<(() => void) | null>(null);

  // Delete flow confirmation dialog
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  // ── localStorage autosave ─────────────────────────────────────────────
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleDraftChange = useCallback((draft: FlowEditorDraft) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      localStorage.setItem(
        "flow_draft",
        JSON.stringify({ draft, savedAt: Date.now() })
      );
    }, 800);
  }, []);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  // ── Template bridge + autosave restore on mount ───────────────────────
  useEffect(() => {
    // 1. Check for template bridge (takes priority)
    const templateRaw = localStorage.getItem("flow_new_draft");
    if (templateRaw) {
      try {
        localStorage.removeItem("flow_new_draft");
        localStorage.removeItem("flow_draft");
        const loaded = JSON.parse(templateRaw) as FlowEditorDraft;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSelected("");
        setCurrentDraft(loaded);
        setDirty(true);
        setEditorKey((k) => k + 1);
      } catch {
        /* ignore */
      }
    } else {
      // 2. Check for autosaved draft
      const draftRaw = localStorage.getItem("flow_draft");
      if (draftRaw) {
        try {
          const saved = JSON.parse(draftRaw) as { draft: FlowEditorDraft };
          const name = saved.draft?.name?.trim();
          toast("Tenés un borrador guardado", {
            id: "flow-draft-restore",
            description: name
              ? `"${name}" — continuá donde dejaste`
              : "Continuá donde dejaste",
            duration: Infinity,
            action: {
              label: "Restaurar",
              onClick: () => {
                setSelected("");
                setCurrentDraft(saved.draft);
                setDirty(true);
                setEditorKey((k) => k + 1);
                localStorage.removeItem("flow_draft");
              },
            },
            cancel: {
              label: "Descartar",
              onClick: () => localStorage.removeItem("flow_draft"),
            },
          });
        } catch {
          localStorage.removeItem("flow_draft");
        }
      }
    }

    // 3. Future template loads (from TemplatesPage navigation)
    const handleTemplateLoad = () => {
      try {
        const raw = localStorage.getItem("flow_new_draft");
        if (raw) {
          localStorage.removeItem("flow_new_draft");
          localStorage.removeItem("flow_draft");
          const loaded = JSON.parse(raw) as FlowEditorDraft;
          setSelected("");
          setCurrentDraft(loaded);
          setDirty(true);
          setEditorKey((k) => k + 1);
        }
      } catch {
        /* ignore */
      }
    };

    window.addEventListener("flow_template_loaded", handleTemplateLoad);
    return () =>
      window.removeEventListener("flow_template_loaded", handleTemplateLoad);
  }, []);

  const doSwitchFlow = (id: string) => {
    localStorage.removeItem("flow_draft");
    const f = (flows.data ?? []).find((x) => x.id === id);
    const draft = toDraft(f);
    setSelected(id);
    setCurrentDraft(draft);
    setDirty(false);
    setEditorKey((k) => k + 1);
  };

  const switchFlow = (id: string) => {
    if (dirty) {
      pendingActionRef.current = () => doSwitchFlow(id);
      setDiscardOpen(true);
      return;
    }
    doSwitchFlow(id);
  };

  const doNewFlow = () => {
    localStorage.removeItem("flow_draft");
    setSelected("");
    setCurrentDraft(emptyDraft());
    setDirty(false);
    setEditorKey((k) => k + 1);
  };

  const newFlow = () => {
    if (dirty) {
      pendingActionRef.current = doNewFlow;
      setDiscardOpen(true);
      return;
    }
    doNewFlow();
  };

  const handleSave = (draft: FlowEditorDraft) => {
    if (!draft.name.trim()) {
      toast.error("El nombre del flow es requerido");
      return;
    }
    if (!draft.triggerPhrase.trim()) {
      toast.error("La frase de trigger es requerida");
      return;
    }

    const messageOverrides: Record<string, string> = {};
    if (draft.receiptPendingMessage?.trim())
      messageOverrides.receiptPendingMessage =
        draft.receiptPendingMessage.trim();
    if (draft.receiptRejectedMessage?.trim())
      messageOverrides.receiptRejectedMessage =
        draft.receiptRejectedMessage.trim();
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
        setSelected(saved.id);
        setCurrentDraft(toDraft(saved));
        setDirty(false);
        setEditorKey((k) => k + 1);
        toast.success("Flow guardado");
      },
    });
  };

  const confirmDelete = (draftId: string) => {
    setDeleteTargetId(draftId);
    setDeleteOpen(true);
  };

  const handleDelete = () => {
    if (!deleteTargetId) return;
    remove.mutate(deleteTargetId, {
      onSuccess: () => {
        setDeleteOpen(false);
        setDeleteTargetId(null);
        setSelected("");
        setCurrentDraft(emptyDraft());
        setDirty(false);
        setEditorKey((k) => k + 1);
      },
    });
  };

  const handleSaveTemplate = (draft: FlowEditorDraft) => {
    const templateDraft: FlowEditorDraft = {
      ...draft,
      id: undefined,
      steps: draft.steps.map((s) => ({
        ...s,
        id: undefined,
        messages: s.messages.map((m) => ({ ...m, id: undefined })),
      })),
    };
    createTemplate.mutate(
      {
        name: templateName.trim(),
        description: templateDescription.trim() || undefined,
        category: templateCategory,
        draft: templateDraft,
      },
      {
        onSuccess: () => {
          toast.success("Plantilla guardada");
          setSaveTemplateOpen(false);
        },
        onError: () => toast.error("No se pudo guardar la plantilla"),
      }
    );
  };

  return (
    <div className="flex h-full flex-col gap-0">
      <div className="grid flex-1 gap-5 overflow-hidden p-3 lg:grid-cols-[300px_1fr] sm:p-6">
        {/* ── Left: flow list ── */}
        <div className="flex flex-col gap-3 overflow-y-auto">
          <Button variant="outline" className="w-full gap-2" onClick={newFlow}>
            <Plus size={15} />
            Nuevo flow
          </Button>

          {flows.isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-16 animate-pulse rounded-lg bg-muted"
                />
              ))}
            </div>
          ) : (flows.data ?? []).length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center">
              <Zap size={24} className="mx-auto mb-2 text-muted-foreground" />
              <p className="text-base text-muted-foreground">
                Crea tu primer flow para comenzar
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {(flows.data ?? []).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => switchFlow(f.id)}
                  className={`w-full rounded-xl border p-3 text-left transition-colors hover:bg-muted/50 ${
                    selected === f.id
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "bg-background"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium leading-tight">{f.name}</span>
                    <Badge
                      variant={f.is_active ? "default" : "outline"}
                      className="shrink-0 text-[10px]"
                    >
                      {f.is_active ? "Activo" : "Inactivo"}
                    </Badge>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                    <Zap size={10} />
                    <span className="font-mono">
                      {f.trigger_first_word || "—"}
                    </span>
                    <span>·</span>
                    <span>
                      {(f.steps ?? []).length} paso
                      {(f.steps ?? []).length !== 1 ? "s" : ""}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Right: editor ── */}
        <div className="overflow-hidden">
          <FlowCanvas
            key={editorKey}
            initialDraft={currentDraft}
            onSave={handleSave}
            savePending={upsert.isPending}
            saveLabel="Guardar flow"
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
                  onClick={() => {
                    setTemplateName(draft.name);
                    setTemplateDescription("");
                    setTemplateCategory("Personalizado");
                    setSaveTemplateOpen(true);
                  }}
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
      </div>

      {/* Discard unsaved changes dialog */}
      <Dialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <DialogContent showCloseButton={false} className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Cambios sin guardar</DialogTitle>
            <DialogDescription>
              Tenés cambios sin guardar en este flow. ¿Querés descartarlos y
              continuar?
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
              Descartar cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete flow confirmation dialog */}
      <Dialog
        open={deleteOpen}
        onOpenChange={(v) => {
          if (!remove.isPending) setDeleteOpen(v);
        }}
      >
        <DialogContent showCloseButton={false} className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Eliminar flow</DialogTitle>
            <DialogDescription>
              Esta acción no se puede deshacer. El flow y todos sus pasos serán
              eliminados permanentemente.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={remove.isPending}
              onClick={() => setDeleteOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              loading={remove.isPending}
              loadingText="Eliminando…"
              onClick={handleDelete}
            >
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Save-as-template dialog */}
      <Dialog
        open={saveTemplateOpen}
        onOpenChange={(v) => !v && setSaveTemplateOpen(false)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Guardar como plantilla</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-1">
            <p className="text-base text-muted-foreground">
              Se guardará el flow actual (configuración + pasos) como plantilla
              reutilizable.
            </p>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-muted-foreground">
                Nombre *
              </label>
              <Input
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="Nombre de la plantilla"
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-muted-foreground">
                Descripción
              </label>
              <Textarea
                value={templateDescription}
                onChange={(e) => setTemplateDescription(e.target.value)}
                placeholder="¿Para qué sirve esta plantilla?"
                rows={2}
                className="resize-none text-base"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-muted-foreground">
                Categoría
              </label>
              <select
                value={templateCategory}
                onChange={(e) => setTemplateCategory(e.target.value)}
                className="h-9 rounded-md border bg-background px-3 text-base"
              >
                {TEMPLATE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSaveTemplateOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                disabled={!templateName.trim() || createTemplate.isPending}
                onClick={() => handleSaveTemplate(currentDraft)}
              >
                {createTemplate.isPending ? "Guardando…" : "Guardar plantilla"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
