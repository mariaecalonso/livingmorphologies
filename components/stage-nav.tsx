"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { DisplayMode } from "@/components/display-mode-toggle";
import { PresentationEditControls } from "@/components/presentation-edit";
import { setViewMode } from "@/components/view-mode";
import { LAB_WORKSPACES, stageFrameSuffix } from "@/lib/site-map";

type NavItem = { href: string; label: string };

const STAGES: (NavItem & { active: (pathname: string) => boolean; sub?: readonly NavItem[] })[] = [
  ...LAB_WORKSPACES.map((workspace) => ({
    href: workspace.href,
    label: workspace.label,
    active: (pathname: string) => pathname === workspace.href || pathname.startsWith(`${workspace.href}/`),
    sub: workspace.tabs,
  })),
];

export function StageNav({ mode, presentationFrame }: { mode: DisplayMode; presentationFrame: boolean }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const wall = search.get("wall") === "1";
  const suffix = stageFrameSuffix(wall, presentationFrame);
  const activeStage = STAGES.find((stage) => stage.active(pathname));

  const tabHref = (href: string) => {
    if (!href.startsWith("/lab/vertical")) return `${href}${suffix}`;
    const params = new URLSearchParams(search.toString());
    const query = params.toString();
    return query ? `${href}?${query}` : href;
  };
  const tabCurrent = (href: string) => {
    if (LAB_WORKSPACES.some((workspace) => workspace.href === href)) return pathname === href;
    return pathname === href || pathname.startsWith(`${href}/`);
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
      <div className="stage-nav-top">
        <Link href="/" className="stage-nav-identity" target={presentationFrame ? "_top" : undefined}>
          <span className="display site-nav-title">Living Morphologies</span>
        </Link>
        <div className="stage-nav-tools">
          {mode === "presentation" ? <PresentationEditControls /> : null}
          <div className="stage-nav-mode">
            <button
              type="button"
              aria-pressed={mode === "presentation"}
              aria-label={mode === "presentation" ? "Presentation. Switch to desktop" : "Desktop. Switch to presentation"}
              onClick={() => changeMode(mode === "presentation" ? "desktop" : "presentation")}
            >
              {mode === "presentation" ? <PresentationIcon /> : <DesktopIcon />}
            </button>
          </div>
        </div>
      </div>
      <div className="stage-nav-bottom">
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
        {activeStage?.sub && activeStage.sub.length > 0 ? (
          <nav className="stage-nav-sub" aria-label={`${activeStage.label} views`}>
            {activeStage.sub.map((item) => {
              const active = tabCurrent(item.href);
              return (
                <Link
                  key={item.href}
                  href={tabHref(item.href)}
                  aria-current={active ? "page" : undefined}
                  className="stage-nav-subitem"
                  data-active={active || undefined}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        ) : null}
      </div>
      </div>
    </header>
  );
}

function DesktopIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5" y="5" width="14" height="10" rx="1" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M3 18.5h18" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function PresentationIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="2" y="6" width="20" height="11" rx="1" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M9 20h6" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
