"use client";

/** Archived. The site Overall Workflow is the map. /lab redirects to Physarum Logic. */

import { Fragment } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useFramed } from "@/components/view-mode";
import { LAB_WORKSPACES, stageFrameSuffix } from "@/lib/site-map";

const STAGES = [
  {
    id: "physarum",
    summary: "The archetype rail, the locked criteria, and the live Physarum field, then the runs and the saved plates.",
  },
  {
    id: "optimization",
    summary: "The search from Physarum logic, the objective space, and the drawings chosen to leave this skill.",
  },
  {
    id: "vertical",
    summary: "The selected section continued upward, the propagated set, and the final morphology catalogue.",
  },
  {
    id: "hybrid",
    summary: "One screen: tile count, the aggregation, and the connection matrices.",
  },
] as const;

export function WorkflowOverview() {
  const search = useSearchParams();
  const frame = useFramed();
  const suffix = stageFrameSuffix(search.get("wall") === "1", frame?.presentationFrame ?? false);

  return (
    <main className="workflow-page">
      <ol className="workflow-flow">
        {STAGES.map((stage, index) => {
          const workspace = LAB_WORKSPACES.find((item) => item.id === stage.id);
          if (!workspace) return null;
          const links = workspace.tabs.length > 0
            ? workspace.tabs.map((tab) => ({ href: tab.href, label: tab.label }))
            : [{ href: workspace.href, label: workspace.label }];
          return (
            <Fragment key={workspace.id}>
              <li className="workflow-stage">
                <p className="eyebrow workflow-stage-kicker">Stage</p>
                <h2 className="display workflow-stage-title">{workspace.label}</h2>
                <p className="workflow-stage-summary">{stage.summary}</p>
                <nav className="workflow-stage-links" aria-label={workspace.label}>
                  {links.map((item) => (
                    <Link key={item.href} href={`${item.href}${suffix}`}>
                      {item.label}
                    </Link>
                  ))}
                </nav>
              </li>
              {index < STAGES.length - 1 ? (
                <li className="workflow-handoff" aria-hidden="true">
                  <span className="workflow-handoff-arrow" />
                </li>
              ) : null}
            </Fragment>
          );
        })}
      </ol>
    </main>
  );
}
