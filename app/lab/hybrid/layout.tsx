import type { ReactNode } from "react";
import "./skill4-interface.css";
import { HybridState } from "@/components/hybrid/hybrid-state";
import { PROVISIONAL_MOCK_IDS, readProvisionalMock } from "@/lib/skill4/fixtures";

export default function HybridLayout({ children }: { children: ReactNode }) {
  const records = PROVISIONAL_MOCK_IDS.map((id) => readProvisionalMock(id));
  return <HybridState records={records}>{children}</HybridState>;
}
