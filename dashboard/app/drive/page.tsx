"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { APIProvider, Map, useMap } from "@vis.gl/react-google-maps";
import {
  Mic, MicOff, AlertTriangle, CheckCircle,
  Navigation, MapPin, LayoutDashboard, Plus, ChevronUp
} from "lucide-react";
import Link from "next/link";
import RouteCreator from "@/components/RouteCreator";
import { useJarvis } from "@/hooks/useJarvis";
import { getRoutes, getPrediction, getRoutePolyline, type Route, type Prediction } from "@/lib/api";

const ALERT_BG: Record<string, string> = {
  ALTO:    "bg-red-600",
  MEDIO:   "bg-orange-500",
  BAJO:    "bg-yellow-500",
  NINGUNO: "bg-transparent",
};

const MAP_STYLE = [
  { elementType: "geometry",           stylers: [{ color: "#1a1a2e" }] },
  { elementType: "labels.text.fill",   stylers: [{ color: "#8ec3b9" }] },
  { featureType: "road",               elementType: "geometry", stylers: [{ color: "#304a7d" }] },
  { featureType: "road.highway",       elementType: "geometry", stylers: [{ color: "#2c6675" }] },
  { featureType: "water",              elementType: "geometry", stylers: [{ color: "#0e1626" }] },
  { featureType: "poi",                stylers: [{ visibility: "off" }] },
];

const TRAFFIC_COLORS: Record<string, string> = {
  LOW: "#4ade80", MODERATE: "#facc15", HEAVY: "#fb923c", SEVERE: "#f87171",
};

function DriveMap({ center, routes, predictions }: {
  center: google.maps.LatLngLiteral;
  routes: Route[];
  predictions: Record<number, Prediction>;
}) {
  const map = useMap();
  const locationMarker = useRef<google.maps.Marker | null>(null);
  const polylines = useRef<google.maps.Polyline[]>([]);

  // Marcador de ubicación actual (flecha azul)
  useEffect(() => {
    if (!map) return;
    if (!locationMarker.current) {
      locationMarker.current = new google.maps.Marker({
        map,
        icon: {
          path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
          scale: 6,
          fillColor: "#3b82f6",
          fillOpacity: 1,
          strokeColor: "#fff",
          strokeWeight: 2,
        },
        zIndex: 10,
      });
    }
    locationMarker.current.setPosition(center);
    map.panTo(center);
  }, [map, center]);

  // Rutas con polilínea real desde la Routes API
  useEffect(() => {
    if (!map || routes.length === 0) return;
    polylines.current.forEach((p) => p.setMap(null));
    polylines.current = [];

    routes.forEach(async (route) => {
      const level = predictions[route.id]?.traffic_level ?? "LOW";
      const color = TRAFFIC_COLORS[level];
      const encoded = await getRoutePolyline(route.id);
      if (!encoded) return;
      const path = google.maps.geometry.encoding.decodePath(encoded);
      const pl = new google.maps.Polyline({
        path, strokeColor: color, strokeWeight: 5, strokeOpacity: 0.85, map,
      });
      polylines.current.push(pl);
    });

    return () => { polylines.current.forEach((p) => p.setMap(null)); };
  }, [map, routes, predictions]);

  return null;
}

