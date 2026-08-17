import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

const sharedConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["pptxgenjs"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "images.pexels.com" },
      { protocol: "https", hostname: "cdn.jsdelivr.net" },
      { protocol: "https", hostname: "fonts.googleapis.com" },
      { protocol: "https", hostname: "fonts.gstatic.com" },
    ],
  },
  webpack(config, { isServer, webpack }) {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        https: false,
        http: false,
        stream: false,
        path: false,
        crypto: false,
      };
      config.plugins.push(
        new webpack.IgnorePlugin({
          resourceRegExp: /^node:(fs|https|http|stream|path|crypto)$/,
        }),
      );
    }
    return config;
  },
  // Uncomment for static export (Hostinger Shared Hosting without Node.js):
  // output: "export",
  // distDir: "dist",
};

export default function nextConfig(phase: string): NextConfig {
  return {
    ...sharedConfig,
    // `next dev` and `next build` may run concurrently during local QA.
    // Separate outputs prevent a production build from invalidating dev chunks.
    distDir: phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next",
  };
}
