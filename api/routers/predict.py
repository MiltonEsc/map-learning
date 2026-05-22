from fastapi import APIRouter, HTTPException
from datetime import datetime

from api.schemas import PredictRequest, PredictResponse
from ml import traffic_model, time_series_model
from data.repository import get_route_by_id
from data.database import SessionLocal

router = APIRouter(prefix="/predict", tags=["Predicción"])


@router.post("", response_model=PredictResponse)
def predict_traffic(req: PredictRequest):
    db = SessionLocal()
    try:
        route = get_route_by_id(db, req.route_id)
    finally:
        db.close()

    if not route:
        raise HTTPException(status_code=404, detail=f"Ruta {req.route_id} no encontrada")

    departure = req.departure_time or datetime.utcnow()
    result = traffic_model.predict(route_id=req.route_id, departure_time=departure)

    # Complemento Prophet (opcional)
    prophet_yhat = None
    ts_forecast = time_series_model.forecast_route(route_id=req.route_id, at=departure)
    if ts_forecast:
        prophet_yhat = ts_forecast["yhat"]

    return PredictResponse(
        route_id=req.route_id,
        predicted_duration_sec=result.get("predicted_duration_sec"),
        predicted_duration_min=result.get("predicted_duration_min"),
        normal_duration_sec=result.get("normal_duration_sec"),
        delay_min=result.get("delay_min"),
        traffic_level=result.get("traffic_level"),
        confidence=result.get("confidence"),
        advice=result["advice"],
        prophet_yhat_sec=prophet_yhat,
        models_loaded=result["models_loaded"],
    )
