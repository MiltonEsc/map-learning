from datetime import datetime
from pydantic import BaseModel, Field


# ── Predict ───────────────────────────────────────────────────────────────────

class PredictRequest(BaseModel):
    route_id: int = Field(..., description="ID de la ruta a predecir")
    departure_time: datetime | None = Field(
        default=None,
        description="Hora de salida (ISO 8601). Si se omite usa la hora actual.",
    )


class PredictResponse(BaseModel):
    route_id: int
    predicted_duration_sec: int | None
    predicted_duration_min: float | None
    normal_duration_sec: int | None
    delay_min: float | None
    traffic_level: str | None
    confidence: float | None
    advice: str
    prophet_yhat_sec: int | None = None
    models_loaded: bool


# ── History ───────────────────────────────────────────────────────────────────

class TrafficRecordOut(BaseModel):
    id: int
    route_id: int
    captured_at: datetime
    duration_sec: int
    duration_in_traffic_sec: int
    distance_m: int
    traffic_level: str

    model_config = {"from_attributes": True}


class HistoryResponse(BaseModel):
    route_id: int
    count: int
    records: list[TrafficRecordOut]


# ── Routes ────────────────────────────────────────────────────────────────────

class RouteOut(BaseModel):
    id: int
    label: str
    origin_address: str
    destination_address: str
    origin_lat: float
    origin_lon: float
    dest_lat: float
    dest_lon: float
    typical_departure_time: str | None
    active: bool

    model_config = {"from_attributes": True}


class RouteCreate(BaseModel):
    label: str
    origin_address: str
    destination_address: str
    origin_lat: float
    origin_lon: float
    dest_lat: float
    dest_lon: float
    typical_departure_time: str | None = None
    active: bool = True


class RouteUpdate(BaseModel):
    label: str | None = None
    typical_departure_time: str | None = None
    active: bool | None = None
