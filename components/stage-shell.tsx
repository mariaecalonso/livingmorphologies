"use client";

import type { ReactNode } from "react";
import type { DisplayMode } from "@/components/display-mode-toggle";
import { StageNav } from "@/components/stage-nav";
import { PresentationFrame, useViewMode, ViewModeProvider } from "@/components/view-mode";

function StageShellInner({ children }: { children: ReactNode }) {
  const mode = useViewMode();
  const shell = (
    <div className="stage-shell" data-view-mode={mode}>
      <StageNav mode={mode} presentationFrame={false} />
      <div className="stage-body">{children}</div>
    </div>
  );
  if (mode === "presentation") return <PresentationFrame>{shell}</PresentationFrame>;
  return shell;
}

export function StageShell({
  children,
  initialMode = "desktop",
}: {
  children: ReactNode;
  initialMode?: DisplayMode;
}) {
  return (
    <ViewModeProvider initialMode={initialMode}>
      <StageShellInner>{children}</StageShellInner>
    </ViewModeProvider>
  );
}
