"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { APIProvider, Map, useMap, useMapsLibrary } from "@vis.gl/react-google-maps";
import {
  Mic, MicOff, AlertTriangle, CheckCircle,
  Navigation, MapPin, LayoutDashboard, Plus, ChevronUp, X, ArrowUp, Loader2,
} from "lucide-react";
import Link from "next/link";
import RouteCreator from "@/components/RouteCreator";
import { useJarvis } from "@/hooks/useJarvis";
import { getRoutes, getPrediction, getRoutePolyline, type Route, type Prediction } from "@/lib/api";

const ALERT_BG: Record<string, string> = {
  ALTO: "bg-red-600", MEDIO: "bg-orange-500", BAJO: "bg-yellow-500", NINGUNO: "bg-transparent",
};

const MAP_STYLE = [
  { elementType: "geometry",         stylers: [{ color: "#1a1a2e" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8ec3b9" }] },
  { featureType: "road",             elementType: "geometry", stylers: [{ color: "#304a7d" }] },
  { featureType: "road.highway",     elementType: "geometry", stylers: [{ color: "#2c6675" }] },
  { featureType: "water",            elementType: "geometry", stylers: [{ color: "#0e1626" }] },
  { featureType: "poi",              stylers: [{ visibility: "off" }] },
];

const TRAFFIC_COLORS: Record<string, string> = {
  LOW: "#4ade80", MODERATE: "#facc15", HEAVY: "#fb923c", SEVERE: "#f87171",
};

interface NavStep {
  instruction: string;
  distance: string;
  maneuver: string;
  lat: number;
  lng: number;
}

function maneuverAngle(maneuver: string): number {
  const map: Record<string, number> = {
    "turn-right": 90,        "turn-slight-right": 45,  "turn-sharp-right": 135,
    "turn-left": -90,        "turn-slight-left": -45,  "turn-sharp-left": -135,
    "uturn-right": 180,      "uturn-left": 180,
    "roundabout-right": 90,  "roundabout-left": -90,
    "ramp-right": 45,        "ramp-left": -45,
    "fork-right": 30,        "fork-left": -30,
  };
  return map[maneuver] ?? 0;
}

// ── NavEngine: fetches directions inside APIProvider ──────────────────────────
function NavEngine({ activeRoute, onSteps }: {
  activeRoute: Route | null;
  onSteps: (steps: NavStep[]) => void;
}) {
  const routesLib = useMapsLibrary("routes");

  useEffect(() => {
    if (!routesLib || !activeRoute) { onSteps([]); return; }
    const svc = new google.maps.DirectionsService();
    svc.route({
      origin:      { lat: activeRoute.origin_lat, lng: activeRoute.origin_lon },
      destination: { lat: activeRoute.dest_lat,   lng: activeRoute.dest_lon   },
      travelMode:  google.maps.TravelMode.DRIVING,
      language: "es",
      region:   "CO",
    }, (result: google.maps.DirectionsResult | null, status: string) => {
      if (status === "OK") {
        const steps = result?.routes[0]?.legs[0]?.steps ?? [];
        onSteps(steps.map((s: google.maps.DirectionsStep) => ({
          instruction: s.instructions.replace(/<[^>]*>/g, ""),
          distance:    s.distance?.text ?? "",
          maneuver:    s.maneuver ?? "",
          lat: s.start_location.lat(),
          lng: s.start_location.lng(),
        })));
      } else {
        onSteps([]);
      }
    });
  }, [routesLib, activeRoute]);

  return null;
}

// ── DriveMap ──────────────────────────────────────────────────────────────────
function DriveMap({ center, routes, predictions, activeRouteId }: {
  center: google.maps.LatLngLiteral;
  routes: Route[];
  predictions: Record<number, Prediction>;
  activeRouteId: number | null;
}) {
  const map = useMap();
  const locationMarker = useRef<google.maps.Marker | null>(null);
  const polylines = useRef<google.maps.Polyline[]>([]);
  const navMode = activeRouteId !== null;

  useEffect(() => {
    if (!map) return;
    if (!locationMarker.current) {
      locationMarker.current = new google.maps.Marker({
        map,
        icon: {
          path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
          scale: 6, fillColor: "#3b82f6", fillOpacity: 1,
          strokeColor: "#fff", strokeWeight: 2,
        },
        zIndex: 10,
      });
    }
    locationMarker.current.setPosition(center);
    map.panTo(center);
    if (navMode) map.setZoom(17);
  }, [map, center, navMode]);

  useEffect(() => {
    if (!map || routes.length === 0) return;
    polylines.current.forEach((p) => p.setMap(null));
    polylines.current = [];

    const toDraw = navMode ? routes.filter((r) => r.id === activeRouteId) : routes;
    toDraw.forEach(async (route) => {
      const level = predictions[route.id]?.traffic_level ?? "LOW";
      const encoded = await getRoutePolyline(route.id);
      if (!encoded) return;
      const path = google.maps.geometry.encoding.decodePath(encoded);
      const pl = new google.maps.Polyline({
        path, strokeColor: TRAFFIC_COLORS[level],
        strokeWeight: navMode ? 7 : 5, strokeOpacity: 0.9, map,
      });
      polylines.current.push(pl);
    });

    return () => { polylines.current.forEach((p) => p.setMap(null)); };
  }, [map, routes, predictions, activeRouteId, navMode]);

  return null;
}

// ── DrivePage ─────────────────────────────────────────────────────────────────
export default function DrivePage() {
  const videoRef   = useRef<HTMLVideoElement>(null);
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const streamRef  = useRef<MediaStream | null>(null);
  const visionInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const [cameraActive, setCameraActive] = useState(false);
  const [location, setLocation] = useState<google.maps.LatLngLiteral>({ lat: 10.9685, lng: -74.7813 });
  const [routes, setRoutes] = useState<Route[]>([]);
  const [predictions, setPredictions] = useState<Record<number, Prediction>>({});
  const [showMap, setShowMap] = useState(false);
  const [showCreator, setShowCreator] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [activeRouteId, setActiveRouteId] = useState<number | null>(null);
  const [navSteps, setNavSteps] = useState<NavStep[]>([]);
  const [stepsLoading, setStepsLoading] = useState(false);
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const hasAutoSelected = useRef(false);
  const navStepsRef    = useRef<NavStep[]>([]);
  const routesRef      = useRef<Route[]>([]);

  const getTrafficContext = useCallback(() =>
    routes.map((r) => {
      const p = predictions[r.id];
      return p
        ? `${r.label}: ${p.predicted_duration_min?.toFixed(0)} min — ${p.traffic_level}`
        : `${r.label}: sin datos`;
    }).join("\n"),
  [routes, predictions]);

  const { state: jarvis, analyzeFrame, startListening, stopListening, speakText } =
    useJarvis(getTrafficContext);

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
      visionInterval.current = setInterval(() => captureAndAnalyze(), 8000);
    } catch (err) {
      console.error("Error cámara:", err);
    }
  };

  const stopCamera = () => {
    if (visionInterval.current) { clearInterval(visionInterval.current); visionInterval.current = null; }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraActive(false);
    setShowControls(true);
  };

  const captureAndAnalyze = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = 320; canvas.height = 180;
    ctx.drawImage(video, 0, 0, 320, 180);
    analyzeFrame(canvas.toDataURL("image/jpeg", 0.4).split(",")[1]);
  };

  // ── GPS ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    const watchId = navigator.geolocation?.watchPosition(
      (pos) => setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      undefined,
      { enableHighAccuracy: true },
    );
    return () => { if (watchId) navigator.geolocation.clearWatch(watchId); };
  }, []);

  // ── Keep refs in sync ─────────────────────────────────────────────────────
  useEffect(() => { navStepsRef.current = navSteps; }, [navSteps]);
  useEffect(() => { routesRef.current = routes; }, [routes]);

  // ── Advance step when within 80 m of next step ────────────────────────────
  useEffect(() => {
    const steps = navStepsRef.current;
    if (!steps.length || currentStepIdx >= steps.length - 1) return;
    if (typeof google === "undefined" || !google.maps?.geometry) return;
    const next = steps[currentStepIdx + 1];
    const dist = google.maps.geometry.spherical.computeDistanceBetween(
      new google.maps.LatLng(location.lat, location.lng),
      new google.maps.LatLng(next.lat, next.lng),
    );
    if (dist < 80) setCurrentStepIdx((i) => i + 1);
  }, [location]);

  // ── Traffic data ──────────────────────────────────────────────────────────
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

  // Auto-select if only one route
  useEffect(() => {
    if (!hasAutoSelected.current && routes.length === 1) {
      setActiveRouteId(routes[0].id);
      hasAutoSelected.current = true;
    }
  }, [routes]);

  // Greeting + reset when route changes
  useEffect(() => {
    if (activeRouteId !== null) {
      const route = routesRef.current.find((r) => r.id === activeRouteId);
      const dest = route?.label.includes("→")
        ? route.label.split("→")[1]?.trim()
        : (route?.label ?? "tu destino");
      setStepsLoading(true);
      setNavSteps([]);
      setCurrentStepIdx(0);
      speakText(`¡Iniciemos! Ruta a ${dest}. Buen viaje.`);
    } else {
      setNavSteps([]);
      setCurrentStepIdx(0);
      setStepsLoading(false);
    }
  }, [activeRouteId]);

  const handleNavSteps = useCallback((steps: NavStep[]) => {
    setNavSteps(steps);
    setStepsLoading(false);
  }, []);

  const alert      = jarvis.lastAlert;
  const apiKey     = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? "";
  const activeRoute = routes.find((r) => r.id === activeRouteId) ?? null;
  const currentStep = navSteps[currentStepIdx];

  // Duration color for active route
  const durationColor = (level: string | null | undefined) =>
    ({ LOW: "text-green-400", MODERATE: "text-yellow-400", HEAVY: "text-orange-400", SEVERE: "text-red-400" }[level ?? "LOW"] ?? "text-white");

  return (
    <div className="relative w-screen h-screen bg-black overflow-hidden select-none">

      <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" autoPlay playsInline muted />
      <canvas ref={canvasRef} className="hidden" />
      <div className="absolute inset-0 bg-black/20 pointer-events-none" />

      {/* ── APIProvider always mounted (loads Maps + fetches directions) ── */}
      {apiKey && (
        <APIProvider apiKey={apiKey} libraries={["geometry", "routes"]}>
          <NavEngine activeRoute={activeRoute} onSteps={handleNavSteps} />

          {showMap && (
            <div className={`absolute left-4 w-72 h-52 rounded-2xl overflow-hidden border border-white/20 z-50 shadow-2xl transition-all duration-300 ${showControls ? "bottom-32" : "bottom-4"}`}>
              <Map
                style={{ width: "100%", height: "100%" }}
                defaultCenter={location}
                defaultZoom={activeRouteId !== null ? 17 : 14}
                gestureHandling="greedy"
                disableDefaultUI
                colorScheme="DARK"
              >
                <DriveMap center={location} routes={routes} predictions={predictions} activeRouteId={activeRouteId} />
              </Map>
            </div>
          )}
        </APIProvider>
      )}

      {/* ── Step panel — turn-by-turn (top of screen) ── */}
      {activeRouteId !== null && (!alert || !alert.riesgo) && (
        <div className="absolute top-0 left-0 right-0 z-50 bg-black/85 backdrop-blur-md px-4 pt-safe-top pb-3" style={{ paddingTop: "max(env(safe-area-inset-top), 12px)" }}>
          <div className="flex items-center gap-3">
            {/* Maneuver arrow */}
            <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center shrink-0">
              {stepsLoading && !currentStep
                ? <Loader2 size={22} className="text-white animate-spin" />
                : <ArrowUp
                    size={22}
                    className="text-white"
                    style={{ transform: `rotate(${maneuverAngle(currentStep?.maneuver ?? "")}deg)` }}
                  />
              }
            </div>

            {/* Step text */}
            <div className="flex-1 min-w-0">
              {stepsLoading && !currentStep ? (
                <p className="text-white/60 text-sm">Calculando ruta...</p>
              ) : currentStep ? (
                <>
                  <p className="text-white/50 text-xs mb-0.5">Paso {currentStepIdx + 1} de {navSteps.length}</p>
                  <p className="text-white font-semibold text-sm leading-tight line-clamp-2">{currentStep.instruction}</p>
                  <p className="text-blue-400 text-sm font-bold mt-0.5">{currentStep.distance}</p>
                </>
              ) : (
                <p className="text-white/60 text-sm">{activeRoute?.label ?? "Ruta activa"}</p>
              )}
            </div>

            {/* Duration + stop button */}
            <div className="flex flex-col items-end gap-1 shrink-0">
              {activeRoute && predictions[activeRoute.id] && (
                <p className={`font-bold text-lg ${durationColor(predictions[activeRoute.id]?.traffic_level)}`}>
                  {predictions[activeRoute.id]?.predicted_duration_min?.toFixed(0)} min
                </p>
              )}
              <button
                onClick={() => setActiveRouteId(null)}
                className="text-white/40 hover:text-white/80 transition-colors"
                title="Detener ruta"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Alert banner (highest priority) ── */}
      {alert && alert.riesgo && (
        <div className={`absolute top-0 left-0 right-0 z-[60] px-6 py-4 ${ALERT_BG[alert.nivel]} flex items-center gap-3 animate-pulse`}>
          <AlertTriangle size={24} className="text-white shrink-0" />
          <div>
            <p className="text-white font-bold text-lg leading-tight">{alert.descripcion}</p>
            <p className="text-white/90 text-sm">{alert.accion}</p>
          </div>
        </div>
      )}

      {/* ── "Vía despejada" — only when camera active, no steps, no alert ── */}
      {(!alert || !alert.riesgo) && cameraActive && activeRouteId === null && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 bg-black/50 backdrop-blur px-4 py-2 rounded-full">
          <CheckCircle size={16} className="text-green-400" />
          <span className="text-green-400 text-sm font-medium">Vía despejada</span>
        </div>
      )}

      {/* ── Route selector (top-right, only when no active route) ── */}
      {activeRouteId === null && (
        <div className="absolute top-4 right-4 z-40 space-y-1.5 max-w-[180px]">
          {routes.map((r) => (
            <button
              key={r.id}
              onClick={() => setActiveRouteId(r.id)}
              className="w-full bg-black/60 backdrop-blur rounded-xl px-4 py-2 text-right hover:bg-black/80 transition-colors"
            >
              <p className="text-white/50 text-xs">Iniciar ruta</p>
              <p className="text-white text-sm font-medium truncate">{r.label}</p>
            </button>
          ))}
        </div>
      )}

      {/* ── Jarvis transcript / reply ── */}
      {(jarvis.transcript || jarvis.reply) && (
        <div className="absolute bottom-28 left-1/2 -translate-x-1/2 z-40 max-w-sm w-full px-4">
          <div className="bg-black/70 backdrop-blur rounded-2xl px-5 py-4 text-center space-y-1">
            {jarvis.transcript && <p className="text-white/50 text-sm">"{jarvis.transcript}"</p>}
            {jarvis.reply && <p className="text-white font-medium">{jarvis.reply}</p>}
          </div>
        </div>
      )}

      {/* ── Toggle controls pill ── */}
      <button
        onClick={() => setShowControls((v) => !v)}
        className={`absolute left-1/2 -translate-x-1/2 z-50 bg-black/55 backdrop-blur px-4 py-1.5 rounded-full flex items-center gap-1.5 transition-all duration-300 ${showControls ? "bottom-[7.5rem]" : "bottom-4"}`}
      >
        <ChevronUp size={14} className={`text-white/60 transition-transform duration-300 ${showControls ? "rotate-180" : ""}`} />
        <span className="text-white/60 text-xs">{showControls ? "Ocultar" : "Controles"}</span>
      </button>

      {/* ── Bottom controls bar ── */}
      <div className={`absolute bottom-0 left-0 right-0 z-40 p-4 transition-transform duration-300 ${showControls ? "translate-y-0" : "translate-y-full"}`}>
        <div className="bg-black/70 backdrop-blur-md rounded-2xl px-6 py-4 flex items-center justify-between gap-4">

          {/* Cámara */}
          <button
            onClick={cameraActive ? stopCamera : startCamera}
            className={`flex flex-col items-center gap-1 ${cameraActive ? "text-green-400" : "text-white/50 hover:text-white"}`}
          >
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${cameraActive ? "bg-green-600" : "bg-white/10"}`}>
              <Navigation size={20} />
            </div>
            <span className="text-xs">{cameraActive ? "Detener" : "Iniciar"}</span>
          </button>

          {/* Micrófono push-to-talk */}
          <button
            onPointerDown={startListening}
            onPointerUp={stopListening}
            onPointerLeave={stopListening}
            className="flex flex-col items-center gap-1 touch-none"
          >
            <div className={`w-16 h-16 rounded-full flex items-center justify-center transition-all ${
              jarvis.listening ? "bg-red-600 scale-110 ring-4 ring-red-400/50"
              : jarvis.speaking  ? "bg-blue-600 animate-pulse"
              : "bg-blue-600 hover:bg-blue-500"
            }`}>
              {jarvis.listening ? <MicOff size={28} className="text-white" /> : <Mic size={28} className="text-white" />}
            </div>
            <span className="text-xs text-white/60">
              {jarvis.listening ? "Escuchando..." : jarvis.speaking ? "Hablando..." : "Mantén para hablar"}
            </span>
          </button>

          {/* Mapa */}
          <button
            onClick={() => setShowMap((v) => !v)}
            className={`flex flex-col items-center gap-1 ${showMap ? "text-blue-400" : "text-white/50 hover:text-white"}`}
          >
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${showMap ? "bg-blue-600" : "bg-white/10"}`}>
              <MapPin size={20} />
            </div>
            <span className="text-xs">Mapa</span>
          </button>

          {/* Nueva ruta */}
          <button
            onClick={() => setShowCreator(true)}
            className="flex flex-col items-center gap-1 text-white/50 hover:text-white"
          >
            <div className="w-10 h-10 rounded-full flex items-center justify-center bg-white/10">
              <Plus size={20} />
            </div>
            <span className="text-xs">Nueva ruta</span>
          </button>

          {/* Dashboard */}
          <Link href="/" className="flex flex-col items-center gap-1 text-white/50 hover:text-white">
            <div className="w-10 h-10 rounded-full flex items-center justify-center bg-white/10">
              <LayoutDashboard size={20} />
            </div>
            <span className="text-xs">Dashboard</span>
          </Link>
        </div>
      </div>

      {/* Modal nueva ruta */}
      {showCreator && apiKey && (
        <RouteCreator
          apiKey={apiKey}
          onClose={() => setShowCreator(false)}
          onSaved={() => { setShowCreator(false); loadRoutes(); }}
        />
      )}
    </div>
  );
}
