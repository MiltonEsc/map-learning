"use client";

import { useEffect, useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { RefreshCw } from "lucide-react";
import { getHistory, type Route } from "@/lib/api";

interface ChartPoint {
  time: string;
  minutos: number;
  nivel: string;
}

const LEVEL_COLORS: Record<string, string> = {
  LOW: "#4ade80",
  MODERATE: "#facc15",
  HEAVY: "#fb923c",
  SEVERE: "#f87171",
};

export default function TrafficChart({ route }: { route: Route }) {
  const [data, setData] = useState<ChartPoint[]>([]);
  const [days, setDays] = useState(1);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const fetchHistory = () => {
    setLoading(true);
    getHistory(route.id, days)
      .then((h) => {
        const points = h.records
          .slice()
          .reverse()
          .map((r) => ({
            time: new Date(r.captured_at).toLocaleTimeString("es-CO", {
              hour: "2-digit",
              minute: "2-digit",
            }),
            minutos: Math.round(r.duration_in_traffic_sec / 60),
            nivel: r.traffic_level,
          }));
        setData(points);
        setLastUpdate(new Date());
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchHistory();
    const interval = setInterval(fetchHistory, 60_000);
    return () => clearInterval(interval);
  }, [route.id, days]);

  const CustomDot = (props: any) => {
    const { cx, cy, payload } = props;
    const color = LEVEL_COLORS[payload.nivel] ?? "#6b7280";
    return <circle cx={cx} cy={cy} r={3} fill={color} stroke="none" />;
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-zinc-900 p-5">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-white font-semibold">{route.label}</h3>
          <p className="text-white/40 text-xs mt-0.5">
            Historial de duración con tráfico
            {lastUpdate && (
              <span className="ml-2 text-white/25">
                · {lastUpdate.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchHistory}
            className="text-white/30 hover:text-white transition-colors"
            title="Actualizar"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
          <div className="flex gap-1">
            {[1, 3, 7].map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                  days === d
                    ? "bg-blue-600 text-white"
                    : "bg-white/5 text-white/50 hover:bg-white/10"
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="h-48 flex items-center justify-center text-white/30 text-sm">
          Cargando datos...
        </div>
      ) : data.length === 0 ? (
        <div className="h-48 flex items-center justify-center text-white/30 text-sm">
          Sin datos para este período
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={data} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
            <defs>
              <linearGradient id={`grad-${route.id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff0a" />
            <XAxis
              dataKey="time"
              tick={{ fill: "#ffffff40", fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fill: "#ffffff40", fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              unit=" min"
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#18181b",
                border: "1px solid #ffffff15",
                borderRadius: "8px",
                color: "#fff",
                fontSize: 12,
              }}
              formatter={(val: number, _: string, entry: any) => [
                `${val} min`,
                `Tráfico: ${entry.payload.nivel}`,
              ]}
            />
            <Area
              type="monotone"
              dataKey="minutos"
              stroke="#3b82f6"
              strokeWidth={2}
              fill={`url(#grad-${route.id})`}
              dot={<CustomDot />}
              activeDot={{ r: 5, fill: "#3b82f6" }}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}

      {/* Leyenda niveles */}
      <div className="flex gap-4 mt-3 flex-wrap">
        {Object.entries(LEVEL_COLORS).map(([nivel, color]) => (
          <div key={nivel} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-white/40 text-xs">{nivel}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