export default function DrivePage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const visionInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const [cameraActive, setCameraActive] = useState(false);
  const [location, setLocation] = useState<google.maps.LatLngLiteral>({ lat: 10.9685, lng: -74.7813 });
  const [routes, setRoutes] = useState<Route[]>([]);
  const [predictions, setPredictions] = useState<Record<number, Prediction>>({});
  const [showMap, setShowMap] = useState(false);
  const [showCreator, setShowCreator] = useState(false);
  const [showControls, setShowControls] = useState(true);

  // Contexto de tráfico para Jarvis
  const getTrafficContext = useCallback(() => {
    return routes.map((r) => {
      const p = predictions[r.id];
      return p
        ? `${r.label}: ${p.predicted_duration_min?.toFixed(0)} min — ${p.traffic_level}`
        : `${r.label}: sin datos`;
    }).join("\n");
  }, [routes, predictions]);

  const { state: jarvis, analyzeFrame, startListening, stopListening } = useJarvis(getTrafficContext);

  // ── Cámara ────────────────────────────────────────────────────────────────
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: 1280, height: 720 },
        audio: false,
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      streamRef.current = stream;
      setCameraActive(true);
      setShowControls(false);

      // Analizar frame cada 8 segundos (optimizado para datos móviles)
      visionInterval.current = setInterval(() => captureAndAnalyze(), 8000);
    } catch (err) {
      console.error("Error cámara:", err);
    }
  };

  const stopCamera = () => {
    if (visionInterval.current) {
      clearInterval(visionInterval.current);
      visionInterval.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
    setShowControls(true);
  };

  const captureAndAnalyze = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Resolución reducida para datos móviles (~15KB por frame)
    canvas.width = 320;
    canvas.height = 180;
    ctx.drawImage(video, 0, 0, 320, 180);
    const base64 = canvas.toDataURL("image/jpeg", 0.4).split(",")[1];
    analyzeFrame(base64);
  };

  // ── GPS ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    const watchId = navigator.geolocation?.watchPosition(
      (pos) => setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      undefined,
      { enableHighAccuracy: true }
    );
    return () => { if (watchId) navigator.geolocation.clearWatch(watchId); };
  }, []);

  // ── Datos de tráfico ──────────────────────────────────────────────────────
  const loadRoutes = useCallback(async () => {
    try {
      const r = await getRoutes();
      setRoutes(r);
      const preds: Record<number, Prediction> = {};
      await Promise.all(r.map(async (rt) => {
        try { preds[rt.id] = await getPrediction(rt.id); } catch {}
      }));
      setPredictions(preds);
    } catch {}
  }, []);

  useEffect(() => {
    loadRoutes();
    const interval = setInterval(loadRoutes, 120_000);
    return () => {
      clearInterval(interval);
      if (visionInterval.current) clearInterval(visionInterval.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const alert = jarvis.lastAlert;
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? "";

  return (
    <div className="relative w-screen h-screen bg-black overflow-hidden select-none">

      {/* ── Cámara (fondo completo) ── */}
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-cover"
        autoPlay playsInline muted
      />
      <canvas ref={canvasRef} className="hidden" />

      {/* ── Overlay oscuro sutil ── */}
      <div className="absolute inset-0 bg-black/20 pointer-events-none" />

      {/* ── Alerta de riesgo (banner superior) ── */}
      {alert && alert.riesgo && (
        <div className={`absolute top-0 left-0 right-0 z-50 px-6 py-4 ${ALERT_BG[alert.nivel]} flex items-center gap-3 animate-pulse`}>
          <AlertTriangle size={24} className="text-white shrink-0" />
          <div>
            <p className="text-white font-bold text-lg leading-tight">{alert.descripcion}</p>
            <p className="text-white/90 text-sm">{alert.accion}</p>
          </div>
        </div>
      )}

      {/* ── Sin alerta (indicador verde pequeño) ── */}
      {(!alert || !alert.riesgo) && cameraActive && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 bg-black/50 backdrop-blur px-4 py-2 rounded-full">
          <CheckCircle size={16} className="text-green-400" />
          <span className="text-green-400 text-sm font-medium">Vía despejada</span>
        </div>
      )}

      {/* ── Mapa (esquina inferior izquierda) ── */}
      {showMap && apiKey && (
        <div className={`absolute left-4 w-72 h-52 rounded-2xl overflow-hidden border border-white/20 z-50 shadow-2xl transition-all duration-300 ${showControls ? "bottom-32" : "bottom-4"}`}>
          <APIProvider apiKey={apiKey} libraries={["geometry"]}>
            <Map
              style={{ width: "100%", height: "100%" }}
              defaultCenter={location}
              defaultZoom={14}
              gestureHandling="greedy"
              disableDefaultUI
              colorScheme="DARK"
            >
              <DriveMap center={location} routes={routes} predictions={predictions} />
            </Map>
          </APIProvider>
        </div>
      )}

      {/* ── Panel superior derecho — predicciones ── */}
      <div className="absolute top-4 right-4 z-40 space-y-2">
        {routes.map((r) => {
          const p = predictions[r.id];
          if (!p) return null;
          const color = {
            LOW: "text-green-400", MODERATE: "text-yellow-400",
            HEAVY: "text-orange-400", SEVERE: "text-red-400",
          }[p.traffic_level ?? "LOW"] ?? "text-white";
          return (
            <div key={r.id} className="bg-black/60 backdrop-blur rounded-xl px-4 py-2 text-right">
              <p className="text-white/60 text-xs">{r.label}</p>
              <p className={`font-bold text-lg ${color}`}>{p.predicted_duration_min?.toFixed(0)} min</p>
            </div>
          );
        })}
      </div>

      {/* ── Transcript / respuesta Jarvis ── */}
      {(jarvis.transcript || jarvis.reply) && (
        <div className="absolute bottom-28 left-1/2 -translate-x-1/2 z-40 max-w-sm w-full px-4">
          <div className="bg-black/70 backdrop-blur rounded-2xl px-5 py-4 text-center space-y-1">
            {jarvis.transcript && (
              <p className="text-white/50 text-sm">"{jarvis.transcript}"</p>
            )}
            {jarvis.reply && (
              <p className="text-white font-medium">{jarvis.reply}</p>
            )}
          </div>
        </div>
      )}

      {/* ── Toggle controles ── */}
      <button
        onClick={() => setShowControls((v) => !v)}
        className={`absolute left-1/2 -translate-x-1/2 z-50 bg-black/55 backdrop-blur px-4 py-1.5 rounded-full flex items-center gap-1.5 transition-all duration-300 ${showControls ? "bottom-[7.5rem]" : "bottom-4"}`}
      >
        <ChevronUp
          size={14}
          className={`text-white/60 transition-transform duration-300 ${showControls ? "rotate-180" : ""}`}
        />
        <span className="text-white/60 text-xs">{showControls ? "Ocultar" : "Controles"}</span>
      </button>

      {/* ── Barra inferior de controles ── */}
      <div className={`absolute bottom-0 left-0 right-0 z-40 p-4 transition-transform duration-300 ${showControls ? "translate-y-0" : "translate-y-full"}`}>
        <div className="bg-black/70 backdrop-blur-md rounded-2xl px-6 py-4 flex items-center justify-between gap-4">

          {/* Botón cámara */}
          <button
            onClick={cameraActive ? stopCamera : startCamera}
            className={`flex flex-col items-center gap-1 ${cameraActive ? "text-green-400" : "text-white/50 hover:text-white"}`}
          >
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${cameraActive ? "bg-green-600" : "bg-white/10"}`}>
              <Navigation size={20} />
            </div>
            <span className="text-xs">{cameraActive ? "Detener" : "Iniciar"}</span>
          </button>

          {/* Botón micrófono (push to talk) */}
          <button
            onPointerDown={startListening}
            onPointerUp={stopListening}
            onPointerLeave={stopListening}
            className="flex flex-col items-center gap-1 touch-none"
          >
            <div className={`w-16 h-16 rounded-full flex items-center justify-center transition-all ${
              jarvis.listening
                ? "bg-red-600 scale-110 ring-4 ring-red-400/50"
                : jarvis.speaking
                ? "bg-blue-600 animate-pulse"
                : "bg-blue-600 hover:bg-blue-500"
            }`}>
              {jarvis.listening ? <MicOff size={28} className="text-white" /> : <Mic size={28} className="text-white" />}
            </div>
            <span className="text-xs text-white/60">
              {jarvis.listening ? "Escuchando..." : jarvis.speaking ? "Hablando..." : "Mantén para hablar"}
            </span>
          </button>

          {/* Botón mapa */}
          <button
            onClick={() => setShowMap((v) => !v)}
            className={`flex flex-col items-center gap-1 ${showMap ? "text-blue-400" : "text-white/50 hover:text-white"}`}
          >
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${showMap ? "bg-blue-600" : "bg-white/10"}`}>
              <MapPin size={20} />
            </div>
            <span className="text-xs">Mapa</span>
          </button>

          {/* Botón nueva ruta */}
          <button
            onClick={() => setShowCreator(true)}
            className="flex flex-col items-center gap-1 text-white/50 hover:text-white"
          >
            <div className="w-10 h-10 rounded-full flex items-center justify-center bg-white/10">
              <Plus size={20} />
            </div>
            <span className="text-xs">Nueva ruta</span>
          </button>

          {/* Ir al dashboard */}
          <Link href="/" className="flex flex-col items-center gap-1 text-white/50 hover:text-white">
            <div className="w-10 h-10 rounded-full flex items-center justify-center bg-white/10">
              <LayoutDashboard size={20} />
            </div>
            <span className="text-xs">Dashboard</span>
          </Link>
        </div>
      </div>

      {/* Modal crear ruta */}
      {showCreator && apiKey && (
        <RouteCreator
          apiKey={apiKey}
          onClose={() => setShowCreator(false)}
          onSaved={() => {
            setShowCreator(false);
            loadRoutes();
          }}
        />
      )}
    </div>
  );
}
