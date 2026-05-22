// Usa siempre la URL del backend directamente — quita barra final si existe
const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/$/, "");

export interface Route {
  id: number;
  label: string;
  origin_address: string;
  destination_address: string;
  typical_departure_time: string | null;
  active: boolean;
}

export interface Prediction {
  route_id: number;
  predicted_duration_sec: number | null;
  predicted_duration_min: number | null;
  normal_duration_sec: number | null;
  delay_min: number | null;
  traffic_level: "LOW" | "MODERATE" | "HEAVY" | "SEVERE" | null;
  confidence: number | null;
  advice: string;
  prophet_yhat_sec: number | null;
  models_loaded: boolean;
}

export interface TrafficRecord {
  id: number;
  route_id: number;
  captured_at: string;
  duration_sec: number;
  duration_in_traffic_sec: number;
  distance_m: number;
  traffic_level: string;
}

export interface HistoryResponse {
  route_id: number;
  count: number;
  records: TrafficRecord[];
}

export async function getRoutes(): Promise<Route[]> {
  const res = await fetch(`${API_BASE}/routes`, { cache: "no-store" });
  if (!res.ok) throw new Error("Error obteniendo rutas");
  return res.json();
}

export async function getPrediction(routeId: number): Promise<Prediction> {
  const res = await fetch(`${API_BASE}/predict`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ route_id: routeId }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Error obteniendo predicción");
  return res.json();
}

export async function getHistory(routeId: number, days = 7): Promise<HistoryResponse> {
  const res = await fetch(`${API_BASE}/history/${routeId}?days=${days}&limit=1000`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Error obteniendo historial");
  return res.json();
}

export async function getRoutePolyline(routeId: number): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE}/navigate/${routeId}/polyline`, { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    return data.encoded_polyline ?? null;
  } catch { return null; }
}

export function getCameraStreamUrl(): string {
  const base = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000")
    .replace("https://", "wss://")
    .replace("http://", "ws://");
  return `${base}/camera/stream`;
}
