import { Fragment } from "react";
import { WorkflowNetwork } from "@/components/workflow-network";

type WorkflowStage = {
  title: string;
  summary: string;
  steps: string[];
  chain: boolean;
  note?: string;
};

const STAGES: WorkflowStage[] = [
  {
    title: "Architectural Input",
    summary: "The design brief, expressed as rated architectural criteria.",
    steps: ["Typology", "Archetype", "Criteria", "Ratings", "Descriptors"],
    chain: false,
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
  },
  {
    title: "Vertical Propagation",
    summary: "The chosen section grows through successive states into volume.",
    steps: ["Selected 2D morphology", "Successive states", "Vertical propagation", "Volumetric morphology"],
    chain: true,
  },
];

const HANDOFFS = ["Criteria ratings + descriptors", "2D morphology + translation state", "Selected non-dominated morphology"];

export function WorkflowOverview() {
  return (
    <main className="workflow-page">
      <header className="workflow-hero">
        <div className="workflow-hero-text">
          <p className="display workflow-title">Living Morphologies</p>
          <p className="workflow-lede">
            Architectural criteria translated through emergent growth, evolutionary selection, and vertical propagation.
          </p>
          <p className="eyebrow workflow-hero-note">Illustrative · not simulation output</p>
        </div>
        <WorkflowNetwork />
      </header>

      <ol className="workflow-flow">
        {STAGES.map((stage, index) => (
          <Fragment key={stage.title}>
            <li className="workflow-stage" data-input={index === 0 || undefined}>
              <p className="eyebrow workflow-stage-kicker">{index === 0 ? "Input" : "Stage"}</p>
              <h2 className="display workflow-stage-title">{stage.title}</h2>
              <p className="workflow-stage-summary">{stage.summary}</p>
              <ul className="workflow-steps" data-chain={stage.chain || undefined}>
                {stage.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ul>
              {stage.note ? <p className="workflow-stage-note">{stage.note}</p> : null}
            </li>
            {index < HANDOFFS.length ? (
              <li className="workflow-handoff" aria-label={`Handoff: ${HANDOFFS[index]}`}>
                <span className="workflow-handoff-arrow" aria-hidden="true" />
                <span className="workflow-handoff-label">{HANDOFFS[index]}</span>
              </li>
            ) : null}
          </Fragment>
        ))}
      </ol>
    </main>
  );
}
