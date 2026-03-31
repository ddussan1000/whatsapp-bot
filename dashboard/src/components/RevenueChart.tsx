import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { RangePoint } from "../types/api";

export function RevenueChart({ data }: { data: RangePoint[] }) {
  return (
    <div className="card chart-card">
      <h3>Ingresos por día</h3>
      <div style={{ width: "100%", height: 280 }}>
        <ResponsiveContainer>
          <BarChart data={data}>
            <XAxis dataKey="date" />
            <YAxis tickFormatter={(v) => `$${Math.round(Number(v) / 1000)}k`} />
            <Tooltip
              formatter={(v) => `$${Number(v).toLocaleString("es-CO")}`}
            />
            <Bar dataKey="total" fill="#22c55e" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
