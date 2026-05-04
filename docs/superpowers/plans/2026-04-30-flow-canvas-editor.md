# Flow Canvas Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the card-based `FlowEditor.tsx` with a canvas-based visual editor using React Flow, where flow steps are nodes connected by arrows and each step is edited via a right-side panel.

**Architecture:** `draft` (FlowEditorDraft) is the single source of truth; `nodes`/`edges` are derived via `useMemo`. All edits go through `setDraft`. React Flow handles pan/zoom/minimap. Right panel slides in when a node is clicked.

**Tech Stack:** React 18, @xyflow/react v12, TailwindCSS, shadcn/ui, lucide-react (no emojis), @dnd-kit (already installed), TypeScript.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `dashboard/src/lib/flowCanvas.ts` | Create | Type defs, draftToNodes, draftToEdges, delay helpers |
| `dashboard/src/components/canvas/StartNode.tsx` | Create | INICIO node (no delete, source handle only) |
| `dashboard/src/components/canvas/StepNode.tsx` | Create | Step node with message chips, delay badge, handles |
| `dashboard/src/components/canvas/DelayEdge.tsx` | Create | Custom bezier edge with clickable delay label |
| `dashboard/src/components/canvas/VariantsPanel.tsx` | Create | Toggle-expand variant textareas for text messages |
| `dashboard/src/components/canvas/DelayEditor.tsx` | Create | Delay +/- input with unit selector (seg/min/hrs) |
| `dashboard/src/components/canvas/MessageEditor.tsx` | Create | Message list with dnd-kit reorder, type switcher, variants |
| `dashboard/src/components/canvas/FlowRightPanel.tsx` | Create | Right side panel: step header, delay, messages |
| `dashboard/src/components/canvas/FlowConfigPanel.tsx` | Create | Collapsible config: name, trigger, keywords, prompt, payment |
| `dashboard/src/components/FlowCanvas.tsx` | Create | Main orchestrator: ReactFlow + panels + action bar |
| `dashboard/src/pages/FlowsPage.tsx` | Modify | Swap FlowEditor import for FlowCanvas, fix container |
| `dashboard/src/components/FlowEditor.tsx` | Keep | Unchanged until FlowCanvas is verified |

---

## Task 1: Install @xyflow/react

**Files:**
- Modify: `dashboard/package.json`

- [ ] **Step 1: Install the package**

```bash
cd /home/ddussan/Proyectos/AutomatizationProjects/whatsapp-bot/dashboard
bun add @xyflow/react
```

Expected output: `bun add v1.x.x` with `@xyflow/react` listed.

- [ ] **Step 2: Verify import resolves**

```bash
grep "@xyflow/react" package.json
```

Expected: `"@xyflow/react": "^12.x.x"` in dependencies.

- [ ] **Step 3: Commit**

```bash
cd /home/ddussan/Proyectos/AutomatizationProjects/whatsapp-bot
git add dashboard/package.json dashboard/bun.lockb
git commit -m "chore(dashboard): add @xyflow/react for canvas flow editor"
```

---

## Task 2: Create `flowCanvas.ts` — helpers and types

**Files:**
- Create: `dashboard/src/lib/flowCanvas.ts`

- [ ] **Step 1: Create the file**

```typescript
// dashboard/src/lib/flowCanvas.ts
import type { Node, Edge } from "@xyflow/react";
import type { FlowEditorDraft, FlowEditorStep } from "./flowUtils";
import type { FlowMessageType } from "@/types/api";

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
  isSelected: boolean;
  isDimmed: boolean;
  onDelayBadgeClick: () => void;
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

  draft.steps.forEach((step, i) => {
    const id = stepNodeId(step, i);
    nodes.push({
      id,
      type: "stepNode",
      position: { x: CANVAS_CENTER_X, y: 160 + i * NODE_SPACING },
      data: {
        step,
        stepIndex: i,
        isSelected: selectedId === id,
        isDimmed: hasSelection && selectedId !== id,
        onDelayBadgeClick: () => onDelayBadgeClick(id),
      } as StepNodeData,
    });
  });

  return nodes;
}

// ── Draft → Edges ─────────────────────────────────────────────────────────

export function draftToEdges(
  draft: FlowEditorDraft,
  selectedId: string | null,
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
```

- [ ] **Step 2: Verify build passes**

```bash
cd /home/ddussan/Proyectos/AutomatizationProjects/whatsapp-bot/dashboard
bun run build 2>&1 | grep -E "error|warning|built"
```

