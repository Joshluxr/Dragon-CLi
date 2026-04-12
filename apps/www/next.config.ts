import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Webpack dev only (`pnpm dev:webpack`). Turbo dev (`pnpm dev`) uses a different pipeline.
  // Mobile / VPN / slow links: default chunk load timeout can surface as ChunkLoadError on first visit.
  webpack: (config, { dev, isServer }) => {
    if (dev && !isServer && config.output) {
      config.output.chunkLoadTimeout = 300000; // 5 minutes (ms)
    }
    return config;
  },
  images: {
    // Local images are now served from /cdn/ directory
    remotePatterns: [],
  },
  experimental: {
    reactCompiler: true,
    serverActions: {
      bodySizeLimit: "4mb",
    },
  },
  async rewrites() {
    return [
      {
        source: "/relay-WkjS/static/:path*",
        destination: "https://us-assets.i.posthog.com/static/:path*",
      },
      {
        source: "/relay-WkjS/:path*",
        destination: "https://us.i.posthog.com/:path*",
      },
      {
        source: "/relay-WkjS/flags",
        destination: "https://us.i.posthog.com/flags",
      },
    ];
  },
  async redirects() {
    // Backward compatibility: redirect /chat/:id to /task/:id
    return [
      {
        source: "/chat/:id",
        destination: "/task/:id",
        permanent: false,
      },
    ];
  },
  // This is required to support PostHog trailing slash API requests
  skipTrailingSlashRedirect: true,
};

export default nextConfig;
