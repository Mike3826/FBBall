import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    staleTimes: { dynamic: 0, static: 0 },
  },
  async redirects() {
    return [{ source: "/trade-log", destination: "/transactions", permanent: true }];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [{ key: "Cache-Control", value: "private, no-cache, no-store, max-age=0, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
