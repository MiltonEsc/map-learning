import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const JARVIS_PROMPT = `Eres Jarvis, un asistente de conducción inteligente y amigable para el carro.
Hablas en español colombiano, de forma clara y concisa.
Estás integrado con datos de tráfico en tiempo real de Barranquilla, Colombia.

Reglas mientras el conductor maneja:
- Respuestas MUY cortas (máx 2 oraciones) para no distraer
- Si hay tráfico pesado, da el consejo específico
- Puedes hacer comentarios sobre la música, el clima, el tráfico
- Si te preguntan algo complejo, responde brevemente y ofrece más info después
- Usa un tono amigable como un copiloto de confianza`;

export async function POST(req: NextRequest) {
  try {
    const { message, trafficContext, visionContext } = await req.json();

    const contextParts: string[] = [];
    if (trafficContext) contextParts.push(`Tráfico actual:\n${trafficContext}`);
    if (visionContext) contextParts.push(`Lo que ve la cámara:\n${visionContext}`);

    const systemContent = contextParts.length > 0
      ? `${JARVIS_PROMPT}\n\nContexto actual:\n${contextParts.join("\n\n")}`
      : JARVIS_PROMPT;

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 120,
      temperature: 0.7,
      messages: [
        { role: "system", content: systemContent },
        { role: "user", content: message },
      ],
    });

    const reply = response.choices[0].message.content?.trim() ?? "";
    return NextResponse.json({ reply });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
