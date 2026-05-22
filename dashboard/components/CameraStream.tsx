"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, CameraOff, Wifi, WifiOff } from "lucide-react";
import { getCameraStreamUrl } from "@/lib/api";

export default function CameraStream() {
  const imgRef = useRef<HTMLImageElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [vehicleCount, setVehicleCount] = useState<number | null>(null);
  const [active, setActive] = useState(false);

  const connect = () => {
    if (wsRef.current) {
      wsRef.current.close();
    }

    const ws = new WebSocket(getCameraStreamUrl());
    ws.binaryType = "blob";

    ws.onopen = () => {
      setConnected(true);
      setActive(true);
    };

    ws.onmessage = (event) => {
      if (event.data instanceof Blob && imgRef.current) {
        const url = URL.createObjectURL(event.data);
        const prev = imgRef.current.src;
        imgRef.current.src = url;
        if (prev.startsWith("blob:")) URL.revokeObjectURL(prev);
      }
    };

    ws.onclose = () => {
      setConnected(false);
    };

    ws.onerror = () => {
      setConnected(false);
    };

    wsRef.current = ws;
  };

  const disconnect = () => {
    wsRef.current?.close();
    wsRef.current = null;
    setActive(false);
    setConnected(false);
  };

  useEffect(() => {
    return () => wsRef.current?.close();
  }, []);

  return (
    <div className="rounded-2xl border border-white/10 bg-zinc-900 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
        <div className="flex items-center gap-2">
          <Camera size={18} className="text-white/70" />
          <span className="text-white font-semibold">Cámara en vivo</span>
          <span className={`w-2 h-2 rounded-full ml-1 ${connected ? "bg-green-400 animate-pulse" : "bg-zinc-600"}`} />
        </div>
        <button
          onClick={active ? disconnect : connect}
          className={`flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg transition-colors ${
            active
              ? "bg-red-900/50 text-red-400 hover:bg-red-900"
              : "bg-blue-900/50 text-blue-400 hover:bg-blue-900"
          }`}
        >
          {active ? <><WifiOff size={14} /> Detener</> : <><Wifi size={14} /> Iniciar stream</>}
        </button>
      </div>

      {/* Video */}
      <div className="relative bg-black aspect-video flex items-center justify-center">
        {active ? (
          <>
            <img
              ref={imgRef}
              alt="Camera stream"
              className="w-full h-full object-contain"
            />
            {!connected && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                <p className="text-white/60 text-sm">Conectando...</p>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center gap-3 text-white/30">
            <CameraOff size={40} />
            <p className="text-sm">Stream detenido</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-5 py-3 flex items-center gap-4 text-xs text-white/40">
        <span>YOLOv8 detección vehicular</span>
        {connected && <span className="text-green-400">● En vivo</span>}
      </div>
    </div>
  );
}
