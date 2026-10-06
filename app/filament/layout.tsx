import type { ReactNode } from "react";
import { StageShell } from "@/components/stage-shell";
import "../lab/lab-interface.css";

export default function FilamentLayout({ children }: { children: ReactNode }) {
  return <StageShell>{children}</StageShell>;
}
