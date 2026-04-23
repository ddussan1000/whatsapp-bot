import { useMemo, useState } from "react";
import { Check, Pencil, Send, X } from "lucide-react";
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  useAdReferralsQuery,
  useExportToReportingMutation,
  useFlowsV2Query,
  useInstanceExternalAccountsQuery,
  useInstancesQuery,
  useReportsQuery,
  usePaymentsQuery,
  useUpdatePaymentAmountMutation,
  useUpdatePaymentStateMutation,
} from "../lib/hooks";

// ── Stage label normalization ─────────────────────────────────────────────

const STAGE_LABELS: Record<string, string> = {
  // current stages
  en_flujo: "En flujo",
  flujo_terminado: "Flujo terminado",
  pago_confirmado: "Pago confirmado",
  revision_manual: "Revisión manual",
  // legacy stages kept for old data
  flow_started: "En flujo",
  confirmar_comprobante: "En revisión",
  interesado: "Interesado",
  listo_pagar: "Listo para pagar",
  necesita_agente: "Necesita agente",
  post_venta: "Post venta",
};

function stageLabel(stage: string): string {
  return (
    STAGE_LABELS[stage] ??
    stage.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

function mergeFunnelByLabel(
  funnel: { stage: string; count: number }[]
): { stage: string; count: number }[] {
  const merged = new Map<string, number>();
  for (const entry of funnel) {
    const label = stageLabel(entry.stage);
    merged.set(label, (merged.get(label) ?? 0) + entry.count);
  }
  return Array.from(merged.entries())
    .map(([stage, count]) => ({ stage, count }))
    .sort((a, b) => b.count - a.count);
}

// Custom YAxis tick that wraps long text into two lines via SVG tspan
function FunnelYAxisTick({
  x,
  y,
  payload,
}: {
  x?: number;
  y?: number;
  payload?: { value: string };
}) {
  const label = payload?.value ?? "";
  const words = label.split(" ");
  // Split into at most 2 lines at the midpoint
  const mid = Math.ceil(words.length / 2);
  const line1 = words.slice(0, mid).join(" ");
  const line2 = words.length > 1 ? words.slice(mid).join(" ") : "";
  const lineHeight = 13;
  const offsetY = line2 ? -lineHeight / 2 : 0;

  return (
    <g transform={`translate(${x ?? 0},${y ?? 0})`}>
      <text
        x={-6}
        y={0}
        textAnchor="end"
        fill="currentColor"
        fontSize={11}
        dominantBaseline="middle"
      >
        <tspan x={-6} dy={offsetY}>
          {line1}
        </tspan>
        {line2 && (
          <tspan x={-6} dy={lineHeight}>
            {line2}
          </tspan>
        )}
      </text>
    </g>
  );
}

function toIsoStart(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0).toISOString();
}
function toIsoEnd(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999).toISOString();
}
function dateInputValue(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function money(value: number, currency = "COP") {
  return value.toLocaleString("es-CO", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  });
}
function pct(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}
// Short currency for chart axis/labels (e.g. "$1.5M", "$300k", "$50k")
function moneyShort(value: number) {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}k`;
  return `$${value}`;
}
// Format ISO bucket date as "26 mar" or "mar 26"
function formatBucket(tick: string) {
  if (!tick) return "";
  const d = new Date(tick);
  if (isNaN(d.getTime())) return tick;
  return d.toLocaleDateString("es-CO", { day: "2-digit", month: "short" });
}
// Truncate long label for Y axis
function truncateLabel(v: string, max = 14) {
  return v.length > max ? v.slice(0, max) + "…" : v;
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

function paymentStateLabel(state: string | null | undefined): string {
  if (state === "pending_manual_review") return "Pendiente";
  if (state === "validated") return "Validado";
  if (state === "rejected") return "Rechazado";
  return state ?? "-";
}

function paymentStateColor(state: string | null | undefined): string {
  if (state === "pending_manual_review") return "text-amber-600";
  if (state === "validated") return "text-green-600";
  if (state === "rejected") return "text-red-600";
  return "text-muted-foreground";
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

  // Pagos tab state
  const [paymentsStateFilter, setPaymentsStateFilter] = useState<string>("all");
  const [paymentsPage, setPaymentsPage] = useState(1);
  const paymentsPageSize = 20;

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

  const paymentsQueryParams = useMemo(
    () => ({
      page: paymentsPage,
      pageSize: paymentsPageSize,
      state: paymentsStateFilter === "all" ? undefined : paymentsStateFilter,
      from: toIsoStart(fromDate),
      to: toIsoEnd(toDate),
      flowId: flowId === "all" ? undefined : flowId,
      instanceId: instanceId === "all" ? undefined : instanceId,
    }),
    [paymentsPage, paymentsStateFilter, fromDate, toDate, flowId, instanceId]
  );

  const { data, isLoading, isFetching, isError, refetch } =
    useReportsQuery(queryParams);
  const { data: adData, isLoading: adLoading } =
    useAdReferralsQuery(adQueryParams);
  const { data: instances = [] } = useInstancesQuery();
  const { data: flows = [] } = useFlowsV2Query();
  const { data: paymentsData, isLoading: paymentsLoading } =
    usePaymentsQuery(paymentsQueryParams);
  const updatePaymentState = useUpdatePaymentStateMutation();
  const updatePaymentAmount = useUpdatePaymentAmountMutation();
  const [editingAmountId, setEditingAmountId] = useState<string | null>(null);
  const [amountDraft, setAmountDraft] = useState("");

  // Export modal state
  const [exportOpen, setExportOpen] = useState(false);
  const [exportInstanceId, setExportInstanceId] = useState<string>("");
  const [exportDate, setExportDate] = useState(
    () => dateInputValue(new Date(Date.now() - 86400000))
  );
  const [exportAccountName, setExportAccountName] = useState<string>("");
  const [exportIncludeMetaSpend, setExportIncludeMetaSpend] = useState(false);

  const loading = isLoading || isFetching;

  // Derive display currency from instance selection.
  // Single instance → use its currency. All instances → use common currency if uniform, else null (mixed).
  const displayCurrency = useMemo(() => {
    if (instanceId !== "all") {
      return instances.find((i) => i.id === instanceId)?.currency ?? "COP";
    }
    const unique = [...new Set(instances.map((i) => i.currency ?? "COP"))];
    return unique.length === 1 ? unique[0] : unique.length === 0 ? "COP" : null;
  }, [instanceId, instances]);

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

  const payments = paymentsData?.items ?? [];
  const paymentsTotal = paymentsData?.total ?? 0;

  const exportableInstances = instances.filter(
    (i) => i.external_reporting_configured
  );
  const selectedExportInstance = instances.find(
    (i) => i.id === exportInstanceId
  );
  const { data: exportAccounts = [] } =
    useInstanceExternalAccountsQuery(exportInstanceId || null);
  const exportToReporting = useExportToReportingMutation();

  return (
    <section className="flex flex-col gap-3 p-3 sm:gap-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Reportes</h2>
          <p className="text-sm text-muted-foreground">
            Ventas, conversiones y rendimiento de anuncios
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={exportCsv} size="sm" variant="outline">
            Exportar CSV
          </Button>
          {exportableInstances.length > 0 && (
            <Button
              size="sm"
              onClick={() => setExportOpen(true)}
            >
              <Send size={14} className="mr-1.5" />
              Exportar a Reportes
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filtros</CardTitle>
          <CardDescription>
            Refina el análisis por periodo, WhatsApp y flujo
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          {/* Date range */}
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="date"
              className="h-9 rounded-md border bg-background px-3 text-sm"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
            <span className="text-muted-foreground text-xs">—</span>
            <input
              type="date"
              className="h-9 rounded-md border bg-background px-3 text-sm"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </div>

          <Select
            value={instanceId}
            onValueChange={(v) => {
              setInstanceId(v);
              setPage(1);
              setPaymentsPage(1);
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

          <Select
            value={flowId}
            onValueChange={(v) => {
              setFlowId(v);
              setPage(1);
              setPaymentsPage(1);
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

          <Select
            value={granularity}
            onValueChange={(v: "day" | "week" | "month") => setGranularity(v)}
          >
            <SelectTrigger className="h-9 w-36 text-sm">
              <SelectValue placeholder="Granularidad" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">Diario</SelectItem>
              <SelectItem value="week">Semanal</SelectItem>
              <SelectItem value="month">Mensual</SelectItem>
            </SelectContent>
          </Select>

          {/* Quick date presets */}
          <div className="flex gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-9 text-xs"
              onClick={() => {
                setFromDate(dateInputValue(new Date()));
                setToDate(dateInputValue(new Date()));
              }}
            >
              Hoy
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-9 text-xs"
              onClick={() => {
                setFromDate(
                  dateInputValue(new Date(Date.now() - 7 * 86400000))
                );
                setToDate(dateInputValue(new Date()));
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
                  dateInputValue(new Date(Date.now() - 30 * 86400000))
                );
                setToDate(dateInputValue(new Date()));
              }}
            >
              30d
            </Button>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="resumen">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="resumen">Resumen</TabsTrigger>
          <TabsTrigger value="pagos">Pagos</TabsTrigger>
          <TabsTrigger value="anuncios">Anuncios</TabsTrigger>
        </TabsList>

        {/* ── Resumen Tab ────────────────────────────────────────────────── */}
        <TabsContent value="resumen" className="flex flex-col gap-3 mt-3">
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

          {displayCurrency === null && !loading && (
            <p className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md px-3 py-2">
              Monedas mixtas — las instancias usan distintas divisas. Los totales
              agregados combinan monedas; filtra por instancia para ver ingresos
              precisos.
            </p>
          )}

          <div className="grid gap-3 md:grid-cols-5">
            {loading || !kpis
              ? Array.from({ length: 5 }).map((_, idx) => (
                  <Skeleton key={idx} className="h-24 w-full" />
                ))
              : [
                  {
                    label: "Ingresos",
                    value: money(kpis.revenueTotal, displayCurrency ?? "COP"),
                  },
                  {
                    label: "Ventas",
                    value: kpis.salesCount.toLocaleString("es-CO"),
                  },
                  {
                    label: "Ticket promedio",
                    value: money(kpis.avgTicket, displayCurrency ?? "COP"),
                  },
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
                      adSpend: { label: "Gasto ads", color: "#f97316" },
                    }}
                    className="h-72 w-full"
                  >
                    <AreaChart
                      data={data?.timeseries ?? []}
                      margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
                    >
                      <CartesianGrid vertical={false} />
                      <XAxis
                        dataKey="bucket"
                        tickFormatter={formatBucket}
                        tick={{ fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        tickFormatter={moneyShort}
                        tick={{ fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                        width={52}
                      />
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
                      {data?.timeseries?.some((p) => p.adSpend != null) && (
                        <Area
                          type="monotone"
                          dataKey="adSpend"
                          stroke="var(--color-adSpend)"
                          fill="var(--color-adSpend)"
                          fillOpacity={0.15}
                        />
                      )}
                    </AreaChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>
            <Card className="flex flex-col">
              <CardHeader>
                <CardTitle>Embudo por etapa</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col flex-1 min-h-0">
                {loading ? (
                  <Skeleton className="flex-1 min-h-[180px]" />
                ) : (
                  <ChartContainer
                    config={{
                      count: { label: "Conversaciones", color: "#f59e0b" },
                    }}
                    className="flex-1 min-h-[120px] w-full"
                  >
                    <BarChart
                      data={mergeFunnelByLabel(data?.funnel ?? [])}
                      layout="vertical"
                      margin={{ top: 4, right: 36, bottom: 4, left: 0 }}
                      barSize={22}
                      barCategoryGap="30%"
                    >
                      <CartesianGrid horizontal={false} />
                      <XAxis
                        type="number"
                        allowDecimals={false}
                        tick={{ fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        type="category"
                        dataKey="stage"
                        width={120}
                        tick={<FunnelYAxisTick />}
                      />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const item = payload[0];
                          return (
                            <div className="rounded-lg border bg-background px-3 py-2 shadow-sm text-sm">
                              <p className="font-medium text-foreground mb-1">
                                {item?.payload?.stage ?? ""}
                              </p>
                              <p className="text-muted-foreground">
                                Conversaciones:{" "}
                                <span className="font-semibold text-foreground">
                                  {item?.value}
                                </span>
                              </p>
                            </div>
                          );
                        }}
                      />
                      <Bar dataKey="count" fill="var(--color-count)" radius={4}>
                        <LabelList
                          dataKey="count"
                          position="right"
                          style={{ fontSize: 11 }}
                        />
                      </Bar>
                    </BarChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <Card className="flex flex-col">
              <CardHeader>
                <CardTitle>Ingresos por flujo</CardTitle>
                <CardDescription>
                  Cuánto genera cada flujo de ventas
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col flex-1 min-h-0">
                {loading ? (
                  <Skeleton className="flex-1 min-h-[180px]" />
                ) : (data?.byFlow ?? []).length === 0 ? (
                  <div className="flex flex-1 min-h-[80px] items-center justify-center text-sm text-muted-foreground">
                    Sin datos para el periodo seleccionado
                  </div>
                ) : (
                  <ChartContainer
                    config={{
                      revenue: { label: "Ingresos", color: "#8b5cf6" },
                      sales: { label: "Ventas", color: "#e9d5ff" },
                    }}
                    className="flex-1 min-h-[120px] w-full"
                  >
                    <BarChart
                      data={data?.byFlow ?? []}
                      layout="vertical"
                      margin={{ top: 4, right: 56, bottom: 4, left: 0 }}
                      barSize={22}
                      barCategoryGap="30%"
                    >
                      <CartesianGrid horizontal={false} />
                      <XAxis type="number" hide />
                      <YAxis
                        type="category"
                        dataKey="label"
                        width={100}
                        tick={{ fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v: string) => truncateLabel(v, 13)}
                      />
                      <ChartTooltip
                        content={<ChartTooltipContent />}
                        formatter={(value) => [
                          typeof value === "number"
                            ? money(value, displayCurrency ?? "COP")
                            : String(value),
                          "Ingresos",
                        ]}
                      />
                      <Bar
                        dataKey="revenue"
                        fill="var(--color-revenue)"
                        radius={4}
                      >
                        <LabelList
                          dataKey="revenue"
                          position="right"
                          style={{ fontSize: 11 }}
                          formatter={(v) =>
                            typeof v === "number"
                              ? moneyShort(v)
                              : String(v ?? "")
                          }
                        />
                      </Bar>
                    </BarChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Distribución por instancia</CardTitle>
                <CardDescription>
                  Ingresos generados por cada número de WhatsApp
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <Skeleton className="h-72 w-full" />
                ) : (data?.byInstance ?? []).length === 0 ? (
                  <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
                    Sin datos para el periodo seleccionado
                  </div>
                ) : (
                  <ChartContainer
                    config={{
                      revenue: { label: "Ingresos", color: "#06b6d4" },
                    }}
                    className="h-72 w-full"
                  >
                    <PieChart>
                      <Pie
                        data={(data?.byInstance ?? []).map((item, i) => ({
                          ...item,
                          fill: AD_BAR_COLORS[i % AD_BAR_COLORS.length],
                        }))}
                        dataKey="revenue"
                        nameKey="label"
                        outerRadius={95}
                        innerRadius={40}
                        paddingAngle={3}
                      />
                      <Tooltip
                        formatter={(value, name) => [
                          typeof value === "number"
                            ? money(value, displayCurrency ?? "COP")
                            : String(value),
                          name,
                        ]}
                      />
                      <ChartLegend content={<ChartLegendContent />} />
                    </PieChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Pagos Tab ─────────────────────────────────────────────────── */}
        <TabsContent value="pagos" className="mt-3">
          <Card>
            <CardHeader>
              <CardTitle>Pagos</CardTitle>
              <CardDescription>
                Gestiona y actualiza el estado de cada pago
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Select
                  value={paymentsStateFilter}
                  onValueChange={(v) => {
                    setPaymentsStateFilter(v);
                    setPaymentsPage(1);
                  }}
                >
                  <SelectTrigger className="h-9 w-52 text-sm">
                    <SelectValue placeholder="Estado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los estados</SelectItem>
                    <SelectItem value="pending_manual_review">
                      Pendiente
                    </SelectItem>
                    <SelectItem value="validated">Validado</SelectItem>
                    <SelectItem value="rejected">Rechazado</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Telefono</TableHead>
                    <TableHead>Flujo</TableHead>
                    <TableHead>Instancia</TableHead>
                    <TableHead>Monto</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paymentsLoading ? (
                    Array.from({ length: 8 }).map((_, idx) => (
                      <TableRow key={idx}>
                        <TableCell colSpan={6}>
                          <Skeleton className="h-5 w-full" />
                        </TableCell>
                      </TableRow>
                    ))
                  ) : payments.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="text-center text-muted-foreground"
                      >
                        No hay pagos para estos filtros.
                      </TableCell>
                    </TableRow>
                  ) : (
                    payments.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell>
                          {p.validated_at
                            ? new Date(p.validated_at).toLocaleString("es-CO")
                            : p.receipt_date
                              ? new Date(p.receipt_date).toLocaleString("es-CO")
                              : "-"}
                        </TableCell>
                        <TableCell>{p.phone}</TableCell>
                        <TableCell>{p.flow_name ?? "-"}</TableCell>
                        <TableCell>{p.instance_label ?? "-"}</TableCell>
                        <TableCell>
                          {editingAmountId === p.id ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                min={1}
                                autoFocus
                                disabled={updatePaymentAmount.isPending}
                                className="h-7 w-28 rounded-md border bg-background px-2 text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none disabled:opacity-50"
                                value={amountDraft}
                                onChange={(e) => setAmountDraft(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    const v = parseFloat(amountDraft);
                                    if (!isNaN(v) && v > 0) {
                                      updatePaymentAmount.mutate(
                                        { id: p.id, amount: v },
                                        {
                                          onSuccess: () => {
                                            setEditingAmountId(null);
                                            toast.success("Monto actualizado");
                                          },
                                        }
                                      );
                                    } else {
                                      toast.error("El monto debe ser un número positivo");
                                    }
                                  }
                                  if (e.key === "Escape" && !updatePaymentAmount.isPending)
                                    setEditingAmountId(null);
                                }}
                              />
                              <button
                                className="text-primary hover:opacity-70 disabled:opacity-40"
                                disabled={updatePaymentAmount.isPending}
                                onClick={() => {
                                  const v = parseFloat(amountDraft);
                                  if (!isNaN(v) && v > 0) {
                                    updatePaymentAmount.mutate(
                                      { id: p.id, amount: v },
                                      {
                                        onSuccess: () => {
                                          setEditingAmountId(null);
                                          toast.success("Monto actualizado");
                                        },
                                      }
                                    );
                                  } else {
                                    toast.error("El monto debe ser un número positivo");
                                  }
                                }}
                              >
                                <Check size={13} />
                              </button>
                              <button
                                className="text-muted-foreground hover:opacity-70 disabled:opacity-40"
                                disabled={updatePaymentAmount.isPending}
                                onClick={() => setEditingAmountId(null)}
                              >
                                <X size={13} />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 group/amount">
                              <span>
                                {p.amount != null
                                  ? money(p.amount, p.currency ?? displayCurrency ?? "COP")
                                  : "-"}
                              </span>
                              <button
                                className="opacity-0 group-hover/amount:opacity-100 text-muted-foreground hover:text-foreground transition-opacity"
                                onClick={() => {
                                  setAmountDraft(String(p.amount ?? ""));
                                  setEditingAmountId(p.id);
                                }}
                              >
                                <Pencil size={11} />
                              </button>
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Select
                            value={p.state ?? ""}
                            onValueChange={(newState) =>
                              updatePaymentState.mutate({
                                id: p.id,
                                state: newState,
                              })
                            }
                          >
                            <SelectTrigger className="h-8 w-44 text-sm border-0 shadow-none p-0 focus:ring-0">
                              <SelectValue>
                                <span
                                  className={`font-medium ${paymentStateColor(p.state)}`}
                                >
                                  {paymentStateLabel(p.state)}
                                </span>
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pending_manual_review">
                                <span className="text-amber-600 font-medium">
                                  Pendiente
                                </span>
                              </SelectItem>
                              <SelectItem value="validated">
                                <span className="text-green-600 font-medium">
                                  Validado
                                </span>
                              </SelectItem>
                              <SelectItem value="rejected">
                                <span className="text-red-600 font-medium">
                                  Rechazado
                                </span>
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>

              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Total: {paymentsTotal}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    disabled={paymentsPage <= 1}
                    onClick={() => setPaymentsPage((p) => p - 1)}
                  >
                    Anterior
                  </Button>
                  <Button
                    variant="outline"
                    disabled={paymentsPage * paymentsPageSize >= paymentsTotal}
                    onClick={() => setPaymentsPage((p) => p + 1)}
                  >
                    Siguiente
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Anuncios Tab ──────────────────────────────────────────────── */}
        <TabsContent value="anuncios" className="mt-3">
          <Card>
            <CardHeader>
              <CardTitle>Rendimiento de anuncios</CardTitle>
              <CardDescription>
                Metricas de anuncios Click-to-WhatsApp (CTWA) en el periodo
                seleccionado
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Meta Ads spend KPIs — shown when configured on any instance */}
              {!loading && kpis?.adSpendTotal != null && (
                <div className="grid gap-3 md:grid-cols-2">
                  {[
                    {
                      label: "Gasto Meta Ads",
                      value: money(kpis.adSpendTotal, displayCurrency ?? "COP"),
                    },
                    {
                      label: "ROAS",
                      value:
                        kpis.roas != null
                          ? `${kpis.roas.toFixed(2)}x`
                          : "—",
                    },
                  ].map((kpi) => (
                    <div
                      key={kpi.label}
                      className="rounded-lg border border-orange-200 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-800 p-3"
                    >
                      <p className="text-xs text-muted-foreground">
                        {kpi.label}
                      </p>
                      <p className="text-lg font-semibold">{kpi.value}</p>
                    </div>
                  ))}
                </div>
              )}

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
                      {
                        label: "Ingresos ads",
                        value: money(adTotals.revenue, displayCurrency ?? "COP"),
                      },
                      {
                        label: "Tasa conversion",
                        value: pct(adTotals.conversionRate),
                      },
                    ].map((kpi) => (
                      <div key={kpi.label} className="rounded-lg border p-3">
                        <p className="text-xs text-muted-foreground">
                          {kpi.label}
                        </p>
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
                          <BarChart
                            data={adChartData}
                            margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
                          >
                            <CartesianGrid vertical={false} />
                            <XAxis dataKey="name" hide />
                            <YAxis
                              allowDecimals={false}
                              tick={{ fontSize: 11 }}
                              tickLine={false}
                              axisLine={false}
                              width={36}
                            />
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
                          config={{
                            clicks: { label: "Clics", color: "#8b5cf6" },
                          }}
                          className="h-64 w-full"
                        >
                          <PieChart>
                            <Pie
                              data={adChartData.map((item, i) => ({
                                ...item,
                                fill: AD_BAR_COLORS[i % AD_BAR_COLORS.length],
                              }))}
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
                            />
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
                        <TableHead className="text-right">
                          Conversiones
                        </TableHead>
                        <TableHead className="text-right">Ingresos</TableHead>
                        <TableHead className="text-right">Conversion</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {adItems.map((item, idx) => (
                        <TableRow key={item.sourceId ?? idx}>
                          <TableCell className="font-medium max-w-50 truncate">
                            {item.headline || "-"}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-30 truncate">
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
                            {money(item.revenue, displayCurrency ?? "COP")}
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
                  Cuando los usuarios lleguen desde anuncios de
                  Click-to-WhatsApp, las metricas apareceran aqui.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Export to Reporting Modal ───────────────────────────────────── */}
      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Exportar a sistema de reportes</DialogTitle>
            <DialogDescription>
              Envía los pagos validados del día seleccionado a la plataforma
              externa de reportes.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="export-instance">Instancia de WhatsApp</Label>
              <Select
                value={exportInstanceId}
                onValueChange={(v) => {
                  setExportInstanceId(v);
                  setExportAccountName("");
                  setExportIncludeMetaSpend(false);
                }}
              >
                <SelectTrigger id="export-instance" className="h-9 text-sm">
                  <SelectValue placeholder="Seleccionar instancia…" />
                </SelectTrigger>
                <SelectContent>
                  {exportableInstances.map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="export-date">Fecha</Label>
              <Input
                id="export-date"
                type="date"
                className="h-9 text-sm"
                value={exportDate}
                onChange={(e) => setExportDate(e.target.value)}
              />
            </div>

            {exportInstanceId && (
              <div className="space-y-1.5">
                <Label htmlFor="export-account">Cuenta en sistema externo</Label>
                <Select
                  value={exportAccountName}
                  onValueChange={setExportAccountName}
                  disabled={exportAccounts.length === 0}
                >
                  <SelectTrigger id="export-account" className="h-9 text-sm">
                    <SelectValue
                      placeholder={
                        exportAccounts.length === 0
                          ? "Cargando cuentas…"
                          : "Seleccionar cuenta…"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {exportAccounts.map((a) => (
                      <SelectItem key={a.account_name} value={a.account_name}>
                        {a.account_name}
                        {a.has_sheet ? "" : " (sin hoja)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {selectedExportInstance?.meta_ads_account_id && (
              <div className="flex items-center justify-between">
                <Label htmlFor="export-meta-spend" className="cursor-pointer">
                  Incluir gasto de Meta Ads
                </Label>
                <Switch
                  id="export-meta-spend"
                  checked={exportIncludeMetaSpend}
                  onCheckedChange={setExportIncludeMetaSpend}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setExportOpen(false)}
              disabled={exportToReporting.isPending}
            >
              Cancelar
            </Button>
            <Button
              disabled={
                !exportInstanceId ||
                !exportDate ||
                !exportAccountName ||
                exportToReporting.isPending
              }
              loading={exportToReporting.isPending}
              onClick={() => {
                exportToReporting.mutate(
                  {
                    date: exportDate,
                    instance_id: exportInstanceId,
                    account_name: exportAccountName,
                    currency:
                      selectedExportInstance?.currency ?? "COP",
                    include_meta_spend: exportIncludeMetaSpend,
                  },
                  {
                    onSuccess: (result) => {
                      setExportOpen(false);
                      if (result.warnings?.length) {
                        toast.warning(
                          `Exportado con advertencias: ${result.warnings.join(", ")}`
                        );
                      } else {
                        toast.success("Exportado exitosamente");
                      }
                    },
                    onError: (err) => {
                      toast.error(
                        err instanceof Error
                          ? err.message
                          : "Error al exportar"
                      );
                    },
                  }
                );
              }}
            >
              Exportar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
