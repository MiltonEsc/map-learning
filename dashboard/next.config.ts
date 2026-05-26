import type { NextConfig } from "next";

const isCapacitor = process.env.CAPACITOR_BUILD === "true";
const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const nextConfig: NextConfig = {
  ...(isCapacitor
    ? {
        output: "export",
        images: { unoptimized: true },
        trailingSlash: true,
      }
    : {
        turbopack: {},
        async rewrites() {
          return [
            {
              source: "/backend/:path*",
              destination: `${apiUrl}/:path*`,
            },
          ];
        },
      }),
};

export default nextConfig;
