"use client";

import { ProcessCanvas } from "@/components/vertical-process-canvas";
import type { NaturalContinuationSet } from "@/lib/skill3/continuations";
import type { ResolvedProcessSource } from "@/lib/skill3/selection";

export function VerticalProcess({
  initial,
  resolved = null,
}: {
  initial: NaturalContinuationSet | null;
  candidate?: unknown;
  resolved?: ResolvedProcessSource | null;
  example?: unknown;
}) {
  return <ProcessCanvas initial={initial} resolved={resolved} />;
}
