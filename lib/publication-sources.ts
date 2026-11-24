/**
 * Website publication source convention.
 *
 * Lab / computational authority → publication representation → Website.
 * Website sources never become upstream design authorities and must not write
 * production Lab files.
 */

export const PUBLICATION_SOURCE_REGISTRY = "living-morphologies-publication-sources-v1" as const;

export type PublicationClass = "live" | "published-snapshot" | "demo" | "legacy";

export type PublicationSource = {
  id: string;
  websiteSection: string;
  class: PublicationClass;
  path: string;
  originAuthority: string | null;
  mayLagLab: boolean;
  mayWrite: false;
  /** False for orphaned/legacy records the Website does not read. */
  consumedByWebsite: boolean;
  note: string;
};

export const PUBLICATION_SOURCES: readonly PublicationSource[] = [
  {
    id: "catalog-schema",
    websiteSection: "Demo Research / criteria",
    class: "live",
    path: "lib/catalog.ts",
    originAuthority: "Typology Analysis",
    mayLagLab: false,
    mayWrite: false,
    consumedByWebsite: true,
    note: "Locked human-authored criteria shared with Lab.",
  },
  {
    id: "skill1-shared-catalog",
    websiteSection: "Results Skill 1 plates",
    class: "published-snapshot",
    path: "public/shared-catalog",
    originAuthority: "Physarum Logic run publish",
    mayLagLab: true,
    mayWrite: false,
    consumedByWebsite: true,
    note: "Intentional frozen run plates.",
  },
  {
    id: "skill1-demo-entries",
    websiteSection: "Demo Workflow Skill 1",
    class: "demo",
    path: "public/demo/skill1",
    originAuthority: "Physarum Logic (export)",
    mayLagLab: true,
    mayWrite: false,
    consumedByWebsite: true,
    note: "Explanatory export. Not the Results snapshot and not Lab run authority.",
  },
  {
    id: "skill2-selections",
    websiteSection: "Results Skill 2 pick ids",
    class: "live",
    path: "data/skill2/pareto-catalog/selections.json",
    originAuthority: "Selected 2D checkpoint",
    mayLagLab: false,
    mayWrite: false,
    consumedByWebsite: true,
    note: "Live designer picks. Preview images are a separate snapshot.",
  },
  {
    id: "skill2-demo-previews",
    websiteSection: "Results / Demo Skill 2 images",
    class: "published-snapshot",
    path: "public/demo/skill2/previews",
    originAuthority: "Selected 2D checkpoint",
    mayLagLab: true,
    mayWrite: false,
    consumedByWebsite: true,
    note: "Frozen drawings of the live pick ids. Allowed to lag if export is stale.",
  },
  {
    id: "skill2-demo-catalog",
    websiteSection: "Demo Optimization JSON",
    class: "demo",
    path: "public/demo/skill2",
    originAuthority: "Optimization (export)",
    mayLagLab: true,
    mayWrite: false,
    consumedByWebsite: true,
    note: "Explanatory MOO boards. Not Lab search authority.",
  },
  {
    id: "skill3-final-selection",
    websiteSection: "Results / Demo Skill 3 ids",
    class: "live",
    path: "data/skill3/final-selection.json",
    originAuthority: "Selected 3D checkpoint",
    mayLagLab: false,
    mayWrite: false,
    consumedByWebsite: true,
    note: "Fifteen designer-selected modules.",
  },
  {
    id: "skill3-demo-pinned",
    websiteSection: "Demo Vertical (vertical-void / 351 / N24)",
    class: "demo",
    path: "public/demo/skill3/vertical-void/351-workflow.json",
    originAuthority: "Selected 3D checkpoint (one of 15)",
    mayLagLab: true,
    mayWrite: false,
    consumedByWebsite: true,
    note: "Pinned explanatory walkthrough of one selected module. Not the full 15.",
  },
  {
    id: "skill6-overnight-demo",
    websiteSection: "Demo clustering engines",
    class: "demo",
    path: "data/skill6/experiments/clustering-overnight-v1",
    originAuthority: null,
    mayLagLab: true,
    mayWrite: false,
    consumedByWebsite: true,
    note: "Research experiment collection. Not Initial Cluster production catalog.",
  },
  {
    id: "skill6-assembled-demo-pair",
    websiteSection: "Demo clustering refinement pair",
    class: "demo",
    path: "data/skill6/assembled",
    originAuthority: "Initial Cluster assembled catalog",
    mayLagLab: true,
    mayWrite: false,
    consumedByWebsite: true,
    note: "Uses assembled-flat-plate as an explanatory pipeline example. Not Interpretation production input.",
  },
  {
    id: "hybrid-integration-run",
    websiteSection: "Demo Integration run",
    class: "demo",
    path: "public/skill4/SKILL04-STRESS-TEST-*-catalog.json + browser lm-skill4-catalog",
    originAuthority: null,
    mayLagLab: true,
    mayWrite: false,
    consumedByWebsite: true,
    note: "Stress-test JSON plus browser Hybrid Cluster catalog. Not Finished Program Clusters.",
  },
  {
    id: "site-model",
    websiteSection: "Site / Demo site views",
    class: "live",
    path: "data/skill5/herald-site.json",
    originAuthority: "Authoritative Site Model",
    mayLagLab: false,
    mayWrite: false,
    consumedByWebsite: true,
    note: "Shared Lab site model. Website is read-only.",
  },
  {
    id: "site-configurations",
    websiteSection: "Website Site panel configurations",
    class: "legacy",
    path: "data/skill5/configurations.json",
    originAuthority: null,
    mayLagLab: true,
    mayWrite: false,
    consumedByWebsite: true,
    note: "Historical C01–C08. Not Selected Assembly for Development.",
  },
  {
    id: "lab-demo-video",
    websiteSection: "Lab Demo",
    class: "published-snapshot",
    path: "public/demo/home/presentation.json labDemo",
    originAuthority: null,
    mayLagLab: true,
    mayWrite: false,
    consumedByWebsite: true,
    note: "Runtime uses labDemo only. presentation.plates is unused legacy.",
  },
  {
    id: "presentation-plates-unused",
    websiteSection: "presentation.json plates",
    class: "legacy",
    path: "public/demo/home/presentation.json plates",
    originAuthority: null,
    mayLagLab: true,
    mayWrite: false,
    consumedByWebsite: false,
    note: "Orphaned. Not read by app/page.tsx. Results plates come from loadHomeResultPlates().",
  },
  {
    id: "published-lobby-cache",
    websiteSection: "Vertical GET optional cache",
    class: "legacy",
    path: "data/skill3/published-lobby",
    originAuthority: "Selected 3D checkpoint (derived cache)",
    mayLagLab: true,
    mayWrite: false,
    consumedByWebsite: true,
    note: "Optional serving cache. GET must not write it. final-selection.json remains the 3D authority.",
  },
];

export function publicationSourcesByClass(kind: PublicationClass) {
  return PUBLICATION_SOURCES.filter((item) => item.class === kind);
}

export function publicationGraphMermaid() {
  const lines = [
    "flowchart LR",
    "  classDef live fill:#0b1f22,stroke:#49d7de,color:#e8ffff",
    "  classDef snapshot fill:#1a1a12,stroke:#c77e5f,color:#ffd8c8",
    "  classDef demo fill:#111,stroke:#888,color:#ccc",
    "  classDef legacy fill:#111,stroke:#555,color:#888",
    "  classDef lab fill:#102018,stroke:#49d7de,color:#cffff6",
    "  labAuth[Lab / computational authorities]:::lab",
    "  website[Website]:::live",
  ];
  for (const source of PUBLICATION_SOURCES) {
    lines.push(`  ${source.id}["${source.id}\\n${source.class}"]:::${source.class === "published-snapshot" ? "snapshot" : source.class}`);
    if (source.originAuthority) {
      lines.push(`  labAuth --> ${source.id}`);
    }
    if (source.consumedByWebsite) {
      lines.push(`  ${source.id} --> website`);
    }
  }
  return lines.join("\n");
}
