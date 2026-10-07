"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { DisplayMode } from "@/components/display-mode-toggle";
import { PresentationEditControls } from "@/components/presentation-edit";
import { setViewMode } from "@/components/view-mode";
import { HOME_SECTIONS, stageFrameSuffix } from "@/lib/site-map";

type NavItem = { href: string; label: string };

const STAGES: (NavItem & { active: (pathname: string) => boolean; sub?: NavItem[] })[] = [
  { href: "/lab", label: "Workflow", active: (pathname) => pathname === "/lab" },
  {
    href: "/lab/physarum",
    label: "Physarum Logic",
    active: (pathname) => pathname.startsWith("/lab/physarum"),
    sub: [
      { href: "/lab/physarum", label: "Translation" },
      { href: "/lab/physarum/runs", label: "Runs" },
      { href: "/lab/physarum/catalog", label: "Catalog" },
    ],
  },
  {
    href: "/lab/evolution",
    label: "2D Evolution",
    active: (pathname) => pathname.startsWith("/lab/evolution"),
    sub: [
      { href: "/lab/evolution", label: "Evolution" },
      { href: "/lab/evolution/pareto", label: "Pareto" },
      { href: "/lab/evolution/pareto-catalog", label: "Pareto Catalog" },
    ],
  },
  { href: "/lab/vertical", label: "Vertical Propagation", active: (pathname) => pathname === "/lab/vertical" || pathname.startsWith("/lab/vertical/") },
  {
    href: "/lab/hybrid",
    label: "Hybrid Connection",
    active: (pathname) => pathname === "/lab/hybrid" || pathname.startsWith("/lab/hybrid/"),
  },
];

const VIEW_MODES: { id: DisplayMode; label: string }[] = [
  { id: "desktop", label: "Desktop" },
  { id: "presentation", label: "Presentation" },
];

export function StageNav({ mode, presentationFrame }: { mode: DisplayMode; presentationFrame: boolean }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const wall = search.get("wall") === "1";
  const suffix = stageFrameSuffix(wall, presentationFrame);
  const activeStage = STAGES.find((stage) => stage.active(pathname));

  const processQuery = () => {
    const params = new URLSearchParams(search.toString());
    const query = params.toString();
    return query ? `/lab/vertical?${query}` : "/lab/vertical";
  };
  const catalogueQuery = () => {
    const params = new URLSearchParams(search.toString());
    const query = params.toString();
    return query ? `/lab/vertical/catalogue?${query}` : "/lab/vertical/catalogue";
  };
  const onProcess = pathname === "/lab/vertical";
  const onCatalogue = pathname.startsWith("/lab/vertical/catalogue");
  const onFinal = pathname.startsWith("/lab/vertical/final");
  const finalQuery = () => {
    const params = new URLSearchParams(search.toString());
    const query = params.toString();
    return query ? `/lab/vertical/final?${query}` : "/lab/vertical/final";
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
        <nav className="stage-nav-site" aria-label="Home">
          {HOME_SECTIONS.map((section) => (
            <Link key={section.href} href={section.href} target={presentationFrame ? "_top" : undefined}>
              {section.label}
            </Link>
          ))}
        </nav>
        <div className="stage-nav-tools">
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
        ) : activeStage?.href === "/lab/vertical" ? (
          <nav className="stage-nav-sub" aria-label="Vertical Propagation views">
            <Link
              href={processQuery()}
              className="stage-nav-subitem"
              aria-current={onProcess ? "page" : undefined}
              data-active={onProcess || undefined}
            >
              Process
            </Link>
            <Link href={catalogueQuery()} className="stage-nav-subitem" aria-current={onCatalogue ? "page" : undefined} data-active={onCatalogue || undefined}>
              Catalogue
            </Link>
            <Link href={finalQuery()} className="stage-nav-subitem" aria-current={onFinal ? "page" : undefined} data-active={onFinal || undefined}>
              Final
            </Link>
          </nav>
        ) : null}
      </div>
      </div>
    </header>
  );
}
