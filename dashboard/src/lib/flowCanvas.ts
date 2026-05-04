// dashboard/src/lib/flowCanvas.ts
import type { Node, Edge } from "@xyflow/react";
import type { FlowEditorDraft, FlowEditorStep } from "./flowUtils";

// ── Layout constants ─────────────────────────────────────────────────────

export const START_NODE_ID = "__start__";
export const NODE_SPACING = 200;       // px between node top edges
export const CANVAS_CENTER_X = 200;    // left edge of all nodes
export const MAX_FLOW_DELAY_SECS = 86_400;

// ── Delay helpers ─────────────────────────────────────────────────────────

export type DelayUnit = "seg" | "min" | "hrs";

export function formatDuration(seconds: number): string {
  if (seconds === 0) return "0 seg";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  if (s > 0 && h === 0) parts.push(`${s}s`);
  return parts.join(" ");
}

export function secondsToDisplay(s: number): { value: number; unit: DelayUnit } {
  if (s === 0) return { value: 0, unit: "seg" };
  if (s >= 3600 && s % 3600 === 0) return { value: s / 3600, unit: "hrs" };
  if (s >= 60 && s % 60 === 0) return { value: s / 60, unit: "min" };
  return { value: s, unit: "seg" };
}

export function displayToSeconds(value: number, unit: DelayUnit): number {
  if (unit === "hrs") return value * 3600;
  if (unit === "min") return value * 60;
  return value;
}

// ── Node/Edge data types ──────────────────────────────────────────────────

export type StartNodeData = Record<string, unknown> & {
  triggerPhrase: string;
};

export type StepNodeData = Record<string, unknown> & {
  step: FlowEditorStep;
  stepIndex: number;
  isFirst: boolean;
  isLast: boolean;
  isSelected: boolean;
  isDimmed: boolean;
  onDelayBadgeClick: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
};

export type DelayEdgeData = Record<string, unknown> & {
  delaySeconds: number;
  showLabel: boolean;
  onLabelClick: () => void;
};

export type FlowNode = Node<StartNodeData | StepNodeData>;
export type FlowEdge = Edge<DelayEdgeData>;

// ── ID helpers ────────────────────────────────────────────────────────────

export function stepNodeId(step: FlowEditorStep, index: number): string {
  return step.id ?? `step-new-${index}`;
}

// ── Draft → Nodes ─────────────────────────────────────────────────────────

export function draftToNodes(
  draft: FlowEditorDraft,
  selectedId: string | null,
  onDelayBadgeClick: (id: string) => void,
  onMoveStep?: (index: number, direction: "up" | "down") => void,
): FlowNode[] {
  const nodes: FlowNode[] = [
    {
      id: START_NODE_ID,
      type: "startNode",
      position: { x: CANVAS_CENTER_X, y: 40 },
      data: { triggerPhrase: draft.triggerPhrase } as StartNodeData,
      draggable: true,
    },
  ];

  const hasSelection = selectedId !== null;

  const total = draft.steps.length;
  draft.steps.forEach((step, i) => {
    const id = stepNodeId(step, i);
    nodes.push({
      id,
      type: "stepNode",
      position: { x: CANVAS_CENTER_X, y: 160 + i * NODE_SPACING },
      data: {
        step,
        stepIndex: i,
        isFirst: i === 0,
        isLast: i === total - 1,
        isSelected: selectedId === id,
        isDimmed: hasSelection && selectedId !== id,
        onDelayBadgeClick: () => onDelayBadgeClick(id),
        onMoveUp: () => onMoveStep?.(i, "up"),
        onMoveDown: () => onMoveStep?.(i, "down"),
      } as StepNodeData,
    });
  });

  return nodes;
}

// ── Draft → Edges ─────────────────────────────────────────────────────────

export function draftToEdges(
  draft: FlowEditorDraft,
  _selectedId: string | null,
  onDelayLabelClick: (targetId: string) => void,
): FlowEdge[] {
  if (draft.steps.length === 0) return [];

  const ids = draft.steps.map(stepNodeId);
  const edges: FlowEdge[] = [];

  // start → step[0]: no delay label (step 0 has delay 0, not user-editable via edge)
  edges.push({
    id: `e-start-${ids[0]}`,
    source: START_NODE_ID,
    target: ids[0],
    type: "delayEdge",
    data: { delaySeconds: 0, showLabel: false, onLabelClick: () => {} } as DelayEdgeData,
  });

  for (let i = 0; i < draft.steps.length - 1; i++) {
    const targetId = ids[i + 1];
    edges.push({
      id: `e-${ids[i]}-${targetId}`,
      source: ids[i],
      target: targetId,
      type: "delayEdge",
      data: {
        delaySeconds: draft.steps[i + 1].delaySeconds,
        showLabel: true,
        onLabelClick: () => onDelayLabelClick(targetId),
      } as DelayEdgeData,
    });
  }

  return edges;
}
