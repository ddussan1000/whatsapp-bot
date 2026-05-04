# Flow Canvas Editor — Design Spec
**Date:** 2026-04-30  
**Status:** Approved for planning

---

## Context

The current flow editor is a vertical card-based list (`FlowEditor.tsx`, ~1500 lines). Users want a canvas-based visual editor where flow steps are nodes connected by arrows, allowing a clearer mental model of the message sequence and better UX for managing delays and message variants.

The backend, API, data model, and `FlowEditorDraft` type are **unchanged**. This is a pure UI replacement.

---

## Design Decisions

### 1. Canvas library: `@xyflow/react` (React Flow v12)
Pan, zoom, custom nodes, custom edges, minimap — all built-in. No custom canvas rendering needed.

### 2. No emojis anywhere
All icons use `lucide-react` SVGs. Applies to nodes, panels, buttons, badges.

### 3. Delay editable in two places (both stay in sync)
- **On the node**: displayed as a badge in the node footer; clicking it focuses the delay field in the right panel
- **In the right panel**: full delay editor with +/− buttons and unit selector (sec/min/hrs)
One source of truth: `FlowEditorDraft.steps[i].delaySeconds`. Both surfaces write to the same field.

### 4. Node layout
Linear vertical sequence. Auto-layout positions nodes top-to-bottom with fixed spacing. Nodes are centered horizontally. Users can drag nodes to reposition (position stored locally, not persisted — resets on reload to auto-layout).

### 5. Right panel
Opens on node click. Closes via X button or clicking empty canvas. Shows: delay editor, message list with per-message type + content + variants.

### 6. Backward compatibility
New `FlowCanvas` component accepts the same props interface as the current `FlowEditor`. `FlowsPage.tsx` replaces the import only — no other changes.

---

## Architecture

```
FlowsPage.tsx
  └── FlowCanvas.tsx              ← replaces FlowEditor.tsx
        ├── ReactFlowProvider
        ├── ReactFlow (canvas)
        │     ├── StartNode        ← custom node: INICIO
        │     ├── StepNode         ← custom node: each flow step
        │     └── DelayEdge        ← custom edge: arrow + delay label
        ├── FlowRightPanel.tsx     ← right panel (slide-in)
        │     ├── DelayEditor
        │     └── MessageEditor
        │           └── VariantsPanel
        └── FlowConfigPanel.tsx   ← replaces current config section (trigger, keywords, etc.)
```

### Data mapping

```
FlowEditorDraft.steps[i]  →  ReactFlow Node { id, position, data: FlowEditorStep }
steps[i] → steps[i+1]    →  ReactFlow Edge { source, target, data: { delaySeconds: steps[i+1].delaySeconds } }
```

Note: `delaySeconds` lives on the **target** step but is displayed on the **edge** that leads into it (except step 0 which has no incoming edge).

---

## Components

### `FlowCanvas.tsx`
- Wraps `ReactFlowProvider` + `ReactFlow`
- Converts `FlowEditorDraft.steps` → nodes + edges via `draftToFlow()`
- Converts nodes + edges back → steps via `flowToDraft()` on every change
- Manages `selectedNodeId` state (drives right panel)
- Handles add/delete step via canvas toolbar
- Passes `onSave`, `savePending`, `renderActions` down to action bar

### `StepNode.tsx`
- Displays: step number (badge), step label, message summary chips (type icon + truncated content + variant count badge if > 0)
- Footer: delay badge (SVG clock icon + formatted duration) — click opens panel and focuses delay field
- Visual states: default, selected (purple border + glow), dimmed (opacity 0.4 when another node is selected)
- Source and target handles (React Flow connection points, styled as dots)

### `StartNode.tsx`
- Fixed first node (no delete), shows flow trigger phrase
- Only has source handle (bottom)

### `DelayEdge.tsx`
- Custom edge using `EdgeLabelRenderer`
- Foreign object renders delay label (SVG clock icon + formatted duration)
- Clicking the label: fires `onDelayLabelClick(edgeId)` → parent opens right panel for target node and focuses delay field
- No delay label for edges entering step 0 (delay is always 0 and not editable)

### `FlowRightPanel.tsx`
- Slide-in from right (CSS transition), 300px wide
- Sections:
  1. **Header**: step number, label input, delete button
  2. **Delay**: `DelayEditor` component
  3. **Messages**: `MessageEditor` component
- Closes on X or `Escape` key

### `DelayEditor.tsx`
- Shows current delay formatted (e.g. "5 segundos", "2 minutos")
- +/− buttons (step: 1s, 5s, 30s depending on magnitude)
- Unit tabs: seg / min / hrs
- Direct number input
- Validation: max 24h cumulative (shows inline warning if exceeded)
- `ref` exposed so parent can `.focus()` it when delay label is clicked on canvas

### `MessageEditor.tsx`
- Lists messages for selected step
- Drag-to-reorder within panel (dnd-kit, same library already installed)
- Per message: type selector (icon button group), content editor (textarea or media picker)
- `VariantsPanel` embedded below text content when `messageType === "text"`
- Add message button at bottom

