"use client";

import { useEffect, useState } from "react";
import { MapPin, Clock, TrendingUp, RefreshCw } from "lucide-react";
import { getPrediction, type Route, type Prediction } from "@/lib/api";

const LEVEL_STYLES: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  LOW:      { bg: "bg-green-950",  text: "text-green-400",  dot: "bg-green-400",  label: "Fluido"   },
  MODERATE: { bg: "bg-yellow-950", text: "text-yellow-400", dot: "bg-yellow-400", label: "Moderado" },
  HEAVY:    { bg: "bg-orange-950", text: "text-orange-400", dot: "bg-orange-400", label: "Pesado"   },
  SEVERE:   { bg: "bg-red-950",    text: "text-red-400",    dot: "bg-red-500",    label: "Severo"   },
};

export default function RouteCard({ route }: { route: Route }) {
  const [pred, setPred] = useState<Prediction | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const fetchPrediction = async () => {
    setLoading(true);
    try {
      const data = await getPrediction(route.id);
      setPred(data);
      setLastUpdate(new Date());
    } catch {
      // silencioso
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPrediction();
    const interval = setInterval(fetchPrediction, 60_000); // refresca cada 1 min
    return () => clearInterval(interval);
  }, [route.id]);

  const level = pred?.traffic_level ?? "LOW";
  const styles = LEVEL_STYLES[level] ?? LEVEL_STYLES.LOW;

  return (
    <div className={`rounded-2xl border border-white/10 p-5 ${styles.bg} transition-all`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className={`w-2.5 h-2.5 rounded-full ${styles.dot} animate-pulse`} />
            <span className={`text-xs font-semibold uppercase tracking-widest ${styles.text}`}>
              {styles.label}
            </span>
          </div>
          <h3 className="text-white font-bold text-lg leading-tight">{route.label}</h3>
        </div>
        <button
          onClick={fetchPrediction}
          className="text-white/40 hover:text-white transition-colors"
          title="Actualizar"
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Métricas */}
      {pred && pred.models_loaded ? (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <Clock size={16} className="text-white/50 shrink-0" />
            <div>
              <span className="text-white font-bold text-2xl">
                {pred.predicted_duration_min?.toFixed(0)} min
              </span>
              {(pred.delay_min ?? 0) > 0 && (
                <span className="text-orange-400 text-sm ml-2">
                  +{pred.delay_min} min extra
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <TrendingUp size={16} className="text-white/50 shrink-0" />
            <span className="text-white/70 text-sm">
              Confianza: {((pred.confidence ?? 0) * 100).toFixed(0)}%
            </span>
          </div>

          <div className="flex items-start gap-3 mt-2">
            <MapPin size={16} className="text-white/50 shrink-0 mt-0.5" />
            <p className="text-white/80 text-sm leading-snug">{pred.advice}</p>
          </div>

          {route.typical_departure_time && (
            <div className="mt-3 pt-3 border-t border-white/10 text-white/40 text-xs">
              Salida habitual: {route.typical_departure_time}
            </div>
          )}
        </div>
      ) : (
        <div className="text-white/40 text-sm py-4 text-center">
          {loading ? "Consultando..." : "Modelos no entrenados aún"}
        </div>
      )}

      {lastUpdate && (
        <div className="mt-3 text-white/25 text-xs text-right">
          Actualizado {lastUpdate.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}
        </div>
      )}
    </div>
  );
}
