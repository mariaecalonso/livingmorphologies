"use client";

import { useMemo } from "react";
import { MorphologyPreview } from "@/components/morphology-preview";
import { mockField } from "@/lib/ui-mock/mock-field";

/** Placeholder field for a mock candidate, drawn with the Physarum plan renderer. Not a simulation result. */
export function MockMorphology({
  seed,
  generation,
  founder,
  className = "",
}: {
  seed: number;
  generation: number;
  founder?: number;
  className?: string;
}) {
  const field = useMemo(() => mockField(seed, generation, founder), [seed, generation, founder]);
  return <MorphologyPreview snapshot={field.snapshot} attractors={field.attractors} className={`mock-morphology ${className}`} />;
}
