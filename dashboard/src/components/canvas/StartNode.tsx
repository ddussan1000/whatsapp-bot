// dashboard/src/components/canvas/StartNode.tsx
import { Handle, Position } from "@xyflow/react";
import { Zap } from "lucide-react";
import type { StartNodeData } from "@/lib/flowCanvas";

export function StartNode({ data }: { data: StartNodeData }) {
  return (
    <div className="rounded-xl border-2 border-emerald-500/50 bg-emerald-50 dark:bg-emerald-950/30 px-4 py-3 shadow-sm min-w-[180px]">
      <div className="flex items-center gap-2">
        <Zap size={13} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
        <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300 uppercase tracking-wide">
          Inicio
        </span>
      </div>
      {data.triggerPhrase && (
        <p className="mt-1 text-[11px] text-emerald-600/70 dark:text-emerald-400/60 truncate max-w-[156px]">
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
