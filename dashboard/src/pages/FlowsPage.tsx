import { Plus, Zap, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useFlowsV2Query } from "@/lib/hooks";
import { useNavigate } from "react-router-dom";

export function FlowsPage() {
  const flows = useFlowsV2Query();
  const navigate = useNavigate();

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b p-4 sm:p-6">
        <h1 className="text-xl font-semibold">Flujos</h1>
        <Button onClick={() => navigate("/flows/new")} className="gap-2">
          <Plus size={15} />
          Nuevo flujo
        </Button>
      </div>

      {/* Flow list */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {flows.isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        ) : (flows.data ?? []).length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-12 text-center">
            <Zap size={32} className="text-muted-foreground/50" />
            <div>
              <p className="font-medium">Sin flujos todavía</p>
              <p className="text-sm text-muted-foreground">
                Crea tu primer flujo para comenzar a automatizar conversaciones
              </p>
            </div>
            <Button
              variant="outline"
              className="mt-2 gap-2"
              onClick={() => navigate("/flows/new")}
            >
              <Plus size={15} />
              Nuevo flujo
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(flows.data ?? []).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => navigate(`/flows/${f.id}`)}
                className="group flex flex-col gap-3 rounded-xl border bg-background p-4 text-left transition-colors hover:bg-muted/40 hover:border-primary/30"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-semibold leading-tight">{f.name}</span>
                  <Badge
                    variant={f.is_active ? "default" : "outline"}
                    className="shrink-0 text-[10px]"
                  >
                    {f.is_active ? "Activo" : "Inactivo"}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Zap size={12} />
                  <span className="font-mono text-xs">
                    {f.trigger_first_word || f.trigger_phrase || "—"}
                  </span>
                  <span>·</span>
                  <span>
                    {(f.steps ?? []).length} paso
                    {(f.steps ?? []).length !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="flex items-center justify-end text-xs text-muted-foreground group-hover:text-foreground transition-colors">
                  Ver flujo
                  <ChevronRight size={13} className="ml-0.5" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
