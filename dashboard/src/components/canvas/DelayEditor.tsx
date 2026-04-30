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
