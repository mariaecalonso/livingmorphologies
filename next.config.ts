import { readFileSync } from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

type SelectionFile = {
  selections: Array<{ archetypeId: string; candidateId: number; continuationId: string }>;
};

const selection = JSON.parse(readFileSync(path.join(process.cwd(), "data", "skill3", "final-selection.json"), "utf8")) as SelectionFile;
const handoffMeshes = selection.selections.map((entry) =>
  `./data/experiments/carved-mass-solidified/${entry.archetypeId}-${entry.candidateId}-${entry.continuationId}.json`,
);

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
      "data/experiments/**",
      "data/skill2/pareto-catalog/**/*.bin",
      "data/semantic-catalogs/**/*.bin",
      "public/shared-catalog/**",
      "public/assets/**",
      "public/references/**",
      "tmp/**",
    ],
  },
  outputFileTracingIncludes: {
    "/api/skill4/handoff": ["./data/skill3/final-selection.json", ...handoffMeshes],
    "/api/vertical/solidified": ["./data/skill3/final-selection.json", ...handoffMeshes],
    "/api/vertical/experiments/carved-mass/dataset": ["./data/experiments/carved-mass/manifest.json"],
  },
};

export default nextConfig;
