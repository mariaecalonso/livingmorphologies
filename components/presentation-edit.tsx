"use client";

import { useEffect, useRef, useState } from "react";
import {
  IDENTITY_VIEWPORT,
  VIEWPORT_INTERACTIVE,
  bindViewportEdit,
  resetViewport,
  type Viewport,
} from "@/components/viewport-edit";

/** Lab drawings and charts keep their own pointer interaction while the frame is edited. */
const PRESENTATION_INTERACTIVE = `${VIEWPORT_INTERACTIVE}, canvas, svg, [role="button"], [role="slider"], [role="tab"]`;

export function PresentationEditControls() {
  const [editing, setEditing] = useState(false);
  const viewRef = useRef<Viewport>({ ...IDENTITY_VIEWPORT });
  const resetRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!editing) return;
    const shell = document.querySelector<HTMLElement>(".site-shell");
    const canvas = shell?.querySelector<HTMLElement>(":scope > .site-edit-canvas");
    if (!shell || !canvas) return;
    shell.dataset.presentationEdit = "on";
    viewRef.current = { ...IDENTITY_VIEWPORT };
    const release = bindViewportEdit({
      shell,
      canvas,
      view: viewRef.current,
      resetButton: resetRef,
      onExit: () => setEditing(false),
      interactiveSelector: PRESENTATION_INTERACTIVE,
    });
    return () => {
      release();
      shell.removeAttribute("data-presentation-edit");
    };
  }, [editing]);

  return (
    <div className="stage-nav-edit">
      {editing ? (
        <button
          ref={resetRef}
          type="button"
          title="Reset view to 100%"
          aria-label="Reset presentation view to 100%"
          onClick={() => {
            const canvas = document.querySelector<HTMLElement>(".site-shell > .site-edit-canvas");
            if (canvas) resetViewport(canvas, viewRef.current, resetRef.current);
          }}
        >
          100%
        </button>
      ) : null}
      <button
        type="button"
        aria-pressed={editing}
        aria-label={editing ? "Exit presentation edit mode" : "Edit presentation canvas"}
        onClick={() => setEditing((value) => !value)}
      >
        Edit
      </button>
    </div>
  );
}
