import type { ReactNode } from "react";
import "./skill4-interface.css";
import { HybridState } from "@/components/hybrid/hybrid-state";
import { loadSkill3HandoffRecords } from "@/lib/skill4/skill3-handoff";

export default function HybridLayout({ children }: { children: ReactNode }) {
  const records = loadSkill3HandoffRecords();
  return <HybridState records={records}>{children}</HybridState>;
}
