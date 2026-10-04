"use client";

import { useEffect } from "react";

/** The embedded browser tags server HTML before hydration, which opens a full-screen Next error sheet over the lab. */
function releaseDevOverlay() {
  const root = document.querySelector("nextjs-portal")?.shadowRoot;
  if (!root) return;
  const dialog = root.querySelector<HTMLElement>(".error-overlay-dialog-container");
  if (dialog) dialog.style.display = "none";
  root.querySelectorAll<HTMLElement>("div").forEach((el) => {
    const box = el.getBoundingClientRect();
    if (box.width <= window.innerWidth * 0.7 || box.height <= window.innerHeight * 0.45) return;
    el.style.pointerEvents = "none";
    if (box.width > window.innerWidth * 0.9 && box.height > window.innerHeight * 0.8) el.style.display = "none";
  });
}

export function DevOverlayPassThrough() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    releaseDevOverlay();
    const observer = new MutationObserver(releaseDevOverlay);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    const timer = window.setInterval(releaseDevOverlay, 400);
    const stop = window.setTimeout(() => window.clearInterval(timer), 6000);
    return () => {
      observer.disconnect();
      window.clearInterval(timer);
      window.clearTimeout(stop);
    };
  }, []);
  return null;
}
