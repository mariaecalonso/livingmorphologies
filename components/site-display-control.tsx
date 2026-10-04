"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { reconcileSiteDisplay, syncLabFromSite, type SiteDisplay } from "@/components/display-sync";
import { IDENTITY_VIEWPORT, bindViewportEdit, resetViewport, type Viewport } from "@/components/viewport-edit";

export function SiteDisplayControl() {
  const pathname = usePathname();
  const [mode, setMode] = useState<SiteDisplay>("laptop");
  const [editing, setEditing] = useState(false);
  const viewRef = useRef<Viewport>({ ...IDENTITY_VIEWPORT });
  const resetRef = useRef<HTMLButtonElement>(null);
  const onLab = pathname.startsWith("/lab");
  const classroom = !onLab && mode === "classroom";
  const editActive = classroom && editing;

  useLayoutEffect(() => {
    if (onLab) return;
    setMode(reconcileSiteDisplay());
  }, [onLab]);

  useEffect(() => {
    const shell = document.querySelector<HTMLElement>(".site-shell");
    if (!shell) return;
    if (onLab) {
      shell.removeAttribute("data-site-display");
      return;
    }
    shell.dataset.siteDisplay = mode;
  }, [mode, onLab]);

  useEffect(() => {
    if (!classroom) setEditing(false);
  }, [classroom]);

  useEffect(() => {
    if (!editActive) return;
    const shell = document.querySelector<HTMLElement>(".site-shell");
    const canvas = shell?.querySelector<HTMLElement>(":scope > .site-edit-canvas");
    if (!shell || !canvas) return;
    viewRef.current = { ...IDENTITY_VIEWPORT };
    return bindViewportEdit({
      shell,
      canvas,
      view: viewRef.current,
      resetButton: resetRef,
      onExit: () => setEditing(false),
    });
  }, [editActive]);

  if (onLab) return null;

  const next = mode === "laptop" ? "classroom" : "laptop";
  const label = mode === "laptop" ? "Laptop" : "Classroom";

  return (
    <div className="site-display-tools">
      {editActive ? (
        <button
          ref={resetRef}
          type="button"
          className="site-edit-reset"
          title="Reset view to 100%"
          aria-label="Reset classroom view to 100%"
          onClick={() => {
            const canvas = document.querySelector<HTMLElement>(".site-shell > .site-edit-canvas");
            if (canvas) resetViewport(canvas, viewRef.current, resetRef.current);
          }}
        >
          100%
        </button>
      ) : null}
      {classroom ? (
        <button
          type="button"
          className="site-edit-toggle"
          aria-pressed={editing}
          aria-label={editing ? "Exit classroom edit mode" : "Edit classroom canvas"}
          onClick={() => setEditing((value) => !value)}
        >
          Edit
        </button>
      ) : null}
      <button
        type="button"
        className="site-display-control"
        aria-pressed={mode === "classroom"}
        aria-label={`${label} resolution. Switch to ${next} resolution`}
        onClick={() => {
          const following = mode === "laptop" ? "classroom" : "laptop";
          syncLabFromSite(following);
          setMode(following);
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
    </div>
  );
}
