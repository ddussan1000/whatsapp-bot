import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  X,
  MessagesSquare,
  Megaphone,
  ChevronLeft,
  ChevronRight,
  Workflow,
  CornerUpLeft,
  RefreshCw,
} from "lucide-react";
import {
  useConversationFiltersQuery,
  useConversationsQuery,
} from "../lib/hooks";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "../components/StatusBadge";
import type { Conversation } from "../types/api";

// ── Helpers ───────────────────────────────────────────────────────────────

function formatPhone(phone: string) {
  return phone.startsWith("57") && phone.length === 12
    ? `+57 ${phone.slice(2, 5)} ${phone.slice(5, 8)} ${phone.slice(8)}`
    : `+${phone}`;
}

function timeAgo(iso?: string | null) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "hace un momento";
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs} h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `hace ${days} d`;
  return new Date(iso).toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "short",
  });
}

const STAGE_OPTIONS = [
  { value: "flow_started", label: "En flujo" },
  { value: "interesado", label: "Interesado" },
  { value: "esperando_comprobante", label: "Esperando comprobante" },
  { value: "confirmar_comprobante", label: "Revisión manual" },
  { value: "pago_confirmado", label: "Pago confirmado" },
  { value: "post_venta", label: "Post venta" },
];

// ── ConversationRow ───────────────────────────────────────────────────────

