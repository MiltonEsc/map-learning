import asyncio
import base64
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/camera", tags=["Cámara"])


class CameraAnalysisResponse(BaseModel):
    vehicle_count: int
    congestion_score: float
    level: str
    jpeg_base64: str | None = None
    error: str | None = None


@router.post("/analyze", response_model=CameraAnalysisResponse)
def analyze_camera():
    """Captura un frame y retorna el análisis de congestión vehicular."""
    from camera.analyzer import analyze_current_frame
    result = analyze_current_frame()
    jpeg_b64 = None
    if result.get("jpeg_bytes"):
        jpeg_b64 = base64.b64encode(result["jpeg_bytes"]).decode()
    return CameraAnalysisResponse(
        vehicle_count=result["vehicle_count"],
        congestion_score=result["congestion_score"],
        level=result["level"],
        jpeg_base64=jpeg_b64,
        error=result.get("error"),
    )


@router.websocket("/stream")
async def camera_stream(websocket: WebSocket):
    """
    WebSocket que transmite frames MJPEG anotados en tiempo real.
    El cliente recibe bytes JPEG cada `interval` segundos.
    """
    await websocket.accept()
    from camera.capture import CameraStream
    from ml.cv_model import detect_vehicles, frame_to_jpeg
    from config.settings import settings

    interval = 1.0 / max(1, settings.camera_fps)
    stream = CameraStream()

    if not stream.open():
        await websocket.send_text('{"error": "No se pudo abrir la cámara"}')
        await websocket.close()
        return

    logger.info("WebSocket /camera/stream abierto")
    try:
        while True:
            frame = stream.read()
            if frame is None:
                break
            result = detect_vehicles(frame)
            jpeg = frame_to_jpeg(result["annotated_frame"])
            await websocket.send_bytes(jpeg)
            await asyncio.sleep(interval)
    except WebSocketDisconnect:
        logger.info("WebSocket /camera/stream cerrado por el cliente")
    finally:
        stream.close()
