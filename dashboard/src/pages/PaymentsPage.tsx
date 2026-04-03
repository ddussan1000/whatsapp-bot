import { useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Search,
  CreditCard,
  Workflow,
  Smartphone,
} from "lucide-react";
import { usePaymentsQuery } from "../lib/hooks";
import { useInstancesQuery, useFlowsV2Query } from "../lib/hooks";
import { Button } from "../components/ui/button";
import { Skeleton } from "../components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import type { Payment } from "../types/api";

// ── Types ─────────────────────────────────────────────────────────────────

type PaymentState = NonNullable<Payment["state"]>;

// ── Helpers ───────────────────────────────────────────────────────────────

function formatPhone(phone: string) {
  return phone.startsWith("57") && phone.length === 12
    ? `+57 ${phone.slice(2, 5)} ${phone.slice(5, 8)} ${phone.slice(8)}`
    : `+${phone}`;
}

function formatMoney(amount: number | null | undefined) {
  if (amount == null) return "—";
  return amount.toLocaleString("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  });
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function dateInputValue(d: Date) {
  return d.toISOString().slice(0, 10);
}
function toIsoStart(date: string) {
  return new Date(`${date}T00:00:00.000Z`).toISOString();
}
function toIsoEnd(date: string) {
  return new Date(`${date}T23:59:59.999Z`).toISOString();
}

// ── PaymentStateBadge ──────────────────────────────────────────────────────

const STATE_CONFIG: Record<PaymentState, { label: string; className: string }> =
  {
    pending_manual_review: {
      label: "Revisión pendiente",
      className: "bg-amber-500/10 text-amber-600 border-amber-500/20",
    },
    validated: {
      label: "Validado",
      className: "bg-green-500/10 text-green-600 border-green-500/20",
    },
    rejected: {
      label: "Rechazado",
      className: "bg-red-500/10 text-red-600 border-red-500/20",
    },
  };

function PaymentStateBadge({
  state,
}: {
  state: PaymentState | null | undefined;
}) {
  if (!state) return <span className="text-muted-foreground text-xs">—</span>;
  const cfg = STATE_CONFIG[state] ?? {
    label: state,
    className: "bg-muted text-muted-foreground border-border",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${cfg.className}`}
    >
      {cfg.label}
    </span>
  );
}

// ── PaymentRow ─────────────────────────────────────────────────────────────

function PaymentRow({ p }: { p: Payment }) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3.5 text-sm transition-colors hover:bg-muted/30">
      <div className="flex items-start gap-3 sm:items-center sm:gap-4">
        {/* Avatar */}
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-500/10 text-green-600 font-bold text-[11px]">
          COP
        </div>

        {/* Phone + meta + mobile badge/date */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium truncate">{formatPhone(p.phone)}</span>
            <span className="font-semibold tabular-nums shrink-0 sm:hidden">
              {formatMoney(p.amount)}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground mt-0.5">
            {p.flow_name && (
              <span className="flex items-center gap-1">
                <Workflow size={10} className="shrink-0" />
                <span className="truncate max-w-[120px]">{p.flow_name}</span>
              </span>
            )}
            {p.instance_label && (
              <span className="flex items-center gap-1">
                <Smartphone size={10} className="shrink-0" />
                {p.instance_label}
              </span>
            )}
          </div>
          {/* Mobile: badge + date row */}
          <div className="flex items-center justify-between mt-2 sm:hidden">
            <PaymentStateBadge state={p.state} />
            <span className="text-xs text-muted-foreground">
              {formatDate(p.validated_at ?? p.receipt_date)}
            </span>
          </div>
        </div>

        {/* Desktop only: amount, badge, date */}
        <div className="hidden sm:block shrink-0 text-right">
          <span className="font-semibold tabular-nums">{formatMoney(p.amount)}</span>
        </div>
        <div className="hidden sm:flex shrink-0 w-36 justify-end">
          <PaymentStateBadge state={p.state} />
        </div>
        <div className="hidden sm:block shrink-0 w-36 text-right text-xs text-muted-foreground">
          {formatDate(p.validated_at ?? p.receipt_date)}
        </div>
      </div>
    </div>
  );
}

// ── PaymentsPage ───────────────────────────────────────────────────────────

const PAGE_SIZE = 15;

export function PaymentsPage() {
  const now = new Date();
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState("validated_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [stateFilter, setStateFilter] = useState("all");
  const [flowFilter, setFlowFilter] = useState("all");
  const [instanceFilter, setInstanceFilter] = useState("all");
  const [fromDate, setFromDate] = useState(
    dateInputValue(new Date(now.getTime() - 30 * 86400000))
  );
  const [toDate, setToDate] = useState(dateInputValue(now));

  const { data: instances = [] } = useInstancesQuery();
  const { data: flows = [] } = useFlowsV2Query();

  const { data, isLoading } = usePaymentsQuery({
    page,
    pageSize: PAGE_SIZE,
    sortBy,
    sortDir,
    state: stateFilter !== "all" ? stateFilter : undefined,
    flowId: flowFilter !== "all" ? flowFilter : undefined,
    instanceId: instanceFilter !== "all" ? instanceFilter : undefined,
    from: toIsoStart(fromDate),
    to: toIsoEnd(toDate),
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const clearFilters = () => {
    setStateFilter("all");
    setFlowFilter("all");
    setInstanceFilter("all");
    setFromDate(dateInputValue(new Date(now.getTime() - 30 * 86400000)));
    setToDate(dateInputValue(now));
    setPage(1);
  };

  const hasFilters =
    stateFilter !== "all" || flowFilter !== "all" || instanceFilter !== "all";

  return (
    <section className="flex flex-col gap-4 p-3 sm:gap-5 sm:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Pagos</h2>
          <p className="text-sm text-muted-foreground">
            {total > 0
              ? `${total.toLocaleString("es-CO")} registros`
              : "Historial de comprobantes y pagos recibidos"}
          </p>
        </div>
        <Select
          value={`${sortBy}:${sortDir}`}
          onValueChange={(v) => {
            const [sb, sd] = v.split(":");
            setSortBy(sb);
            setSortDir(sd as "asc" | "desc");
            setPage(1);
          }}
        >
          <SelectTrigger className="h-9 w-44 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="validated_at:desc">Más recientes</SelectItem>
            <SelectItem value="validated_at:asc">Más antiguos</SelectItem>
            <SelectItem value="amount:desc">Mayor monto</SelectItem>
            <SelectItem value="amount:asc">Menor monto</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Date range */}
        <div className="flex items-center gap-1 rounded-lg border bg-background px-2 py-1.5 text-sm">
          <Search size={13} className="shrink-0 text-muted-foreground" />
          <input
            type="date"
            value={fromDate}
            onChange={(e) => {
              setFromDate(e.target.value);
              setPage(1);
            }}
            className="bg-transparent text-xs sm:text-sm outline-none w-[110px] sm:w-32"
          />
          <span className="text-muted-foreground text-xs shrink-0">—</span>
          <input
            type="date"
            value={toDate}
            onChange={(e) => {
              setToDate(e.target.value);
              setPage(1);
            }}
            className="bg-transparent text-xs sm:text-sm outline-none w-[110px] sm:w-32"
          />
        </div>

        {/* State */}
        <Select
          value={stateFilter}
          onValueChange={(v) => {
            setStateFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="h-9 w-44 text-sm">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            <SelectItem value="pending_manual_review">
              Revisión pendiente
            </SelectItem>
            <SelectItem value="validated">Validado</SelectItem>
            <SelectItem value="rejected">Rechazado</SelectItem>
          </SelectContent>
        </Select>

        {/* Flow */}
        {flows.length > 0 && (
          <Select
            value={flowFilter}
            onValueChange={(v) => {
              setFlowFilter(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="h-9 w-44 text-sm">
              <SelectValue placeholder="Flujo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los flujos</SelectItem>
              {flows.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Instance */}
        {instances.length > 0 && (
          <Select
            value={instanceFilter}
            onValueChange={(v) => {
              setInstanceFilter(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="h-9 w-44 text-sm">
              <SelectValue placeholder="Instancia" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las instancias</SelectItem>
              {instances.map((i) => (
                <SelectItem key={i.id} value={i.id}>
                  {i.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Quick date presets */}
        <Button
          variant="outline"
          size="sm"
          className="h-9 text-xs"
          onClick={() => {
            setFromDate(dateInputValue(now));
            setToDate(dateInputValue(now));
            setPage(1);
          }}
        >
          Hoy
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-9 text-xs"
          onClick={() => {
            setFromDate(dateInputValue(new Date(now.getTime() - 7 * 86400000)));
            setToDate(dateInputValue(now));
            setPage(1);
          }}
        >
          7d
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-9 text-xs"
          onClick={() => {
            setFromDate(
              dateInputValue(new Date(now.getTime() - 30 * 86400000))
            );
            setToDate(dateInputValue(now));
            setPage(1);
          }}
        >
          30d
        </Button>

        {hasFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Limpiar filtros
          </button>
        )}
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
                <Skeleton className="h-3.5 w-28" />
                <Skeleton className="h-3 w-40" />
              </div>
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-5 w-28 rounded-full" />
              <Skeleton className="h-3 w-24" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-16 text-center">
          <CreditCard size={36} className="text-muted-foreground/30" />
          <div>
            <p className="font-medium text-muted-foreground">
              {hasFilters
                ? "No hay pagos con esos filtros"
                : "No hay pagos en este periodo"}
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
          {items.map((p) => (
            <PaymentRow key={p.id} p={p} />
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
