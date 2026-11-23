import type { NextConfig } from "next";

// 개발 중 다른 기기(휴대폰 등)에서 접속할 주소: .env.local 의 DEV_ORIGINS=호스트1,호스트2 (예: Tailscale IP)
const devOrigins = (process.env.DEV_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);

const nextConfig: NextConfig = {
  allowedDevOrigins: ["*.ts.net", ...devOrigins],
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
