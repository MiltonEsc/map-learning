"""
Guarda y carga artefactos de modelos ML en models_saved/.
Maneja versiones con timestamp para no perder modelos anteriores.
"""

import os
import joblib
import logging
from pathlib import Path
from datetime import datetime

from config.settings import settings

logger = logging.getLogger(__name__)

_MODELS_DIR = Path(settings.models_dir)


def _ensure_dir() -> None:
    _MODELS_DIR.mkdir(parents=True, exist_ok=True)


def save_model(model, name: str) -> Path:
    """Guarda un modelo con joblib. Retorna el path guardado."""
    _ensure_dir()
    path = _MODELS_DIR / f"{name}.pkl"
    joblib.dump(model, path)
    logger.info("Modelo guardado: %s", path)
    return path


def load_model(name: str):
    """Carga un modelo por nombre. Retorna None si no existe."""
    path = _MODELS_DIR / f"{name}.pkl"
    if not path.exists():
        logger.warning("Modelo no encontrado: %s", path)
        return None
    model = joblib.load(path)
    logger.info("Modelo cargado: %s", path)
    return model


def model_exists(name: str) -> bool:
    return (_MODELS_DIR / f"{name}.pkl").exists()


def list_models() -> list[str]:
    _ensure_dir()
    return [p.stem for p in _MODELS_DIR.glob("*.pkl")]
