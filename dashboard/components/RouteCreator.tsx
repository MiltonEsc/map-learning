"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { APIProvider, Map, useMap, useMapsLibrary } from "@vis.gl/react-google-maps";
import {
  Search, Home, Briefcase, Clock, MapPin, Navigation,
  X, ChevronRight, ArrowLeft, Save, Loader2, Star
} from "lucide-react";

const API_BASE = "/backend";

interface LatLng { lat: number; lng: number; }
interface PlaceResult { address: string; latlng: LatLng; }
interface Preview { encoded_polyline: string; duration_min: number; distance_km: number; }

type Sheet = "search" | "confirm";

// ── Mapa de confirmación ─────────────────────────────────────────────────────
function ConfirmMap({ origin, destination, preview }: {
  origin: LatLng;
  destination: LatLng;
  preview: Preview | null;
}) {
  const map = useMap();
  const drawn = useRef(false);

  useEffect(() => {
    if (!map || drawn.current) return;
    drawn.current = true;

    new google.maps.Marker({
      map, position: origin,
      label: { text: "A", color: "#fff", fontWeight: "bold" },
      icon: { path: google.maps.SymbolPath.CIRCLE, scale: 10, fillColor: "#22c55e", fillOpacity: 1, strokeColor: "#fff", strokeWeight: 2 },
    });
    new google.maps.Marker({
      map, position: destination,
      label: { text: "B", color: "#fff", fontWeight: "bold" },
      icon: { path: google.maps.SymbolPath.CIRCLE, scale: 10, fillColor: "#ef4444", fillOpacity: 1, strokeColor: "#fff", strokeWeight: 2 },
    });

    if (preview) {
      const path = google.maps.geometry.encoding.decodePath(preview.encoded_polyline);
      new google.maps.Polyline({ path, strokeColor: "#3b82f6", strokeWeight: 5, strokeOpacity: 0.9, map });
      const bounds = new google.maps.LatLngBounds();
      path.forEach((p) => bounds.extend(p));
      map.fitBounds(bounds, 40);
    }
  }, [map, origin, destination, preview]);

  return null;
}

