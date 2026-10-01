"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { readVerticalSelection } from "@/lib/skill3/selection";

export function VerticalSelectionNotice({ title, detail }: { title: string; detail: string }) {
  return (
    <main className="flex h-full flex-col justify-center gap-3 bg-black px-8 text-[var(--text)]">
      <p className="display text-[0.95rem] text-white">{title}</p>
      <p className="evo-empty max-w-md">{detail}</p>
      <Link href="/lab/evolution/pareto-catalog" className="text-[0.72rem] uppercase tracking-[0.16em] text-[var(--orange-hot)]">
        Pareto Catalog
      </Link>
    </main>
  );
}

/** Opens `/lab/vertical` with no query. Restores a stored selection, or asks for one. */
export function VerticalSelectionResume() {
  const router = useRouter();
  const [empty, setEmpty] = useState(false);

  useEffect(() => {
    const selection = readVerticalSelection();
    if (!selection) {
      setEmpty(true);
      return;
    }
    const params = new URLSearchParams(window.location.search);
    params.set("archetype", selection.archetypeId);
    params.set("candidate", String(selection.candidateId));
    router.replace(`/lab/vertical?${params.toString()}${window.location.hash}`);
  }, [router]);

  if (!empty) return null;
  return <VerticalSelectionNotice title="Select a Skill 2 candidate first." detail="The Pareto Catalog chooses which archived morphology continues vertically." />;
}
