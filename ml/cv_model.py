"""
Detección de vehículos con YOLOv8 para estimar congestión vehicular.

Clases de vehículos en COCO:
  2=car, 3=motorcycle, 5=bus, 7=truck
"""

import logging
import numpy as np
import cv2

from config.settings import settings

logger = logging.getLogger(__name__)

VEHICLE_CLASSES = {2, 3, 5, 7}

_model = None


def _get_model():
    global _model
    if _model is None:
        from ultralytics import YOLO
        model_name = f"{settings.yolo_model_size}.pt"
        logger.info("Cargando modelo YOLOv8: %s", model_name)
        _model = YOLO(model_name)
    return _model


def detect_vehicles(frame: np.ndarray) -> dict:
    """
    Detecta vehículos en un frame BGR y calcula un congestion_score.

    congestion_score:
      0.0 = sin vehículos
      1.0 = muchos vehículos (>= 30 detectados)

    Retorna dict con vehicle_count, congestion_score, level, annotated_frame.
    """
    model = _get_model()
    h, w = frame.shape[:2]

    results = model(
        frame,
        conf=settings.yolo_confidence_threshold,
        verbose=False,
    )[0]

    vehicle_count = 0
    for box in results.boxes:
        cls = int(box.cls[0])
        if cls in VEHICLE_CLASSES:
            vehicle_count += 1

    # Score normalizado: 30+ vehículos = máxima congestión
    congestion_score = min(1.0, vehicle_count / 30)

    if congestion_score >= 0.7:
        level = "SEVERO"
    elif congestion_score >= 0.4:
        level = "PESADO"
    elif congestion_score >= 0.15:
        level = "MODERADO"
    else:
        level = "FLUIDO"

    annotated = results.plot()

    return {
        "vehicle_count": vehicle_count,
        "congestion_score": round(congestion_score, 2),
        "level": level,
        "annotated_frame": annotated,
    }


def frame_to_jpeg(frame: np.ndarray, quality: int = 75) -> bytes:
    """Convierte un frame BGR a bytes JPEG."""
    _, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, quality])
    return buf.tobytes()
