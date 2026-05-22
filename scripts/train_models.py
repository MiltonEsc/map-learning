"""
Entrena todos los modelos ML con los datos históricos disponibles.
Corre: python scripts/train_models.py

También es invocado automáticamente por el scheduler cada domingo a las 2 AM.
"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

from data.database import init_db, SessionLocal
from sqlalchemy import text


def check_data() -> int:
    db = SessionLocal()
    try:
        return db.execute(text("SELECT COUNT(*) FROM traffic_records")).scalar()
    finally:
        db.close()


def main():
    init_db()

    count = check_data()
    logger.info("Registros disponibles en DB: %d", count)

    if count < 100:
        logger.error("Datos insuficientes (%d filas). Ejecuta seed_data.py primero.", count)
        sys.exit(1)

    # 1. Entrenar XGBoost
    logger.info("=== Entrenando modelos XGBoost ===")
    from ml.traffic_model import train as train_xgb
    try:
        metrics = train_xgb(weeks_back=8)
        logger.info("XGBoost OK — MAE: %.2f min | Accuracy: %.1f%%",
                    metrics["mae_minutes"], metrics["classifier_accuracy"] * 100)
    except Exception as e:
        logger.error("Error entrenando XGBoost: %s", e)
        sys.exit(1)

    # 2. Entrenar Prophet (opcional — no falla si no está instalado)
    logger.info("=== Entrenando modelos Prophet ===")
    try:
        from ml.time_series_model import train_all_routes
        results = train_all_routes(weeks_back=8)
        for r in results:
            if r.get("skipped"):
                logger.warning("Prophet saltado: %s", r.get("reason"))
            else:
                logger.info("Prophet OK — ruta %d (%d filas)", r["route_id"], r["rows"])
    except Exception as e:
        logger.warning("Prophet no disponible: %s", e)

    logger.info("=== Entrenamiento completado ===")


if __name__ == "__main__":
    main()
