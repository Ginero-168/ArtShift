import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

const sharedConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "images.pexels.com" },
      { protocol: "https", hostname: "cdn.jsdelivr.net" },
      { protocol: "https", hostname: "fonts.googleapis.com" },
      { protocol: "https", hostname: "fonts.gstatic.com" },
    ],
  },
  webpack(config, { webpack }) {
    // PptxGenJS 4's ESM entry contains optional dynamic imports for Node-only
    // path-based media. ArtShift supplies browser data URLs exclusively, so
    // those unreachable branches must not enter the client bundle.
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      https: false,
    };
    config.plugins.push(
      new webpack.IgnorePlugin({
        resourceRegExp: /^node:(fs|https)$/,
      }),
    );
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
