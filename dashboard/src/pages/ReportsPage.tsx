import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "../components/ui/chart";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { Skeleton } from "../components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import {
  useFlowsV2Query,
  useInstancesQuery,
  useReportsQuery,
} from "../lib/hooks";

function toIsoStart(date: string) {
  return new Date(`${date}T00:00:00.000Z`).toISOString();
}
function toIsoEnd(date: string) {
  return new Date(`${date}T23:59:59.999Z`).toISOString();
}
function dateInputValue(d: Date) {
  return d.toISOString().slice(0, 10);
}
function money(value: number) {
  return value.toLocaleString("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  });
}

export function ReportsPage() {
  const now = new Date();
  const [fromDate, setFromDate] = useState(
    dateInputValue(new Date(now.getTime() - 7 * 86400000))
  );
  const [toDate, setToDate] = useState(dateInputValue(now));
  const [instanceId, setInstanceId] = useState<string>("all");
  const [flowId, setFlowId] = useState<string>("all");
  const [granularity, setGranularity] = useState<"day" | "week" | "month">(
    "day"
  );
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const queryParams = useMemo(
    () => ({
      from: toIsoStart(fromDate),
      to: toIsoEnd(toDate),
      instanceId: instanceId === "all" ? undefined : [instanceId],
      flowId: flowId === "all" ? undefined : [flowId],
      granularity,
      page,
      pageSize,
    }),
    [flowId, fromDate, granularity, instanceId, page, toDate]
  );

  const { data, isLoading, isFetching, isError, refetch } =
    useReportsQuery(queryParams);
  const { data: instances = [] } = useInstancesQuery();
  const { data: flows = [] } = useFlowsV2Query();

  const table = data?.table;
  const loading = isLoading || isFetching;
  const empty = !loading && (table?.total ?? 0) === 0;

  const kpis = data?.kpis;
  const exportCsv = () => {
    const rows = data?.table.items ?? [];
    if (!rows.length) {
      toast.error("No hay datos para exportar");
      return;
    }
    const header = [
      "paymentId",
      "fecha",
      "monto",
      "moneda",
      "telefono",
      "flow",
      "instancia",
      "estado",
    ];
    const lines = rows.map((r) =>
      [
        r.paymentId,
        r.validatedAt ?? "",
        String(r.amount),
        r.currency ?? "",
        r.phone,
        r.flowName ?? "",
        r.instanceLabel ?? "",
        r.state ?? "",
      ]
        .map((v) => `"${String(v).replaceAll('"', '""')}"`)
        .join(",")
    );
    const csv = [header.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reporte-${fromDate}-${toDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exportado");
  };

  return (
    <section className="space-y-4">
      <div className="page-header">
        <h2>Reportes</h2>
        <p className="muted">
          Ventas y conversiones por instancia, flow y fecha
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
          <CardDescription>
            Refina el análisis por periodo, WhatsApp y flow
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-6">
          <input
            type="date"
            className="h-9 rounded-md border bg-background px-3"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
          />
          <input
            type="date"
            className="h-9 rounded-md border bg-background px-3"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
          />
          <Select
            value={instanceId}
            onValueChange={(v) => {
              setInstanceId(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-full">
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
          <Select
            value={flowId}
            onValueChange={(v) => {
              setFlowId(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Flow" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los flows</SelectItem>
              {flows.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={granularity}
            onValueChange={(v: "day" | "week" | "month") => setGranularity(v)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Granularidad" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">Diario</SelectItem>
              <SelectItem value="week">Semanal</SelectItem>
              <SelectItem value="month">Mensual</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setFromDate(dateInputValue(new Date()));
                setToDate(dateInputValue(new Date()));
              }}
            >
              Hoy
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setFromDate(
                  dateInputValue(new Date(Date.now() - 30 * 86400000))
                );
                setToDate(dateInputValue(new Date()));
              }}
            >
              30d
            </Button>
            <Button onClick={exportCsv}>Exportar CSV</Button>
          </div>
        </CardContent>
      </Card>

      {isError ? (
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-destructive">
              No se pudo cargar el reporte.
            </p>
            <Button
              className="mt-3"
              onClick={() => refetch()}
              loading={loading}
            >
              Reintentar
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-3 md:grid-cols-5">
        {loading || !kpis
          ? Array.from({ length: 5 }).map((_, idx) => (
              <Skeleton key={idx} className="h-24 w-full" />
            ))
          : [
              { label: "Ingresos", value: money(kpis.revenueTotal) },
              {
                label: "Ventas",
                value: kpis.salesCount.toLocaleString("es-CO"),
              },
              { label: "Ticket promedio", value: money(kpis.avgTicket) },
              {
                label: "Conversaciones",
                value: kpis.conversationsCount.toLocaleString("es-CO"),
              },
              {
                label: "Conversión",
                value: `${(kpis.conversionRate * 100).toFixed(1)}%`,
              },
            ].map((kpi) => (
              <Card key={kpi.label}>
                <CardHeader className="pb-2">
                  <CardDescription>{kpi.label}</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-semibold">{kpi.value}</p>
                </CardContent>
              </Card>
            ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Serie temporal</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-72 w-full" />
            ) : (
              <ChartContainer
                config={{
                  revenue: { label: "Ingresos", color: "#22c55e" },
                  sales: { label: "Ventas", color: "#3b82f6" },
                }}
                className="h-72 w-full"
              >
                <AreaChart data={data?.timeseries ?? []}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="bucket" />
                  <YAxis />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="var(--color-revenue)"
                    fill="var(--color-revenue)"
                    fillOpacity={0.2}
                  />
                  <Area
                    type="monotone"
                    dataKey="sales"
                    stroke="var(--color-sales)"
                    fill="var(--color-sales)"
                    fillOpacity={0.2}
                  />
                </AreaChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Embudo por etapa</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-72 w-full" />
            ) : (
              <ChartContainer
                config={{
                  count: { label: "Conversaciones", color: "#f59e0b" },
                }}
                className="h-72 w-full"
              >
                <BarChart data={data?.funnel ?? []} layout="vertical">
                  <CartesianGrid horizontal={false} />
                  <XAxis type="number" />
                  <YAxis type="category" dataKey="stage" width={120} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="count" fill="var(--color-count)" radius={6}>
                    <LabelList dataKey="count" position="right" />
                  </Bar>
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Ventas por flow</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-72 w-full" />
            ) : (
              <ChartContainer
                config={{ revenue: { label: "Ingresos", color: "#8b5cf6" } }}
                className="h-72 w-full"
              >
                <BarChart data={data?.byFlow ?? []}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="label" hide />
                  <YAxis />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar
                    dataKey="revenue"
                    fill="var(--color-revenue)"
                    radius={6}
                  />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Distribución por instancia</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-72 w-full" />
            ) : (
              <ChartContainer
                config={{ revenue: { label: "Ingresos", color: "#06b6d4" } }}
                className="h-72 w-full"
              >
                <PieChart>
                  <Pie
                    data={data?.byInstance ?? []}
                    dataKey="revenue"
                    nameKey="label"
                    outerRadius={100}
                  >
                    <LabelList dataKey="label" position="outside" />
                  </Pie>
                  <ChartTooltip content={<ChartTooltipContent />} />
                </PieChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Detalle de ventas</CardTitle>
          <CardDescription>Dataset filtrado con paginación</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead>Flow</TableHead>
                <TableHead>Instancia</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Monto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 8 }).map((_, idx) => (
                  <TableRow key={idx}>
                    <TableCell colSpan={6}>
                      <Skeleton className="h-5 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : empty ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center text-muted-foreground"
                  >
                    No hay ventas para estos filtros.
                  </TableCell>
                </TableRow>
              ) : (
                (table?.items ?? []).map((row) => (
                  <TableRow key={row.paymentId}>
                    <TableCell>
                      {row.validatedAt
                        ? new Date(row.validatedAt).toLocaleString("es-CO")
                        : "-"}
                    </TableCell>
                    <TableCell>{row.phone}</TableCell>
                    <TableCell>{row.flowName ?? "-"}</TableCell>
                    <TableCell>{row.instanceLabel ?? "-"}</TableCell>
                    <TableCell>{row.state ?? "-"}</TableCell>
                    <TableCell className="text-right">
                      {money(row.amount)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Total: {table?.total ?? 0}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Anterior
              </Button>
              <Button
                variant="outline"
                disabled={!table || page * pageSize >= table.total}
                onClick={() => setPage((p) => p + 1)}
              >
                Siguiente
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
