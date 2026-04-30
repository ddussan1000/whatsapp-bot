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