Expected: `✓ built` with no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
cd /home/ddussan/Proyectos/AutomatizationProjects/whatsapp-bot
git add dashboard/src/lib/flowCanvas.ts
git commit -m "feat(canvas): add flowCanvas helpers and type definitions"
```

---

## Task 3: Create `StartNode.tsx`

**Files:**
- Create: `dashboard/src/components/canvas/StartNode.tsx`

- [ ] **Step 1: Create the directory and file**

```bash
mkdir -p /home/ddussan/Proyectos/AutomatizationProjects/whatsapp-bot/dashboard/src/components/canvas
```

```typescript
// dashboard/src/components/canvas/StartNode.tsx
import { Handle, Position } from "@xyflow/react";
import { Zap } from "lucide-react";
import type { StartNodeData } from "@/lib/flowCanvas";

export function StartNode({ data }: { data: StartNodeData }) {
  return (
    <div className="rounded-xl border-2 border-emerald-500/40 bg-emerald-950/20 px-4 py-3 shadow-sm min-w-[180px]">
      <div className="flex items-center gap-2">
        <Zap size={13} className="text-emerald-400 shrink-0" />
        <span className="text-xs font-bold text-emerald-400 uppercase tracking-wide">
          Inicio
        </span>
      </div>
      {data.triggerPhrase && (
        <p className="mt-1 text-[11px] text-emerald-300/60 truncate max-w-[156px]">
          {data.triggerPhrase}
        </p>
      )}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-2.5 !h-2.5 !bg-emerald-500 !border-2 !border-background"
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
cd /home/ddussan/Proyectos/AutomatizationProjects/whatsapp-bot/dashboard && bun run build 2>&1 | grep -E "error TS|✓ built"
```

Expected: `✓ built` (no errors).

- [ ] **Step 3: Commit**

```bash
cd /home/ddussan/Proyectos/AutomatizationProjects/whatsapp-bot
git add dashboard/src/components/canvas/StartNode.tsx
git commit -m "feat(canvas): add StartNode component"
```

---

## Task 4: Create `StepNode.tsx`

**Files:**
- Create: `dashboard/src/components/canvas/StepNode.tsx`

- [ ] **Step 1: Create the file**

```typescript
// dashboard/src/components/canvas/StepNode.tsx
import { Handle, Position } from "@xyflow/react";
import {
  MessageSquare, Image as ImageIcon, FileText,
  Video, Music, Clock, Shuffle,
} from "lucide-react";
import { formatDuration } from "@/lib/flowCanvas";
import type { StepNodeData } from "@/lib/flowCanvas";
import type { FlowMessageType } from "@/types/api";

const TYPE_ICON: Record<FlowMessageType, React.ElementType> = {
  text: MessageSquare,
  image: ImageIcon,
  document: FileText,
  video: Video,
  audio: Music,
};

const TYPE_COLOR: Record<FlowMessageType, string> = {
  text: "bg-primary/15 text-primary",
  image: "bg-blue-500/15 text-blue-400",
  document: "bg-orange-500/15 text-orange-400",
  video: "bg-purple-500/15 text-purple-400",
  audio: "bg-green-500/15 text-green-400",
};

export function StepNode({ data }: { data: StepNodeData }) {
  const { step, stepIndex, isSelected, isDimmed, onDelayBadgeClick } = data;

  return (
    <div
      className={[
        "rounded-xl border bg-card shadow-sm transition-all min-w-[210px] max-w-[250px]",
        isSelected
          ? "border-primary shadow-[0_0_0_3px_rgba(124,58,237,0.2)]"
          : "border-border",
        isDimmed ? "opacity-40" : "opacity-100",
      ].join(" ")}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-2.5 !h-2.5 !bg-primary/60 !border-2 !border-background"
      />

      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-3 py-2 rounded-t-xl">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
          {stepIndex + 1}
        </span>
        <span className="flex-1 truncate text-xs font-semibold text-foreground">
          {step.label || `Paso ${stepIndex + 1}`}
        </span>
      </div>

      {/* Message summary chips */}
      <div className="px-3 py-2 flex flex-col gap-1">
        {step.messages.length === 0 ? (
          <span className="text-[10px] text-muted-foreground/50">Sin mensajes</span>
        ) : (
          <>
            {step.messages.slice(0, 3).map((msg, j) => {
              const Icon = TYPE_ICON[msg.messageType];
              const variantCount = (msg.textVariants ?? []).length;
              const label =
                msg.messageType === "text"
                  ? msg.textContent || "…"
                  : msg.filename || msg.mediaUrl?.split("/").pop() || "archivo";
              return (
                <div
                  key={j}
                  className={`flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[10px] ${TYPE_COLOR[msg.messageType]}`}
                >
                  <Icon size={10} className="shrink-0" />
                  <span className="truncate flex-1">{label}</span>
                  {variantCount > 0 && (
                    <span className="flex items-center gap-0.5 rounded-full bg-primary/20 px-1 text-[9px] text-primary shrink-0">
                      <Shuffle size={8} />
                      {variantCount + 1}
                    </span>
                  )}
                </div>
              );
            })}
            {step.messages.length > 3 && (
              <span className="text-[10px] text-muted-foreground/50">
                +{step.messages.length - 3} más
              </span>
            )}
          </>
        )}
      </div>

      {/* Delay footer */}
      <div className="border-t border-border px-3 py-1.5">
        <button
          type="button"
          className="flex items-center gap-1 text-[10px] text-amber-500/80 hover:text-amber-400 transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            onDelayBadgeClick();
          }}
        >
          <Clock size={10} />
          {step.delaySeconds === 0 ? "Inmediato" : formatDuration(step.delaySeconds)}
        </button>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-2.5 !h-2.5 !bg-primary/60 !border-2 !border-background"
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
cd /home/ddussan/Proyectos/AutomatizationProjects/whatsapp-bot/dashboard && bun run build 2>&1 | grep -E "error TS|✓ built"
```

- [ ] **Step 3: Commit**

```bash
cd /home/ddussan/Proyectos/AutomatizationProjects/whatsapp-bot
git add dashboard/src/components/canvas/StepNode.tsx
git commit -m "feat(canvas): add StepNode component"
```

---

## Task 5: Create `DelayEdge.tsx`

**Files:**
- Create: `dashboard/src/components/canvas/DelayEdge.tsx`

- [ ] **Step 1: Create the file**

```typescript
// dashboard/src/components/canvas/DelayEdge.tsx
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from "@xyflow/react";
import { Clock } from "lucide-react";
import { formatDuration } from "@/lib/flowCanvas";
import type { DelayEdgeData } from "@/lib/flowCanvas";

export function DelayEdge({
  id,
  sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition,
  data,
}: EdgeProps<DelayEdgeData>) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
  });

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{ stroke: "var(--border)", strokeWidth: 1.5 }}
      />
      {data?.showLabel && (
        <EdgeLabelRenderer>
          <button
            type="button"
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "all",
            }}
            className="nodrag nopan flex items-center gap-1 rounded-full border border-amber-500/30 bg-card px-2 py-0.5 text-[10px] text-amber-500 shadow-sm transition-colors hover:border-amber-400 hover:text-amber-400"
            onClick={data.onLabelClick}
          >
            <Clock size={9} />
            {formatDuration(data.delaySeconds)}
          </button>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
