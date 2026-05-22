from fastapi import APIRouter, HTTPException, Query
from datetime import datetime, timedelta

from api.schemas import HistoryResponse, TrafficRecordOut
from api.dependencies import get_db
from data.repository import get_traffic_records, get_route_by_id
from data.database import SessionLocal

router = APIRouter(prefix="/history", tags=["Historial"])


@router.get("/{route_id}", response_model=HistoryResponse)
def get_history(
    route_id: int,
    days: int = Query(default=7, ge=1, le=90, description="Días de historial a retornar"),
    limit: int = Query(default=500, ge=1, le=5000),
):
    db = SessionLocal()
    try:
        route = get_route_by_id(db, route_id)
        if not route:
            raise HTTPException(status_code=404, detail=f"Ruta {route_id} no encontrada")

        since = datetime.utcnow() - timedelta(days=days)
        records = get_traffic_records(db, route_id=route_id, since=since, limit=limit)
        return HistoryResponse(
            route_id=route_id,
            count=len(records),
            records=[TrafficRecordOut.model_validate(r) for r in records],
        )
    finally:
        db.close()
