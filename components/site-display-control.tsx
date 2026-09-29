"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

type SiteDisplay = "laptop" | "classroom";

const STORAGE_KEY = "lm-site-display";

export function SiteDisplayControl() {
  const pathname = usePathname();
  const [mode, setMode] = useState<SiteDisplay>("laptop");
  const onLab = pathname.startsWith("/lab");

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "classroom" || stored === "laptop") setMode(stored);
  }, []);

  useEffect(() => {
    const shell = document.querySelector<HTMLElement>(".site-shell");
    if (!shell) return;
    if (onLab) {
      shell.removeAttribute("data-site-display");
      return;
    }
    shell.dataset.siteDisplay = mode;
  }, [mode, onLab]);

  if (onLab) return null;

  const next = mode === "laptop" ? "classroom" : "laptop";
  const label = mode === "laptop" ? "Laptop" : "Classroom";

  return (
    <button
      type="button"
      className="site-display-control"
      aria-pressed={mode === "classroom"}
      aria-label={`${label} resolution. Switch to ${next} resolution`}
      onClick={() => {
        setMode(next);
        window.localStorage.setItem(STORAGE_KEY, next);
      }}
    >
      {mode === "laptop" ? (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="5" y="5" width="14" height="10" rx="1" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <path d="M3 18.5h18" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="2" y="6" width="20" height="11" rx="1" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <path d="M9 20h6" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      )}
    </button>
  );
}
