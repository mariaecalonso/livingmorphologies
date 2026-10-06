import type { ReactNode } from "react";
import { StageShell } from "@/components/stage-shell";
import "../lab/lab-interface.css";

export default function ScreenLayout({ children }: { children: ReactNode }) {
  return <StageShell>{children}</StageShell>;
}
