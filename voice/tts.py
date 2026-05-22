"""
Text-to-Speech usando OpenAI TTS API + pygame para reproducción.
Voz natural en español, sin bugs de threading de pyttsx3.
"""

import io
import logging
import threading

logger = logging.getLogger(__name__)

_lock = threading.Lock()
_mixer_ready = False


def _init_pygame() -> None:
    global _mixer_ready
    if not _mixer_ready:
        import pygame
        pygame.mixer.init(frequency=24000, size=-16, channels=1, buffer=512)
        _mixer_ready = True


def speak(text: str) -> None:
    """Genera audio con OpenAI TTS y lo reproduce. Bloqueante."""
    with _lock:
        try:
            from openai import OpenAI
            from config.settings import settings
            import pygame

            _init_pygame()

            logger.info("TTS: %s", text)
            client = OpenAI(api_key=settings.openai_api_key)
            response = client.audio.speech.create(
                model="tts-1",
                voice="nova",       # nova suena natural en español
                input=text,
                response_format="mp3",
            )

            audio_buf = io.BytesIO(response.content)
            pygame.mixer.music.load(audio_buf)
            pygame.mixer.music.play()
            while pygame.mixer.music.get_busy():
                pygame.time.Clock().tick(10)

        except Exception as exc:
            logger.error("Error en TTS: %s", exc)


def speak_async(text: str) -> None:
    """Reproduce el audio en un hilo separado (no bloquea)."""
    t = threading.Thread(target=speak, args=(text,), daemon=True)
    t.start()


def stop() -> None:
    try:
        import pygame
        if _mixer_ready:
            pygame.mixer.music.stop()
    except Exception:
        pass
