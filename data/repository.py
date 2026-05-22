from datetime import datetime, timedelta

from sqlalchemy.orm import Session
from sqlalchemy import select, and_

from data.models import Route, TrafficRecord, WeatherRecord, PredictionLog, TrafficLevel


# ── Routes ────────────────────────────────────────────────────────────────────

def get_active_routes(db: Session) -> list[Route]:
    return db.execute(select(Route).where(Route.active == True)).scalars().all()


def get_route_by_id(db: Session, route_id: int) -> Route | None:
    return db.get(Route, route_id)


def create_route(db: Session, **kwargs) -> Route:
    route = Route(**kwargs)
    db.add(route)
    db.commit()
    db.refresh(route)
    return route


# ── Traffic Records ───────────────────────────────────────────────────────────

def insert_traffic_record(
    db: Session,
    route_id: int,
    duration_sec: int,
    duration_in_traffic_sec: int,
    distance_m: int,
    traffic_level: TrafficLevel,
    captured_at: datetime | None = None,
) -> TrafficRecord:
    record = TrafficRecord(
        route_id=route_id,
        duration_sec=duration_sec,
        duration_in_traffic_sec=duration_in_traffic_sec,
        distance_m=distance_m,
        traffic_level=traffic_level,
        captured_at=captured_at or datetime.utcnow(),
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def get_traffic_records(
    db: Session,
    route_id: int,
    since: datetime | None = None,
    limit: int = 1000,
) -> list[TrafficRecord]:
    stmt = select(TrafficRecord).where(TrafficRecord.route_id == route_id)
    if since:
        stmt = stmt.where(TrafficRecord.captured_at >= since)
    stmt = stmt.order_by(TrafficRecord.captured_at.desc()).limit(limit)
    return db.execute(stmt).scalars().all()


# ── Weather Records ───────────────────────────────────────────────────────────

def insert_weather_record(
    db: Session,
    lat: float,
    lon: float,
    temp_c: float,
    precipitation_mm: float,
    wind_kph: float,
    humidity_pct: float,
    condition_code: int,
    condition_desc: str,
    captured_at: datetime | None = None,
) -> WeatherRecord:
    record = WeatherRecord(
        lat=lat,
        lon=lon,
        temp_c=temp_c,
        precipitation_mm=precipitation_mm,
        wind_kph=wind_kph,
        humidity_pct=humidity_pct,
        condition_code=condition_code,
        condition_desc=condition_desc,
        captured_at=captured_at or datetime.utcnow(),
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def get_latest_weather(db: Session, lat: float, lon: float) -> WeatherRecord | None:
    stmt = (
        select(WeatherRecord)
        .where(
            and_(
                WeatherRecord.lat == lat,
                WeatherRecord.lon == lon,
            )
        )
        .order_by(WeatherRecord.captured_at.desc())
        .limit(1)
    )
    return db.execute(stmt).scalar_one_or_none()


def get_weather_records(
    db: Session,
    since: datetime | None = None,
    limit: int = 1000,
) -> list[WeatherRecord]:
    stmt = select(WeatherRecord)
    if since:
        stmt = stmt.where(WeatherRecord.captured_at >= since)
    stmt = stmt.order_by(WeatherRecord.captured_at.desc()).limit(limit)
    return db.execute(stmt).scalars().all()


# ── Prediction Logs ───────────────────────────────────────────────────────────

def insert_prediction_log(
    db: Session,
    route_id: int,
    predicted_duration_sec: int,
    predicted_level: TrafficLevel,
    departure_time: datetime | None = None,
    confidence: float | None = None,
    model_version: str = "v1",
) -> PredictionLog:
    log = PredictionLog(
        route_id=route_id,
        predicted_duration_sec=predicted_duration_sec,
        predicted_level=predicted_level,
        departure_time=departure_time,
        confidence=confidence,
        model_version=model_version,
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


def update_prediction_actual(
    db: Session, prediction_id: int, actual_duration_sec: int
) -> PredictionLog | None:
    log = db.get(PredictionLog, prediction_id)
    if log:
        log.actual_duration_sec = actual_duration_sec
        db.commit()
        db.refresh(log)
    return log
