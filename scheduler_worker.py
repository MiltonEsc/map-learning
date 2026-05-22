"""
Worker dedicado solo al scheduler — corre en Railway como proceso separado.
Inicia la DB, arranca el APScheduler y se mantiene vivo indefinidamente.

Separar el scheduler de la API permite:
- Escalar la API independientemente
- El scheduler no se detiene si la API reinicia
- Logs separados para debugging

Railway Start Command: python scheduler_worker.py
"""

import logging
import signal
import sys
import time

from config.settings import settings
from data.database import init_db
from collectors.scheduler import start_scheduler, stop_scheduler

logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)


def _handle_shutdown(signum, frame):
    logger.info("Señal de parada — apagando scheduler...")
    stop_scheduler()
    sys.exit(0)


def main():
    signal.signal(signal.SIGINT, _handle_shutdown)
    signal.signal(signal.SIGTERM, _handle_shutdown)

    logger.info("=== TrafficVoice Scheduler Worker iniciando ===")
    init_db()
    start_scheduler()
    logger.info("Scheduler activo — manteniendo proceso vivo...")

    # Mantener el proceso vivo
    while True:
        time.sleep(60)


if __name__ == "__main__":
    main()
