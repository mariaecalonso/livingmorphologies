"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const SECTIONS = [
  { href: "/", label: "Home" },
  { href: "/research", label: "Research" },
  { href: "/lab", label: "Lab" },
  { href: "/results", label: "Results" },
] as const;

export function SiteNav() {
  const pathname = usePathname();
  const stageRoute =
    pathname === "/" ||
    pathname.startsWith("/lab") ||
    pathname.startsWith("/evolution") ||
    pathname.startsWith("/hybrid") ||
    pathname.startsWith("/filament") ||
    pathname === "/scan" ||
    pathname === "/screen" ||
    pathname === "/vertical";
  if (stageRoute) return null;

  return (
    <header className="site-nav">
      <p className="display site-nav-title">Living Morphologies</p>
      <nav className="site-nav-links" aria-label="Sections">
        {SECTIONS.map((section) => {
          const active = section.href === "/" ? pathname === "/" : pathname.startsWith(section.href);
          return (
            <Link
              key={section.href}
              href={section.href}
              aria-current={active ? "page" : undefined}
              className={active ? "site-nav-link is-active" : "site-nav-link"}
            >
              {section.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
