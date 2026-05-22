"""
Captura de frames desde webcam local o cámara IP del celular.

Para usar la cámara del celular:
  1. Instala "IP Webcam" (Android) o "EpocCam" (iOS)
  2. Anota la URL que muestra la app (ej: http://192.168.1.5:8080/video)
  3. Pon esa URL en CAMERA_SOURCE en tu .env
"""

import logging
import cv2
import numpy as np

from config.settings import settings

logger = logging.getLogger(__name__)


def _parse_source(source: str):
    """Convierte el string de CAMERA_SOURCE al tipo correcto para OpenCV."""
    try:
        return int(source)   # 0, 1, 2 → cámara local
    except ValueError:
        return source        # URL RTSP/HTTP → cámara IP


def get_frame() -> np.ndarray | None:
    """Captura un solo frame de la cámara. Retorna array BGR o None si falla."""
    source = _parse_source(settings.camera_source)
    cap = cv2.VideoCapture(source)
    if not cap.isOpened():
        logger.error("No se pudo abrir la cámara: %s", settings.camera_source)
        return None
    ret, frame = cap.read()
    cap.release()
    if not ret:
        logger.error("No se pudo leer frame de la cámara")
        return None
    return frame


class CameraStream:
    """Mantiene una conexión persistente a la cámara para streaming continuo."""

    def __init__(self):
        self._source = _parse_source(settings.camera_source)
        self._cap: cv2.VideoCapture | None = None

    def open(self) -> bool:
        self._cap = cv2.VideoCapture(self._source)
        if not self._cap.isOpened():
            logger.error("No se pudo abrir stream de cámara: %s", self._source)
            return False
        logger.info("Stream de cámara abierto: %s", self._source)
        return True

    def read(self) -> np.ndarray | None:
        if self._cap is None or not self._cap.isOpened():
            return None
        ret, frame = self._cap.read()
        return frame if ret else None

    def close(self) -> None:
        if self._cap:
            self._cap.release()
            self._cap = None
