"""
Convierte registros de la DB en DataFrames listos para entrenar y para inferencia.

Features generadas:
  hour_of_day, minute_of_hour, day_of_week, month, is_weekend,
  is_rush_morning, is_rush_evening, is_lunch,
  temp_c, precipitation_mm, wind_kph, humidity_pct, condition_code,
  route_id

Targets:
  duration_in_traffic_sec  (regresión)
  traffic_level_encoded    (clasificación: 0=LOW 1=MOD 2=HEAVY 3=SEVERE)
"""

from datetime import datetime, timedelta

import numpy as np
import pandas as pd
from sqlalchemy.orm import Session
from sqlalchemy import select, and_

from data.models import TrafficRecord, WeatherRecord, TrafficLevel
from data.database import SessionLocal

TRAFFIC_LEVEL_MAP = {
    TrafficLevel.LOW: 0,
    TrafficLevel.MODERATE: 1,
    TrafficLevel.HEAVY: 2,
    TrafficLevel.SEVERE: 3,
}
TRAFFIC_LEVEL_INV = {v: k for k, v in TRAFFIC_LEVEL_MAP.items()}

FEATURE_COLS = [
    "hour_of_day", "minute_of_hour", "day_of_week", "month",
    "is_weekend", "is_rush_morning", "is_rush_evening", "is_lunch",
    "temp_c", "precipitation_mm", "wind_kph", "humidity_pct", "condition_code",
    "route_id",
]


def _add_time_features(df: pd.DataFrame) -> pd.DataFrame:
    df["hour_of_day"] = df["captured_at"].dt.hour
    df["minute_of_hour"] = df["captured_at"].dt.minute
    df["day_of_week"] = df["captured_at"].dt.dayofweek  # 0=lunes
    df["month"] = df["captured_at"].dt.month
    df["is_weekend"] = (df["day_of_week"] >= 5).astype(int)
    df["is_rush_morning"] = ((df["hour_of_day"] >= 6) & (df["hour_of_day"] <= 8)).astype(int)
    df["is_rush_evening"] = ((df["hour_of_day"] >= 17) & (df["hour_of_day"] <= 19)).astype(int)
    df["is_lunch"] = ((df["hour_of_day"] >= 12) & (df["hour_of_day"] <= 13)).astype(int)
    return df


def _nearest_weather(traffic_time: datetime, weather_df: pd.DataFrame) -> pd.Series:
    """Retorna la fila de clima más cercana en tiempo."""
    if weather_df.empty:
        return pd.Series({
            "temp_c": 28.0, "precipitation_mm": 0.0,
            "wind_kph": 10.0, "humidity_pct": 75.0, "condition_code": 800,
        })
    deltas = (weather_df["captured_at"] - traffic_time).abs()
    return weather_df.loc[deltas.idxmin(), ["temp_c", "precipitation_mm", "wind_kph", "humidity_pct", "condition_code"]]


def build_training_dataframe(weeks_back: int = 8) -> pd.DataFrame:
    """
    Construye el DataFrame de entrenamiento uniendo traffic_records y weather_records.
    Toma los últimos `weeks_back` semanas de datos.
    """
    db = SessionLocal()
    since = datetime.utcnow() - timedelta(weeks=weeks_back)
    try:
        traffic_rows = db.execute(
            select(TrafficRecord).where(TrafficRecord.captured_at >= since)
            .order_by(TrafficRecord.captured_at)
        ).scalars().all()

        weather_rows = db.execute(
            select(WeatherRecord).where(WeatherRecord.captured_at >= since)
            .order_by(WeatherRecord.captured_at)
        ).scalars().all()
    finally:
        db.close()

    if not traffic_rows:
        return pd.DataFrame()

    traffic_df = pd.DataFrame([{
        "captured_at": r.captured_at,
        "route_id": r.route_id,
        "duration_sec": r.duration_sec,
        "duration_in_traffic_sec": r.duration_in_traffic_sec,
        "traffic_level": r.traffic_level,
    } for r in traffic_rows])
    traffic_df["captured_at"] = pd.to_datetime(traffic_df["captured_at"])

    weather_df = pd.DataFrame([{
        "captured_at": w.captured_at,
        "temp_c": w.temp_c,
        "precipitation_mm": w.precipitation_mm,
        "wind_kph": w.wind_kph,
        "humidity_pct": w.humidity_pct,
        "condition_code": w.condition_code,
    } for w in weather_rows]) if weather_rows else pd.DataFrame()

    if not weather_df.empty:
        weather_df["captured_at"] = pd.to_datetime(weather_df["captured_at"])

    # Join clima más cercano a cada registro de tráfico
    weather_cols = ["temp_c", "precipitation_mm", "wind_kph", "humidity_pct", "condition_code"]
    if not weather_df.empty:
        weather_data = traffic_df["captured_at"].apply(
            lambda t: _nearest_weather(t, weather_df)
        )
        for col in weather_cols:
            traffic_df[col] = weather_data[col].values
    else:
        traffic_df["temp_c"] = 28.0
        traffic_df["precipitation_mm"] = 0.0
        traffic_df["wind_kph"] = 10.0
        traffic_df["humidity_pct"] = 75.0
        traffic_df["condition_code"] = 800

    traffic_df = _add_time_features(traffic_df)
    traffic_df["traffic_level_encoded"] = traffic_df["traffic_level"].map(TRAFFIC_LEVEL_MAP)

    return traffic_df[FEATURE_COLS + ["duration_in_traffic_sec", "traffic_level_encoded", "duration_sec"]]


def build_inference_row(route_id: int, departure_time: datetime | None = None) -> pd.DataFrame:
    """
    Construye una sola fila de features para predecir en tiempo real.
    Si departure_time es None usa datetime.utcnow().
    """
    t = departure_time or datetime.utcnow()

    db = SessionLocal()
    try:
        since = t - timedelta(hours=1)
        weather_rows = db.execute(
            select(WeatherRecord)
            .where(WeatherRecord.captured_at >= since)
            .order_by(WeatherRecord.captured_at.desc())
            .limit(1)
        ).scalars().all()
    finally:
        db.close()

    if weather_rows:
        w = weather_rows[0]
        weather = {
            "temp_c": w.temp_c, "precipitation_mm": w.precipitation_mm,
            "wind_kph": w.wind_kph, "humidity_pct": w.humidity_pct,
            "condition_code": w.condition_code,
        }
    else:
        weather = {"temp_c": 28.0, "precipitation_mm": 0.0, "wind_kph": 10.0, "humidity_pct": 75.0, "condition_code": 800}

    row = {
        "hour_of_day": t.hour,
        "minute_of_hour": t.minute,
        "day_of_week": t.weekday(),
        "month": t.month,
        "is_weekend": int(t.weekday() >= 5),
        "is_rush_morning": int(6 <= t.hour <= 8),
        "is_rush_evening": int(17 <= t.hour <= 19),
        "is_lunch": int(12 <= t.hour <= 13),
        "route_id": route_id,
        **weather,
    }
    return pd.DataFrame([row])[FEATURE_COLS]
