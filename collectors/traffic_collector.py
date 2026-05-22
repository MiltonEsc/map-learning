import logging
from datetime import datetime

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential

from config.settings import settings
from data.database import SessionLocal
from data.models import TrafficLevel
from data.repository import get_active_routes, insert_traffic_record

logger = logging.getLogger(__name__)

# Traffic level thresholds — ratio of duration_in_traffic / duration_normal
_LEVEL_THRESHOLDS = {
    TrafficLevel.SEVERE: 1.6,
    TrafficLevel.HEAVY: 1.3,
    TrafficLevel.MODERATE: 1.1,
}


def _classify_traffic(duration_sec: int, duration_in_traffic_sec: int) -> TrafficLevel:
    if duration_sec == 0:
        return TrafficLevel.LOW
    ratio = duration_in_traffic_sec / duration_sec
    if ratio >= _LEVEL_THRESHOLDS[TrafficLevel.SEVERE]:
        return TrafficLevel.SEVERE
    if ratio >= _LEVEL_THRESHOLDS[TrafficLevel.HEAVY]:
        return TrafficLevel.HEAVY
    if ratio >= _LEVEL_THRESHOLDS[TrafficLevel.MODERATE]:
        return TrafficLevel.MODERATE
    return TrafficLevel.LOW


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
def _fetch_route_traffic(origin_lat: float, origin_lon: float, dest_lat: float, dest_lon: float) -> dict:
    """Call Google Routes API and return raw response dict."""
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": settings.google_maps_api_key,
        "X-Goog-FieldMask": "routes.duration,routes.staticDuration,routes.distanceMeters",
    }
    body = {
        "origin": {"location": {"latLng": {"latitude": origin_lat, "longitude": origin_lon}}},
        "destination": {"location": {"latLng": {"latitude": dest_lat, "longitude": dest_lon}}},
        "travelMode": "DRIVE",
        "routingPreference": "TRAFFIC_AWARE",
    }
    with httpx.Client(timeout=15) as client:
        resp = client.post(settings.google_maps_base_url, json=body, headers=headers)
        resp.raise_for_status()
        return resp.json()


def collect_all_routes() -> None:
    """Poll Google Maps for every active route and store results in DB."""
    db = SessionLocal()
    try:
        routes = get_active_routes(db)
        if not routes:
            logger.warning("No active routes configured — skipping traffic collection")
            return

        for route in routes:
            try:
                data = _fetch_route_traffic(
                    route.origin_lat, route.origin_lon,
                    route.dest_lat, route.dest_lon,
                )
                if not data.get("routes"):
                    logger.warning("Empty routes response for route %s", route.id)
                    continue

                best = data["routes"][0]
                duration_sec = int(best.get("staticDuration", "0s").rstrip("s"))
                duration_in_traffic_sec = int(best.get("duration", "0s").rstrip("s"))
                distance_m = int(best.get("distanceMeters", 0))

                level = _classify_traffic(duration_sec, duration_in_traffic_sec)
                insert_traffic_record(
                    db,
                    route_id=route.id,
                    duration_sec=duration_sec,
                    duration_in_traffic_sec=duration_in_traffic_sec,
                    distance_m=distance_m,
                    traffic_level=level,
                    captured_at=datetime.utcnow(),
                )
                logger.info(
                    "Route %s (%s): %d s con tráfico [%s]",
                    route.id, route.label, duration_in_traffic_sec, level.value,
                )
            except Exception as exc:
                logger.error("Failed to collect traffic for route %s: %s", route.id, exc)
    finally:
        db.close()
