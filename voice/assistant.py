"""
Asistente de voz principal.

Flujo:
  1. Escucha micrófono → Whisper API → texto
  2. Llama GPT-4o-mini con contexto de tráfico en tiempo real
  3. GPT genera respuesta natural en español
  4. pyttsx3 habla la respuesta

GPT recibe: la pregunta del usuario + datos actuales de /predict para cada ruta.
"""

import json
import logging
import threading
from datetime import datetime

import httpx

from config.settings import settings
from voice import stt, tts

logger = logging.getLogger(__name__)

API_BASE = "http://localhost:8000"

_SYSTEM_PROMPT = """Eres un asistente de voz personal para predicción de tráfico en Barranquilla, Colombia.
Tu nombre es TrafficVoice.

Cuando el usuario te pregunta sobre el tráfico, recibirás datos en tiempo real de sus rutas.
Responde siempre en español colombiano, de forma clara y concisa (máximo 3 oraciones).
Usa los datos de tráfico que se te proporcionan para dar consejos precisos.
Si el tráfico está pesado, recomienda hora de salida o ruta alternativa.
Si no tienes datos, dilo con honestidad.
Nunca inventes datos de tráfico."""


def _get_traffic_context() -> str:
    """Consulta /predict para todas las rutas activas y construye contexto para GPT."""
    try:
        routes_resp = httpx.get(f"{API_BASE}/routes", timeout=5)
        routes = routes_resp.json()
    except Exception:
        return "No se pudo obtener información de rutas en este momento."

    context_parts = [f"Hora actual: {datetime.now().strftime('%H:%M')} — {_day_name()}"]

    for route in routes:
        try:
            pred_resp = httpx.post(
                f"{API_BASE}/predict",
                json={"route_id": route["id"]},
                timeout=5,
            )
            pred = pred_resp.json()
            context_parts.append(
                f"Ruta '{route['label']}': {pred.get('predicted_duration_min', '?')} min "
                f"| Tráfico: {pred.get('traffic_level', '?')} "
                f"| Confianza: {int((pred.get('confidence') or 0) * 100)}% "
                f"| Consejo: {pred.get('advice', '')}"
            )
        except Exception:
            context_parts.append(f"Ruta '{route['label']}': sin datos disponibles")

    return "\n".join(context_parts)


def _day_name() -> str:
    days = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]
    return days[datetime.now().weekday()]


def ask(question: str) -> str:
    """
    Envía una pregunta a GPT-4o-mini con contexto de tráfico en tiempo real.
    Retorna la respuesta en texto.
    """
    from openai import OpenAI
    client = OpenAI(api_key=settings.openai_api_key)

    traffic_context = _get_traffic_context()

    messages = [
        {"role": "system", "content": _SYSTEM_PROMPT},
        {
            "role": "user",
            "content": f"Datos de tráfico en tiempo real:\n{traffic_context}\n\nPregunta del usuario: {question}",
        },
    ]

    response = client.chat.completions.create(
        model=settings.openai_model,
        messages=messages,
        max_tokens=200,
        temperature=0.4,
    )
    answer = response.choices[0].message.content.strip()
    logger.info("GPT respuesta: %s", answer)
    return answer


def handle_voice_query(duration_sec: int = 5) -> str:
    """
    Ciclo completo: graba → transcribe → GPT → habla.
    Retorna el texto de la respuesta.
    """
    tts.speak("Dime, te escucho.")

    transcript = stt.listen(duration_sec=duration_sec)
    if not transcript:
        tts.speak("No escuché nada. Habla más cerca del micrófono e intenta de nuevo.")
        return ""

    logger.info("Usuario dijo: %s", transcript)
    tts.speak("Un momento, consultando el tráfico.")

    response = ask(transcript)
    tts.speak(response)
    return response


_listener_thread: threading.Thread | None = None
_running = False


def start_continuous_listening(duration_sec: int = 5, pause_sec: float = 1.0) -> None:
    """
    Arranca el asistente en modo push-to-talk en un hilo de fondo.
    El usuario presiona Enter para hablar.
    """
    global _running, _listener_thread

    def _loop():
        logger.info("Asistente de voz iniciado — modo push-to-talk")
        tts.speak("Hola, soy TrafficVoice. Presiona Enter para hablarme.")
        print("\n" + "="*50)
        print("TrafficVoice listo. Presiona Enter para hablar.")
        print("Escribe 'salir' y Enter para apagar el asistente.")
        print("="*50 + "\n")
        while _running:
            try:
                cmd = input("[ Enter = hablar | 'salir' = apagar ]: ").strip().lower()
                if cmd == "salir":
                    tts.speak("Hasta luego.")
                    break
                handle_voice_query(duration_sec=duration_sec)
            except (KeyboardInterrupt, EOFError):
                break
            except Exception as exc:
                logger.error("Error en ciclo de escucha: %s", exc)

    _running = True
    _listener_thread = threading.Thread(target=_loop, daemon=True)
    _listener_thread.start()


def stop_continuous_listening() -> None:
    global _running
    _running = False
    logger.info("Asistente de voz detenido")
