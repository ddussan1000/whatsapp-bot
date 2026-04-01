import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Pie,
  PieChart,
  Tooltip,
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
  useAdReferralsQuery,
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
function pct(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

const AD_BAR_COLORS = [
  "#8b5cf6",
  "#3b82f6",
  "#22c55e",
  "#f59e0b",
  "#ef4444",
  "#06b6d4",
  "#ec4899",
  "#14b8a6",
  "#f97316",
  "#6366f1",
];

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

  const adQueryParams = useMemo(
    () => ({
      from: toIsoStart(fromDate),
      to: toIsoEnd(toDate),
      flowId: flowId === "all" ? undefined : [flowId],
    }),
    [flowId, fromDate, toDate]
  );

  const { data, isLoading, isFetching, isError, refetch } =
    useReportsQuery(queryParams);
  const { data: adData, isLoading: adLoading } =
    useAdReferralsQuery(adQueryParams);
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

  const adItems = adData?.items ?? [];
  const adTotals = adData?.totals;
  const adChartData = adItems.slice(0, 10).map((item) => ({
    name: item.headline || item.sourceId || "Sin ID",
    clicks: item.clicks,
    leads: item.uniqueLeads,
    conversions: item.conversions,
  }));

  return (
    <section className="space-y-4">
      <div className="page-header">
        <h2>Reportes</h2>
        <p className="muted">Ventas, conversiones y rendimiento de anuncios</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
          <CardDescription>
            Refina el analisis por periodo, WhatsApp y flow
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
                label: "Conversion",
                value: pct(kpis.conversionRate),
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
            <CardTitle>Distribucion por instancia</CardTitle>
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

      {/* ── Ad Performance Section ──────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Rendimiento de anuncios</CardTitle>
          <CardDescription>
            Metricas de anuncios Click-to-WhatsApp (CTWA) en el periodo
            seleccionado
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {adLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : adTotals && adTotals.clicks > 0 ? (
            <>
              <div className="grid gap-3 md:grid-cols-5">
                {[
                  {
                    label: "Clics totales",
                    value: adTotals.clicks.toLocaleString("es-CO"),
                  },
                  {
                    label: "Leads unicos",
                    value: adTotals.uniqueLeads.toLocaleString("es-CO"),
                  },
                  {
                    label: "Conversiones",
                    value: adTotals.conversions.toLocaleString("es-CO"),
                  },
                  { label: "Ingresos ads", value: money(adTotals.revenue) },
                  {
                    label: "Tasa conversion",
                    value: pct(adTotals.conversionRate),
                  },
                ].map((kpi) => (
                  <div key={kpi.label} className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">{kpi.label}</p>
                    <p className="text-lg font-semibold">{kpi.value}</p>
                  </div>
                ))}
              </div>

              <div className="grid gap-3 lg:grid-cols-2">
                <Card className="border-0 shadow-none">
                  <CardHeader className="pb-2 px-0">
                    <CardTitle className="text-base">
                      Comparativa por anuncio
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-0">
                    <ChartContainer
                      config={{
                        clicks: { label: "Clics", color: "#3b82f6" },
                        leads: { label: "Leads", color: "#22c55e" },
                        conversions: {
                          label: "Conversiones",
                          color: "#f59e0b",
                        },
                      }}
                      className="h-64 w-full"
                    >
                      <BarChart data={adChartData}>
                        <CartesianGrid vertical={false} />
                        <XAxis dataKey="name" hide />
                        <YAxis />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <ChartLegend content={<ChartLegendContent />} />
                        <Bar
                          dataKey="clicks"
                          fill="var(--color-clicks)"
                          radius={[4, 4, 0, 0]}
                        />
                        <Bar
                          dataKey="leads"
                          fill="var(--color-leads)"
                          radius={[4, 4, 0, 0]}
                        />
                        <Bar
                          dataKey="conversions"
                          fill="var(--color-conversions)"
                          radius={[4, 4, 0, 0]}
                        />
                      </BarChart>
                    </ChartContainer>
                  </CardContent>
                </Card>

                <Card className="border-0 shadow-none">
                  <CardHeader className="pb-2 px-0">
                    <CardTitle className="text-base">
                      Distribucion de clics
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-0">
                    <ChartContainer
                      config={{ clicks: { label: "Clics", color: "#8b5cf6" } }}
                      className="h-64 w-full"
                    >
                      <PieChart>
                        <Pie
                          data={adChartData}
                          dataKey="clicks"
                          nameKey="name"
                          outerRadius={90}
                          label={({
                            name,
                            percent,
                          }: {
                            name?: string;
                            percent?: number;
                          }) => {
                            const n = name ?? "";
                            const p = percent ?? 0;
                            return `${n.slice(0, 12)}${n.length > 12 ? "..." : ""} ${(p * 100).toFixed(0)}%`;
                          }}
                          labelLine={false}
                        >
                          {adChartData.map((_, i) => (
                            <Cell
                              key={i}
                              fill={AD_BAR_COLORS[i % AD_BAR_COLORS.length]}
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value) =>
                            typeof value === "number"
                              ? value.toLocaleString("es-CO")
                              : String(value)
                          }
                        />
                      </PieChart>
                    </ChartContainer>
                  </CardContent>
                </Card>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Anuncio</TableHead>
                    <TableHead>ID fuente</TableHead>
                    <TableHead className="text-right">Clics</TableHead>
                    <TableHead className="text-right">Leads</TableHead>
                    <TableHead className="text-right">Conversiones</TableHead>
                    <TableHead className="text-right">Ingresos</TableHead>
                    <TableHead className="text-right">Conversion</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {adItems.map((item, idx) => (
                    <TableRow key={item.sourceId ?? idx}>
                      <TableCell className="font-medium max-w-[200px] truncate">
                        {item.headline || "-"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[120px] truncate">
                        {item.sourceId || "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        {item.clicks.toLocaleString("es-CO")}
                      </TableCell>
                      <TableCell className="text-right">
                        {item.uniqueLeads.toLocaleString("es-CO")}
                      </TableCell>
                      <TableCell className="text-right">
                        {item.conversions.toLocaleString("es-CO")}
                      </TableCell>
                      <TableCell className="text-right">
                        {money(item.revenue)}
                      </TableCell>
                      <TableCell className="text-right">
                        {pct(item.conversionRate)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {adItems.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="text-center text-muted-foreground"
                      >
                        No hay datos de anuncios para este periodo.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">
              No se han registrado clics de anuncios CTWA en este periodo.
              Cuando los usuarios lleguen desde anuncios de Click-to-WhatsApp,
              las metricas apareceran aqui.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── Sales Detail Table ─────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Detalle de ventas</CardTitle>
          <CardDescription>Dataset filtrado con paginacion</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Telefono</TableHead>
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
