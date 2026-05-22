"""
Inserta datos sintéticos de 4 semanas para poder entrenar los modelos ML
sin esperar semanas de recolección real.

Los patrones simulados reflejan un commute típico colombiano:
- Pico mañanero: 6:30–8:30 AM (HEAVY/SEVERE)
- Hora del almuerzo: 12:00–1:30 PM (MODERATE)
- Pico vespertino: 5:00–7:00 PM (HEAVY/SEVERE)
- Viernes peor que otros días
- Lluvia aumenta el tiempo ~20–35%
"""

import random
import sys
import os
import yaml
from datetime import datetime, timedelta

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from data.database import init_db, SessionLocal
from data.models import TrafficLevel
from data.repository import (
    create_route,
    get_active_routes,
    insert_traffic_record,
    insert_weather_record,
)

random.seed(42)

WEEKS = 4
POLL_INTERVAL_MIN = 10
BASE_DURATION_SEC = 1800          # 30 min sin tráfico
BASE_DISTANCE_M = 12_000          # 12 km


def _traffic_multiplier(hour: int, minute: int, weekday: int) -> float:
    """Retorna un multiplicador de tráfico según hora y día."""
    t = hour + minute / 60.0
    is_friday = weekday == 4

    # Pico mañanero
    if 6.5 <= t <= 8.5:
        base = 1.7 if is_friday else 1.5
        peak = 7.5
        spread = 0.8
        bump = base * max(0, 1 - ((t - peak) / spread) ** 2)
        return max(1.0, bump)

    # Almuerzo
    if 12.0 <= t <= 13.5:
        return random.uniform(1.1, 1.25)

    # Pico vespertino
    if 17.0 <= t <= 19.0:
        base = 1.8 if is_friday else 1.6
        peak = 17.8
        spread = 0.9
        bump = base * max(0, 1 - ((t - peak) / spread) ** 2)
        return max(1.0, bump)

    return random.uniform(0.95, 1.08)


def _rain_multiplier(precipitation_mm: float) -> float:
    if precipitation_mm < 1:
        return 1.0
    if precipitation_mm < 5:
        return random.uniform(1.10, 1.20)
    if precipitation_mm < 15:
        return random.uniform(1.20, 1.35)
    return random.uniform(1.35, 1.50)


def _classify(duration_sec: int, duration_in_traffic_sec: int) -> TrafficLevel:
    ratio = duration_in_traffic_sec / max(duration_sec, 1)
    if ratio >= 1.6:
        return TrafficLevel.SEVERE
    if ratio >= 1.3:
        return TrafficLevel.HEAVY
    if ratio >= 1.1:
        return TrafficLevel.MODERATE
    return TrafficLevel.LOW


def _load_routes_from_yaml() -> list[dict]:
    yaml_path = os.path.join(os.path.dirname(__file__), "..", "config", "routes_config.yaml")
    with open(yaml_path, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f)
    return data.get("routes", [])


def seed_routes(db) -> list:
    existing = get_active_routes(db)
    if existing:
        print(f"  Ya existen {len(existing)} rutas — usando las existentes")
        return existing

    yaml_routes = _load_routes_from_yaml()
    if not yaml_routes:
        print("  ADVERTENCIA: no se encontraron rutas en routes_config.yaml")
        return []

    created = []
    for r in yaml_routes:
        route = create_route(
            db,
            label=r["label"],
            origin_address=r.get("origin_address", ""),
            destination_address=r.get("destination_address", ""),
            origin_lat=r["origin_lat"],
            origin_lon=r["origin_lon"],
            dest_lat=r["dest_lat"],
            dest_lon=r["dest_lon"],
            typical_departure_time=r.get("typical_departure_time"),
            active=r.get("active", True),
        )
        created.append(route)
        print(f"  Ruta creada: {route.label}")
    return created


def seed_traffic_and_weather(db, routes: list) -> None:
    now = datetime.utcnow()
    start = now - timedelta(weeks=WEEKS)

    total_traffic = 0
    total_weather = 0
    current = start

    while current <= now:
        weekday = current.weekday()  # 0=lunes, 6=domingo

        # Clima del día (cambia cada hora aprox.)
        precipitation_mm = 0.0
        if random.random() < 0.30:  # 30% días con lluvia (Barranquilla)
            precipitation_mm = random.uniform(2, 25)
        temp_c = random.uniform(27, 34)
        wind_kph = random.uniform(8, 25)
        condition_code = 500 if precipitation_mm > 1 else 800
        condition_desc = "lluvia ligera" if precipitation_mm > 1 else "despejado"

        # Weather record (uno por intervalo de tiempo)
        ref_lat = routes[0].origin_lat if routes else 10.9685
        ref_lon = routes[0].origin_lon if routes else -74.7813
        insert_weather_record(
            db,
            lat=ref_lat,
            lon=ref_lon,
            temp_c=temp_c,
            precipitation_mm=precipitation_mm,
            wind_kph=wind_kph,
            humidity_pct=random.uniform(65, 90),
            condition_code=condition_code,
            condition_desc=condition_desc,
            captured_at=current,
        )
        total_weather += 1

        # Traffic records para cada ruta activa
        h, m = current.hour, current.minute
        traffic_mult = _traffic_multiplier(h, m, weekday)
        rain_mult = _rain_multiplier(precipitation_mm)
        noise = random.uniform(0.92, 1.08)

        combined = traffic_mult * rain_mult * noise
        duration_in_traffic = int(BASE_DURATION_SEC * combined)
        distance = BASE_DISTANCE_M + random.randint(-500, 500)
        level = _classify(BASE_DURATION_SEC, duration_in_traffic)

        for route in routes:
            insert_traffic_record(
                db,
                route_id=route.id,
                duration_sec=BASE_DURATION_SEC,
                duration_in_traffic_sec=duration_in_traffic,
                distance_m=distance,
                traffic_level=level,
                captured_at=current,
            )
            total_traffic += 1

        current += timedelta(minutes=POLL_INTERVAL_MIN)

    print(f"  Insertados {total_traffic} traffic records")
    print(f"  Insertados {total_weather} weather records")


def main():
    print("Inicializando base de datos...")
    init_db()
    db = SessionLocal()
    try:
        print("Creando rutas...")
        routes = seed_routes(db)
        print(f"Generando {WEEKS} semanas de datos sintéticos ({POLL_INTERVAL_MIN} min interval)...")
        seed_traffic_and_weather(db, routes)
        print("¡Seed completado!")
    finally:
        db.close()


if __name__ == "__main__":
    main()
