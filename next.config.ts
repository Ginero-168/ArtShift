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
    config.module.noParse = /[\\/]@techstark[\\/]opencv-js[\\/]dist[\\/]opencv\.js$/;
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
    };

    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
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
  const developmentPort = process.env.PORT?.trim();
  const developmentDistDir = developmentPort?.match(/^\d{1,5}$/)
    ? `.next-dev-${developmentPort}`
    : ".next-dev";

  return {
    ...sharedConfig,
    // Keep dev caches isolated by port so multiple local sessions cannot corrupt
    // each other's Webpack module tables. Production continues to use `.next`.
    distDir: phase === PHASE_DEVELOPMENT_SERVER ? developmentDistDir : ".next",
  };
}
