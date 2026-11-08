"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { HOME_RAIL, HOME_RAIL_SELECT, LAB_ENTRY } from "@/lib/site-map";

const WORKFLOW_OVERVIEW_EVENT = "lm-workflow-overview";

function inLab(pathname: string) {
  return pathname.startsWith("/lab") || pathname.startsWith("/hybrid") || pathname.startsWith("/filament");
}

export function SiteRail() {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);
  const [homeIndex, setHomeIndex] = useState(0);
  const onHome = pathname === "/";
  const lab = inLab(pathname);
  const current = onHome ? homeIndex : -1;

  useEffect(() => {
    const nav = navRef.current;
    if (!nav || !onHome) return;
    const shell = nav.closest<HTMLElement>(".site-shell");
    const main = nav.closest<HTMLElement>(".site-main");
    const update = () => {
      const classroom = shell?.dataset.siteDisplay === "classroom" && !!shell && shell.clientHeight > 0;
      const mainScrolls = !classroom && !!main && main.scrollHeight > main.clientHeight + 2;
      const viewEl = classroom ? shell : mainScrolls ? main : null;
      const bounds = viewEl?.getBoundingClientRect();
      const scale = viewEl && bounds && viewEl.clientHeight > 0 ? bounds.height / viewEl.clientHeight : 1;
      const viewTop = bounds ? bounds.top : 0;
      const viewHeight = viewEl ? viewEl.clientHeight : window.innerHeight;
      const home = document.querySelector<HTMLElement>('[data-rail-target="home"]');
      let travel = 0;
      if (home && viewHeight > 0) {
        const scrolled = (viewTop - home.getBoundingClientRect().top) / scale;
        travel = Math.min(HOME_RAIL.length - 1, Math.max(0, scrolled / viewHeight));
      }
      nav.style.setProperty("--rail-travel", travel.toFixed(3));
      setHomeIndex(Math.min(HOME_RAIL.length - 1, Math.max(0, Math.round(travel))));
    };
    update();
    const observer = new ResizeObserver(update);
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
  }, [onHome]);

  const selectHome = (event: MouseEvent<HTMLAnchorElement>, id: string, index: number) => {
    if (!onHome || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    history.pushState(null, "", `#${id}`);
    if (id === "workflow") window.dispatchEvent(new Event(WORKFLOW_OVERVIEW_EVENT));
    window.dispatchEvent(new CustomEvent(HOME_RAIL_SELECT, { detail: index }));
  };

  if (lab) return null;

  return (
    <nav
      ref={navRef}
      className="home-rail"
      aria-label="Sections"
      data-placed={current < 0 ? "off" : undefined}
      style={
        {
          "--rail-index": current < 0 ? 0 : current,
          "--rail-span": HOME_RAIL.length,
          ...(onHome ? {} : { "--rail-travel": current < 0 ? 0 : current }),
        } as CSSProperties
      }
    >
      <span className="home-rail-track" aria-hidden="true">
        <span className="home-rail-line" />
        <span className="home-rail-energy" />
      </span>
      <span className="home-rail-indicator" aria-hidden="true" />
      {HOME_RAIL.map((item, index) => (
        <Link
          key={item.id}
          href={item.href}
          className={current === index ? "home-rail-link is-current" : "home-rail-link"}
          aria-current={current === index ? "true" : undefined}
          style={{ "--rail-slot": index } as CSSProperties}
          onClick={(event) => selectHome(event, item.id, index)}
        >
          <span className="home-rail-node" />
          <span className="home-rail-text">{item.label}</span>
        </Link>
      ))}
      <Link
        href={LAB_ENTRY.href}
        className={current === HOME_RAIL.length ? "home-rail-link home-rail-lab is-current" : "home-rail-link home-rail-lab"}
        aria-current={current === HOME_RAIL.length ? "true" : undefined}
        style={{ "--rail-slot": HOME_RAIL.length } as CSSProperties}
      >
        <span className="home-rail-node" />
        <span className="home-rail-text">Lab</span>
      </Link>
    </nav>
  );
}
