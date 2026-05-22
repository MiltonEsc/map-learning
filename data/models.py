from datetime import datetime
from enum import Enum as PyEnum

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Enum,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class TrafficLevel(str, PyEnum):
    LOW = "LOW"
    MODERATE = "MODERATE"
    HEAVY = "HEAVY"
    SEVERE = "SEVERE"


class Route(Base):
    __tablename__ = "routes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    label: Mapped[str] = mapped_column(String(100), nullable=False)
    origin_address: Mapped[str] = mapped_column(String(300), nullable=False)
    destination_address: Mapped[str] = mapped_column(String(300), nullable=False)
    origin_lat: Mapped[float] = mapped_column(Float, nullable=False)
    origin_lon: Mapped[float] = mapped_column(Float, nullable=False)
    dest_lat: Mapped[float] = mapped_column(Float, nullable=False)
    dest_lon: Mapped[float] = mapped_column(Float, nullable=False)
    typical_departure_time: Mapped[str | None] = mapped_column(String(5), nullable=True)  # "07:30"
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    traffic_records: Mapped[list["TrafficRecord"]] = relationship(
        "TrafficRecord", back_populates="route", cascade="all, delete-orphan"
    )
    prediction_logs: Mapped[list["PredictionLog"]] = relationship(
        "PredictionLog", back_populates="route", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Route id={self.id} label={self.label!r}>"


class TrafficRecord(Base):
    __tablename__ = "traffic_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    route_id: Mapped[int] = mapped_column(Integer, ForeignKey("routes.id"), nullable=False)
    captured_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    duration_sec: Mapped[int] = mapped_column(Integer, nullable=False)
    duration_in_traffic_sec: Mapped[int] = mapped_column(Integer, nullable=False)
    distance_m: Mapped[int] = mapped_column(Integer, nullable=False)
    traffic_level: Mapped[TrafficLevel] = mapped_column(
        Enum(TrafficLevel), nullable=False, default=TrafficLevel.LOW
    )

    route: Mapped["Route"] = relationship("Route", back_populates="traffic_records")

    def __repr__(self) -> str:
        return (
            f"<TrafficRecord id={self.id} route={self.route_id} "
            f"level={self.traffic_level} at={self.captured_at}>"
        )


class WeatherRecord(Base):
    __tablename__ = "weather_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    captured_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    lon: Mapped[float] = mapped_column(Float, nullable=False)
    temp_c: Mapped[float] = mapped_column(Float, nullable=False)
    precipitation_mm: Mapped[float] = mapped_column(Float, default=0.0)
    wind_kph: Mapped[float] = mapped_column(Float, default=0.0)
    humidity_pct: Mapped[float] = mapped_column(Float, default=0.0)
    condition_code: Mapped[int] = mapped_column(Integer, default=800)
    condition_desc: Mapped[str] = mapped_column(String(100), default="Clear")

    def __repr__(self) -> str:
        return (
            f"<WeatherRecord id={self.id} temp={self.temp_c}°C "
            f"rain={self.precipitation_mm}mm at={self.captured_at}>"
        )


class PredictionLog(Base):
    __tablename__ = "prediction_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    route_id: Mapped[int] = mapped_column(Integer, ForeignKey("routes.id"), nullable=False)
    predicted_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    departure_time: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    predicted_duration_sec: Mapped[int] = mapped_column(Integer, nullable=False)
    predicted_level: Mapped[TrafficLevel] = mapped_column(Enum(TrafficLevel), nullable=False)
    actual_duration_sec: Mapped[int | None] = mapped_column(Integer, nullable=True)
    model_version: Mapped[str] = mapped_column(String(50), default="v1")
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)

    route: Mapped["Route"] = relationship("Route", back_populates="prediction_logs")

    def __repr__(self) -> str:
        return (
            f"<PredictionLog id={self.id} route={self.route_id} "
            f"predicted={self.predicted_duration_sec}s level={self.predicted_level}>"
        )
