import { useEffect, useRef, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  ArrowUp,
  ArrowDown,
  MoreHorizontal,
  MessageSquare,
} from "lucide-react";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from "@tanstack/react-table";
import { usePaymentsQuery, useUpdatePaymentStateMutation } from "../lib/hooks";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Payment } from "../types/api";

// ── Helpers ───────────────────────────────────────────────────────────────

const PAYMENT_STATE_OPTIONS = [
  { value: "pending_manual_review", label: "Pendiente revisión" },
  { value: "validated", label: "Validado" },
  { value: "rejected", label: "Rechazado" },
];

const PAYMENT_STATE_COLORS: Record<string, string> = {
  pending_manual_review: "text-amber-600 bg-amber-500/10",
  validated: "text-green-600 bg-green-500/10",
  rejected: "text-red-600 bg-red-500/10",
};

function PaymentStateBadge({ state }: { state: string }) {
  const opt = PAYMENT_STATE_OPTIONS.find((o) => o.value === state);
  const color = PAYMENT_STATE_COLORS[state] ?? "text-muted-foreground bg-muted";
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${color}`}
    >
      {opt?.label ?? state}
    </span>
  );
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-CO", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function formatCurrency(
  amount: number | null | undefined,
  currency: string | null | undefined
) {
  if (amount == null) return "—";
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: currency ?? "COP",
    maximumFractionDigits: 0,
  }).format(amount);
}

// ── PaymentsPage ──────────────────────────────────────────────────────────

export function PaymentsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [search, setSearch] = useState(searchParams.get("phone") ?? "");
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const page = Number(searchParams.get("page") ?? "1");
  const stateFilter = searchParams.get("state") ?? "";
  const sortBy = searchParams.get("sortBy") ?? "validated_at";
  const sortDir = (searchParams.get("sortDir") ?? "desc") as "asc" | "desc";

  const updateParam = (key: string, value: string | null) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
      return next;
    });
  };

  const handleSearchChange = (v: string) => {
    setSearch(v);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (v) next.set("phone", v);
        else next.delete("phone");
        next.set("page", "1");
        return next;
      });
    }, 300);
  };

  useEffect(() => {
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, []);

  const { data, isLoading } = usePaymentsQuery({
    page,
    pageSize: 20,
    sortBy,
    sortDir,
    state: stateFilter || undefined,
    phone: searchParams.get("phone") ?? undefined,
  });

  const updatePaymentState = useUpdatePaymentStateMutation();

  const totalPages = data ? Math.ceil(data.total / 20) : 1;

  const toggleSort = (col: string) => {
    if (sortBy === col) {
      updateParam("sortDir", sortDir === "asc" ? "desc" : "asc");
    } else {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("sortBy", col);
        next.set("sortDir", "desc");
        next.set("page", "1");
        return next;
      });
    }
  };

  function SortIcon({ col }: { col: string }) {
    if (sortBy !== col)
      return <ChevronsUpDown size={13} className="text-muted-foreground" />;
    return sortDir === "asc" ? (
      <ArrowUp size={13} className="text-primary" />
    ) : (
      <ArrowDown size={13} className="text-primary" />
    );
  }

  const columns: ColumnDef<Payment>[] = [
    {
      accessorKey: "phone",
      header: () => (
        <button
          className="flex items-center gap-1 hover:text-foreground"
          onClick={() => toggleSort("phone")}
        >
          Teléfono <SortIcon col="phone" />
        </button>
      ),
      cell: ({ row }) => (
        <span className="text-sm font-mono">{row.original.phone}</span>
      ),
    },
    {
      accessorKey: "amount",
      header: () => (
        <button
          className="flex items-center gap-1 hover:text-foreground"
          onClick={() => toggleSort("amount")}
        >
          Monto <SortIcon col="amount" />
        </button>
      ),
      cell: ({ row }) => (
        <span className="text-sm font-semibold">
          {formatCurrency(row.original.amount, row.original.currency)}
        </span>
      ),
    },
    {
      accessorKey: "currency",
      header: "Moneda",
      cell: ({ row }) => (
        <span className="text-sm">{row.original.currency ?? "—"}</span>
      ),
    },
    {
      accessorKey: "flow_name",
      header: "Flujo",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.flow_name ?? "—"}
        </span>
      ),
    },
    {
      accessorKey: "state",
      header: "Estado",
      cell: ({ row }) => <PaymentStateBadge state={row.original.state ?? ""} />,
    },
    {
      accessorKey: "receipt_date",
      header: () => (
        <button
          className="flex items-center gap-1 hover:text-foreground"
          onClick={() => toggleSort("receipt_date")}
        >
          Fecha comprobante <SortIcon col="receipt_date" />
        </button>
      ),
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {formatDate(row.original.receipt_date)}
        </span>
      ),
    },
    {
      accessorKey: "validated_at",
      header: () => (
        <button
          className="flex items-center gap-1 hover:text-foreground"
          onClick={() => toggleSort("validated_at")}
        >
          Validado <SortIcon col="validated_at" />
        </button>
      ),
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {formatDate(row.original.validated_at)}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const p = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <MoreHorizontal size={14} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {p.conversation_id && (
                <DropdownMenuItem
                  onClick={() =>
                    navigate(`/conversations/${p.conversation_id}`)
                  }
                >
                  <MessageSquare size={14} />
                  Ver conversación
                </DropdownMenuItem>
              )}
              {p.state !== "validated" && (
                <DropdownMenuItem
                  onClick={() =>
                    updatePaymentState.mutate({ id: p.id, state: "validated" })
                  }
                >
                  Marcar como validado
                </DropdownMenuItem>
              )}
              {p.state !== "pending_manual_review" && (
                <DropdownMenuItem
                  onClick={() =>
                    updatePaymentState.mutate({
                      id: p.id,
                      state: "pending_manual_review",
                    })
                  }
                >
                  Marcar como pendiente
                </DropdownMenuItem>
              )}
              {p.state !== "rejected" && (
                <DropdownMenuItem
                  className="text-red-600"
                  onClick={() =>
                    updatePaymentState.mutate({ id: p.id, state: "rejected" })
                  }
                >
                  Marcar como rechazado
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  const table = useReactTable({
    data: data?.items ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    pageCount: totalPages,
  });

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 max-w-full">
      {/* Header */}
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold">Pagos</h1>
        {data != null && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            {data.total}
          </span>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Buscar por teléfono…"
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="h-9 w-52"
        />
        <Select
          value={stateFilter || "all"}
          onValueChange={(v) => {
            updateParam("state", v === "all" ? null : v);
            updateParam("page", "1");
          }}
        >
          <SelectTrigger className="h-9 w-44">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            {PAYMENT_STATE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={sortBy}
          onValueChange={(v) => {
            updateParam("sortBy", v);
            updateParam("page", "1");
          }}
        >
          <SelectTrigger className="h-9 w-44">
            <SelectValue placeholder="Ordenar por" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="validated_at">Fecha validación</SelectItem>
            <SelectItem value="amount">Monto</SelectItem>
            <SelectItem value="receipt_date">Fecha comprobante</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="sm"
          className="h-9"
          onClick={() =>
            updateParam("sortDir", sortDir === "asc" ? "desc" : "asc")
          }
        >
          {sortDir === "asc" ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
          {sortDir === "asc" ? "Ascendente" : "Descendente"}
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-xl border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-muted-foreground text-xs">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => (
                  <th
                    key={header.id}
                    className="px-3 py-2.5 text-left font-medium whitespace-nowrap"
                  >
                    {flexRender(
                      header.column.columnDef.header,
                      header.getContext()
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="border-t">
                  {columns.map((_, j) => (
                    <td key={j} className="px-3 py-2.5">
                      <Skeleton className="h-4 w-full" />
                    </td>
                  ))}
                </tr>
              ))
            ) : table.getRowModel().rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-3 py-10 text-center text-muted-foreground"
                >
                  No se encontraron pagos.
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-t hover:bg-muted/30 transition-colors"
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-3 py-2.5 whitespace-nowrap">
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {data && data.total > 20 && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Página {page} de {totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => updateParam("page", String(page - 1))}
            >
              <ChevronLeft size={14} /> Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => updateParam("page", String(page + 1))}
            >
              Siguiente <ChevronRight size={14} />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
