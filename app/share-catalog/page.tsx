"use client";

import { useEffect, useState } from "react";
import { TYPOLOGIES } from "@/lib/catalog";
import { readCatalog } from "@/lib/skill1/run-catalog";
import { shareCatalogEntries } from "@/lib/skill1/shared-catalog";

const ARCHETYPE_IDS = TYPOLOGIES.flatMap((typology) => typology.archetypes.map((item) => item.id));

export default function ShareCatalogPage() {
  const [lines, setLines] = useState<string[]>(["Writing saved iterations into the repo…"]);

  useEffect(() => {
    let live = true;
    void (async () => {
      const next: string[] = [];
      let total = 0;
      for (const id of ARCHETYPE_IDS) {
        const entries = await readCatalog(id);
        if (!live) return;
        if (!entries.length) {
          next.push(`${id}: none in this browser`);
          setLines([...next]);
          continue;
        }
        const ok = await shareCatalogEntries(id, entries);
        total += entries.length;
        next.push(`${id}: ${entries.length}${ok ? " written" : " failed"}`);
        setLines([...next, `total ${total}`]);
      }
      if (live) setLines((current) => [...current, "done"]);
    })();
    return () => {
      live = false;
    };
  }, []);

  return (
    <main className="p-6 font-mono text-sm whitespace-pre-wrap">
      {lines.join("\n")}
    </main>
  );
}
