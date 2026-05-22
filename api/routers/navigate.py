from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import httpx
from config.settings import settings
from data.database import SessionLocal
from data.repository import get_route_by_id

router = APIRouter(prefix="/navigate", tags=["Navegación"])


def _call_routes_api(origin_lat: float, origin_lon: float, dest_lat: float, dest_lon: float) -> dict:
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": settings.google_maps_api_key,
        "X-Goog-FieldMask": "routes.polyline.encodedPolyline,routes.duration,routes.staticDuration,routes.distanceMeters",
    }
    body = {
        "origin": {"location": {"latLng": {"latitude": origin_lat, "longitude": origin_lon}}},
        "destination": {"location": {"latLng": {"latitude": dest_lat, "longitude": dest_lon}}},
        "travelMode": "DRIVE",
        "routingPreference": "TRAFFIC_AWARE",
    }
    with httpx.Client(timeout=10) as client:
        resp = client.post(settings.google_maps_base_url, json=body, headers=headers)
        resp.raise_for_status()
        data = resp.json()
    if not data.get("routes"):
        raise ValueError("Sin rutas en la respuesta de Google")
    return data["routes"][0]


@router.get("/{route_id}/polyline")
def get_route_polyline(route_id: int):
    """Polilínea de una ruta guardada."""
    db = SessionLocal()
    try:
        route = get_route_by_id(db, route_id)
        if not route:
            raise HTTPException(status_code=404, detail="Ruta no encontrada")
    finally:
        db.close()

    try:
        best = _call_routes_api(route.origin_lat, route.origin_lon, route.dest_lat, route.dest_lon)
        return {
            "route_id": route_id,
            "encoded_polyline": best["polyline"]["encodedPolyline"],
            "duration_sec": int(best.get("duration", "0s").rstrip("s")),
            "distance_m": int(best.get("distanceMeters", 0)),
        }
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


class PreviewRequest(BaseModel):
    origin_lat: float
    origin_lon: float
    dest_lat: float
    dest_lon: float


@router.post("/preview")
def preview_route(body: PreviewRequest):
    """Vista previa de una ruta por coordenadas (sin guardar en DB)."""
    try:
        best = _call_routes_api(body.origin_lat, body.origin_lon, body.dest_lat, body.dest_lon)
        duration_sec = int(best.get("duration", "0s").rstrip("s"))
        distance_m = int(best.get("distanceMeters", 0))
        return {
            "encoded_polyline": best["polyline"]["encodedPolyline"],
            "duration_sec": duration_sec,
            "duration_min": round(duration_sec / 60, 1),
            "distance_m": distance_m,
            "distance_km": round(distance_m / 1000, 1),
        }
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))
