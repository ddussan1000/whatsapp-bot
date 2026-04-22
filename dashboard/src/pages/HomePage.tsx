import { useMemo } from "react";
import { StatCard } from "../components/StatCard";
import { useInstancesQuery, useTodayStatsQuery } from "../lib/hooks";

export function HomePage() {
  const { data: stats, isLoading } = useTodayStatsQuery();
  const { data: instances = [] } = useInstancesQuery();
  const total = stats?.total ?? 0;
  const count = stats?.count ?? 0;
  const average = stats?.average ?? 0;

  const displayCurrency = useMemo(() => {
    const unique = [...new Set(instances.map((i) => i.currency ?? "COP"))];
    return unique.length === 1 ? unique[0] : null;
  }, [instances]);

  function money(value: number) {
    if (!displayCurrency) return `$${value.toLocaleString("es-CO")}`;
    return value.toLocaleString("es-CO", {
      style: "currency",
      currency: displayCurrency,
      maximumFractionDigits: 0,
    });
  }

  return (
    <section>
      <h2>Resumen de hoy</h2>
      <div className="grid stats-grid">
        <StatCard
          title="Total ventas"
          value={money(total)}
          loading={isLoading}
        />
        <StatCard
          title="Cantidad pagos"
          value={String(count)}
          loading={isLoading}
        />
        <StatCard
          title="Ticket promedio"
          value={money(average)}
          loading={isLoading}
        />
      </div>
    </section>
  );
}
