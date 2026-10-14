import type { ReactNode } from "react";
import "./skill4-interface.css";
import { HybridState } from "@/components/hybrid/hybrid-state";

export default function HybridLayout({ children }: { children: ReactNode }) {
  return <HybridState>{children}</HybridState>;
}