cd /home/ddussan/Proyectos/AutomatizationProjects/whatsapp-bot/dashboard && bun run build 2>&1 | grep -E "error TS|✓ built"
```

- [ ] **Step 3: Commit**

```bash
cd /home/ddussan/Proyectos/AutomatizationProjects/whatsapp-bot
git add dashboard/src/components/canvas/DelayEdge.tsx
git commit -m "feat(canvas): add DelayEdge with clickable delay label"
```

---

## Task 6: Create `VariantsPanel.tsx`

**Files:**
- Create: `dashboard/src/components/canvas/VariantsPanel.tsx`

- [ ] **Step 1: Create the file**

```typescript
// dashboard/src/components/canvas/VariantsPanel.tsx
import { Plus, Shuffle, X } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  textContent: string;
  variants: string[];
  expanded: boolean;
  onToggle: () => void;
  onTextChange: (v: string) => void;
  onVariantsChange: (v: string[]) => void;
};

export function VariantsPanel({
  textContent,
  variants,
  expanded,
  onToggle,
  onTextChange,
  onVariantsChange,
}: Props) {
  const hasVariants = variants.length > 0;

  if (expanded && hasVariants) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Versión 1 (principal)
          </span>
          <Textarea
            placeholder="Escribe el mensaje…"
            value={textContent}
            rows={2}
            className="resize-none text-sm"
            onChange={(e) => onTextChange(e.target.value)}
          />
        </div>

        {variants.map((v, vi) => (
          <div key={vi} className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Versión {vi + 2}
              </span>
              <button
                type="button"
                className="rounded p-0.5 text-muted-foreground hover:text-destructive"
                onClick={() => {
                  const next = variants.filter((_, idx) => idx !== vi);
                  onVariantsChange(next);
                  if (next.length === 0) onToggle();
                }}
              >
                <X size={12} />
              </button>
            </div>
            <Textarea
              placeholder="Versión alternativa…"
              value={v}
              rows={2}
              className="resize-none text-sm"
              onChange={(e) => {
                const next = [...variants];
                next[vi] = e.target.value;
                onVariantsChange(next);
              }}
            />
          </div>
        ))}

        <button
          type="button"
          onClick={() => onVariantsChange([...variants, ""])}
          className="flex items-center gap-1.5 self-start rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Plus size={11} />
          Agregar versión
        </button>

        <p className="flex items-center gap-1 text-[10px] text-muted-foreground/60">
          <Shuffle size={9} />
          El bot elige una versión al azar al enviar.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Textarea
        placeholder="Escribe el mensaje…"
        value={textContent}
        rows={2}
        className="resize-none text-sm"
        onChange={(e) => onTextChange(e.target.value)}
      />
      <button
        type="button"
        onClick={() => {
          onVariantsChange([...variants, ""]);
          onToggle();
        }}
        className="flex items-center gap-1 self-start rounded-md px-1.5 py-0.5 text-[10px] text-muted-foreground/60 transition-colors hover:bg-muted hover:text-muted-foreground"
      >
        <Plus size={9} />
        Agregar versión alternativa
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
cd /home/ddussan/Proyectos/AutomatizationProjects/whatsapp-bot/dashboard && bun run build 2>&1 | grep -E "error TS|✓ built"
```

- [ ] **Step 3: Commit**

```bash
cd /home/ddussan/Proyectos/AutomatizationProjects/whatsapp-bot
git add dashboard/src/components/canvas/VariantsPanel.tsx
git commit -m "feat(canvas): add VariantsPanel component"
```

---

## Task 7: Create `DelayEditor.tsx`

**Files:**
- Create: `dashboard/src/components/canvas/DelayEditor.tsx`

- [ ] **Step 1: Create the file**

```typescript
// dashboard/src/components/canvas/DelayEditor.tsx
import { forwardRef, useImperativeHandle, useRef, useState, useEffect } from "react";
import { Clock, AlertTriangle } from "lucide-react";
import {
  secondsToDisplay, displayToSeconds, formatDuration,
  MAX_FLOW_DELAY_SECS,
} from "@/lib/flowCanvas";
import type { DelayUnit } from "@/lib/flowCanvas";

export type DelayEditorRef = { focus: () => void };

type Props = {
  value: number;
  /** Sum of all other steps' delaySeconds (for 24h total validation) */
  totalOtherDelays: number;
  onChange: (seconds: number) => void;
};

export const DelayEditor = forwardRef<DelayEditorRef, Props>(
  function DelayEditor({ value, totalOtherDelays, onChange }, ref) {
    const { value: initVal, unit: initUnit } = secondsToDisplay(value);
    const [localVal, setLocalVal] = useState(String(initVal));
    const [unit, setUnit] = useState<DelayUnit>(initUnit);
    const inputRef = useRef<HTMLInputElement>(null);

    // Sync when external value changes (e.g. step switch)
    useEffect(() => {
      const { value: v, unit: u } = secondsToDisplay(value);
      setLocalVal(String(v));
      setUnit(u);
    }, [value]);

    useImperativeHandle(ref, () => ({
      focus: () => inputRef.current?.focus(),
    }));

    const total = totalOtherDelays + value;
    const exceeds = total > MAX_FLOW_DELAY_SECS;

    function commit(raw: string, u: DelayUnit) {
      const n = Math.max(0, parseInt(raw, 10) || 0);
      setLocalVal(String(n));
      onChange(displayToSeconds(n, u));
    }

    function step(delta: number) {
      const current = parseInt(localVal, 10) || 0;
      const next = Math.max(0, current + delta);
      setLocalVal(String(next));
      onChange(displayToSeconds(next, unit));
    }

    function changeUnit(u: DelayUnit) {
      const currentSecs = displayToSeconds(parseInt(localVal, 10) || 0, unit);
      setUnit(u);
      if (u === "hrs") setLocalVal(String(Math.round(currentSecs / 3600)));
      else if (u === "min") setLocalVal(String(Math.round(currentSecs / 60)));
      else setLocalVal(String(currentSecs));
      // value in seconds doesn't change when switching units
    }

    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
          <Clock size={13} className="text-amber-500 shrink-0" />
          <div className="flex flex-1 items-center gap-1">
            <button
              type="button"
              onClick={() => step(-1)}
              className="flex h-6 w-6 items-center justify-center rounded border border-border text-sm font-bold text-muted-foreground hover:text-foreground"
            >
              −
            </button>
            <input
              ref={inputRef}
              type="number"
              min={0}
              value={localVal}
              onChange={(e) => setLocalVal(e.target.value)}
              onBlur={(e) => commit(e.target.value, unit)}
              onKeyDown={(e) => { if (e.key === "Enter") commit(localVal, unit); }}
              className="w-14 rounded border border-border bg-background px-2 py-1 text-center text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <button
              type="button"
              onClick={() => step(1)}
              className="flex h-6 w-6 items-center justify-center rounded border border-border text-sm font-bold text-muted-foreground hover:text-foreground"
            >
              +
            </button>
          </div>
          <div className="flex gap-1">
            {(["seg", "min", "hrs"] as DelayUnit[]).map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => changeUnit(u)}
                className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                  unit === u
                    ? "bg-amber-500/20 text-amber-400"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {u}
              </button>
            ))}
          </div>
        </div>
        {exceeds && (
          <div className="flex items-center gap-1.5 text-[11px] text-destructive">
            <AlertTriangle size={11} />
            Acumulado supera 24h ({formatDuration(total)})
          </div>
        )}
      </div>
    );
  },
);
```

- [ ] **Step 2: Verify build**

```bash
cd /home/ddussan/Proyectos/AutomatizationProjects/whatsapp-bot/dashboard && bun run build 2>&1 | grep -E "error TS|✓ built"
```

- [ ] **Step 3: Commit**

```bash
cd /home/ddussan/Proyectos/AutomatizationProjects/whatsapp-bot
git add dashboard/src/components/canvas/DelayEditor.tsx
git commit -m "feat(canvas): add DelayEditor with unit selector and validation"
```

---

## Task 8: Create `MessageEditor.tsx`

**Files:**
- Create: `dashboard/src/components/canvas/MessageEditor.tsx`

- [ ] **Step 1: Create the file**

```typescript
// dashboard/src/components/canvas/MessageEditor.tsx
import {
  DndContext, PointerSensor, KeyboardSensor,
  useSensor, useSensors, closestCenter, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, sortableKeyboardCoordinates,
  useSortable, verticalListSortingStrategy, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical, X, Plus, Library,
  MessageSquare, Image as ImageIcon, FileText, Video, Music,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { VariantsPanel } from "./VariantsPanel";
import type { FlowEditorMessage, FlowMessageType } from "@/lib/flowUtils";

const MSG_TYPES: {
  type: FlowMessageType;
  label: string;
  Icon: React.ElementType;
}[] = [
  { type: "text",     label: "Texto",     Icon: MessageSquare },
  { type: "image",    label: "Imagen",    Icon: ImageIcon },
  { type: "document", label: "Documento", Icon: FileText },
  { type: "video",    label: "Video",     Icon: Video },
  { type: "audio",    label: "Audio",     Icon: Music },
];

type Props = {
  messages: FlowEditorMessage[];
  onChange: (messages: FlowEditorMessage[]) => void;
  onUploadClick: (msgIndex: number) => void;
  uploadPendingIndex: number | null;
  expandedVariants: Set<number>;
  onToggleVariants: (index: number) => void;
};

export function MessageEditor({
  messages, onChange, onUploadClick,
  uploadPendingIndex, expandedVariants, onToggleVariants,
}: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const ids = messages.map((m, i) => m.id ?? `msg-panel-${i}`);

  function patch(index: number, partial: Partial<FlowEditorMessage>) {
    const next = [...messages];
    next[index] = { ...next[index], ...partial };
    onChange(next);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from !== -1 && to !== -1) onChange(arrayMove(messages, from, to));
  }

  return (
    <div className="flex flex-col gap-2">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {messages.map((msg, i) => (
            <SortableMsgItem
              key={ids[i]}
              id={ids[i]}
              msg={msg}
              index={i}
              uploadPending={uploadPendingIndex === i}
              variantExpanded={expandedVariants.has(i)}
              onTypeChange={(type) =>
                patch(i, {
                  messageType: type,
                  textContent: "",
                  textVariants: [],
                  mediaUrl: "",
                  filename: "",
                  caption: "",
                })
              }
              onTextChange={(v) => patch(i, { textContent: v })}
              onCaptionChange={(v) => patch(i, { caption: v })}
              onVariantsChange={(v) => patch(i, { textVariants: v })}
              onToggleVariants={() => onToggleVariants(i)}
              onUploadClick={() => onUploadClick(i)}
              onDelete={() => onChange(messages.filter((_, idx) => idx !== i))}
            />
          ))}
        </SortableContext>
      </DndContext>

      <button
        type="button"
        onClick={() =>
          onChange([
            ...messages,
            { position: messages.length, messageType: "text", textContent: "" },
          ])
        }
        className="mt-1 flex items-center gap-1.5 self-start rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <Plus size={12} />
        Agregar mensaje
      </button>
    </div>
  );
}

