"""
Wrapper de alto nivel: captura un frame y retorna el análisis de congestión.
"""

import logging
import numpy as np

from camera.capture import get_frame
from ml.cv_model import detect_vehicles, frame_to_jpeg

logger = logging.getLogger(__name__)


def analyze_current_frame() -> dict:
    """
    Captura un frame de la cámara activa y retorna el análisis de congestión.

    Retorna dict con:
      vehicle_count, congestion_score, level
      jpeg_bytes (frame anotado en JPEG para mostrar en la app)
      error (si no hay cámara disponible)
    """
    frame = get_frame()
    if frame is None:
        return {
            "vehicle_count": 0,
            "congestion_score": 0.0,
            "level": "SIN_CAMARA",
            "jpeg_bytes": None,
            "error": "No se pudo obtener frame de la cámara",
        }

    result = detect_vehicles(frame)
    jpeg = frame_to_jpeg(result.pop("annotated_frame"))

    logger.info(
        "Cámara: %d vehículos detectados | score=%.2f | %s",
        result["vehicle_count"], result["congestion_score"], result["level"],
    )

    return {**result, "jpeg_bytes": jpeg, "error": None}
