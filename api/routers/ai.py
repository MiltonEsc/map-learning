"""
AI endpoints that mirror the Next.js /api/* routes.
Used by the Android app (Capacitor static export) and as a single source of truth.
"""
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from openai import AsyncOpenAI

from config.settings import settings

router = APIRouter(prefix="/ai", tags=["AI"])
client = AsyncOpenAI(api_key=settings.openai_api_key)

JARVIS_PROMPT = (
    "Eres Jarvis, un asistente de conducción inteligente y amigable para el carro.\n"
    "Hablas en español colombiano, de forma clara y concisa.\n"
    "Estás integrado con datos de tráfico en tiempo real de Barranquilla, Colombia.\n\n"
    "Reglas mientras el conductor maneja:\n"
    "- Respuestas de UNA oración corta (máx 15 palabras) para no distraer\n"
    "- Si hay tráfico pesado, da el consejo específico\n"
    "- Puedes hacer comentarios sobre la música, el clima, el tráfico\n"
    "- Si te preguntan algo complejo, responde brevemente y ofrece más info después\n"
    "- Usa un tono amigable como un copiloto de confianza"
)

VISION_PROMPT = (
    "Eres el sistema de visión de un asistente de conducción inteligente llamado Jarvis.\n"
    "Analiza esta imagen capturada por la cámara del tablero de un vehículo en movimiento "
    "en Barranquilla, Colombia.\n\n"
    "Detecta ÚNICAMENTE situaciones de RIESGO REAL e INMEDIATO:\n"
    "- Accidentes o vehículos accidentados en la vía\n"
    "- Vehículos en sentido contrario\n"
    "- Peatones cruzando inesperadamente\n"
    "- Señales de PARE, semáforos en rojo que el conductor pueda ignorar\n"
    "- Obstáculos en la vía (huecos grandes, escombros, animales)\n"
    "- Vehículos de emergencia (ambulancias, bomberos, policía)\n\n"
    "Responde en JSON con este formato exacto:\n"
    '{"riesgo": true/false, "nivel": "ALTO"|"MEDIO"|"BAJO"|"NINGUNO", '
    '"descripcion": "descripción breve en español colombiano (máx 15 palabras)", '
    '"accion": "qué debe hacer el conductor ahora mismo (máx 10 palabras)"}\n\n'
    "Si la vía está despejada y no hay riesgo, responde con riesgo: false y nivel: \"NINGUNO\".\n"
    "NO reportes situaciones normales de tráfico como riesgo."
)


# ── Schemas ───────────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    message: str
    trafficContext: str | None = None
    visionContext: str | None = None


class VisionRequest(BaseModel):
    imageBase64: str


class TTSRequest(BaseModel):
    text: str
    urgent: bool = False


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/chat")
async def jarvis_chat(req: ChatRequest):
    context_parts: list[str] = []
    if req.trafficContext:
        context_parts.append(f"Tráfico actual:\n{req.trafficContext}")
    if req.visionContext:
        context_parts.append(f"Lo que ve la cámara:\n{req.visionContext}")

    system_content = (
        f"{JARVIS_PROMPT}\n\nContexto actual:\n" + "\n\n".join(context_parts)
        if context_parts
        else JARVIS_PROMPT
    )

    response = await client.chat.completions.create(
        model="gpt-4o-mini",
        max_tokens=80,
        temperature=0.7,
        messages=[
            {"role": "system", "content": system_content},
            {"role": "user", "content": req.message},
        ],
    )
    reply = response.choices[0].message.content or ""
    return {"reply": reply.strip()}


@router.post("/vision")
async def jarvis_vision(req: VisionRequest):
    if not req.imageBase64:
        raise HTTPException(status_code=400, detail="No image provided")

    response = await client.chat.completions.create(
        model="gpt-4o",
        max_tokens=200,
        response_format={"type": "json_object"},
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": VISION_PROMPT},
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/jpeg;base64,{req.imageBase64}",
                            "detail": "low",
                        },
                    },
                ],
            }
        ],
    )
    import json
    raw = response.choices[0].message.content or "{}"
    return json.loads(raw)


@router.post("/tts")
async def jarvis_tts(req: TTSRequest):
    if not req.text:
        raise HTTPException(status_code=400, detail="No text provided")

    response = await client.audio.speech.create(
        model="tts-1",
        voice="onyx" if req.urgent else "nova",
        input=req.text,
        response_format="mp3",
        speed=1.15 if req.urgent else 1.0,
    )
    audio_bytes = bytes(await response.aread())
    return Response(
        content=audio_bytes,
        media_type="audio/mpeg",
        headers={"Content-Length": str(len(audio_bytes))},
    )