// ── Sortable wrapper ──────────────────────────────────────────────────────

type ItemProps = {
  msg: FlowEditorMessage;
  index: number;
  uploadPending: boolean;
  dragHandle?: React.ReactNode;
  variantExpanded: boolean;
  onTypeChange: (type: FlowMessageType) => void;
  onTextChange: (v: string) => void;
  onCaptionChange: (v: string) => void;
  onVariantsChange: (v: string[]) => void;
  onToggleVariants: () => void;
  onUploadClick: () => void;
  onDelete: () => void;
};

function SortableMsgItem({ id, ...props }: { id: string } & Omit<ItemProps, "dragHandle">) {
  const {
    attributes, listeners, setNodeRef,
    setActivatorNodeRef, transform, transition, isDragging,
  } = useSortable({ id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
    >
      <MsgItem
        {...props}
        dragHandle={
          <button
            type="button"
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            tabIndex={-1}
            className="cursor-grab touch-none rounded p-0.5 text-muted-foreground/40 hover:text-muted-foreground active:cursor-grabbing"
          >
            <GripVertical size={12} />
          </button>
        }
      />
    </div>
  );
}

function MsgItem({
  msg, index, uploadPending, dragHandle,
  variantExpanded, onTypeChange, onTextChange, onCaptionChange,
  onVariantsChange, onToggleVariants, onUploadClick, onDelete,
}: ItemProps) {
  const variants = msg.textVariants ?? [];
  const hasVariants = variants.length > 0;
  const typeInfo = MSG_TYPES.find((t) => t.type === msg.messageType)!;

  return (
    <div className="group relative flex gap-2 rounded-lg border bg-background p-2.5">
      <div className="flex flex-col items-center gap-1 pt-0.5 shrink-0">
        {dragHandle ?? <GripVertical size={12} className="text-muted-foreground/40" />}
        <span className="text-[9px] font-bold text-muted-foreground/40">
          {index + 1}
        </span>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        {/* Type selector + variants badge + delete */}
        <div className="flex items-center gap-1">
          <div className="flex gap-0.5">
            {MSG_TYPES.map(({ type, Icon }) => (
              <button
                key={type}
                type="button"
                onClick={() => onTypeChange(type)}
                title={MSG_TYPES.find((t) => t.type === type)?.label}
                className={`rounded p-1 transition-colors ${
                  msg.messageType === type
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground/50 hover:text-muted-foreground"
                }`}
              >
                <Icon size={12} />
              </button>
            ))}
          </div>
          <span className="flex-1" />
          {msg.messageType === "text" && hasVariants && (
            <button
              type="button"
              onClick={onToggleVariants}
              className="flex items-center gap-0.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold text-primary hover:bg-primary/20 transition-colors"
            >
              {variants.length + 1} versiones
            </button>
          )}
          <button
            type="button"
            className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
            onClick={onDelete}
          >
            <X size={12} />
          </button>
        </div>

        {/* Content */}
        {msg.messageType === "text" ? (
          <VariantsPanel
            textContent={msg.textContent ?? ""}
            variants={variants}
            expanded={variantExpanded}
            onToggle={onToggleVariants}
            onTextChange={onTextChange}
            onVariantsChange={onVariantsChange}
          />
        ) : (
          <div className="flex flex-col gap-1.5">
            <button
              type="button"
              onClick={onUploadClick}
              disabled={uploadPending}
              className="flex items-center gap-2 rounded-lg border-2 border-dashed border-muted-foreground/20 px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-50"
            >
              <Library size={12} className="shrink-0" />
              {uploadPending ? (
                <span>Cargando…</span>
              ) : msg.filename ? (
                <span className="max-w-[150px] truncate font-medium text-foreground">
                  {msg.filename}
                </span>
              ) : (
                <span>Seleccionar {typeInfo.label.toLowerCase()}</span>
              )}
            </button>
            {(msg.messageType === "image" || msg.messageType === "video") && (
              <Input
                placeholder="Descripción (opcional)"
                value={msg.caption ?? ""}
                className="h-7 text-xs"
                onChange={(e) => onCaptionChange(e.target.value)}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
cd /home/ddussan/Proyectos/AutomatizationProjects/whatsapp-bot/dashboard && bun run build 2>&1 | grep -E "error TS|✓ built"
```

- [ ] **Step 3: Commit**

```bash
cd /home/ddussan/Proyectos/AutomatizationProjects/whatsapp-bot
git add dashboard/src/components/canvas/MessageEditor.tsx
git commit -m "feat(canvas): add MessageEditor with dnd reorder and variants"
```

---

## Task 9: Create `FlowRightPanel.tsx`

**Files:**
- Create: `dashboard/src/components/canvas/FlowRightPanel.tsx`

- [ ] **Step 1: Create the file**

```typescript
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
```

- [ ] **Step 2: Verify build**

```bash
cd /home/ddussan/Proyectos/AutomatizationProjects/whatsapp-bot/dashboard && bun run build 2>&1 | grep -E "error TS|✓ built"
```

- [ ] **Step 3: Commit**

```bash
cd /home/ddussan/Proyectos/AutomatizationProjects/whatsapp-bot
git add dashboard/src/components/canvas/FlowRightPanel.tsx
git commit -m "feat(canvas): add FlowRightPanel with delay and message editors"
```

---

## Task 10: Create `FlowConfigPanel.tsx`

**Files:**
- Create: `dashboard/src/components/canvas/FlowConfigPanel.tsx`

- [ ] **Step 1: Create the file**

```typescript
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
```

- [ ] **Step 2: Verify build**

```bash
cd /home/ddussan/Proyectos/AutomatizationProjects/whatsapp-bot/dashboard && bun run build 2>&1 | grep -E "error TS|✓ built"
```

- [ ] **Step 3: Commit**

```bash
cd /home/ddussan/Proyectos/AutomatizationProjects/whatsapp-bot
git add dashboard/src/components/canvas/FlowConfigPanel.tsx
git commit -m "feat(canvas): add FlowConfigPanel with payment messages dialog"
```

---

## Task 11: Create `FlowCanvas.tsx` — main orchestrator

**Files:**
- Create: `dashboard/src/components/FlowCanvas.tsx`

- [ ] **Step 1: Create the file**

```typescript
// dashboard/src/components/FlowCanvas.tsx
import { useState, useMemo, useCallback } from "react";
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
import { emptyDraft } from "@/lib/flowUtils";
import type { FlowEditorDraft, FlowEditorStep } from "@/lib/flowUtils";
import type { FlowMessageType } from "@/types/api";

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
}: Props) {
  const [draft, setDraftRaw] = useState<FlowEditorDraft>(initialDraft);
  const [dirty, setDirtyRaw] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [focusDelay, setFocusDelay] = useState(false);
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [uploadMsgIndex, setUploadMsgIndex] = useState<number | null>(null);
  const [expandedVariants, setExpandedVariants] = useState<Set<number>>(new Set());

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

  const uploadTargetType: "image" | "video" | "document" | "audio" | undefined =
    uploadMsgIndex !== null && selectedStepIndex !== null
      ? (draft.steps[selectedStepIndex]?.messages[uploadMsgIndex]
          ?.messageType as "image" | "video" | "document" | "audio" | undefined)
      : undefined;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Config panel */}
      <FlowConfigPanel
        draft={draft}
        onChange={patch}
        showPaymentConfig={showPaymentConfig}
      />

      {/* Canvas + right panel */}
      <div className="flex min-h-0 flex-1">
        {/* Canvas */}
        <div className="relative flex-1">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={NODE_TYPES}
            edgeTypes={EDGE_TYPES}
            onNodeClick={onNodeClick}
            onPaneClick={() => selectNode(null)}
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
            />
            <Controls className="!rounded-lg !border-border !bg-card" showInteractive={false} />
          </ReactFlow>

          {/* Floating add-step button */}
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
        </div>

        {/* Right panel */}
        {selectedStepIndex !== null && (
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
          loading={savePending}
          loadingText="Guardando…"
        >
          {saveLabel}
        </Button>
        {renderActions?.({ draft, dirty, resetDraft })}
      </div>

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
```

- [ ] **Step 2: Verify build passes with no TS errors**

```bash
cd /home/ddussan/Proyectos/AutomatizationProjects/whatsapp-bot/dashboard && bun run build 2>&1 | grep -E "error TS|✓ built"
```

Expected: `✓ built` with no `error TS` lines.

- [ ] **Step 3: Commit**

```bash
cd /home/ddussan/Proyectos/AutomatizationProjects/whatsapp-bot
git add dashboard/src/components/FlowCanvas.tsx
git commit -m "feat(canvas): add FlowCanvas main orchestrator component"
```

---

## Task 12: Wire `FlowsPage.tsx` — swap FlowEditor for FlowCanvas

**Files:**
- Modify: `dashboard/src/pages/FlowsPage.tsx`

- [ ] **Step 1: Update imports**

In `FlowsPage.tsx`, replace lines 15-16:

```typescript
// REMOVE:
import { FlowEditor } from "@/components/FlowEditor";
import type { FlowEditorDraft } from "@/components/FlowEditor";

// ADD:
import { FlowCanvas } from "@/components/FlowCanvas";
import type { FlowEditorDraft } from "@/components/FlowCanvas";
```

- [ ] **Step 2: Replace `<FlowEditor>` with `<FlowCanvas>` and fix container**

Find the `{/* ── Right: editor ── */}` block (around line 409):

```typescript
// REMOVE:
        <div className="overflow-y-auto">
          <FlowEditor

// ADD:
        <div className="overflow-hidden">
          <FlowCanvas
```

Also change the closing tag on line ~457 if it says `</FlowEditor>` → `</FlowCanvas>`.

- [ ] **Step 3: Verify build with no errors**

```bash
cd /home/ddussan/Proyectos/AutomatizationProjects/whatsapp-bot/dashboard && bun run build 2>&1 | grep -E "error TS|✓ built"
```

Expected: `✓ built`.

- [ ] **Step 4: Commit**

```bash
cd /home/ddussan/Proyectos/AutomatizationProjects/whatsapp-bot
git add dashboard/src/pages/FlowsPage.tsx
git commit -m "feat(canvas): swap FlowEditor → FlowCanvas in FlowsPage"
```

---

## Task 13: Manual verification checklist

Start both servers:

```bash
# Terminal 1
cd /home/ddussan/Proyectos/AutomatizationProjects/whatsapp-bot/backend && bun run dev

# Terminal 2
cd /home/ddussan/Proyectos/AutomatizationProjects/whatsapp-bot/dashboard && bun run dev
```

Open `http://localhost:5173/flows` and verify each item:

- [ ] **Canvas renders** — dot-grid background, INICIO node visible, no console errors
- [ ] **Load existing flow** — navigate to a saved flow, all step nodes appear with correct message chips
- [ ] **Click step node** — right panel slides in, shows step label, delay editor, message list
- [ ] **Edit delay in panel** — change value with +/- and unit tabs, delay badge on node updates immediately
- [ ] **Click delay label on edge** — right panel opens and delay input is focused
- [ ] **Click delay badge on node footer** — same: panel opens, delay focused
- [ ] **Add step** — click "Agregar paso", new node appears connected to previous
- [ ] **Delete step** — trash icon in panel header, node removed, panel closes
- [ ] **Add text message** — "+ Agregar mensaje" in panel, new text field appears
- [ ] **Add variant** — click "Agregar versión alternativa", variant textarea appears with label
- [ ] **Second variant** — "+ Agregar versión" adds another, badge on node shows "N versiones"
- [ ] **Remove variant** — X button on variant, reverts to single text if last removed
- [ ] **Add image message** — click image icon in type selector, media picker opens on "Seleccionar imagen" click
- [ ] **Save flow** — click "Guardar flow", toast shows "Flow guardado"
- [ ] **Reload page** — canvas re-renders saved flow identically
- [ ] **Discard changes** — edit something, click "Descartar cambios", draft reverts
- [ ] **Save as template** — "Guardar como plantilla" opens template dialog, template saves
- [ ] **Config panel** — name, trigger, keywords, system prompt, no-match behavior all editable
- [ ] **Payment messages** — "Mensajes de pago" button opens dialog, changes persist to save
- [ ] **Close panel** — click X or press Escape, panel closes
- [ ] **Minimap** — visible in bottom right of canvas, click to navigate
- [ ] **Pan/zoom** — drag canvas, scroll to zoom
- [ ] **24h validation** — set a step delay to 99999 seconds, save button disables with warning

---

## Task 14: Build verification and cleanup

- [ ] **Step 1: Final clean build**

```bash
cd /home/ddussan/Proyectos/AutomatizationProjects/whatsapp-bot/dashboard && bun run build 2>&1
```

Expected: `✓ built` with zero TypeScript errors and no warnings about missing types.

- [ ] **Step 2: Add .superpowers to .gitignore if not present**

```bash
grep -q ".superpowers" /home/ddussan/Proyectos/AutomatizationProjects/whatsapp-bot/.gitignore || echo ".superpowers/" >> /home/ddussan/Proyectos/AutomatizationProjects/whatsapp-bot/.gitignore
```

- [ ] **Step 3: Final commit**

```bash
cd /home/ddussan/Proyectos/AutomatizationProjects/whatsapp-bot
git add .gitignore
git commit -m "chore: add .superpowers to .gitignore"
```

- [ ] **Step 4: Verify FlowEditor.tsx still present (not deleted)**

```bash
ls /home/ddussan/Proyectos/AutomatizationProjects/whatsapp-bot/dashboard/src/components/FlowEditor.tsx
```

Expected: file exists. Do not delete until FlowCanvas is verified stable in production.

---

## Self-Review Notes

**Spec coverage:**
- Canvas library (@xyflow/react) ✓ Task 1
- draftToNodes/draftToEdges helpers ✓ Task 2
- StartNode ✓ Task 3, StepNode ✓ Task 4, DelayEdge ✓ Task 5
- VariantsPanel ✓ Task 6, DelayEditor ✓ Task 7
- MessageEditor ✓ Task 8, FlowRightPanel ✓ Task 9
- FlowConfigPanel with payment overrides ✓ Task 10
- FlowCanvas orchestrator ✓ Task 11
- FlowsPage swap ✓ Task 12
- Delay editable in node badge AND right panel ✓ (both trigger `setSelectedNodeId + setFocusDelay`)
- No emojis, lucide-react only ✓ all components
- Same props interface as FlowEditor ✓ Task 11 (same `Props` type, re-exports FlowEditorDraft)
- Autosave/dirty tracking ✓ Task 11 (`setDraft` calls `onDirtyChange`)
- MediaPickerModal reused ✓ Task 11
- Backward compat (FlowEditor unchanged) ✓ Task 14

**Type consistency:**
- `stepNodeId` used in both `flowCanvas.ts` and `FlowCanvas.tsx` ✓
- `DelayEditorRef` exported from `DelayEditor.tsx` and imported in `FlowRightPanel.tsx` ✓
- `FlowEditorDraft` sourced from `flowUtils.ts`, re-exported from `FlowCanvas.tsx` ✓
- `FlowEditorActionsContext` defined in `FlowCanvas.tsx` matching the shape used in `FlowsPage.tsx` ✓
