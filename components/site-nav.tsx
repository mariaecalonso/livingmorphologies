"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HOME_SECTIONS, LAB_ENTRY, LAB_ROUTES } from "@/lib/site-map";

const LAB_LINKS = [LAB_ENTRY, ...LAB_ROUTES.filter((route) => route.href !== "/lab")] as const;

function linkActive(href: string, pathname: string) {
  if (href === "/") return pathname === "/";
  if (href.startsWith("/#")) return false;
  if (href === "/lab") return pathname === "/lab";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SiteNav() {
  const pathname = usePathname();
  const stageRoute =
    pathname === "/" ||
    pathname.startsWith("/lab") ||
    pathname.startsWith("/hybrid") ||
    pathname.startsWith("/filament");
  if (stageRoute) return null;

  return (
    <header className="site-nav">
      <Link href="/" className="display site-nav-title">
        Living Morphologies
      </Link>
      <nav className="site-nav-links" aria-label="Site">
        {HOME_SECTIONS.map((section) => {
          const active = linkActive(section.href, pathname);
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
      <nav className="site-nav-links site-nav-lab" aria-label="Lab">
        {LAB_LINKS.map((section) => {
          const active = linkActive(section.href, pathname);
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
