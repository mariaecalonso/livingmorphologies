import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  devIndicators: false,
  outputFileTracingExcludes: {
    "*": [
      "data/**/*.png",
      "public/shared-catalog/**",
      "public/assets/**",
      "public/references/**",
      "tmp/**",
    ],
  },
};

export default nextConfig;
