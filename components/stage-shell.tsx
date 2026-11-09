"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useLayoutEffect, type ReactNode } from "react";
import { reconcileLabDisplay } from "@/components/display-sync";
import { StageNav } from "@/components/stage-nav";
import { PresentationFrame, useFramed, useViewMode } from "@/components/view-mode";

/** The presentation canvas lives in an iframe. Keep the address bar on that route so a refresh stays there. */
function useRememberFramedRoute() {
  const pathname = usePathname();
  const search = useSearchParams();
  const query = search.toString();

  useLayoutEffect(() => {
    const top = window.top;
    if (!top || top === window.self) return;
    const params = new URLSearchParams(query);
    params.delete("wall");
    params.delete("frame");
    const nextQuery = params.toString();
    const next = `${pathname}${nextQuery ? `?${nextQuery}` : ""}${window.location.hash}`;
    const current = `${top.location.pathname}${top.location.search}${top.location.hash}`;
    if (current === next) return;
    top.history.replaceState(top.history.state, "", next);
  }, [pathname, query]);
}

function StageShellFrame({ children }: { children: ReactNode }) {
  const mode = useViewMode();
  const frame = useFramed();
  useRememberFramedRoute();

  useLayoutEffect(() => {
    reconcileLabDisplay();
  }, []);

  if (mode === null || frame === null) return <div className="stage-shell" />;
  if (mode === "presentation" && !frame.framed) return <PresentationFrame />;

  return (
    <div className="stage-shell" data-view-mode={mode} data-presentation-frame={frame.presentationFrame ? "on" : undefined}>
      <StageNav mode={mode} presentationFrame={frame.presentationFrame} />
      <div className="stage-body">{children}</div>
    </div>
  );
}

export function StageShell({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<div className="stage-shell" />}>
      <StageShellFrame>{children}</StageShellFrame>
    </Suspense>
  );
}
