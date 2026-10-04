import type { ReactNode } from "react";
import { StageShell } from "@/components/stage-shell";

export default function StagesLayout({ children }: { children: ReactNode }) {
  return <StageShell initialMode="desktop">{children}</StageShell>;
}
