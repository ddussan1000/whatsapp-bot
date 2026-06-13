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
          disabled={variants.length >= 4}
          className="flex items-center gap-1.5 self-start rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Plus size={11} />
          {variants.length >= 4 ? "Máximo 5 versiones" : "Agregar versión"}
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
          if (variants.length >= 4) return;
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
