// dashboard/src/components/FlowCanvas.tsx
import { useState, useMemo, useCallback, useEffect } from "react";
import {
  ReactFlow, Background, Controls, MiniMap,
  ReactFlowProvider, BackgroundVariant,
  type NodeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Plus, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { MediaPickerModal } from "@/components/ui/media-picker-modal";
import { StartNode } from "./canvas/StartNode";
import { StepNode } from "./canvas/StepNode";
import { DelayEdge } from "./canvas/DelayEdge";
import { FlowRightPanel } from "./canvas/FlowRightPanel";
import { FlowConfigPanel } from "./canvas/FlowConfigPanel";
import {
  draftToNodes, draftToEdges, stepNodeId,
  MAX_FLOW_DELAY_SECS, START_NODE_ID,
} from "@/lib/flowCanvas";
import type { FlowEditorDraft, FlowEditorStep } from "@/lib/flowUtils";

export type { FlowEditorDraft, FlowEditorStep };

export type FlowEditorActionsContext = {
  draft: FlowEditorDraft;
  dirty: boolean;
  resetDraft: () => void;
};

const NODE_TYPES = { startNode: StartNode, stepNode: StepNode } as const;
const EDGE_TYPES = { delayEdge: DelayEdge } as const;

type Props = {
  initialDraft: FlowEditorDraft;
  onSave: (draft: FlowEditorDraft) => void;
  savePending?: boolean;
  saveLabel?: string;
  showPaymentConfig?: boolean;
  showMediaPicker?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
  onDraftChange?: (draft: FlowEditorDraft) => void;
  renderActions?: (ctx: FlowEditorActionsContext) => React.ReactNode;
  readOnly?: boolean;
};

function FlowCanvasInner({
  initialDraft,
  onSave,
  savePending = false,
  saveLabel = "Guardar",
  showPaymentConfig = true,
  showMediaPicker = true,
  onDirtyChange,
  onDraftChange,
  renderActions,
  readOnly = false,
}: Props) {
  const [draft, setDraftRaw] = useState<FlowEditorDraft>(initialDraft);
  const [dirty, setDirtyRaw] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [focusDelay, setFocusDelay] = useState(false);
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [uploadMsgIndex, setUploadMsgIndex] = useState<number | null>(null);
  const [expandedVariants, setExpandedVariants] = useState<Set<number>>(new Set());

  // Reset when initialDraft changes (e.g. parent loads different flow)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraftRaw(initialDraft);
    setDirtyRaw(false);
    setSelectedNodeId(null);
    setExpandedVariants(new Set());
  }, [initialDraft]);

  // ── Draft mutations ────────────────────────────────────────────────────

  function setDraft(updater: (d: FlowEditorDraft) => FlowEditorDraft) {
    setDraftRaw((prev) => {
      const next = updater(prev);
      if (!dirty) { setDirtyRaw(true); onDirtyChange?.(true); }
      onDraftChange?.(next);
      return next;
    });
  }

  function patch(partial: Partial<FlowEditorDraft>) {
    setDraft((d) => ({ ...d, ...partial }));
  }

  function resetDraft() {
    setDraftRaw(initialDraft);
    setDirtyRaw(false);
    onDirtyChange?.(false);
    setSelectedNodeId(null);
    setExpandedVariants(new Set());
  }

  // ── Selected step ──────────────────────────────────────────────────────

  const selectedStepIndex = useMemo(() => {
    if (!selectedNodeId || selectedNodeId === START_NODE_ID) return null;
    return draft.steps.findIndex((s, i) => stepNodeId(s, i) === selectedNodeId);
  }, [selectedNodeId, draft.steps]);

  function selectNode(id: string | null) {
    setSelectedNodeId(id);
    setExpandedVariants(new Set());
  }

  // ── Canvas data (derived) ──────────────────────────────────────────────

  const nodes = useMemo(
    () =>
      draftToNodes(draft, selectedNodeId, (id) => {
        setSelectedNodeId(id);
        setFocusDelay(true);
      }),
    [draft, selectedNodeId],
  );

  const edges = useMemo(
    () =>
      draftToEdges(draft, selectedNodeId, (targetId) => {
        setSelectedNodeId(targetId);
        setFocusDelay(true);
      }),
    [draft, selectedNodeId],
  );

  // ── Step CRUD ──────────────────────────────────────────────────────────

  function addStep() {
    setDraft((d) => ({
      ...d,
      steps: [
        ...d.steps,
        {
          position: d.steps.length,
          delaySeconds: d.steps.length === 0 ? 0 : 5,
          label: "",
          messages: [],
        },
      ],
    }));
  }

  function patchStep(index: number, partial: Partial<FlowEditorStep>) {
    setDraft((d) => {
      const steps = [...d.steps];
      steps[index] = { ...steps[index], ...partial };
      return { ...d, steps };
    });
  }

  function deleteStep(index: number) {
    setDraft((d) => ({ ...d, steps: d.steps.filter((_, i) => i !== index) }));
    selectNode(null);
  }

  // ── Node click ─────────────────────────────────────────────────────────

  const onNodeClick: NodeMouseHandler = useCallback((_event, node) => {
    if (node.id !== START_NODE_ID) selectNode(node.id);
  }, []);

  // ── Validation ─────────────────────────────────────────────────────────

  const totalDelaySecs = draft.steps.reduce((s, st) => s + st.delaySeconds, 0);
  const exceeds24h = totalDelaySecs > MAX_FLOW_DELAY_SECS;
  const canSave = Boolean(draft.name.trim() && draft.triggerPhrase.trim() && !exceeds24h);

  // ── Media picker ───────────────────────────────────────────────────────

  const uploadTargetType =
    uploadMsgIndex !== null && selectedStepIndex !== null
      ? (draft.steps[selectedStepIndex]?.messages[uploadMsgIndex]
          ?.messageType as "image" | "video" | "document" | "audio" | undefined)
      : undefined;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Config panel */}
      {!readOnly && (
        <FlowConfigPanel
          draft={draft}
          onChange={patch}
          showPaymentConfig={showPaymentConfig}
        />
      )}

      {/* Canvas + right panel */}
      <div className="flex min-h-0 flex-1">
        {/* Canvas */}
        <div className="relative flex-1">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={NODE_TYPES}
            edgeTypes={EDGE_TYPES}
            onNodeClick={readOnly ? undefined : onNodeClick}
            onPaneClick={readOnly ? undefined : () => selectNode(null)}
            nodesDraggable={!readOnly}
            nodesConnectable={!readOnly}
            elementsSelectable={!readOnly}
            fitView
            fitViewOptions={{ padding: 0.4 }}
            minZoom={0.2}
            maxZoom={2}
            proOptions={{ hideAttribution: true }}
            className="bg-background"
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={20}
              size={1}
              color="hsl(var(--border))"
            />
            <MiniMap
              nodeStrokeWidth={3}
              className="!rounded-lg !border !border-border !bg-card"
              nodeColor={(node) => {
                if (node.type === 'startNode') return 'hsl(var(--primary))';
                return 'hsl(var(--muted-foreground))';
              }}
            />
            <Controls className="!rounded-lg !border-border !bg-card" showInteractive={false} />
          </ReactFlow>

          {/* Floating add-step button */}
          {!readOnly && (
            <div className="pointer-events-none absolute inset-x-0 bottom-20 flex justify-center">
              <button
                type="button"
                className="pointer-events-auto flex items-center gap-2 rounded-xl border-2 border-dashed border-primary/30 bg-card px-4 py-2 text-sm text-muted-foreground shadow-sm transition-colors hover:border-primary/60 hover:text-foreground"
                onClick={addStep}
              >
                <Plus size={14} />
                Agregar paso
              </button>
            </div>
          )}
        </div>

        {/* Right panel */}
        {!readOnly && selectedStepIndex !== null && (
          <FlowRightPanel
            draft={draft}
            stepIndex={selectedStepIndex}
            focusDelay={focusDelay}
            onFocusDelayConsumed={() => setFocusDelay(false)}
            onStepChange={(step) => patchStep(selectedStepIndex, step)}
            onDeleteStep={() => deleteStep(selectedStepIndex)}
            onClose={() => selectNode(null)}
            onUploadClick={(msgIdx) => {
              setUploadMsgIndex(msgIdx);
              setMediaPickerOpen(true);
            }}
            uploadPendingIndex={uploadMsgIndex}
            expandedVariants={expandedVariants}
            onToggleVariants={(i) =>
              setExpandedVariants((prev) => {
                const next = new Set(prev);
                if (next.has(i)) next.delete(i);
                else next.add(i);
                return next;
              })
            }
          />
        )}
      </div>

      {/* Action bar */}
      {!readOnly && (
        <>
          <Separator />
          <div className="flex shrink-0 flex-wrap items-center gap-2 p-3">
            {exceeds24h && (
              <div className="flex items-center gap-1.5 text-sm text-destructive">
                <AlertTriangle size={13} />
                El tiempo acumulado supera 24h. Reduce los delays para guardar.
              </div>
            )}
            <Button
              onClick={() => onSave(draft)}
              disabled={savePending || !canSave}
            >
              {savePending ? "Guardando…" : saveLabel}
            </Button>
            {renderActions?.({ draft, dirty, resetDraft })}
          </div>
        </>
      )}

      {/* Media picker */}
      {showMediaPicker && (
        <MediaPickerModal
          open={mediaPickerOpen}
          onClose={() => {
            setMediaPickerOpen(false);
            setUploadMsgIndex(null);
          }}
          allowedType={uploadTargetType}
          onSelect={(results) => {
            const result = results[0];
            if (result && uploadMsgIndex !== null && selectedStepIndex !== null) {
              const step = draft.steps[selectedStepIndex];
              const msgs = [...step.messages];
              msgs[uploadMsgIndex] = {
                ...msgs[uploadMsgIndex],
                mediaUrl: result.url,
                filename: result.filename,
              };
              patchStep(selectedStepIndex, { messages: msgs });
            }
            setMediaPickerOpen(false);
            setUploadMsgIndex(null);
          }}
        />
      )}
    </div>
  );
}

export function FlowCanvas(props: Props) {
  return (
    <ReactFlowProvider>
      <FlowCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
