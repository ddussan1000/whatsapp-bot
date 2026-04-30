// dashboard/src/components/canvas/DelayEdge.tsx
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type Edge, type EdgeProps } from "@xyflow/react";
import { Clock } from "lucide-react";
import { formatDuration } from "@/lib/flowCanvas";
import type { DelayEdgeData } from "@/lib/flowCanvas";

export function DelayEdge({
  id,
  sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition,
  data,
}: EdgeProps<Edge<DelayEdgeData>>) {
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