### `VariantsPanel.tsx`
- Extracted from current `FlowEditor.tsx` implementation (already built in previous session)
- Same behavior: toggle expanded, numbered variant textareas, delete per variant, "+ Agregar versión" button
- Hint: "El bot elige una versión al azar al enviar este mensaje"

### `FlowConfigPanel.tsx`
- Collapsible panel above canvas (or in a separate drawer/sheet)
- Contains: flow name, trigger phrase, keywords, no-match behavior, system prompt, session timeout, payment overrides
- Same fields as current config section in `FlowEditor.tsx`

---

## State Management

`draft` is the single source of truth. `nodes`/`edges` are derived views for React Flow rendering.

```ts
// In FlowCanvas.tsx
const [draft, setDraft] = useState<FlowEditorDraft>(initialDraft)
const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)

// Derived: recomputed whenever draft changes
const nodes = useMemo(() => draftToNodes(draft), [draft])
const edges = useMemo(() => draftToEdges(draft), [draft])
```

All edits go through `setDraft()` (right panel, add/delete step, delay change). React Flow's `onNodesChange` is used only for tracking node drag positions (local, not persisted to draft).

When `initialDraft` prop changes (parent loads a different flow) → `useEffect` resets `draft` to new value.

---

## `draftToFlow` / `flowToDraft` helpers

```ts
// draft → canvas
function draftToNodes(draft: FlowEditorDraft): Node[]
function draftToEdges(draft: FlowEditorDraft): Edge[]

// canvas → draft (reconstruct step order from node y-positions)
function flowToDraft(nodes: Node[], edges: Edge[], draft: FlowEditorDraft): FlowEditorDraft
```

Auto-layout: positions nodes at `{ x: CENTER_X, y: i * NODE_SPACING }`. `NODE_SPACING = 180px`. `CENTER_X = 300px`.

---

## Preserved Behaviors

- **Autosave to localStorage** (800ms debounce) — unchanged, lives in `FlowsPage.tsx`
- **Draft recovery toast** — unchanged
- **Save-as-template** — unchanged
- **MediaPickerModal** — reused as-is
- **Payment overrides dialog** — reused as-is
- **Type generation** — `bun run generate:api` still works, no API changes

---

## Visual Design

- **Background**: dot grid (CSS radial-gradient), dark theme
- **Nodes**: rounded corners (12px), subtle border, purple glow on selection
- **Edges**: curved (bezier), grey default, purple when target node selected
- **Right panel**: slides in from right, same dark background as topbar
- **Icons**: lucide-react exclusively (no emoji)
- **Colors**: consistent with existing dashboard (primary = purple #7c3aed, warning = amber #f59e0b)

---

## Out of Scope

- Branching / conditional edges (future)
- Canvas node drag persisted to DB (positions reset on reload)
- Mobile editing (canvas is desktop-only; mobile gets read-only or redirect to list view)
- Undo/redo history (future)

---

## Testing Plan

### Functional
1. Load existing flow → all steps render as nodes with correct message summaries
2. Change delay in right panel → node badge updates immediately
3. Click delay edge label → panel opens, delay field focused
4. Add step → new node appears, edge connected, step added to draft
5. Delete step → node removed, edges reconnect correctly, draft updated
6. Add text message → appears in message editor
7. Add variant → variant panel expands, variant saved to draft
8. Reorder messages in panel → order reflects in draft
9. Switch message type → clears content and variants
10. Save flow → `FlowEditorDraft` reconstructed correctly from canvas state
11. Reload saved flow → canvas renders identical to what was saved

### Regression
12. Existing flows from production load without errors (test with real flow data)
13. `toDraft` / `handleSave` in `FlowsPage.tsx` unchanged behavior
14. Template save/load still works
15. Media picker opens and sets mediaUrl correctly

### Build
16. `bun run build` passes with no TypeScript errors

---

## Files Changed

| File | Change |
|------|--------|
| `dashboard/src/components/FlowCanvas.tsx` | New — main canvas component |
| `dashboard/src/components/StepNode.tsx` | New — custom React Flow node |
| `dashboard/src/components/StartNode.tsx` | New — start node |
| `dashboard/src/components/DelayEdge.tsx` | New — custom edge with delay label |
| `dashboard/src/components/FlowRightPanel.tsx` | New — right editing panel |
| `dashboard/src/components/DelayEditor.tsx` | New — delay input component |
| `dashboard/src/components/MessageEditor.tsx` | New — message list editor |
| `dashboard/src/components/VariantsPanel.tsx` | New — extracted from FlowEditor.tsx |
| `dashboard/src/components/FlowConfigPanel.tsx` | New — config fields (name, trigger, etc.) |
| `dashboard/src/lib/flowCanvas.ts` | New — draftToNodes, draftToEdges, flowToDraft helpers |
| `dashboard/src/pages/FlowsPage.tsx` | Minor — swap FlowEditor import for FlowCanvas |
| `dashboard/src/components/FlowEditor.tsx` | Keep as-is (deprecated but not deleted until verified) |
| `package.json` | Add `@xyflow/react` |
