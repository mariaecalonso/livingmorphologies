"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { DisplayMode } from "@/components/display-mode-toggle";
import { useVerticalView, VERTICAL_VIEWS } from "@/components/vertical-view";
import { setViewMode } from "@/components/view-mode";

type NavItem = { href: string; label: string };

const STAGES: (NavItem & { match: string; sub?: NavItem[] })[] = [
  { href: "/", label: "Workflow", match: "/" },
  {
    href: "/physarum",
    label: "Physarum Logic",
    match: "/physarum",
    sub: [
      { href: "/physarum", label: "Translation" },
      { href: "/physarum/runs", label: "Runs" },
      { href: "/physarum/catalog", label: "Catalog" },
    ],
  },
  {
    href: "/evolution/process",
    label: "2D Evolution",
    match: "/evolution",
    sub: [
      { href: "/evolution/process", label: "Process" },
      { href: "/evolution", label: "Evolution" },
      { href: "/evolution/pareto", label: "Pareto" },
      { href: "/evolution/pareto-catalog", label: "Pareto Catalog" },
    ],
  },
  { href: "/vertical", label: "Vertical Propagation", match: "/vertical" },
];

const VIEW_MODES: { id: DisplayMode; label: string }[] = [
  { id: "desktop", label: "Desktop" },
  { id: "presentation", label: "Presentation" },
];

const isStageActive = (pathname: string, match: string) =>
  match === "/" ? pathname === "/" : pathname === match || pathname.startsWith(`${match}/`);

export function StageNav({ mode, presentationFrame }: { mode: DisplayMode; presentationFrame: boolean }) {
  const pathname = usePathname();
  const verticalView = useVerticalView();
  const wall = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("wall") === "1";
  const suffix = presentationFrame ? "?wall=1&frame=1" : wall ? "?wall=1" : "";
  const activeStage = STAGES.find((stage) => isStageActive(pathname, stage.match));

  const changeMode = (next: DisplayMode) => {
    if (next === mode) return;
    setViewMode(next, presentationFrame ? `${pathname}${window.location.hash}` : undefined);
  };

  return (
    <header className="stage-nav">
      <Link href={`/${suffix}`} className="stage-nav-identity">
        <span className="display">Living Morphologies</span>
      </Link>
      <nav className="stage-nav-stages" aria-label="Workflow stages">
        {STAGES.map((stage, index) => {
          const active = stage === activeStage;
          return (
            <span key={stage.href} className="stage-nav-stage-wrap">
              {index > 0 ? <span className="stage-nav-sep" aria-hidden="true">›</span> : null}
              <Link
                href={`${stage.href}${suffix}`}
                aria-current={active ? "page" : undefined}
                className="stage-nav-stage"
                data-active={active || undefined}
              >
                {stage.label}
              </Link>
            </span>
          );
        })}
      </nav>
      <div className="stage-nav-end">
        {activeStage?.sub ? (
          <nav className="stage-nav-sub" aria-label={`${activeStage.label} views`}>
            {activeStage.sub.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={`${item.href}${suffix}`}
                  aria-current={active ? "page" : undefined}
                  className="stage-nav-subitem"
                  data-active={active || undefined}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        ) : activeStage?.match === "/vertical" ? (
          <nav className="stage-nav-sub" aria-label="Vertical Propagation views">
            {VERTICAL_VIEWS.map((item) => {
              const active = item.view === verticalView;
              return (
                <a
                  key={item.hash}
                  href={item.hash}
                  aria-current={active ? "page" : undefined}
                  className="stage-nav-subitem"
                  data-active={active || undefined}
                >
                  {item.label}
                </a>
              );
            })}
          </nav>
        ) : null}
        <div className="stage-nav-mode" role="group" aria-label="View mode">
          {VIEW_MODES.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={item.id === mode}
              data-active={item.id === mode || undefined}
              onClick={() => changeMode(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}
