import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const VISION_PROMPT = `Eres el sistema de visión de un asistente de conducción inteligente llamado Jarvis.
Analiza esta imagen capturada por la cámara del tablero de un vehículo en movimiento en Barranquilla, Colombia.

Detecta ÚNICAMENTE situaciones de RIESGO REAL e INMEDIATO:
- Accidentes o vehículos accidentados en la vía
- Vehículos en sentido contrario
- Peatones cruzando inesperadamente
- Señales de PARE, semáforos en rojo que el conductor pueda ignorar
- Obstáculos en la vía (huecos grandes, escombros, animales)
- Vehículos de emergencia (ambulancias, bomberos, policía)

Responde en JSON con este formato exacto:
{
  "riesgo": true/false,
  "nivel": "ALTO" | "MEDIO" | "BAJO" | "NINGUNO",
  "descripcion": "descripción breve en español colombiano (máx 15 palabras)",
  "accion": "qué debe hacer el conductor ahora mismo (máx 10 palabras)"
}

Si la vía está despejada y no hay riesgo, responde con riesgo: false y nivel: "NINGUNO".
NO reportes situaciones normales de tráfico como riesgo.`;

export async function POST(req: NextRequest) {
  try {
    const { imageBase64 } = await req.json();
    if (!imageBase64) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    const response = await client.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 200,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: VISION_PROMPT },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${imageBase64}`,
                detail: "low", // más rápido y barato, suficiente para detección de riesgos
              },
            },
          ],
        },
      ],
    });

    const raw = response.choices[0].message.content ?? "{}";
    const result = JSON.parse(raw);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
