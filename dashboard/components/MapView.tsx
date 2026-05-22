"use client";

import { useEffect, useRef, useState } from "react";
import { APIProvider, Map, useMap } from "@vis.gl/react-google-maps";
import { type Route, type Prediction, getRoutePolyline } from "@/lib/api";

const TRAFFIC_COLORS: Record<string, string> = {
  LOW:      "#4ade80",
  MODERATE: "#facc15",
  HEAVY:    "#fb923c",
  SEVERE:   "#f87171",
};

const DEFAULT_CENTER = { lat: 10.9685, lng: -74.7813 };

interface RouteLayerProps {
  route: Route;
  prediction: Prediction | null;
}

function RouteLayer({ route, prediction }: RouteLayerProps) {
  const map = useMap();
  const polyline = useRef<google.maps.Polyline | null>(null);
  const trafficLayer = useRef<google.maps.TrafficLayer | null>(null);
  const prevLevel = useRef<string | null>(null);

  useEffect(() => {
    if (!map) return;

    if (!trafficLayer.current) {
      trafficLayer.current = new google.maps.TrafficLayer();
      trafficLayer.current.setMap(map);
    }

    const level = prediction?.traffic_level ?? "LOW";
    const color = TRAFFIC_COLORS[level];

    const drawPolyline = async () => {
      const encoded = await getRoutePolyline(route.id);
      if (!encoded) return;

      const path = google.maps.geometry.encoding.decodePath(encoded);

      if (polyline.current) {
        polyline.current.setOptions({ strokeColor: color });
        if (prevLevel.current !== level) polyline.current.setPath(path);
      } else {
        polyline.current = new google.maps.Polyline({
          path,
          strokeColor: color,
          strokeWeight: 6,
          strokeOpacity: 0.9,
          map,
        });

        // Marcadores A y B
        const origin = path[0];
        const dest = path[path.length - 1];
        new google.maps.Marker({ position: origin, map, label: { text: "A", color: "#fff" } });
        new google.maps.Marker({ position: dest,   map, label: { text: "B", color: "#fff" } });
      }
      prevLevel.current = level;
    };

    drawPolyline();

    return () => { polyline.current?.setMap(null); polyline.current = null; };
  }, [map, route.id, prediction?.traffic_level]);

  return null;
}

interface Props {
  routes: Route[];
  predictions: Record<number, Prediction>;
}

export default function MapView({ routes, predictions }: Props) {
  const [mounted, setMounted] = useState(false);
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? "";

  useEffect(() => { setMounted(true); }, []);

  if (!mounted) {
    return (
      <div className="rounded-2xl border border-white/10 bg-zinc-900 h-[460px] flex items-center justify-center text-white/30 text-sm">
        Cargando mapa...
      </div>
    );
  }

  if (!apiKey) {
    return (
      <div className="rounded-2xl border border-white/10 bg-zinc-900 h-[460px] flex items-center justify-center text-white/40 text-sm">
        Agrega NEXT_PUBLIC_GOOGLE_MAPS_KEY al .env.local
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 overflow-hidden">
      <div className="bg-zinc-900 px-5 py-3 flex items-center justify-between">
        <span className="text-white font-semibold text-sm">Mapa de rutas en tiempo real</span>
        <div className="flex gap-4">
          {Object.entries(TRAFFIC_COLORS).map(([level, color]) => (
            <div key={level} className="flex items-center gap-1.5">
              <span className="w-3 h-1.5 rounded-full inline-block" style={{ backgroundColor: color }} />
              <span className="text-white/40 text-xs">{level}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ height: "420px", width: "100%" }}>
        <APIProvider apiKey={apiKey} libraries={["geometry"]}>
          <Map
            style={{ width: "100%", height: "100%" }}
            defaultCenter={DEFAULT_CENTER}
            defaultZoom={13}
            gestureHandling="greedy"
            colorScheme="DARK"
          >
            {routes.map((route) => (
              <RouteLayer
                key={route.id}
                route={route}
                prediction={predictions[route.id] ?? null}
              />
            ))}
          </Map>
        </APIProvider>
      </div>
    </div>
  );
}
