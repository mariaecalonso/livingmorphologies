"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { HomePrecedent } from "@/components/home-precedent";
import { HomeResults } from "@/components/home-results";
import { HomeWorkflowPrototype } from "@/components/home-workflow-prototype";

const RAIL = [
  { href: "#home", id: "home", label: "Home" },
  { href: "#workflow", id: "workflow", label: "Workflow" },
  { href: "#precedent-analysis", id: "precedent-analysis", label: "Precedent Analysis" },
  { href: "#results", id: "results", label: "Results" },
] as const;

const STORY = [
  { id: "precedent-analysis", number: "02", title: "Precedent Analysis" },
  { id: "results", number: "03", title: "Results" },
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
      const next = Math.min(RAIL.length - 1, Math.max(0, Math.round(travel)));
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

    const scroller = () => {
      const classroom = shell?.dataset.siteDisplay === "classroom" && !!shell && shell.clientHeight > 0;
      const mainScrolls = !classroom && !!main && main.scrollHeight > main.clientHeight + 2;
      return classroom ? shell : mainScrolls ? main : document.scrollingElement;
    };
    let frame = 0;
    const settle = (view: Element, top: number) => {
      if (view instanceof HTMLElement) view.style.scrollSnapType = "";
      (view as HTMLElement).scrollTop = top;
    };
    const go = (index: number) => {
      const view = scroller();
      if (!view) return;
      const height = view.clientHeight || window.innerHeight;
      const target = Math.round(index * height);
      const start = view.scrollTop;
      const distance = target - start;
      if (Math.abs(distance) < 2) return;
      const steps = Math.max(1, Math.round(Math.abs(distance) / height));
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduce) {
        settle(view, target);
        return;
      }
      const duration = Math.min(1500, 520 + steps * 280);
      const t0 = performance.now();
      if (view instanceof HTMLElement) view.style.scrollSnapType = "none";
      cancelAnimationFrame(frame);
      const tick = (now: number) => {
        const t = Math.min(1, (now - t0) / duration);
        const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        view.scrollTop = start + distance * eased;
        if (t < 1) frame = requestAnimationFrame(tick);
        else settle(view, target);
      };
      frame = requestAnimationFrame(tick);
    };
    const onRail = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element | null)?.closest("a.home-rail-link");
      if (!link || !root.contains(link)) return;
      const id = (link.getAttribute("href") || "").replace(/^#/, "");
      const index = RAIL.findIndex((item) => item.id === id);
      if (index < 0) return;
      event.preventDefault();
      history.pushState(null, "", `#${id}`);
      go(index);
    };
    root.addEventListener("click", onRail);

    const alignToHash = (animate: boolean) => {
      const index = RAIL.findIndex((item) => item.id === location.hash.replace(/^#/, ""));
      if (index < 0) return;
      if (animate) {
        go(index);
        return;
      }
      const view = scroller();
      if (!view) return;
      settle(view, Math.round(index * (view.clientHeight || window.innerHeight)));
    };
    alignToHash(false);
    const onPop = () => alignToHash(true);
    window.addEventListener("popstate", onPop);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      displayObserver.disconnect();
      root.removeEventListener("click", onRail);
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("scroll", update);
      main?.removeEventListener("scroll", update);
      shell?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      window.removeEventListener("hashchange", update);
      if (shell) shell.style.scrollSnapType = "";
      if (main) main.style.scrollSnapType = "";
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
        <header className="home-section-heading wf-section-heading" data-wf-heading>
          <div className="wf-heading-face is-macro">
            <p className="home-index">01</p>
            <h2 className="home-overview-title">Overall Workflow</h2>
          </div>
          <div className="wf-heading-face is-detail" aria-hidden="true">
            <p className="home-index" data-wf-index>
              01
            </p>
            <h2 className="home-overview-title" data-wf-label>
              Decomposition
            </h2>
          </div>
        </header>
        {/* Spatial zoom trial. Restore <HomeWorkflow /> from components/home-workflow.tsx to revert. */}
        <HomeWorkflowPrototype />
      </section>

      {STORY.map((section) => (
        <section className="home-overview" id={section.id} data-rail-target={section.id} key={section.id}>
          <HomeSectionHeading number={section.number} title={section.title} />
          {section.id === "precedent-analysis" ? <HomePrecedent /> : null}
          {section.id === "results" ? <HomeResults /> : null}
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
