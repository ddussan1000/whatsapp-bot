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
import { Input } from "@/components/ui/input";
import { VariantsPanel } from "./VariantsPanel";
import type { FlowEditorMessage } from "@/lib/flowUtils";
import type { FlowMessageType } from "@/types/api";

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
    if (from !== -1 && to !== -1) {
      const reordered = arrayMove(messages, from, to);
      onChange(reordered.map((m, i) => ({ ...m, position: i })));
    }
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
