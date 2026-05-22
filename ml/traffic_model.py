"""
Modelo XGBoost para predicción de tráfico.

- Regresor: predice duration_in_traffic_sec
- Clasificador: predice traffic_level (LOW/MODERATE/HEAVY/SEVERE)
"""

import logging
from datetime import datetime

import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error, accuracy_score
from xgboost import XGBRegressor, XGBClassifier

from ml.feature_engineering import (
    build_training_dataframe,
    build_inference_row,
    FEATURE_COLS,
    TRAFFIC_LEVEL_INV,
)
from ml.model_registry import save_model, load_model, model_exists
from data.models import TrafficLevel

logger = logging.getLogger(__name__)

_REG_NAME = "traffic_xgb_regressor"
_CLF_NAME = "traffic_xgb_classifier"

_regressor = None
_classifier = None


def train(weeks_back: int = 8) -> dict:
    """
    Entrena el regresor y clasificador XGBoost con los datos históricos.
    Retorna métricas de evaluación.
    """
    logger.info("Construyendo dataset de entrenamiento...")
    df = build_training_dataframe(weeks_back=weeks_back)

    if df.empty or len(df) < 100:
        raise ValueError(f"Datos insuficientes para entrenar: {len(df)} filas (mínimo 100)")

    X = df[FEATURE_COLS]
    y_reg = df["duration_in_traffic_sec"]
    y_clf = df["traffic_level_encoded"]

    X_train, X_test, yr_train, yr_test, yc_train, yc_test = train_test_split(
        X, y_reg, y_clf, test_size=0.15, random_state=42, shuffle=True
    )

    # Regresor
    logger.info("Entrenando regresor XGBoost (%d filas)...", len(X_train))
    regressor = XGBRegressor(
        n_estimators=300,
        max_depth=6,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        random_state=42,
        n_jobs=-1,
        verbosity=0,
    )
    regressor.fit(X_train, yr_train)
    yr_pred = regressor.predict(X_test)
    mae_sec = mean_absolute_error(yr_test, yr_pred)
    mae_min = mae_sec / 60

    # Clasificador
    logger.info("Entrenando clasificador XGBoost...")
    classifier = XGBClassifier(
        n_estimators=200,
        max_depth=5,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        random_state=42,
        n_jobs=-1,
        verbosity=0,
        eval_metric="mlogloss",
    )
    classifier.fit(X_train, yc_train)
    yc_pred = classifier.predict(X_test)
    acc = accuracy_score(yc_test, yc_pred)

    save_model(regressor, _REG_NAME)
    save_model(classifier, _CLF_NAME)

    global _regressor, _classifier
    _regressor = regressor
    _classifier = classifier

    metrics = {
        "train_rows": len(X_train),
        "test_rows": len(X_test),
        "mae_seconds": round(mae_sec, 1),
        "mae_minutes": round(mae_min, 2),
        "classifier_accuracy": round(acc, 3),
    }
    logger.info(
        "Entrenamiento completado — MAE: %.1f s (%.2f min) | Accuracy: %.1f%%",
        mae_sec, mae_min, acc * 100,
    )
    return metrics


def _load_models() -> bool:
    global _regressor, _classifier
    if _regressor is None:
        _regressor = load_model(_REG_NAME)
    if _classifier is None:
        _classifier = load_model(_CLF_NAME)
    return _regressor is not None and _classifier is not None


def _get_baseline_duration(route_id: int) -> int:
    """Promedio de duration_sec (sin tráfico) de los últimos 30 días para la ruta."""
    from data.database import SessionLocal
    from data.models import TrafficRecord
    from datetime import timedelta
    from sqlalchemy import select, func

    db = SessionLocal()
    since = datetime.utcnow() - timedelta(days=30)
    try:
        result = db.execute(
            select(func.avg(TrafficRecord.duration_sec))
            .where(TrafficRecord.route_id == route_id)
            .where(TrafficRecord.captured_at >= since)
        ).scalar()
        return int(result) if result else 1200
    finally:
        db.close()


def predict(route_id: int, departure_time=None) -> dict:
    """
    Predice duración y nivel de tráfico para una ruta en un momento dado.

    Retorna dict con:
      predicted_duration_sec, predicted_duration_min,
      traffic_level, advice, models_loaded
    """
    if not _load_models():
        return {
            "predicted_duration_sec": None,
            "traffic_level": None,
            "advice": "Modelos no entrenados aún. Ejecuta train_models.py primero.",
            "models_loaded": False,
        }

    X = build_inference_row(route_id=route_id, departure_time=departure_time)
    duration_sec = int(_regressor.predict(X)[0])
    level_code = int(_classifier.predict(X)[0])
    proba = _classifier.predict_proba(X)[0]
    confidence = float(proba[level_code])

    level: TrafficLevel = TRAFFIC_LEVEL_INV[level_code]
    duration_min = round(duration_sec / 60, 1)

    normal_sec = _get_baseline_duration(route_id)
    raw_delay = duration_sec - normal_sec

    # Si el regresor predice menos que la línea base (datos mixtos sintético/real),
    # usamos un estimado basado en el nivel de tráfico como fallback.
    if raw_delay > 0:
        delay_min = round(raw_delay / 60, 1)
    else:
        delay_min = _level_delay_estimate(level)

    advice = _build_advice(level, duration_min, delay_min)

    return {
        "predicted_duration_sec": duration_sec,
        "predicted_duration_min": duration_min,
        "normal_duration_sec": normal_sec,
        "delay_min": delay_min,
        "traffic_level": level.value,
        "confidence": round(confidence, 2),
        "advice": advice,
        "models_loaded": True,
    }


def _level_delay_estimate(level: TrafficLevel) -> float:
    """Estimado de retraso en minutos basado solo en el nivel de tráfico."""
    return {
        TrafficLevel.LOW: 0.0,
        TrafficLevel.MODERATE: 5.0,
        TrafficLevel.HEAVY: 12.0,
        TrafficLevel.SEVERE: 22.0,
    }[level]


def _build_advice(level: TrafficLevel, duration_min: float, delay_min: float) -> str:
    if level == TrafficLevel.LOW:
        return f"Tráfico fluido. Tiempo estimado: {duration_min:.0f} minutos."
    if level == TrafficLevel.MODERATE:
        return f"Tráfico moderado. Sal {delay_min:.0f} minutos antes. Tiempo estimado: {duration_min:.0f} min."
    if level == TrafficLevel.HEAVY:
        return f"Tráfico pesado. Sal {delay_min:.0f} minutos antes de lo habitual. Tiempo estimado: {duration_min:.0f} min."
    return f"Tráfico severo. Sal {delay_min:.0f} minutos antes o considera una ruta alternativa. Tiempo estimado: {duration_min:.0f} min."


def models_ready() -> bool:
    return model_exists(_REG_NAME) and model_exists(_CLF_NAME)
