import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ProcessIntro } from "@/components/evolution/process-intro";
import { loadEvolutionCatalog } from "@/lib/skill2/evolution-index";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "2D Evolution Process -+ Living Morphologies",
};

function voidEdgeCatalogImages() {
  try {
    const raw = JSON.parse(readFileSync(join(process.cwd(), "public/shared-catalog/void-edge/entries.json"), "utf8")) as unknown;
    if (!Array.isArray(raw)) return [];
    return raw
      .map((row) => (row && typeof row === "object" && "image" in row ? row.image : null))
      .filter((src): src is string => typeof src === "string" && src.startsWith("/shared-catalog/"))
      .slice(0, 7);
  } catch {
    return [];
  }
}

export default function EvolutionPage() {
  return <ProcessIntro initial={loadEvolutionCatalog()} catalogImages={voidEdgeCatalogImages()} />;
}
