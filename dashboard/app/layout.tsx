import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TrafficVoice AI",
  description: "Asistente Jarvis de tráfico con IA",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "TrafficVoice",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${geistSans.variable} h-full`}>
      {/* suppressHydrationWarning evita falso error por extensiones del navegador */}
      <body className="min-h-full bg-zinc-950" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
