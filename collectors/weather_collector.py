import logging
from datetime import datetime

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential

from config.settings import settings
from data.database import SessionLocal
from data.repository import get_active_routes, insert_weather_record

logger = logging.getLogger(__name__)


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
def _fetch_weather(lat: float, lon: float) -> dict:
    url = f"{settings.openweather_base_url}/weather"
    params = {
        "lat": lat,
        "lon": lon,
        "appid": settings.openweather_api_key,
        "units": "metric",
        "lang": "es",
    }
    with httpx.Client(timeout=10) as client:
        resp = client.get(url, params=params)
        resp.raise_for_status()
        return resp.json()


def _parse_weather(data: dict) -> dict:
    rain = data.get("rain", {})
    precipitation_mm = rain.get("1h", rain.get("3h", 0.0))
    wind = data.get("wind", {})
    main = data.get("main", {})
    weather_list = data.get("weather", [{}])

    return {
        "temp_c": main.get("temp", 0.0),
        "precipitation_mm": precipitation_mm,
        "wind_kph": wind.get("speed", 0.0) * 3.6,  # m/s → km/h
        "humidity_pct": main.get("humidity", 0.0),
        "condition_code": weather_list[0].get("id", 800),
        "condition_desc": weather_list[0].get("description", ""),
    }


def collect_weather() -> None:
    """Fetch weather for the centroid of all active route endpoints."""
    db = SessionLocal()
    try:
        routes = get_active_routes(db)
        if not routes:
            return

        # Deduplicate: collect weather once per unique origin coordinate (rounded to 2 decimals)
        seen: set[tuple[float, float]] = set()
        for route in routes:
            coord = (round(route.origin_lat, 2), round(route.origin_lon, 2))
            if coord in seen:
                continue
            seen.add(coord)

            try:
                raw = _fetch_weather(coord[0], coord[1])
                parsed = _parse_weather(raw)
                insert_weather_record(
                    db,
                    lat=coord[0],
                    lon=coord[1],
                    captured_at=datetime.utcnow(),
                    **parsed,
                )
                logger.info(
                    "Weather at (%.2f, %.2f): %.1f°C rain=%.1fmm [%s]",
                    coord[0], coord[1],
                    parsed["temp_c"], parsed["precipitation_mm"], parsed["condition_desc"],
                )
            except Exception as exc:
                logger.error("Failed to fetch weather at %s: %s", coord, exc)
    finally:
        db.close()
