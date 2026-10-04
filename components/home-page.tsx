"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { HomeLabPreview } from "@/components/home-lab-preview";
import { HomePrecedent } from "@/components/home-precedent";
import { HomeWorkflow } from "@/components/home-workflow";

const RAIL = [
  { href: "#home", id: "home", label: "Home" },
  { href: "#workflow", id: "workflow", label: "Workflow" },
  { href: "#precedent-analysis", id: "precedent-analysis", label: "Precedent Analysis" },
  { href: "#lab", id: "lab", label: "Lab" },
  { href: "#results", id: "results", label: "Results" },
] as const;

const STORY = [
  { id: "precedent-analysis", number: "02", title: "Precedent Analysis" },
  { id: "lab", number: "03", title: "Live Lab Preview" },
  { id: "results", number: "04", title: "Results" },
] as const;

function HomeSectionHeading({ number, title }: { number: string; title: string }) {
  const tone = Number(number) % 2 === 0 ? "copper" : "azul";
  return (
    <header className="home-section-heading">
      <p className={`home-index is-${tone}`}>{number}</p>
      <h2 className="home-overview-title">{title}</h2>
    </header>
  );
}

export function HomePage() {
  const rootRef = useRef<HTMLDivElement>(null);
  const railIndexRef = useRef(0);
  const [railIndex, setRailIndex] = useState(0);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const main = root.closest<HTMLElement>(".site-main");
    const shell = root.closest<HTMLElement>(".site-shell");
    const update = () => {
      const classroom = shell?.dataset.siteDisplay === "classroom" && !!shell && shell.clientHeight > 0;
      const mainScrolls = !classroom && !!main && main.scrollHeight > main.clientHeight + 2;
      const viewEl = classroom ? shell : mainScrolls ? main : null;
      const viewTop = viewEl ? viewEl.getBoundingClientRect().top : 0;
      const viewHeight = viewEl ? viewEl.clientHeight : window.innerHeight;
      root.style.setProperty("--home-view", `${Math.round(viewHeight)}px`);

      const home = root.querySelector<HTMLElement>('[data-rail-target="home"]');
      let travel = 0;
      if (home && viewHeight > 0) {
        const scrolled = viewTop - home.getBoundingClientRect().top;
        travel = Math.min(RAIL.length - 1, Math.max(0, scrolled / viewHeight));
      }
      root.style.setProperty("--rail-travel", travel.toFixed(3));
      const nearest = Math.round(travel);
      const next = Math.abs(travel - nearest) < 0.08 ? nearest : railIndexRef.current;
      if (next !== railIndexRef.current) {
        railIndexRef.current = next;
        setRailIndex(next);
      }

      if (!home) return;
      const heroBottom = home.getBoundingClientRect().bottom;
      const fullEdge = viewTop + viewHeight;
      const gone = viewTop + viewHeight * 0.7;
      const fade = Math.min(1, Math.max(0, (heroBottom - gone) / (fullEdge - gone)));
      root.style.setProperty("--hero-fade", fade.toFixed(3));
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(root);
    if (shell) observer.observe(shell);
    const displayObserver = new MutationObserver(update);
    if (shell) displayObserver.observe(shell, { attributes: true, attributeFilter: ["data-site-display"] });
    window.addEventListener("scroll", update, { passive: true });
    main?.addEventListener("scroll", update, { passive: true });
    shell?.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    window.addEventListener("hashchange", update);
    return () => {
      observer.disconnect();
      displayObserver.disconnect();
      window.removeEventListener("scroll", update);
      main?.removeEventListener("scroll", update);
      shell?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      window.removeEventListener("hashchange", update);
    };
  }, []);

  return (
    <div className="home-page" ref={rootRef} style={{ "--rail-index": railIndex } as CSSProperties}>
      <nav className="home-rail" aria-label="Sections">
        <span className="home-rail-track" aria-hidden="true">
          <span className="home-rail-line" />
          <span className="home-rail-energy" />
        </span>
        <span className="home-rail-indicator" aria-hidden="true" />
        {RAIL.map((item, index) => (
          <Link
            key={item.id}
            href={item.href}
            className={index === railIndex ? "home-rail-link is-current" : "home-rail-link"}
            aria-current={index === railIndex ? "true" : undefined}
            style={{ "--rail-slot": index } as CSSProperties}
          >
            <span className="home-rail-node" />
            {item.label}
          </Link>
        ))}
      </nav>

      <section className="home-hero" id="home" data-rail-target="home">
        <img
          className="home-hero-field home-hero-field-laptop"
          src="/home-hero-laptop.webp"
          alt=""
          draggable={false}
        />
        <img
          className="home-hero-field home-hero-field-classroom"
          src="/home-hero-classroom.webp"
          alt=""
          draggable={false}
        />
        <div className="home-hero-copy">
          <p className="home-team">
            Maria Alonso <span className="home-team-x home-team-x-teal">×</span> Renata Maguiño{" "}
            <span className="home-team-x home-team-x-copper">×</span> Julieta Segura
          </p>
          <h1 className="home-title">
            <span className="home-title-living">Living</span>
            <span className="home-title-morph">Morphologies</span>
          </h1>
          <p className="home-subtitle">A temporary project introduction.</p>
          <Link className="home-explore" href="/lab">
            <span>Explore Lab</span>
            <span className="home-explore-arrow" aria-hidden="true">
              →
            </span>
          </Link>
        </div>
      </section>

      <section className="home-overview home-workflow" id="workflow" data-rail-target="workflow">
        <HomeSectionHeading number="01" title="Overall Workflow" />
        <HomeWorkflow />
      </section>

      {STORY.map((section) => (
        <section className="home-overview" id={section.id} data-rail-target={section.id} key={section.id}>
          <HomeSectionHeading number={section.number} title={section.title} />
          {section.id === "precedent-analysis" ? <HomePrecedent /> : null}
          {section.id === "lab" ? <HomeLabPreview /> : null}
          {section.id === "results" ? (
            <Link className="results-generate" href="/results">
              <span>See More Results</span>
              <span className="results-generate-arrow" aria-hidden="true">
                →
              </span>
            </Link>
          ) : null}
        </section>
      ))}

      {railIndex < RAIL.length - 1 ? (
        <div className="home-scroll-cue" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      ) : null}
    </div>
  );
}
