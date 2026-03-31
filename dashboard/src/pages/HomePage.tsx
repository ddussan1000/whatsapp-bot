import { StatCard } from "../components/StatCard";
import { useTodayStatsQuery } from "../lib/hooks";

export function HomePage() {
  const { data: stats, isLoading } = useTodayStatsQuery();
  const total = stats?.total ?? 0;
  const count = stats?.count ?? 0;
  const average = stats?.average ?? 0;

  return (
    <section>
      <h2>Resumen de hoy</h2>
      {isLoading ? <p className="muted">Cargando métricas...</p> : null}
      <div className="grid stats-grid">
        <StatCard
          title="Total ventas"
          value={`$${total.toLocaleString("es-CO")}`}
        />
        <StatCard title="Cantidad pagos" value={String(count)} />
        <StatCard
          title="Ticket promedio"
          value={`$${average.toLocaleString("es-CO")}`}
        />
      </div>
    </section>
  );
}
