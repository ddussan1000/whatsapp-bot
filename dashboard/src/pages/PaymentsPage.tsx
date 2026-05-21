import { useEffect, useRef, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  ArrowUp,
  ArrowDown,
  MessageSquare,
  Pencil,
  CheckCircle2,
  Clock,
  XCircle,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from "@tanstack/react-table";
import { toast } from "sonner";
import {
  usePaymentsQuery,
  useUpdatePaymentStateMutation,
  useUpdatePaymentAmountMutation,
  useDeletePaymentMutation,
} from "../lib/hooks";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
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

// ── PhonePaymentsModal ────────────────────────────────────────────────────

function PhonePaymentsModal({
  phone,
  onClose,
}: {
  phone: string;
  onClose: () => void;
}) {
  const { data, isLoading } = usePaymentsQuery({ phone, pageSize: 50 });
  const updateState = useUpdatePaymentStateMutation();
  const updateAmount = useUpdatePaymentAmountMutation();
  const deletePayment = useDeletePaymentMutation();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [amountDraft, setAmountDraft] = useState("");
  const [pendingStateId, setPendingStateId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const payments = data?.items ?? [];

  function handleStateChange(id: string, state: string) {
    setPendingStateId(id);
    updateState.mutate(
      { id, state },
      {
        onSuccess: () => {
          toast.success("Estado actualizado");
          setPendingStateId(null);
        },
        onSettled: () => setPendingStateId(null),
      }
    );
  }

  function handleAmountSave(id: string, currency: string) {
    const v = parseFloat(amountDraft);
    if (!v || v <= 0) return;
    updateAmount.mutate(
      { id, amount: v, currency },
      {
        onSuccess: () => {
          toast.success("Monto actualizado");
          setEditingId(null);
        },
      }
    );
  }

  return (
    <>
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="w-full sm:max-w-xl md:max-w-xl">
          <DialogHeader>
            <DialogTitle>Pagos de {phone}</DialogTitle>
            <DialogDescription>
              Todos los pagos registrados para este número. Haz clic en el monto
              para editarlo.
            </DialogDescription>
          </DialogHeader>
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Cargando…
            </p>
          ) : payments.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Sin pagos registrados
            </p>
          ) : (
            <div className="flex flex-col gap-2 max-h-[60vh] overflow-y-auto pr-1">
              {payments.map((p) => (
                <div
                  key={p.id}
                  className="flex flex-col gap-2 rounded-lg border p-3 text-sm sm:flex-row sm:items-center sm:gap-3"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {editingId === p.id ? (
                      <div className="flex items-center gap-1 shrink-0">
                        <input
                          type="number"
                          value={amountDraft}
                          onChange={(e) => setAmountDraft(e.target.value)}
                          className="w-24 h-7 border rounded px-2 text-xs font-mono bg-background"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter")
                              handleAmountSave(p.id, p.currency ?? "COP");
                            if (e.key === "Escape") setEditingId(null);
                          }}
                        />
                        <span className="text-xs text-muted-foreground">
                          {p.currency}
                        </span>
                      </div>
                    ) : (
                      <button
                        className="font-mono text-sm hover:underline text-left shrink-0"
                        title="Editar monto"
                        onClick={() => {
                          setEditingId(p.id);
                          setAmountDraft(String(p.amount ?? ""));
                        }}
                      >
                        {formatCurrency(p.amount, p.currency)}
                      </button>
                    )}
                    <div className="shrink-0">
                      <PaymentStateBadge state={p.state ?? ""} />
                    </div>
                  </div>

                  <div className="flex items-center gap-1 sm:ml-auto">
                    <span className="text-xs text-muted-foreground shrink-0 flex-1 sm:flex-none">
                      {formatDate(p.receipt_date ?? p.received_at)}
                    </span>
                    <div className="flex items-center gap-0.5 shrink-0 ml-auto sm:ml-0">
                      {p.state !== "validated" && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-green-600 hover:text-green-700"
                          title="Aprobar"
                          disabled={pendingStateId === p.id}
                          onClick={() => handleStateChange(p.id, "validated")}
                        >
                          <CheckCircle2 size={14} />
                        </Button>
                      )}
                      {p.state !== "pending_manual_review" && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-amber-600 hover:text-amber-700"
                          title="Marcar pendiente"
                          disabled={pendingStateId === p.id}
                          onClick={() =>
                            handleStateChange(p.id, "pending_manual_review")
                          }
                        >
                          <Clock size={14} />
                        </Button>
                      )}
                      {p.state !== "rejected" && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-red-600 hover:text-red-700"
                          title="Rechazar"
                          disabled={pendingStateId === p.id}
                          onClick={() => handleStateChange(p.id, "rejected")}
                        >
                          <XCircle size={14} />
                        </Button>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        title="Eliminar"
                        disabled={
                          deletePayment.isPending && confirmDeleteId === p.id
                        }
                        onClick={() => setConfirmDeleteId(p.id)}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!confirmDeleteId}
        onOpenChange={(o) => {
          if (!o) setConfirmDeleteId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar pago</DialogTitle>
            <DialogDescription>
              Esta acción no se puede deshacer. El registro de pago será
              eliminado permanentemente.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDeleteId(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={deletePayment.isPending}
              onClick={() => {
                if (!confirmDeleteId) return;
                deletePayment.mutate(confirmDeleteId, {
                  onSuccess: () => {
                    toast.success("Pago eliminado");
                    setConfirmDeleteId(null);
                  },
                });
              }}
            >
              {deletePayment.isPending ? "Eliminando…" : "Eliminar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
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
  const updatePaymentAmount = useUpdatePaymentAmountMutation();
  const deletePayment = useDeletePaymentMutation();

  // Phone payments modal
  const [phoneModal, setPhoneModal] = useState<string | null>(null);

  // Edit amount dialog
  const [editPayment, setEditPayment] = useState<Payment | null>(null);
  const [editAmount, setEditAmount] = useState("");

  // Delete confirm dialog
  const [deletePaymentId, setDeletePaymentId] = useState<string | null>(null);

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
      cell: ({ row }) => {
        const p = row.original;
        const warn =
          p.state === "pending_manual_review" && p.has_validated_duplicate;
        return (
          <span className="flex items-center gap-1.5">
            <span className="text-sm font-mono">{p.phone}</span>
            {warn && (
              <button
                onClick={() => setPhoneModal(p.phone)}
                className="flex items-center gap-0.5 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600 hover:bg-amber-500/20 transition-colors"
                title="Este teléfono tiene pagos validados. Ver todos los pagos."
              >
                <AlertTriangle size={10} />
                Duplicado
              </button>
            )}
          </span>
        );
      },
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
          <div className="flex items-center gap-0.5">
            {p.conversation_id && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                title="Ver conversación"
                onClick={() => navigate(`/conversations/${p.conversation_id}`)}
              >
                <MessageSquare size={13} />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              title="Editar monto"
              onClick={() => {
                setEditPayment(p);
                setEditAmount(String(p.amount ?? ""));
              }}
            >
              <Pencil size={13} />
            </Button>
            {p.state !== "validated" && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-green-600 hover:text-green-600"
                title="Marcar como validado"
                onClick={() =>
                  updatePaymentState.mutate({ id: p.id, state: "validated" })
                }
              >
                <CheckCircle2 size={13} />
              </Button>
            )}
            {p.state !== "pending_manual_review" && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-amber-500 hover:text-amber-500"
                title="Marcar como pendiente"
                onClick={() =>
                  updatePaymentState.mutate({
                    id: p.id,
                    state: "pending_manual_review",
                  })
                }
              >
                <Clock size={13} />
              </Button>
            )}
            {p.state !== "rejected" && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-red-500 hover:text-red-500"
                title="Marcar como rechazado"
                onClick={() =>
                  updatePaymentState.mutate({ id: p.id, state: "rejected" })
                }
              >
                <XCircle size={13} />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              title="Eliminar pago"
              onClick={() => setDeletePaymentId(p.id)}
            >
              <Trash2 size={13} />
            </Button>
          </div>
        );
      },
    },
  ];

  // eslint-disable-next-line react-hooks/incompatible-library
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
            setSearchParams((prev) => {
              const next = new URLSearchParams(prev);
              if (v === "all") next.delete("state");
              else next.set("state", v);
              next.set("page", "1");
              return next;
            });
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
            setSearchParams((prev) => {
              const next = new URLSearchParams(prev);
              next.set("sortBy", v);
              next.set("page", "1");
              return next;
            });
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

      {/* Edit amount dialog */}
      <Dialog
        open={!!editPayment}
        onOpenChange={(o) => {
          if (!o) {
            setEditPayment(null);
            setEditAmount("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar monto</DialogTitle>
            <DialogDescription>
              Actualiza el monto del pago de {editPayment?.phone}.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5 py-2">
            <Label htmlFor="edit-amount">
              Monto ({editPayment?.currency ?? "COP"})
            </Label>
            <Input
              id="edit-amount"
              type="number"
              min={0}
              value={editAmount}
              onChange={(e) => setEditAmount(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && editPayment) {
                  const num = Number(editAmount);
                  if (!num || num <= 0) return;
                  updatePaymentAmount.mutate(
                    { id: editPayment.id, amount: num },
                    {
                      onSuccess: () => {
                        toast.success("Monto actualizado");
                        setEditPayment(null);
                      },
                    }
                  );
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditPayment(null)}>
              Cancelar
            </Button>
            <Button
              disabled={
                updatePaymentAmount.isPending ||
                !editAmount ||
                Number(editAmount) <= 0
              }
              onClick={() => {
                if (!editPayment) return;
                const num = Number(editAmount);
                if (!num || num <= 0) return;
                updatePaymentAmount.mutate(
                  { id: editPayment.id, amount: num },
                  {
                    onSuccess: () => {
                      toast.success("Monto actualizado");
                      setEditPayment(null);
                    },
                  }
                );
              }}
            >
              {updatePaymentAmount.isPending ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Phone payments modal */}
      {phoneModal && (
        <PhonePaymentsModal
          phone={phoneModal}
          onClose={() => setPhoneModal(null)}
        />
      )}

      {/* Delete confirm dialog */}
      <Dialog
        open={!!deletePaymentId}
        onOpenChange={(o) => {
          if (!o) setDeletePaymentId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar pago</DialogTitle>
            <DialogDescription>
              Esta acción no se puede deshacer. El registro de pago será
              eliminado permanentemente.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletePaymentId(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={deletePayment.isPending}
              onClick={() => {
                if (!deletePaymentId) return;
                deletePayment.mutate(deletePaymentId, {
                  onSuccess: () => {
                    toast.success("Pago eliminado");
                    setDeletePaymentId(null);
                  },
                });
              }}
            >
              {deletePayment.isPending ? "Eliminando…" : "Eliminar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
