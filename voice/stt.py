"""
Speech-to-Text usando OpenAI Whisper API.
Graba audio del micrófono y retorna el texto transcrito en español.
"""

import io
import logging
import wave

import sounddevice as sd
import numpy as np

from config.settings import settings

logger = logging.getLogger(__name__)

SAMPLE_RATE = 16000
CHANNELS = 1
SILENCE_THRESHOLD = 200  # nivel RMS mínimo para considerar que hay voz


def _get_device() -> int | None:
    """Retorna el índice de dispositivo configurado, o None para usar el default."""
    idx = settings.mic_device_index
    return None if idx < 0 else idx


def record_audio(duration_sec: int = 5) -> bytes:
    """Graba audio del micrófono por `duration_sec` segundos. Retorna bytes WAV."""
    device = _get_device()
    device_name = sd.query_devices(device)["name"] if device is not None else "default"
    logger.info("Grabando %d segundos desde: %s", duration_sec, device_name)

    audio = sd.rec(
        int(duration_sec * SAMPLE_RATE),
        samplerate=SAMPLE_RATE,
        channels=CHANNELS,
        dtype="int16",
        device=device,
    )
    sd.wait()

    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(CHANNELS)
        wf.setsampwidth(2)
        wf.setframerate(SAMPLE_RATE)
        wf.writeframes(audio.tobytes())
    return buf.getvalue()


def _is_silent(audio_bytes: bytes) -> bool:
    """Retorna True si el audio es demasiado silencioso para transcribir."""
    # Leer los samples PCM del WAV
    buf = io.BytesIO(audio_bytes)
    with wave.open(buf, "rb") as wf:
        raw = wf.readframes(wf.getnframes())
    samples = np.frombuffer(raw, dtype=np.int16).astype(np.float32)
    rms = np.sqrt(np.mean(samples ** 2))
    logger.debug("Audio RMS: %.1f (umbral: %d)", rms, SILENCE_THRESHOLD)
    return rms < SILENCE_THRESHOLD


def transcribe(audio_bytes: bytes) -> str:
    """Envía audio WAV a OpenAI Whisper API y retorna el texto."""
    if _is_silent(audio_bytes):
        logger.info("Audio silencioso — no se envía a Whisper")
        return ""

    from openai import OpenAI
    client = OpenAI(api_key=settings.openai_api_key)

    audio_file = io.BytesIO(audio_bytes)
    audio_file.name = "audio.wav"

    response = client.audio.transcriptions.create(
        model=settings.openai_whisper_model,
        file=audio_file,
        language="es",
        response_format="text",
    )
    transcript = response.strip() if isinstance(response, str) else str(response).strip()
    logger.info("Transcripción: %s", transcript)
    return transcript


def listen(duration_sec: int = 5) -> str:
    """Graba y transcribe en un solo paso. Retorna texto o cadena vacía si silencio."""
    audio = record_audio(duration_sec)
    return transcribe(audio)
