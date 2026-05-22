"""
TrafficVoice AI — punto de entrada principal.

Arranca:
  1. Base de datos
  2. Scheduler (recolección automática de tráfico y clima)
  3. Motor de alertas de voz proactivas
  4. API FastAPI en http://localhost:8000

Uso:
  python main.py                    # modo normal
  python main.py --voice            # activa escucha continua de micrófono
"""

import logging
import signal
import sys

import uvicorn

from config.settings import settings
from data.database import init_db
from collectors.scheduler import start_scheduler, stop_scheduler
from notifications.alert_engine import start_alert_engine, stop_alert_engine

logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

_voice_mode = "--voice" in sys.argv


def _handle_shutdown(signum, frame):
    logger.info("Señal de parada recibida — apagando...")
    stop_scheduler()
    stop_alert_engine()
    if _voice_mode:
        from voice.assistant import stop_continuous_listening
        stop_continuous_listening()
    sys.exit(0)


def main():
    signal.signal(signal.SIGINT, _handle_shutdown)
    signal.signal(signal.SIGTERM, _handle_shutdown)

    logger.info("=== TrafficVoice AI iniciando ===")

    # 1. Base de datos
    logger.info("Inicializando base de datos...")
    init_db()

    # 2. Scheduler de recolección
    logger.info("Arrancando scheduler...")
    start_scheduler()

    # 3. Motor de alertas proactivas
    logger.info("Arrancando motor de alertas...")
    start_alert_engine()

    # 4. Asistente de voz continuo (opcional)
    if _voice_mode:
        logger.info("Modo voz activado — el asistente escuchará continuamente")
        from voice.assistant import start_continuous_listening
        start_continuous_listening(duration_sec=5)

    # 5. API
    logger.info("Servidor API en http://localhost:8000 — Docs en http://localhost:8000/docs")
    uvicorn.run(
        "api.app:app",
        host="0.0.0.0",
        port=8000,
        reload=(settings.app_env == "development"),
        log_level=settings.log_level.lower(),
    )


if __name__ == "__main__":
    main()
