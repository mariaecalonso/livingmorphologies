"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { DisplayMode } from "@/components/display-mode-toggle";
import { PresentationEditControls } from "@/components/presentation-edit";
import { useVerticalView, VERTICAL_VIEWS } from "@/components/vertical-view";
import { setViewMode } from "@/components/view-mode";

type NavItem = { href: string; label: string };

const STAGES: (NavItem & { match: string; sub?: NavItem[] })[] = [
  { href: "/lab", label: "Workflow", match: "/lab" },
  {
    href: "/lab/physarum",
    label: "Physarum Logic",
    match: "/lab/physarum",
    sub: [
      { href: "/lab/physarum", label: "Translation" },
      { href: "/lab/physarum/runs", label: "Runs" },
      { href: "/lab/physarum/catalog", label: "Catalog" },
    ],
  },
  {
    href: "/lab/evolution",
    label: "2D Evolution",
    match: "/lab/evolution",
    sub: [
      { href: "/lab/evolution", label: "Evolution" },
      { href: "/lab/evolution/pareto", label: "Pareto" },
      { href: "/lab/evolution/pareto-catalog", label: "Pareto Catalog" },
    ],
  },
  { href: "/lab/vertical", label: "Vertical Propagation", match: "/lab/vertical" },
];

const VIEW_MODES: { id: DisplayMode; label: string }[] = [
  { id: "desktop", label: "Desktop" },
  { id: "presentation", label: "Presentation" },
];

const isStageActive = (pathname: string, match: string) =>
  match === "/lab" ? pathname === "/lab" : pathname === match || pathname.startsWith(`${match}/`);

export function StageNav({ mode, presentationFrame }: { mode: DisplayMode; presentationFrame: boolean }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const verticalView = useVerticalView();
  const wall = search.get("wall") === "1";
  const legacy = search.get("legacy") === "1";
  const suffix = presentationFrame ? "?wall=1&frame=1" : wall ? "?wall=1" : "";
  const activeStage = STAGES.find((stage) => isStageActive(pathname, stage.match));

  const verticalQuery = (nextLegacy: boolean) => {
    const params = new URLSearchParams(search.toString());
    if (nextLegacy) params.set("legacy", "1");
    else params.delete("legacy");
    const query = params.toString();
    return query ? `/lab/vertical?${query}` : "/lab/vertical";
  };

  const changeMode = (next: DisplayMode) => {
    if (next === mode) return;
    if (!presentationFrame) {
      setViewMode(next);
      return;
    }
    const params = new URLSearchParams(search.toString());
    params.delete("wall");
    params.delete("frame");
    const query = params.toString();
    setViewMode(next, `${pathname}${query ? `?${query}` : ""}${window.location.hash}`);
  };

  return (
    <header className="stage-nav">
      <Link href={`/lab${suffix}`} className="stage-nav-identity">
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
        ) : activeStage?.match === "/lab/vertical" ? (
          <nav className="stage-nav-sub" aria-label="Vertical Propagation views">
            {legacy ? (
              <Link href={verticalQuery(false)} className="stage-nav-subitem">
                Process
              </Link>
            ) : null}
            {legacy
              ? VERTICAL_VIEWS.map((item) => {
                  const active = item.view === verticalView;
                  return (
                    <a
                      key={item.hash}
                      href={`${verticalQuery(true)}${item.hash}`}
                      aria-current={active ? "page" : undefined}
                      className="stage-nav-subitem"
                      data-active={active || undefined}
                    >
                      {item.label}
                    </a>
                  );
                })
              : (
                <Link href={verticalQuery(true)} className="stage-nav-subitem">
                  Experimental
                </Link>
              )}
          </nav>
        ) : null}
        {mode === "presentation" ? <PresentationEditControls /> : null}
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
