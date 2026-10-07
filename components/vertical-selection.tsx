"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

export function VerticalSelectionNotice({ title, detail }: { title: string; detail: string }) {
  const search = useSearchParams();
  const fixture = new URLSearchParams(search.toString());
  fixture.set("fixture", "1");
  return (
    <main className="flex h-full flex-col justify-center gap-3 bg-black px-8 text-[var(--text)]">
      <p className="display text-[0.95rem] text-white">{title}</p>
      <p className="evo-empty max-w-md">{detail}</p>
      <Link href="/lab/vertical" className="text-[0.72rem] uppercase tracking-[0.16em] text-[var(--orange-hot)]">
        Vertical Propagation
      </Link>
      <Link href={`/lab/vertical?${fixture.toString()}`} className="text-[0.72rem] uppercase tracking-[0.16em] text-[var(--muted)]">
        Development fixture
      </Link>
    </main>
  );
}

/** Catalogue opened without a continuation query. Stays in Skill 3. */
export function VerticalSelectionResume() {
  return (
    <VerticalSelectionNotice
      title="The 3D catalogue follows a verified Z0."
      detail="Choose the active archetype on Vertical Propagation. Generation stays gated until that candidate has a verified Z0."
    />
  );
}
