// dashboard/src/components/canvas/FlowRightPanel.tsx
import { useEffect, useRef } from "react";
import { X, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { DelayEditor } from "./DelayEditor";
import { MessageEditor } from "./MessageEditor";
import type { DelayEditorRef } from "./DelayEditor";
import type { FlowEditorDraft, FlowEditorStep } from "@/lib/flowUtils";

type Props = {
  draft: FlowEditorDraft;
  stepIndex: number;
  /** When true, focus the delay input on mount/update */
  focusDelay: boolean;
  onFocusDelayConsumed: () => void;
  onStepChange: (step: FlowEditorStep) => void;
  onDeleteStep: () => void;
  onClose: () => void;
  onUploadClick: (msgIndex: number) => void;
  uploadPendingIndex: number | null;
  expandedVariants: Set<number>;
  onToggleVariants: (index: number) => void;
};

export function FlowRightPanel({
  draft, stepIndex, focusDelay, onFocusDelayConsumed,
  onStepChange, onDeleteStep, onClose,
  onUploadClick, uploadPendingIndex, expandedVariants, onToggleVariants,
}: Props) {
  const step = draft.steps[stepIndex];
  const delayRef = useRef<DelayEditorRef>(null);

  useEffect(() => {
    if (focusDelay) {
      delayRef.current?.focus();
      onFocusDelayConsumed();
    }
  }, [focusDelay, onFocusDelayConsumed]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!step) return null;

  const totalOtherDelays = draft.steps.reduce(
    (sum, s, i) => (i !== stepIndex ? sum + s.delaySeconds : sum),
    0,
  );

  return (
    <div className="flex w-[300px] shrink-0 flex-col border-l border-border bg-background overflow-hidden">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
          {stepIndex + 1}
        </span>
        <Input
          value={step.label ?? ""}
          placeholder={`Paso ${stepIndex + 1}`}
          className="h-7 flex-1 border-0 bg-transparent px-1 text-sm font-semibold shadow-none focus-visible:ring-0"
          onChange={(e) => onStepChange({ ...step, label: e.target.value })}
        />
        <button
          type="button"
          title="Eliminar paso"
          className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          onClick={onDeleteStep}
        >
          <Trash2 size={13} />
        </button>
        <button
          type="button"
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={onClose}
        >
          <X size={13} />
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-4">
        <section>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Espera antes de este paso
          </p>
          <DelayEditor
            ref={delayRef}
            value={step.delaySeconds}
            totalOtherDelays={totalOtherDelays}
            onChange={(secs) => onStepChange({ ...step, delaySeconds: secs })}
          />
        </section>

        <section>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Mensajes
          </p>
          <MessageEditor
            messages={step.messages}
            onChange={(msgs) => onStepChange({ ...step, messages: msgs })}
            onUploadClick={onUploadClick}
            uploadPendingIndex={uploadPendingIndex}
            expandedVariants={expandedVariants}
            onToggleVariants={onToggleVariants}
          />
        </section>
      </div>
    </div>
  );
}
