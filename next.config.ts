import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  devIndicators: false,
  async redirects() {
    return [
      { source: "/lab", destination: "/lab/physarum", permanent: false },
      { source: "/lab/evolution/pareto", destination: "/lab/evolution/pareto-catalog", permanent: false },
      { source: "/hybrid", destination: "/lab/hybrid", permanent: false },
      { source: "/hybrid/assembly", destination: "/lab/hybrid", permanent: false },
    ];
  },
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
