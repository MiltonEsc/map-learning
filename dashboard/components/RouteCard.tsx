"use client";

import { useEffect, useState } from "react";
import { MapPin, Clock, TrendingUp, RefreshCw, Pencil, Trash2, Check, X } from "lucide-react";
import { getPrediction, updateRoute, deleteRoute, type Route, type Prediction } from "@/lib/api";

const LEVEL_STYLES: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  LOW:      { bg: "bg-green-950",  text: "text-green-400",  dot: "bg-green-400",  label: "Fluido"   },
  MODERATE: { bg: "bg-yellow-950", text: "text-yellow-400", dot: "bg-yellow-400", label: "Moderado" },
  HEAVY:    { bg: "bg-orange-950", text: "text-orange-400", dot: "bg-orange-400", label: "Pesado"   },
  SEVERE:   { bg: "bg-red-950",    text: "text-red-400",    dot: "bg-red-500",    label: "Severo"   },
};

type Mode = "view" | "edit" | "confirm-delete";

interface Props {
  route: Route;
  onUpdated?: () => void;
  onDeleted?: () => void;
}

export default function RouteCard({ route, onUpdated, onDeleted }: Props) {
  const [pred, setPred] = useState<Prediction | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const [mode, setMode] = useState<Mode>("view");
  const [editLabel, setEditLabel] = useState(route.label);
  const [editTime, setEditTime] = useState(route.typical_departure_time ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

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
    const interval = setInterval(fetchPrediction, 60_000);
    return () => clearInterval(interval);
  }, [route.id]);

  const handleSave = async () => {
    const label = editLabel.trim();
    if (!label) { setError("El nombre no puede estar vacío"); return; }
    setSaving(true);
    setError("");
    try {
      await updateRoute(route.id, {
        label,
        typical_departure_time: editTime || null,
      });
      onUpdated?.();
      setMode("view");
    } catch {
      setError("No se pudo guardar. Intenta de nuevo.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setSaving(true);
    try {
      await deleteRoute(route.id);
      onDeleted?.();
    } catch {
      setError("No se pudo eliminar. Intenta de nuevo.");
      setSaving(false);
      setMode("view");
    }
  };

  const cancelEdit = () => {
    setEditLabel(route.label);
    setEditTime(route.typical_departure_time ?? "");
    setError("");
    setMode("view");
  };

  const level = pred?.traffic_level ?? "LOW";
  const styles = LEVEL_STYLES[level] ?? LEVEL_STYLES.LOW;

  return (
    <div className={`rounded-2xl border border-white/10 p-5 ${styles.bg} transition-all`}>

      {/* ── MODO EDICIÓN ── */}
      {mode === "edit" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-white/60 text-xs font-semibold uppercase tracking-widest">Editar ruta</span>
            <button onClick={cancelEdit} className="text-white/40 hover:text-white">
              <X size={16} />
            </button>
          </div>

          <div>
            <label className="text-white/50 text-xs block mb-1.5">Nombre</label>
            <input
              type="text"
              value={editLabel}
              onChange={(e) => setEditLabel(e.target.value)}
              className="w-full bg-zinc-800 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500"
              autoFocus
            />
          </div>

          <div>
            <label className="text-white/50 text-xs block mb-1.5">Hora de salida habitual <span className="text-white/25">(opcional)</span></label>
            <input
              type="time"
              value={editTime}
              onChange={(e) => setEditTime(e.target.value)}
              className="w-full bg-zinc-800 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500"
            />
          </div>

          {error && <p className="text-red-400 text-xs">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-white/30 text-white text-sm font-medium py-2.5 rounded-xl transition-colors"
            >
              <Check size={15} />
              {saving ? "Guardando..." : "Guardar"}
            </button>
            <button
              onClick={cancelEdit}
              className="flex-1 bg-white/5 hover:bg-white/10 text-white/60 text-sm py-2.5 rounded-xl transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* ── CONFIRMACIÓN BORRADO ── */}
      {mode === "confirm-delete" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-red-900/60 flex items-center justify-center shrink-0">
              <Trash2 size={18} className="text-red-400" />
            </div>
            <div>
              <p className="text-white font-semibold text-sm">¿Eliminar ruta?</p>
              <p className="text-white/40 text-xs mt-0.5 leading-snug">Se borrarán también todos los registros de tráfico de <span className="text-white/60">{route.label}</span>.</p>
            </div>
          </div>

          {error && <p className="text-red-400 text-xs">{error}</p>}

          <div className="flex gap-2">
            <button
              onClick={handleDelete}
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 bg-red-700 hover:bg-red-600 disabled:bg-zinc-700 disabled:text-white/30 text-white text-sm font-medium py-2.5 rounded-xl transition-colors"
            >
              <Trash2 size={15} />
              {saving ? "Eliminando..." : "Sí, eliminar"}
            </button>
            <button
              onClick={() => { setError(""); setMode("view"); }}
              className="flex-1 bg-white/5 hover:bg-white/10 text-white/60 text-sm py-2.5 rounded-xl transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* ── VISTA NORMAL ── */}
      {mode === "view" && (
        <>
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
            <div className="flex items-center gap-2">
              <button
                onClick={fetchPrediction}
                className="text-white/30 hover:text-white transition-colors"
                title="Actualizar"
              >
                <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
              </button>
              <button
                onClick={() => setMode("edit")}
                className="text-white/30 hover:text-blue-400 transition-colors"
                title="Editar ruta"
              >
                <Pencil size={15} />
              </button>
              <button
                onClick={() => setMode("confirm-delete")}
                className="text-white/30 hover:text-red-400 transition-colors"
                title="Eliminar ruta"
              >
                <Trash2 size={15} />
              </button>
            </div>
          </div>

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
        </>
      )}
    </div>
  );
}
