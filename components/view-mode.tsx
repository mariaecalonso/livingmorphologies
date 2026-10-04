"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { DisplayMode } from "@/components/display-mode-toggle";
import { LAB_DISPLAY_EVENT, labModeForSite, readStoredLab, readStoredSite, syncSiteFromLab } from "@/components/display-sync";

export const PRESENTATION_WIDTH = 7407;
export const PRESENTATION_HEIGHT = 2160;

function subscribeViewMode(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(LAB_DISPLAY_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(LAB_DISPLAY_EVENT, onChange);
  };
}

function readViewMode(): DisplayMode {
  return readStoredLab() ?? labModeForSite(readStoredSite() ?? "laptop");
}

const subscribeNever = () => () => {};

/** Null until the client has read the stored mode. */
export function useViewMode(): DisplayMode | null {
  return useSyncExternalStore(subscribeViewMode, readViewMode, () => null);
}

/** True inside any frame; the presentation canvas also carries `frame=1`. */
export function useFramed(): { framed: boolean; presentationFrame: boolean } | null {
  const framed = useSyncExternalStore(subscribeNever, () => window.self !== window.top, () => null);
  const presentationFrame = useSyncExternalStore(
    subscribeNever,
    () => new URLSearchParams(window.location.search).get("frame") === "1",
    () => null,
  );
  if (framed === null || presentationFrame === null) return null;
  return { framed, presentationFrame: framed && presentationFrame };
}

export function setViewMode(mode: DisplayMode, returnPath?: string) {
  syncSiteFromLab(mode);
  if (returnPath && window.top && window.top !== window.self) window.top.location.assign(returnPath);
}

/** Renders the current route on the ultra-wide canvas, fitted to the window. */
export function PresentationFrame() {
  const pathname = usePathname();
  const [src] = useState(() => `${pathname}?wall=1&frame=1${window.location.hash}`);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const fit = () =>
      setScale(Math.min(window.innerWidth / PRESENTATION_WIDTH, window.innerHeight / PRESENTATION_HEIGHT));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  return (
    <div className="presentation-stage">
      <iframe
        src={src}
        title="Living Morphologies presentation canvas"
        className="presentation-canvas"
        style={{
          width: PRESENTATION_WIDTH,
          height: PRESENTATION_HEIGHT,
          transform: `translate(-50%, -50%) scale(${scale})`,
        }}
      />
    </div>
  );
}