// ── Autocomplete input ───────────────────────────────────────────────────────
function PlaceSearch({ placeholder, onSelect }: {
  placeholder: string;
  onSelect: (result: PlaceResult) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const placesLib = useMapsLibrary("places"); // espera a que la librería cargue

  useEffect(() => {
    if (!placesLib || !inputRef.current || autocompleteRef.current) return;
    autocompleteRef.current = new placesLib.Autocomplete(inputRef.current, {
      componentRestrictions: { country: "co" },
      fields: ["geometry", "formatted_address"],
    });
    autocompleteRef.current.addListener("place_changed", () => {
      const place = autocompleteRef.current!.getPlace();
      if (place.geometry?.location) {
        onSelect({
          address: place.formatted_address ?? "",
          latlng: { lat: place.geometry.location.lat(), lng: place.geometry.location.lng() },
        });
      }
    });
  }, [placesLib, onSelect]);

  return (
    <input
      ref={inputRef}
      type="text"
      placeholder={placeholder}
      className="w-full bg-transparent text-white placeholder-white/40 text-base outline-none"
      autoComplete="off"
    />
  );
}

// ── Componente principal ─────────────────────────────────────────────────────
interface Props { onClose: () => void; onSaved: () => void; apiKey: string; }

export default function RouteCreator({ onClose, onSaved, apiKey }: Props) {
  const [sheet, setSheet] = useState<Sheet>("search");
  const [selectingFor, setSelectingFor] = useState<"origin" | "destination">("destination");
  const [origin, setOrigin] = useState<PlaceResult | null>(null);
  const [destination, setDestination] = useState<PlaceResult | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [label, setLabel] = useState("");
  const [departureTime, setDepartureTime] = useState("07:00");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Carga la ruta preview cuando tiene origen y destino
  useEffect(() => {
    if (!origin || !destination) return;
    setLoading(true);
    setError("");
    fetch(`${API_BASE}/navigate/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        origin_lat: origin.latlng.lat, origin_lon: origin.latlng.lng,
        dest_lat: destination.latlng.lat, dest_lon: destination.latlng.lng,
      }),
    })
      .then((r) => r.json())
      .then((d) => { setPreview(d); setSheet("confirm"); })
      .catch(() => setError("No se pudo calcular la ruta"))
      .finally(() => setLoading(false));
  }, [origin, destination]);

  const handleSelect = useCallback((result: PlaceResult) => {
    if (selectingFor === "destination") {
      setDestination(result);
      if (!origin) setSelectingFor("origin");
    } else {
      setOrigin(result);
    }
  }, [selectingFor, origin]);

  const handleSave = async () => {
    if (!origin || !destination || !label.trim()) { setError("Escribe un nombre para la ruta"); return; }
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/routes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: label.trim(),
          origin_address: origin.address,
          destination_address: destination.address,
          origin_lat: origin.latlng.lat, origin_lon: origin.latlng.lng,
          dest_lat: destination.latlng.lat, dest_lon: destination.latlng.lng,
          typical_departure_time: departureTime,
          active: true,
        }),
      });
      if (!res.ok) throw new Error();
      onSaved();
    } catch { setError("No se pudo guardar la ruta"); }
    finally { setSaving(false); }
  };

  const locationColor = (val: PlaceResult | null, type: "origin" | "destination") => {
    if (!val) return "text-white/30";
    return type === "origin" ? "text-green-400" : "text-blue-400";
  };

  return (
    <APIProvider apiKey={apiKey} libraries={["places", "geometry"]}>
      <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={onClose}>

        {/* ── Backdrop ── */}
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

        {/* ── Sheet ── */}
        <div
          className="relative bg-zinc-900 rounded-t-3xl shadow-2xl"
          style={{ maxHeight: sheet === "confirm" ? "90vh" : "70vh" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Handle */}
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 rounded-full bg-white/20" />
          </div>

          {/* ── SHEET: Buscar ── */}
          {sheet === "search" && (
            <div className="px-5 pb-8 flex flex-col gap-4">
              {/* Header */}
              <div className="flex items-center justify-between py-2">
                <h2 className="text-white font-bold text-xl">Nueva ruta</h2>
                <button onClick={onClose} className="text-white/40 hover:text-white">
                  <X size={20} />
                </button>
              </div>

              {/* Barra de búsqueda principal */}
              <div className={`flex items-center gap-3 bg-zinc-800 rounded-2xl px-4 py-3.5 border ${
                selectingFor === "destination" ? "border-blue-500" : "border-white/10"
              }`}>
                <Navigation size={18} className="text-blue-400 shrink-0" />
                <PlaceSearch
                  placeholder="¿Adónde vas?"
                  onSelect={handleSelect}
                />
              </div>

              {/* Origen (aparece cuando destino está puesto) */}
              {destination && (
                <div className={`flex items-center gap-3 bg-zinc-800 rounded-2xl px-4 py-3.5 border ${
                  selectingFor === "origin" ? "border-green-500" : "border-white/10"
                }`}>
                  <MapPin size={18} className="text-green-400 shrink-0" />
                  {origin
                    ? <span className="text-green-400 text-sm truncate">{origin.address}</span>
                    : <PlaceSearch placeholder="Desde dónde sales" onSelect={handleSelect} />
                  }
                </div>
              )}

              {loading && (
                <div className="flex items-center gap-2 text-blue-400 text-sm px-1">
                  <Loader2 size={14} className="animate-spin" />
                  Calculando ruta...
                </div>
              )}

              {error && <p className="text-red-400 text-sm px-1">{error}</p>}

              {/* Accesos rápidos */}
              <div className="grid grid-cols-4 gap-3 pt-1">
                {[
                  { icon: <Star size={20} />,     label: "Guardados", color: "text-yellow-400" },
                  { icon: <Home size={20} />,      label: "Casa",      color: "text-blue-400" },
                  { icon: <Briefcase size={20} />, label: "Trabajo",   color: "text-purple-400" },
                  { icon: <MapPin size={20} />,    label: "Otro",      color: "text-orange-400" },
                ].map((item) => (
                  <button key={item.label} className="flex flex-col items-center gap-2">
                    <div className={`w-14 h-14 rounded-2xl bg-zinc-800 flex items-center justify-center ${item.color}`}>
                      {item.icon}
                    </div>
                    <span className="text-white/60 text-xs">{item.label}</span>
                  </button>
                ))}
              </div>

              {/* Rutas recientes (placeholder) */}
              <div>
                <p className="text-white/40 text-xs font-medium uppercase tracking-wider mb-3">Recientes</p>
                {[destination, origin].filter(Boolean).map((p, i) => p && (
                  <div key={i} className="flex items-center gap-3 py-3 border-b border-white/5">
                    <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center">
                      <Clock size={14} className="text-white/40" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium truncate">{p.address.split(",")[0]}</p>
                      <p className="text-white/40 text-xs truncate">{p.address}</p>
                    </div>
                    <ChevronRight size={16} className="text-white/20" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── SHEET: Confirmar y guardar ── */}
          {sheet === "confirm" && origin && destination && (
            <div className="flex flex-col" style={{ maxHeight: "87vh" }}>
              {/* Back button */}
              <div className="flex items-center gap-3 px-5 py-3 border-b border-white/10">
                <button onClick={() => { setSheet("search"); setPreview(null); }} className="text-white/50 hover:text-white">
                  <ArrowLeft size={20} />
                </button>
                <h2 className="text-white font-bold">Confirmar ruta</h2>
              </div>

              {/* Mapa preview */}
              <div style={{ height: "240px" }}>
                <Map
                  style={{ width: "100%", height: "100%" }}
                  defaultCenter={destination.latlng}
                  defaultZoom={13}
                  gestureHandling="greedy"
                  colorScheme="DARK"
                  disableDefaultUI
                >
                  <ConfirmMap origin={origin.latlng} destination={destination.latlng} preview={preview} />
                </Map>
              </div>

              {/* Info de la ruta */}
              {preview && (
                <div className="flex items-center gap-4 px-5 py-3 bg-blue-950/50 border-b border-blue-900/30">
                  <div className="text-center">
                    <p className="text-white font-bold text-xl">{preview.duration_min} min</p>
                    <p className="text-white/40 text-xs">tiempo estimado</p>
                  </div>
                  <div className="w-px h-8 bg-white/10" />
                  <div className="text-center">
                    <p className="text-white font-bold text-xl">{preview.distance_km} km</p>
                    <p className="text-white/40 text-xs">distancia</p>
                  </div>
                  <div className="ml-auto text-right">
                    <p className="text-blue-400 text-xs font-medium truncate max-w-32">{origin.address.split(",")[0]}</p>
                    <p className="text-white/30 text-xs">→</p>
                    <p className="text-red-400 text-xs font-medium truncate max-w-32">{destination.address.split(",")[0]}</p>
                  </div>
                </div>
              )}

              {/* Formulario */}
              <div className="px-5 py-4 space-y-4 overflow-y-auto">
                <div>
                  <label className="text-white/50 text-xs font-medium uppercase tracking-wider">Nombre de la ruta</label>
                  <input
                    type="text"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="Ej: Casa → Oficina"
                    className="mt-2 w-full bg-zinc-800 border border-white/10 rounded-2xl px-4 py-3 text-white text-sm placeholder-white/20 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="text-white/50 text-xs font-medium uppercase tracking-wider">Hora de salida habitual</label>
                  <input
                    type="time"
                    value={departureTime}
                    onChange={(e) => setDepartureTime(e.target.value)}
                    className="mt-2 w-full bg-zinc-800 border border-white/10 rounded-2xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>
                {error && <p className="text-red-400 text-sm">{error}</p>}
                <button
                  onClick={handleSave}
                  disabled={!label.trim() || saving}
                  className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-800 disabled:text-white/30 text-white font-semibold py-4 rounded-2xl transition-colors flex items-center justify-center gap-2 text-base"
                >
                  {saving
                    ? <><Loader2 size={18} className="animate-spin" /> Guardando...</>
                    : <><Save size={18} /> Guardar ruta</>
                  }
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </APIProvider>
  );
}
