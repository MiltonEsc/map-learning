"""
Motor de alertas proactivas.

Lógica:
  - Cada minuto revisa si alguna ruta tiene una hora de salida típica
  - Si faltan `ALERT_ADVANCE_NOTICE_MINUTES` minutos para esa hora
  - Y el tráfico predicho supera el umbral
  → Habla en voz alta con el consejo
"""

import logging
import threading
import time
from datetime import datetime

import httpx

from config.settings import settings
from voice.tts import speak_async

logger = logging.getLogger(__name__)

API_BASE = "http://localhost:8000"

_running = False
_thread: threading.Thread | None = None


def _minutes_until(departure_str: str) -> float | None:
    """Calcula cuántos minutos faltan para la hora de salida HH:MM."""
    try:
        now = datetime.now()
        h, m = map(int, departure_str.split(":"))
        dep = now.replace(hour=h, minute=m, second=0, microsecond=0)
        diff = (dep - now).total_seconds() / 60
        return diff
    except Exception:
        return None


def _check_and_alert() -> None:
    """Revisa todas las rutas y lanza alertas si aplica."""
    try:
        routes_resp = httpx.get(f"{API_BASE}/routes", timeout=5)
        routes = routes_resp.json()
    except Exception as exc:
        logger.debug("Alert engine: no pudo obtener rutas: %s", exc)
        return

    for route in routes:
        dep_time = route.get("typical_departure_time")
        if not dep_time:
            continue

        minutes_left = _minutes_until(dep_time)
        if minutes_left is None:
            continue

        # Solo alertar en la ventana de aviso
        advance = settings.alert_advance_notice_minutes
        if not (0 < minutes_left <= advance):
            continue

        # Evitar alertas duplicadas en la misma ventana (solo una vez por ruta por día)
        cache_key = f"{route['id']}_{datetime.now().strftime('%Y-%m-%d_%H')}"
        if cache_key in _alerted_today:
            continue

        try:
            pred_resp = httpx.post(
                f"{API_BASE}/predict",
                json={"route_id": route["id"]},
                timeout=5,
            )
            pred = pred_resp.json()
        except Exception:
            continue

        level = pred.get("traffic_level", "LOW")
        threshold = settings.alert_delay_threshold_minutes
        delay = pred.get("delay_min", 0) or 0

        if level in ("HEAVY", "SEVERE") or delay >= threshold:
            msg = (
                f"Alerta de tráfico. En {int(minutes_left)} minutos debes salir por la ruta {route['label']}. "
                f"{pred.get('advice', '')}"
            )
            logger.info("ALERTA: %s", msg)
            speak_async(msg)
            _alerted_today.add(cache_key)


_alerted_today: set[str] = set()


def _clear_old_alerts() -> None:
    """Limpia el cache de alertas al cambiar de hora."""
    global _alerted_today
    current_hour = datetime.now().strftime("%Y-%m-%d_%H")
    to_remove = {k for k in _alerted_today if not k.endswith(current_hour)}
    _alerted_today -= to_remove


def _loop() -> None:
    logger.info("Motor de alertas iniciado — revisando cada 60 segundos")
    while _running:
        _clear_old_alerts()
        _check_and_alert()
        time.sleep(60)


def start_alert_engine() -> None:
    global _running, _thread
    if _running:
        return
    _running = True
    _thread = threading.Thread(target=_loop, daemon=True)
    _thread.start()
    logger.info("Alert engine arrancado")


def stop_alert_engine() -> None:
    global _running
    _running = False
    logger.info("Alert engine detenido")
