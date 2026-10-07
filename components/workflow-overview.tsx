"use client";

import { Fragment } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useFramed } from "@/components/view-mode";
import { stageFrameSuffix } from "@/lib/site-map";

type StageLink = { href: string; label: string };

type WorkflowStage = {
  title: string;
  summary: string;
  steps: string[];
  chain: boolean;
  note?: string;
  links?: readonly StageLink[];
};

type WorkflowHandoff = {
  label: string;
};

const STAGES: WorkflowStage[] = [
  {
    title: "Architectural Input",
    summary: "The design brief, expressed as rated architectural criteria.",
    steps: ["Typology", "Archetype", "Criteria", "Ratings", "Descriptors"],
    chain: false,
    note: "Ratings and descriptors are locked. They are the brief every later stage reads.",
  },
  {
    title: "Physarum Logic",
    summary: "Architectural conditions become biological behaviour.",
    steps: [
      "Architectural conditions",
      "Biological translation",
      "Agent behaviour",
      "Canonical recipe",
      "2D morphology generation",
    ],
    chain: true,
    note: "The translation stays fixed. Its generated morphologies are what 2D evolution searches.",
    links: [{ href: "/lab/physarum", label: "Open" }],
  },
  {
    title: "2D Evolution",
    summary: "Populations of morphologies are measured and searched against the criteria.",
    steps: [
      "Population generation",
      "Morphological measurement",
      "Formal / Spatial / Atmospheric correspondence",
      "Evolutionary search",
      "Pareto archive",
      "Designer selection",
    ],
    chain: true,
    note: "The search returns non-dominated alternatives. The designer chooses which morphology proceeds.",
    links: [{ href: "/lab/evolution", label: "Open" }],
  },
  {
    title: "Vertical Propagation",
    summary: "The chosen section grows through successive states into volume.",
    steps: ["Selected 2D morphology", "Successive states", "Vertical propagation", "Volumetric morphology"],
    chain: true,
    note: "The chosen section grows through successive states into one volumetric morphology.",
    links: [{ href: "/lab/vertical", label: "Open" }],
  },
  {
    title: "Tiling",
    summary: "The fifteen volumetric models interlock and aggregate.",
    steps: ["15 volumetric models", "Interlocking", "Aggregation"],
    chain: true,
    note: "In construction",
    links: [{ href: "/lab/hybrid", label: "Hybrid" }],
  },
];

const HANDOFFS: WorkflowHandoff[] = [
  { label: "Criteria ratings + descriptors" },
  { label: "2D morphology + translation state" },
  { label: "Selected non-dominated morphology" },
  { label: "15 volumetric models" },
];

export function WorkflowOverview() {
  const search = useSearchParams();
  const frame = useFramed();
  const suffix = stageFrameSuffix(search.get("wall") === "1", frame?.presentationFrame ?? false);

  return (
    <main className="workflow-page">
      <ol className="workflow-flow">
        {STAGES.map((stage, index) => (
          <Fragment key={stage.title}>
            <li className="workflow-stage">
              <p className="eyebrow workflow-stage-kicker">{index === 0 ? "Input" : "Stage"}</p>
              <h2 className="display workflow-stage-title">{stage.title}</h2>
              <p className="workflow-stage-summary">{stage.summary}</p>
              <ul className="workflow-steps" data-chain={stage.chain || undefined}>
                {stage.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ul>
              {stage.note ? <p className="workflow-stage-note">{stage.note}</p> : null}
              {stage.links ? (
                <nav className="workflow-stage-links" aria-label={stage.title}>
                  {stage.links.map((item) => (
                    <Link key={item.href} href={`${item.href}${suffix}`}>
                      {item.label}
                    </Link>
                  ))}
                </nav>
              ) : null}
            </li>
            {index < HANDOFFS.length ? (
              <li
                className="workflow-handoff"
                aria-label={`Handoff: ${HANDOFFS[index].label}`}
              >
                <span className="workflow-handoff-arrow" aria-hidden="true" />
                <span className="workflow-handoff-label">{HANDOFFS[index].label}</span>
              </li>
            ) : null}
          </Fragment>
        ))}
      </ol>
    </main>
  );
}
