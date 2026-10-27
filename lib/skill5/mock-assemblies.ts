import { layoutTiles, type AssemblyArrangement, type AssemblyCount } from "@/lib/skill4/assembly-layout";
import type { CatalogConnectionRecord, CatalogEntry } from "@/lib/skill4/catalog";
import { detectAdjacencies } from "@/lib/skill4/connections";
import { registrationEnvelope, VIEW_SCAN } from "@/lib/skill4/contract";
import { HYBRID_GAP, type TileInstance } from "@/lib/skill4/tiles";
import { SITE_ARCHETYPES } from "@/lib/skill5/catalog";

type Recipe = {
  id: string;
  count: AssemblyCount;
  arrangement: AssemblyArrangement;
  archetypes: string[];
  stack?: boolean;
  quarter?: 0 | 1 | 2 | 3;
};

const RECIPES: Recipe[] = [
  { id: "M01", count: 2, arrangement: "linear", archetypes: ["vertical-void", "compressed-sequential"] },
  { id: "M02", count: 2, arrangement: "linear", archetypes: ["continuous-hall", "topographic-ground-field"], stack: true },
  { id: "M03", count: 4, arrangement: "linear", archetypes: ["linear-gallery", "open-hall", "terraced", "flat-deep-plan"] },
  { id: "M04", count: 4, arrangement: "grid", archetypes: ["void-edge", "undulated", "stepped-amphitheater", "void-field"] },
  { id: "M05", count: 6, arrangement: "linear", archetypes: ["vertical-void", "open-hall", "void-field", "linear-gallery", "terraced", "contained-room-within-volume"] },
  { id: "M06", count: 6, arrangement: "grid", archetypes: ["compressed-sequential", "flat-deep-plan", "inserted-horizontal-plate", "continuous-hall", "undulated", "linear-edge-gallery"] },
  { id: "M07", count: 8, arrangement: "linear", archetypes: ["vertical-void", "compressed-sequential", "continuous-hall", "topographic-ground-field", "linear-gallery", "open-hall", "terraced", "flat-deep-plan"] },
  { id: "M08", count: 8, arrangement: "grid", archetypes: ["void-edge", "undulated", "stepped-amphitheater", "void-field", "inserted-horizontal-plate", "contained-room-within-volume", "linear-edge-gallery", "open-hall"] },
  { id: "M09", count: 4, arrangement: "t", archetypes: ["stepped-amphitheater", "void-field", "linear-gallery", "vertical-void"] },
  { id: "M10", count: 4, arrangement: "grid", archetypes: ["terraced", "continuous-hall", "linear-edge-gallery", "undulated"], quarter: 1 },
];

function sourceFor(archetypeId: string) {
  const source = SITE_ARCHETYPES.find((item) => item.archetypeId === archetypeId);
  if (!source) throw new Error(`Missing Skill 3 module for ${archetypeId}`);
  return source;
}

function mockEntry(recipe: Recipe): CatalogEntry {
  const tiles: TileInstance[] = layoutTiles(recipe.count, recipe.arrangement).map((tile, index) => {
    const source = sourceFor(recipe.archetypes[index]);
    const rotationQuarter: 0 | 1 | 2 | 3 = recipe.quarter !== undefined && index % 2 === 1 ? recipe.quarter : 0;
    const next: TileInstance = {
      ...tile,
      archetypeId: source.archetypeId,
      moduleId: source.moduleId,
      rotationQuarter,
      mirror: null,
    };
    if (recipe.stack && index === 1) {
      const box = registrationEnvelope(VIEW_SCAN.spacing, VIEW_SCAN.yaw);
      next.transform = { x: 0, y: box.max.y - box.min.y + HYBRID_GAP, z: 0 };
    }
    return next;
  });
  const connections: CatalogConnectionRecord[] = detectAdjacencies(tiles).map((link) => ({
    id: link.id,
    tileAId: link.tileAId,
    tileBId: link.tileBId,
    faceA: link.faceA,
    faceB: link.faceB,
    faceSelection: "suggested",
    selectedMockId: "",
    signature: `${recipe.id}:${link.tileAId}:${link.faceA}:${link.tileBId}:${link.faceB}`,
    hadCandidateField: false,
    hadGeneratedField: false,
    candidateField: null,
  }));
  return {
    id: recipe.id,
    tileCount: tiles.length,
    arrangement: recipe.arrangement,
    count: recipe.count,
    tiles: tiles.map((tile) => {
      const source = sourceFor(tile.archetypeId);
      return {
        instanceId: tile.instanceId,
        archetypeId: tile.archetypeId,
        name: source.name,
        moduleId: source.moduleId,
        revision: 1,
        transform: { ...tile.transform },
        rotationQuarter: tile.rotationQuarter,
        mirror: tile.mirror,
      };
    }),
    connections,
    regenerationRequired: false,
  };
}

/** Review assemblies for Site Integration. They are not saved Skill 4 catalog entries. */
export const SKILL5_MOCK_ASSEMBLIES: CatalogEntry[] = RECIPES.map(mockEntry);

export function isSkill5MockAssembly(id: string) {
  return SKILL5_MOCK_ASSEMBLIES.some((entry) => entry.id === id);
}
