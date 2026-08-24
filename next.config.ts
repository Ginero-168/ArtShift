import path from "node:path";
import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

const florenceBrowserEntry = path.join(
  path.dirname(path.dirname(require.resolve("transformers-florence-v3"))),
  "dist",
  "transformers.web.js",
);

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
    // The package export condition can resolve its Node entry while Next is
    // compiling the Web Worker. Force the browser build in both the client
    // and server compilation passes so webpack never traverses
    // onnxruntime-node's native .node binaries.
    config.resolve.alias = {
      ...config.resolve.alias,
      "transformers-florence-v3$": florenceBrowserEntry,
    };
    if (isServer) {
      config.externals = [
        ...(Array.isArray(config.externals) ? config.externals : []),
        { "onnxruntime-node": "commonjs onnxruntime-node" },
      ];
    }
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
