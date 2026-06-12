// dashboard/src/components/canvas/StepNode.tsx
import { Handle, Position } from "@xyflow/react";
import {
  MessageSquare, Image as ImageIcon, FileText,
  Video, Music, Clock, Shuffle, ChevronUp, ChevronDown,
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
  const { step, stepIndex, isFirst, isLast, isSelected, isDimmed, onDelayBadgeClick, onMoveUp, onMoveDown } = data;

  const stepVariantCount = step.messages.reduce(
    (sum, m) => sum + (m.textVariants?.length ?? 0),
    0,
  );

  return (
    <div
      className={[
        "group rounded-xl border bg-card shadow-sm transition-all min-w-[210px] max-w-[250px]",
        isSelected
          ? "border-primary shadow-[0_0_0_3px_rgba(124,58,237,0.2)]"
          : "border-border",
        isDimmed ? "opacity-50 grayscale-[30%]" : "opacity-100",
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
        {stepVariantCount > 0 && (
          <span
            title={`${stepVariantCount} versión(es) alternativa(s) en este paso`}
            className="flex shrink-0 items-center gap-0.5 rounded-full bg-primary/20 px-1.5 py-0.5 text-[9px] font-medium text-primary"
          >
            <Shuffle size={9} />
            {stepVariantCount}
          </span>
        )}
        <div className="flex flex-col opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            disabled={isFirst}
            onClick={(e) => { e.stopPropagation(); onMoveUp(); }}
            className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-20 disabled:cursor-not-allowed"
          >
            <ChevronUp size={11} />
          </button>
          <button
            type="button"
            disabled={isLast}
            onClick={(e) => { e.stopPropagation(); onMoveDown(); }}
            className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-20 disabled:cursor-not-allowed"
          >
            <ChevronDown size={11} />
          </button>
        </div>
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
