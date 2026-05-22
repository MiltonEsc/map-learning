import logging
import subprocess
import sys

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger
from apscheduler.triggers.cron import CronTrigger

from config.settings import settings
from collectors.traffic_collector import collect_all_routes
from collectors.weather_collector import collect_weather

logger = logging.getLogger(__name__)

_scheduler: BackgroundScheduler | None = None


def _retrain_models() -> None:
    logger.info("Starting weekly model retraining...")
    result = subprocess.run(
        [sys.executable, "scripts/train_models.py"],
        capture_output=True,
        text=True,
    )
    if result.returncode == 0:
        logger.info("Model retraining completed successfully")
    else:
        logger.error("Model retraining failed:\n%s", result.stderr)


def start_scheduler() -> BackgroundScheduler:
    global _scheduler
    if _scheduler and _scheduler.running:
        return _scheduler

    _scheduler = BackgroundScheduler(timezone=settings.tz)

    _scheduler.add_job(
        collect_all_routes,
        trigger=IntervalTrigger(minutes=settings.traffic_poll_interval_minutes),
        id="collect_traffic",
        name="Collect traffic from Google Maps",
        replace_existing=True,
        misfire_grace_time=60,
    )

    _scheduler.add_job(
        collect_weather,
        trigger=IntervalTrigger(minutes=settings.weather_poll_interval_minutes),
        id="collect_weather",
        name="Collect weather from OpenWeatherMap",
        replace_existing=True,
        misfire_grace_time=60,
    )

    _scheduler.add_job(
        _retrain_models,
        trigger=CronTrigger(
            day_of_week=settings.model_retrain_day[:3],
            hour=settings.model_retrain_hour,
            minute=0,
            timezone=settings.tz,
        ),
        id="retrain_models",
        name="Weekly model retraining",
        replace_existing=True,
    )

    _scheduler.start()
    logger.info(
        "Scheduler started — traffic every %d min, weather every %d min",
        settings.traffic_poll_interval_minutes,
        settings.weather_poll_interval_minutes,
    )
    return _scheduler


def stop_scheduler() -> None:
    global _scheduler
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("Scheduler stopped")
