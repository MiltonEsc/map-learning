"""
Modelo Prophet para series temporales por ruta.
Captura patrones semanales y diarios que XGBoost no modela directamente.
Se usa como complemento al XGBoost en el endpoint /predict.
"""

import logging
from datetime import datetime, timedelta

import pandas as pd

from data.database import SessionLocal
from data.models import TrafficRecord
from ml.model_registry import save_model, load_model, model_exists
from sqlalchemy import select

logger = logging.getLogger(__name__)


def _model_name(route_id: int) -> str:
    return f"prophet_route_{route_id}"


def train_route(route_id: int, weeks_back: int = 8) -> dict:
    """Entrena un modelo Prophet para una ruta específica."""
    try:
        from prophet import Prophet
    except ImportError:
        logger.warning("Prophet no instalado — saltando modelo de series temporales")
        return {"skipped": True, "reason": "prophet not installed"}

    db = SessionLocal()
    since = datetime.utcnow() - timedelta(weeks=weeks_back)
    try:
        rows = db.execute(
            select(TrafficRecord)
            .where(TrafficRecord.route_id == route_id)
            .where(TrafficRecord.captured_at >= since)
            .order_by(TrafficRecord.captured_at)
        ).scalars().all()
    finally:
        db.close()

    if len(rows) < 50:
        return {"skipped": True, "reason": f"Solo {len(rows)} filas para ruta {route_id}"}

    df = pd.DataFrame([{
        "ds": r.captured_at.replace(tzinfo=None) if r.captured_at.tzinfo else r.captured_at,
        "y": r.duration_in_traffic_sec,
    } for r in rows])

    model = Prophet(
        daily_seasonality=True,
        weekly_seasonality=True,
        yearly_seasonality=False,
        changepoint_prior_scale=0.05,
        interval_width=0.80,
    )
    model.fit(df)
    save_model(model, _model_name(route_id))

    logger.info("Prophet entrenado para ruta %d con %d filas", route_id, len(df))
    return {"route_id": route_id, "rows": len(df)}


def forecast_route(route_id: int, at: datetime | None = None) -> dict | None:
    """
    Predice el tiempo de viaje para una ruta en un momento dado usando Prophet.
    Retorna dict con yhat, yhat_lower, yhat_upper o None si no hay modelo.
    """
    name = _model_name(route_id)
    if not model_exists(name):
        return None

    model = load_model(name)
    if model is None:
        return None

    t = at or datetime.utcnow()
    t_naive = t.replace(tzinfo=None) if t.tzinfo else t
    future = pd.DataFrame({"ds": [t_naive]})
    forecast = model.predict(future)

    return {
        "yhat": max(0, int(forecast["yhat"].iloc[0])),
        "yhat_lower": max(0, int(forecast["yhat_lower"].iloc[0])),
        "yhat_upper": max(0, int(forecast["yhat_upper"].iloc[0])),
    }


def train_all_routes(weeks_back: int = 8) -> list[dict]:
    from data.repository import get_active_routes
    db = SessionLocal()
    try:
        routes = get_active_routes(db)
    finally:
        db.close()

    results = []
    for route in routes:
        result = train_route(route.id, weeks_back=weeks_back)
        results.append(result)
    return results