function ConversationRow({
  conv,
  onClick,
}: {
  conv: Conversation;
  onClick: () => void;
}) {
  const unread = (conv as Conversation & { unread_count?: number }).unread_count ?? 0;
  const lastText = (conv as Conversation & { last_message_text?: string | null }).last_message_text ?? null;
  const lastDir = (conv as Conversation & { last_message_direction?: string | null }).last_message_direction ?? null;
  const hasAd = Boolean(conv.ad_source);

  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-3 rounded-xl border bg-card px-4 py-3 text-left transition-all hover:bg-muted/40 hover:shadow-sm"
    >
      {/* Avatar with unread badge */}
      <div className="relative shrink-0">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-sm">
          {conv.phone.slice(-2)}
        </div>
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-green-500 px-1 text-[10px] font-bold text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col gap-0.5 min-w-0">
        {/* Row 1: name + time */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className={`font-medium text-sm truncate ${unread > 0 ? "text-foreground" : ""}`}>
              {conv.contact_name ?? formatPhone(conv.phone)}
            </span>
            {conv.contact_name && (
              <span className="text-xs text-muted-foreground hidden sm:block shrink-0">
                {formatPhone(conv.phone)}
              </span>
            )}
          </div>
          <span className="text-xs text-muted-foreground shrink-0">
            {timeAgo(conv.updated_at)}
          </span>
        </div>

        {/* Row 2: last message preview */}
        <div className="flex items-center gap-1 text-xs text-muted-foreground min-w-0">
          {lastDir === "outbound" && (
            <CornerUpLeft size={11} className="shrink-0 text-muted-foreground/60" />
          )}
          <span className="truncate">
            {lastText ?? (conv.flow_name ? `Flujo: ${conv.flow_name}` : "Sin mensajes")}
          </span>
        </div>

        {/* Row 3: stage + flow + ad */}
        <div className="flex items-center gap-2 flex-wrap mt-0.5">
          <StatusBadge state={String(conv.stage)} />
          {conv.flow_name && (
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Workflow size={10} className="shrink-0" />
              <span className="truncate max-w-32">{conv.flow_name}</span>
            </span>
          )}
          {hasAd && (
            <span className="flex items-center gap-1 rounded-full bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-medium text-violet-600">
              <Megaphone size={9} />
              <span className="truncate max-w-24">{conv.ad_name ?? "Anuncio"}</span>
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

// ── ConversationsPage ─────────────────────────────────────────────────────

export function ConversationsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState("all");
  const [flowFilter, setFlowFilter] = useState("all");
  const [adFilter, setAdFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const pageSize = 15;

  const { data: filters } = useConversationFiltersQuery();

  const { data, isLoading, isFetching, refetch } = useConversationsQuery({
    page,
    pageSize,
    search: search || undefined,
    state: stateFilter !== "all" ? stateFilter : undefined,
    flowId: flowFilter !== "all" ? flowFilter : undefined,
    adSourceId: adFilter !== "all" && adFilter !== "any" ? adFilter : undefined,
    fromAd: adFilter === "any" ? true : undefined,
    sortBy: "updated_at",
    sortDir,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  const clearFilters = () => {
    setSearch("");
    setStateFilter("all");
    setFlowFilter("all");
    setAdFilter("all");
    setPage(1);
  };

  const hasFilters =
    search ||
    stateFilter !== "all" ||
    flowFilter !== "all" ||
    adFilter !== "all";

  const hasFlowOptions = (filters?.flows?.length ?? 0) > 0;
  const hasAdOptions = (filters?.ads?.length ?? 0) > 0;

  return (
    <section className="flex flex-col gap-4 p-3 sm:gap-5 sm:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Conversaciones</h2>
          <p className="text-sm text-muted-foreground">
            {total > 0
              ? `${total.toLocaleString("es-CO")} conversaciones`
              : "Historial de chats con clientes"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refetch()}
            disabled={isFetching}
            className="gap-1.5"
          >
            <RefreshCw size={14} className={isFetching ? "animate-spin" : ""} />
            Actualizar
          </Button>
        <Select
          value={`updated_at:${sortDir}`}
          onValueChange={(v) => {
            const [, dir] = v.split(":");
            setSortDir(dir as "asc" | "desc");
            setPage(1);
          }}
        >
          <SelectTrigger className="w-44 h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="updated_at:desc">Más recientes</SelectItem>
            <SelectItem value="updated_at:asc">Más antiguas</SelectItem>
          </SelectContent>
        </Select>
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-xl border bg-muted/20 p-3 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Filtros
          </p>
          {hasFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              Limpiar
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {/* Search */}
          <div className="flex flex-col gap-1">
            <label
              htmlFor="conv-search"
              className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
            >
              Buscar
            </label>
            <div className="relative">
              <Search
                size={13}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                id="conv-search"
                placeholder="Teléfono o nombre…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="pl-7 h-9 text-sm"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch("");
                    setPage(1);
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          </div>

          {/* Stage filter */}
          <div className="flex flex-col gap-1">
            <label
              htmlFor="conv-state"
              className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
            >
              Estado
            </label>
            <Select
              value={stateFilter}
              onValueChange={(v) => {
                setStateFilter(v);
                setPage(1);
              }}
            >
              <SelectTrigger
                id="conv-state"
                className="h-9 text-sm"
                aria-label="Filtrar por estado"
              >
                <SelectValue placeholder="Todos los estados" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estados</SelectItem>
                {STAGE_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Flow filter */}
          <div className="flex flex-col gap-1">
            <label
              htmlFor="conv-flow"
              className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
            >
              Flujo
            </label>
            <Select
              value={flowFilter}
              onValueChange={(v) => {
                setFlowFilter(v);
                setPage(1);
              }}
              disabled={!hasFlowOptions}
            >
              <SelectTrigger
                id="conv-flow"
                className="h-9 text-sm"
                aria-label="Filtrar por flujo"
              >
                <SelectValue placeholder="Todos los flujos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los flujos</SelectItem>
                {filters?.flows.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Ad filter */}
          <div className="flex flex-col gap-1">
            <label
              htmlFor="conv-ad"
              className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
            >
              Anuncio Meta
            </label>
            <Select
              value={adFilter}
              onValueChange={(v) => {
                setAdFilter(v);
                setPage(1);
              }}
              disabled={!hasAdOptions}
            >
              <SelectTrigger
                id="conv-ad"
                className="h-9 text-sm"
                aria-label="Filtrar por anuncio"
              >
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {hasAdOptions && (
                  <SelectItem value="any">
                    <span className="flex items-center gap-1.5">
                      <Megaphone size={12} />
                      Cualquier anuncio
                    </span>
                  </SelectItem>
                )}
                {filters?.ads.map((a) => (
                  <SelectItem key={a.source_id} value={a.source_id}>
                    {a.ad_name ?? a.campaign_name ?? a.source_id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 rounded-xl border px-4 py-3.5"
            >
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex flex-1 flex-col gap-1.5">
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="h-3 w-48" />
              </div>
              <Skeleton className="h-3 w-16" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-16 text-center">
          <MessagesSquare size={36} className="text-muted-foreground/30" />
          <div>
            <p className="font-medium text-muted-foreground">
              {hasFilters
                ? "No hay conversaciones con esos filtros"
                : "No hay conversaciones todavía"}
            </p>
            {hasFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="mt-1 text-sm text-primary underline underline-offset-2"
              >
                Limpiar filtros
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((conv) => (
            <ConversationRow
              key={conv.id}
              conv={conv}
              onClick={() => navigate(`/conversations/${conv.id}`)}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {pageCount > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Página {page} de {pageCount} · {total.toLocaleString("es-CO")}{" "}
            resultados
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || isLoading}
              onClick={() => setPage((p) => p - 1)}
              className="gap-1"
            >
              <ChevronLeft size={14} />
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pageCount || isLoading}
              onClick={() => setPage((p) => p + 1)}
              className="gap-1"
            >
              Siguiente
              <ChevronRight size={14} />
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
