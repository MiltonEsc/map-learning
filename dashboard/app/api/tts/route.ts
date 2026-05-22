import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const { text, urgent } = await req.json();
    if (!text) return NextResponse.json({ error: "No text" }, { status: 400 });

    const response = await client.audio.speech.create({
      model: "tts-1",
      voice: urgent ? "onyx" : "nova", // onyx más autoritario para alertas de riesgo
      input: text,
      response_format: "mp3",
      speed: urgent ? 1.15 : 1.0,
    });

    const buffer = Buffer.from(await response.arrayBuffer());
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": buffer.length.toString(),
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
