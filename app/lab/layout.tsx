import type { ReactNode } from "react";
import "./lab-interface.css";
import { StageShell } from "@/components/stage-shell";

export default function LabLayout({ children }: { children: ReactNode }) {
  return <StageShell>{children}</StageShell>;
}
