"use client";

import { useEffect, useState } from "react";
import RouteCard from "@/components/RouteCard";
import CameraStream from "@/components/CameraStream";
import TrafficChart from "@/components/TrafficChart";
import MapView from "@/components/MapView";
import { Activity, RefreshCw, Navigation } from "lucide-react";
import Link from "next/link";
import { getRoutes, getPrediction, type Route, type Prediction } from "@/lib/api";

export default function Dashboard() {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [predictions, setPredictions] = useState<Record<number, Prediction>>({});
  const [apiOk, setApiOk] = useState(true);
  const [loading, setLoading] = useState(true);

  const fetchRoutes = async () => {
    try {
      const data = await getRoutes();
      setRoutes(data);
      setApiOk(true);
      // Cargar predicciones para el mapa
      const preds: Record<number, Prediction> = {};
      await Promise.all(
        data.map(async (r) => {
          try {
            preds[r.id] = await getPrediction(r.id);
          } catch {}
        })
      );
      setPredictions(preds);
    } catch {
      setApiOk(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRoutes();
    const interval = setInterval(() => {
      // Refrescar solo predicciones cada 60s para mantener el mapa actualizado
      routes.forEach(async (r) => {
        try {
          const pred = await getPrediction(r.id);
          setPredictions((prev) => ({ ...prev, [r.id]: pred }));
        } catch {}
      });
    }, 60_000);
    return () => clearInterval(interval);
  }, [routes.length]);

  return (
    <main className="min-h-screen bg-zinc-950 text-white p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center shrink-0">
          <Activity size={20} />
        </div>
        <div>
          <h1 className="text-xl font-bold">TrafficVoice AI</h1>
          <p className="text-white/40 text-xs">Predicción de tráfico en tiempo real — Barranquilla</p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <button
            onClick={fetchRoutes}
            className="text-white/30 hover:text-white transition-colors"
            title="Recargar rutas"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          </button>
          <Link
            href="/drive"
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors"
          >
            <Navigation size={16} />
            Modo conducción
          </Link>
          <div className="flex items-center gap-2 text-xs text-white/30">
            <span className={`w-2 h-2 rounded-full ${apiOk ? "bg-green-400 animate-pulse" : "bg-red-500"}`} />
            {apiOk ? "En vivo" : "Sin conexión"}
          </div>
        </div>
      </div>

      {!apiOk && (
        <div className="rounded-2xl border border-red-900/40 bg-red-950/30 p-5 mb-6 text-red-400 text-sm">
          No se pudo conectar con la API. Asegúrate de que{" "}
          <code className="bg-red-900/40 px-1.5 py-0.5 rounded font-mono">python main.py</code>{" "}
          esté corriendo en otra terminal.
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-20 text-white/30 text-sm gap-3">
          <RefreshCw size={16} className="animate-spin" />
          Conectando con la API...
        </div>
      )}

      {!loading && (
        <div className="space-y-6">
          {/* Mapa — ancho completo */}
          <MapView routes={routes} predictions={predictions} />

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            {/* Columna izquierda — cámara + tarjetas */}
            <div className="xl:col-span-1 space-y-6">
              <CameraStream />

              <div className="space-y-4">
                <h2 className="text-white/60 text-xs font-semibold uppercase tracking-widest">
                  Predicciones actuales
                </h2>
                {routes.map((route) => (
                  <RouteCard
                    key={route.id}
                    route={route}
                    onUpdated={fetchRoutes}
                    onDeleted={fetchRoutes}
                  />
                ))}
                {routes.length === 0 && apiOk && (
                  <div className="rounded-2xl border border-white/5 bg-zinc-900 p-5 text-white/30 text-sm text-center">
                    Sin rutas configuradas
                  </div>
                )}
              </div>
            </div>

            {/* Columna derecha — gráficas */}
            <div className="xl:col-span-2 space-y-6">
              <h2 className="text-white/60 text-xs font-semibold uppercase tracking-widest">
                Historial de tráfico
              </h2>
              {routes.map((route) => (
                <TrafficChart key={route.id} route={route} />
              ))}
              {routes.length === 0 && apiOk && (
                <div className="rounded-2xl border border-white/5 bg-zinc-900 p-10 text-white/30 text-sm text-center">
                  Sin rutas disponibles
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </main>
  );
}
