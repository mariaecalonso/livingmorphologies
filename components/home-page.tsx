"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { DemoWorkflow } from "@/components/demo-workflow/demo-workflow";
import { HomeClient } from "@/components/home-client";
import { HomeLabDemo } from "@/components/home-lab-demo";
import { HomeResults } from "@/components/home-results";
import { HomeSite } from "@/components/home-site";
import { HomeWorkflowPrototype } from "@/components/home-workflow-prototype";
import type { LabDemoMedia } from "@/lib/home-lab-demo-chapters";
import type { HomeResultPreview, HomeResultSkill } from "@/lib/home-results";
import { HOME_RAIL, HOME_RAIL_SELECT, LAB_ENTRY } from "@/lib/site-map";

const RAIL = HOME_RAIL;

const STORY = [
  { id: "results", title: "Results" },
] as const;

function HomeSectionHeading({ title }: { title: string }) {
  return (
    <header className="home-section-heading">
      <h2 className="home-overview-title">{title}</h2>
    </header>
  );
}

export function HomePage({
  plates = {},
  demo,
}: {
  plates?: Partial<Record<HomeResultSkill["id"], readonly HomeResultPreview[]>>;
  demo: LabDemoMedia;
}) {
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
      const bounds = viewEl?.getBoundingClientRect();
      const scale = viewEl && bounds && viewEl.clientHeight > 0 ? bounds.height / viewEl.clientHeight : 1;
      const viewTop = bounds ? bounds.top : 0;
      const viewHeight = viewEl ? viewEl.clientHeight : window.innerHeight;
      root.style.setProperty("--home-view", `${Math.round(viewHeight)}px`);

      const home = root.querySelector<HTMLElement>('[data-rail-target="home"]');
      let travel = 0;
      if (home && viewHeight > 0) {
        const scrolled = (viewTop - home.getBoundingClientRect().top) / scale;
        travel = Math.min(RAIL.length - 1, Math.max(0, scrolled / viewHeight));
      }
      const nearest = Math.round(travel);
      const seam = Math.min(1, Math.max(0, Math.abs(travel - nearest) * 2));
      root.style.setProperty("--seam", seam.toFixed(3));
      const next = Math.min(RAIL.length - 1, Math.max(0, nearest));
      if (next !== railIndexRef.current) {
        railIndexRef.current = next;
        setRailIndex(next);
      }

      const visualHeight = viewHeight * scale;
      if (home && visualHeight > 0) {
        const progress = (viewTop - home.getBoundingClientRect().top) / visualHeight;
        const heroFade = Math.min(1, Math.max(0, 1 - progress));
        const clientFade = Math.min(1, Math.max(0, progress <= 1 ? progress : 2 - progress));
        root.style.setProperty("--hero-fade", heroFade.toFixed(3));
        root.style.setProperty("--client-fade", clientFade.toFixed(3));
      }
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
    const onRail = (event: Event) => {
      const index = (event as CustomEvent<number>).detail;
      if (typeof index !== "number") return;
      go(index);
    };
    window.addEventListener(HOME_RAIL_SELECT, onRail);

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
      window.removeEventListener(HOME_RAIL_SELECT, onRail);
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
    <div className="home-page" ref={rootRef}>
      <section className="home-hero" id="home" data-rail-target="home">
        <div className="home-hero-live">
          <img
            className="home-hero-field home-hero-field-laptop"
            src="/home-hero-web.png"
            alt=""
            draggable={false}
          />
          <img
            className="home-hero-field home-hero-field-classroom"
            src="/home-hero-web.png"
            alt=""
            draggable={false}
          />
        </div>
        <div className="home-hero-copy">
          <p className="home-team">
            Maria Alonso <span className="home-team-x home-team-x-teal">+</span> Renata Maguiño{" "}
            <span className="home-team-x home-team-x-copper">+</span> Julieta Segura
          </p>
          <h1 className="home-title">
            <span className="home-title-living">Living</span>
            <span className="home-title-morph">Morphologies</span>
          </h1>
          <p className="home-subtitle">
            Living Morphologies uses a Physarum-based generative system
            <br />
            and optimization process to produce 2D plates for
            <br />
            vertical propagation, which then are used to generate
            <br />
            hybrid models that serve as connectors for assembly.
          </p>
          <Link className="home-explore" href={LAB_ENTRY.href}>
            <span>Explore Lab</span>
            <span className="home-explore-arrow" aria-hidden="true">
              →
            </span>
          </Link>
        </div>
      </section>

      <section className="home-overview home-client" id="client" data-rail-target="client" aria-label="Our Client">
        <HomeClient />
      </section>

      {/* Kept, not shown. Remove `hidden` to put Overall Workflow back on the page. */}
      <section className="home-overview home-workflow" id="workflow" hidden>
        <header className="home-section-heading wf-section-heading" data-wf-heading>
          <div className="wf-heading-face is-macro">
            <h2 className="home-overview-title">Overall Workflow</h2>
          </div>
          <div className="wf-heading-face is-detail" aria-hidden="true">
            <h2 className="home-overview-title" data-wf-label>
              Typology Analysis
            </h2>
          </div>
        </header>
        {/* Spatial zoom trial. Restore <HomeWorkflow /> from components/home-workflow.tsx to revert. */}
        <HomeWorkflowPrototype />
      </section>

      <section className="home-overview" id="demo-workflow" data-rail-target="demo-workflow" aria-label="Demo Workflow">
        <DemoWorkflow />
      </section>

      {STORY.map((section) => (
        <section className="home-overview" id={section.id} data-rail-target={section.id} key={section.id}>
          <HomeSectionHeading title={section.title} />
          {section.id === "results" ? <HomeResults plates={plates} /> : null}
        </section>
      ))}

      <section className="home-overview" id="site" data-rail-target="site">
        <HomeSectionHeading title="Site" />
        <HomeSite />
      </section>

      <section className="home-overview" id="lab-demo" data-rail-target="lab-demo">
        <HomeSectionHeading title="Lab Demo" />
        <HomeLabDemo src={demo.src} poster={demo.poster} />
      </section>

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
