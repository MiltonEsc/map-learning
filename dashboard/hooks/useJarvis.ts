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

async function speakText(text: string, urgent = false): Promise<void> {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    return new Promise((resolve) => {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "es-CO";
      utterance.rate = urgent ? 1.2 : 1.0;
      utterance.pitch = 1.0;
      const voices = window.speechSynthesis.getVoices();
      const spanishVoice = voices.find((v) => v.lang.startsWith("es")) ?? null;
      if (spanishVoice) utterance.voice = spanishVoice;
      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();
      window.speechSynthesis.speak(utterance);
    });
  }
  // Fallback: OpenAI TTS si speechSynthesis no está disponible
  const res = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, urgent }),
  });
  if (!res.ok) return;
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  return new Promise((resolve) => {
    const audio = new Audio(url);
    audio.oncanplaythrough = () => audio.play().catch(resolve);
    audio.onended = () => { URL.revokeObjectURL(url); resolve(); };
    audio.onerror = () => { URL.revokeObjectURL(url); resolve(); };
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
