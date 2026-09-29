"use client";

import type { ReactNode } from "react";
import { StageNav } from "@/components/stage-nav";
import { PresentationFrame, useFramed, useViewMode } from "@/components/view-mode";

export function StageShell({ children }: { children: ReactNode }) {
  const mode = useViewMode();
  const frame = useFramed();

  if (mode === null || frame === null) return <div className="stage-shell" />;
  if (mode === "presentation" && !frame.framed) return <PresentationFrame />;

  return (
    <div className="stage-shell" data-view-mode={mode}>
      <StageNav mode={mode} presentationFrame={frame.presentationFrame} />
      <div className="stage-body">{children}</div>
    </div>
  );
}
