import { useState } from "react";
import { usePaymentsQuery } from "../lib/hooks";
import { Card } from "../components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { Button } from "../components/ui/button";
import { StatusBadge } from "../components/StatusBadge";

export function PaymentsPage() {
  const [page, setPage] = useState(1);
  const [pageSize] = useState(12);
  const [sortBy, setSortBy] = useState("validated_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const { data, isLoading } = usePaymentsQuery({
    page,
    pageSize,
    sortBy,
    sortDir,
  });
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <section>
      <div className="page-header">
        <h2>Pagos</h2>
        <select
          className="input"
          value={`${sortBy}:${sortDir}`}
          onChange={(e) => {
            const [newSortBy, newSortDir] = e.target.value.split(":");
            setSortBy(newSortBy);
            setSortDir(newSortDir as "asc" | "desc");
          }}
        >
          <option value="validated_at:desc">Mas recientes</option>
          <option value="validated_at:asc">Mas antiguos</option>
          <option value="amount:desc">Monto mayor</option>
          <option value="amount:asc">Monto menor</option>
        </select>
      </div>
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Telefono</TableHead>
              <TableHead>Producto</TableHead>
              <TableHead>Monto</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-center text-muted-foreground"
                >
                  Cargando pagos...
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-center text-muted-foreground"
                >
                  No hay pagos para mostrar.
                </TableCell>
              </TableRow>
            ) : (
              items.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    {p.validated_at
                      ? new Date(p.validated_at).toLocaleString("es-CO")
                      : "-"}
                  </TableCell>
                  <TableCell>{p.phone}</TableCell>
                  <TableCell>{p.product ?? "-"}</TableCell>
                  <TableCell>
                    ${Number(p.amount ?? 0).toLocaleString("es-CO")}
                  </TableCell>
                  <TableCell>
                    {p.state ? <StatusBadge state={p.state} /> : "-"}
                  </TableCell>
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
              variant="outline"
              className="ml-8"
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
