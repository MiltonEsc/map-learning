"use client";

import { useCallback, useRef, useState } from "react";

export interface VisionResult {
  riesgo: boolean;
  nivel: "ALTO" | "MEDIO" | "BAJO" | "NINGUNO";
  descripcion: string;
  accion: string;
}

export interface JarvisState {
  speaking: boolean;
  listening: boolean;
  lastAlert: VisionResult | null;
  transcript: string;
  reply: string;
}

let _audioCtx: AudioContext | null = null;

function getAudioCtx(): AudioContext {
  if (!_audioCtx || _audioCtx.state === "closed") {
    _audioCtx = new AudioContext();
  }
  // iOS requiere reanudar el contexto tras interacción del usuario
  if (_audioCtx.state === "suspended") {
    _audioCtx.resume();
  }
  return _audioCtx;
}

async function speakText(text: string, urgent = false): Promise<void> {
  const res = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, urgent }),
  });
  if (!res.ok) return;

  // Recibir el buffer completo antes de reproducir — evita cortes
  const arrayBuffer = await res.arrayBuffer();
  const ctx = getAudioCtx();

  return new Promise((resolve) => {
    ctx.decodeAudioData(arrayBuffer, (decoded) => {
      const source = ctx.createBufferSource();
      source.buffer = decoded;
      source.connect(ctx.destination);
      source.onended = () => resolve();
      source.start(0);
    }, () => resolve()); // fallback si falla el decode
  });
}

export function useJarvis(getTrafficContext: () => string) {
  const [state, setState] = useState<JarvisState>({
    speaking: false,
    listening: false,
    lastAlert: null,
    transcript: "",
    reply: "",
  });

  const isSpeaking = useRef(false);
  const lastAlertLevel = useRef<string>("NINGUNO");
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);

  // ── Analizar frame con GPT-4o Vision ─────────────────────────────────────
  const analyzeFrame = useCallback(async (imageBase64: string) => {
    try {
      const res = await fetch("/api/vision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64 }),
      });
      if (!res.ok) return;
      const result: VisionResult = await res.json();

      if (result.riesgo && result.nivel !== "NINGUNO") {
        setState((s) => ({ ...s, lastAlert: result }));

        // Alertar solo si el nivel cambió o es ALTO (evita repeticiones)
        const shouldAlert =
          result.nivel === "ALTO" ||
          result.nivel !== lastAlertLevel.current;

        if (shouldAlert && !isSpeaking.current) {
          lastAlertLevel.current = result.nivel;
          isSpeaking.current = true;
          setState((s) => ({ ...s, speaking: true }));
          const msg = result.nivel === "ALTO"
            ? `¡ATENCIÓN! ${result.descripcion}. ${result.accion}`
            : `${result.descripcion}. ${result.accion}`;
          await speakText(msg, result.nivel === "ALTO");
          isSpeaking.current = false;
          setState((s) => ({ ...s, speaking: false }));
        }
      } else {
        lastAlertLevel.current = "NINGUNO";
        setState((s) => ({ ...s, lastAlert: null }));
      }
    } catch {}
  }, []);

  // ── Chat con Jarvis (texto) ───────────────────────────────────────────────
  const askJarvis = useCallback(async (message: string, visionDesc?: string) => {
    if (isSpeaking.current) return;
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          trafficContext: getTrafficContext(),
          visionContext: visionDesc ?? null,
        }),
      });
      if (!res.ok) return;
      const { reply } = await res.json();
      setState((s) => ({ ...s, reply, transcript: message }));

      isSpeaking.current = true;
      setState((s) => ({ ...s, speaking: true }));
      await speakText(reply, false);
      isSpeaking.current = false;
      setState((s) => ({ ...s, speaking: false }));
    } catch {}
  }, [getTrafficContext]);

  // ── Grabación de voz → Whisper API ───────────────────────────────────────
  const startListening = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunks.current = [];
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      recorder.ondataavailable = (e) => audioChunks.current.push(e.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setState((s) => ({ ...s, listening: false }));
        const blob = new Blob(audioChunks.current, { type: "audio/webm" });
        const formData = new FormData();
        formData.append("file", blob, "audio.webm");
        formData.append("model", "whisper-1");
        formData.append("language", "es");
        try {
          const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
            method: "POST",
            headers: { Authorization: `Bearer ${process.env.NEXT_PUBLIC_OPENAI_KEY ?? ""}` },
            body: formData,
          });
          const data = await res.json();
          const transcript = data.text?.trim() ?? "";
          if (transcript) {
            setState((s) => ({ ...s, transcript }));
            await askJarvis(transcript);
          }
        } catch {}
      };
      recorder.start();
      mediaRecorder.current = recorder;
      setState((s) => ({ ...s, listening: true }));
    } catch {}
  }, [askJarvis]);

  const stopListening = useCallback(() => {
    mediaRecorder.current?.stop();
  }, []);

  return { state, analyzeFrame, askJarvis, startListening, stopListening, speakText };
}
