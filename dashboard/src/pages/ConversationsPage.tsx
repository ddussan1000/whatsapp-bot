import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useConversationsQuery } from "../lib/hooks";
import { Card } from "../components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import type { Conversation } from "../types/api";
import { StatusBadge } from "../components/StatusBadge";
import { Button } from "../components/ui/button";

export function ConversationsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(12);
  const [sortBy, setSortBy] = useState("updated_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const { data, isLoading } = useConversationsQuery({
    page,
    pageSize,
    search: search || undefined,
    state: stateFilter || undefined,
    sortBy,
    sortDir,
  });
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  const columns = useMemo<ColumnDef<Conversation>[]>(
    () => [
      { accessorKey: "phone", header: "Telefono" },
      {
        accessorKey: "stage",
        header: "Estado",
        cell: ({ row }) => <StatusBadge state={String(row.original.stage)} />,
      },
      {
        accessorKey: "product",
        header: "Producto",
        cell: ({ row }) => row.original.product ?? "-",
      },
      {
        accessorKey: "updated_at",
        header: "Actualizado",
        cell: ({ row }) =>
          row.original.updated_at
            ? new Date(row.original.updated_at).toLocaleString("es-CO")
            : "-",
      },
    ],
    []
  );

  const table = useReactTable({
    data: items,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <section>
      <div className="page-header">
        <h2>Conversaciones</h2>
        <div className="table-actions">
          <input
            className="input"
            placeholder="Buscar por telefono"
            value={search}
            onChange={(e) => {
              setPage(1);
              setSearch(e.target.value);
            }}
          />
          <select
            className="input"
            value={stateFilter}
            onChange={(e) => {
              setPage(1);
              setStateFilter(e.target.value);
            }}
          >
            <option value="">Todos los estados</option>
            <option value="saludo">saludo</option>
            <option value="catalogo">catalogo</option>
            <option value="esperando_comprobante">esperando comprobante</option>
            <option value="confirmar_comprobante">confirmar comprobante</option>
            <option value="pago_confirmado">pago confirmado</option>
            <option value="comprobante_rechazado">comprobante rechazado</option>
          </select>
          <select
            className="input"
            value={`${sortBy}:${sortDir}`}
            onChange={(e) => {
              const [newSortBy, newSortDir] = e.target.value.split(":");
              setSortBy(newSortBy);
              setSortDir(newSortDir as "asc" | "desc");
            }}
          >
            <option value="updated_at:desc">Mas recientes</option>
            <option value="updated_at:asc">Mas antiguas</option>
            <option value="phone:asc">Telefono A-Z</option>
            <option value="phone:desc">Telefono Z-A</option>
          </select>
        </div>
      </div>
      <Card>
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {flexRender(
                      header.column.columnDef.header,
                      header.getContext()
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="text-center text-muted-foreground"
                >
                  Cargando conversaciones...
                </TableCell>
              </TableRow>
            ) : table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="text-center text-muted-foreground"
                >
                  No hay conversaciones para mostrar.
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="clickable-row"
                  role="button"
                  tabIndex={0}
                  aria-label={`Abrir conversación con ${row.original.phone}`}
                  onClick={() => navigate(`/conversations/${row.original.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      navigate(`/conversations/${row.original.id}`);
                    }
                  }}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <div className="pagination">
          <p className="muted">
            Pagina {page} de {pageCount} - {total} registros
          </p>
          <div>
            <Button
              variant="outline"
              loading={isLoading && page > 1}
              loadingText="Cargando..."
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Anterior
            </Button>
            <Button
              className="ml-8"
              variant="outline"
              loading={isLoading && page < pageCount}
              loadingText="Cargando..."
              disabled={page >= pageCount}
              onClick={() => setPage((p) => p + 1)}
            >
              Siguiente
            </Button>
          </div>
        </div>
      </Card>
    </section>
  );
}
