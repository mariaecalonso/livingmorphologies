import { attractorsFromCompressedSequential } from "./run-compressed-sequential";
import { attractorsFromContinuousHall } from "./run-continuous-hall";
import { attractorsFromLinearGallery, planLinearGallery } from "./run-linear-gallery";
import { attractorsFromTopographic } from "./run-topographic-ground-field";
import { attractorsFromVerticalVoidPlan, type MorphPlan } from "./run-morphology";
import { runAttractorsFor } from "./run-variants";
import { slimeControlsFromTranslation } from "./slime-controls";
import { translateArchetype } from "./translate";
import {
  LOBBY_ARCHETYPE_IDS,
  planLobby,
  realizeLobbyPlan,
  repairLobbyPlan,
  type LobbyPlan,
  type LobbySalt,
} from "./lobby-realization";
import { realizeLobbyCatalogEntry, simulateLobbyCatalogEntry } from "../skill2/lobby-catalog";

const salt: LobbySalt = { seed: 11, attempt: 2, index: 4 };
let failed = 0;

function assert(condition: boolean, message: string) {
  if (!condition) {
    failed += 1;
    console.error(`FAIL ${message}`);
  }
}

function radii(marks: { radius?: number }[]) {
  return marks.map((mark) => mark.radius ?? null).join(",");
}

for (const archetypeId of LOBBY_ARCHETYPE_IDS) {
  const planned = planLobby(archetypeId, salt);
  assert(planned != null, `${archetypeId} plans`);
  if (!planned) continue;
  const repaired = repairLobbyPlan(planned);
  assert(repaired.ok && repaired.repaired.length === 0, `${archetypeId} fresh plan needs no repair`);
  assert(repaired.ok && JSON.stringify(repaired.plan) === JSON.stringify(planned), `${archetypeId} repair keeps a fresh plan`);
  const base = translateArchetype(archetypeId);
  const slime = slimeControlsFromTranslation(base);
  const a = realizeLobbyPlan(base, slime, planned, salt);
  const b = realizeLobbyPlan(base, slime, planned, salt);
  assert(a.ok && b.ok, `${archetypeId} realizes`);
  if (!a.ok || !b.ok) continue;
  assert(JSON.stringify(a.attractors) === JSON.stringify(b.attractors), `${archetypeId} attractors stable`);
  assert(JSON.stringify(a.slime) === JSON.stringify(b.slime), `${archetypeId} slime stable`);
  assert(a.agents === b.agents, `${archetypeId} agents stable`);
  let direct = a.attractors;
  if (archetypeId === "vertical-void") {
    direct = runAttractorsFor(archetypeId, salt.seed, base.recipe.attractors ?? [], undefined, salt.attempt, salt.index);
  } else if (planned.archetypeId === "compressed-sequential") {
    direct = attractorsFromCompressedSequential(planned.plan, salt.seed, salt.attempt);
  } else if (planned.archetypeId === "continuous-hall") {
    direct = attractorsFromContinuousHall(planned.plan, salt.seed, salt.attempt);
  } else if (planned.archetypeId === "topographic-ground-field") {
    direct = attractorsFromTopographic(planned.plan, salt.seed, salt.attempt);
  } else if (planned.archetypeId === "linear-gallery") {
    direct = attractorsFromLinearGallery(planned.plan, salt.seed, salt.attempt);
  }
  assert(JSON.stringify(a.attractors) === JSON.stringify(direct), `${archetypeId} realization matches the drawer`);
  assert(a.foodPoints.length > 0, `${archetypeId} publishes the food points that will be simulated`);
}

const galleryBase = translateArchetype("linear-gallery");
const gallerySlime = slimeControlsFromTranslation(galleryBase);
const galleryPlanned = planLobby("linear-gallery", salt);
if (galleryPlanned && galleryPlanned.archetypeId === "linear-gallery") {
  const scheduled = planLinearGallery(salt.seed, salt.attempt, salt.index);
  const nextKind = (["enfilade", "dogleg", "meander", "fork"] as const).find(
    (kind) => kind !== galleryPlanned.plan.kind && kind !== scheduled.kind,
  );
  assert(nextKind != null, "a gallery kind exists outside this salt's schedule");
  if (nextKind) {
    const mutated: LobbyPlan = {
      archetypeId: "linear-gallery",
      plan: { ...galleryPlanned.plan, kind: nextKind },
    };
    const realized = realizeLobbyPlan(galleryBase, gallerySlime, mutated, salt);
    assert(realized.ok && realized.plan.archetypeId === "linear-gallery" && realized.plan.plan.kind === nextKind, "stored gallery kind is kept");
    if (realized.ok && realized.plan.archetypeId === "linear-gallery") {
      const direct = attractorsFromLinearGallery(realized.plan.plan, salt.seed, salt.attempt);
      assert(JSON.stringify(realized.attractors) === JSON.stringify(direct), "mutated gallery kind is what the drawer reads");
      assert(realized.plan.plan.kind !== scheduled.kind, "realization does not recompute kind from index");
    }
  }
  const shifted: LobbyPlan = {
    archetypeId: "linear-gallery",
    plan: { ...galleryPlanned.plan, originX: Math.min(18, galleryPlanned.plan.originX + 0.4) },
  };
  const placed = realizeLobbyPlan(galleryBase, gallerySlime, shifted, salt);
  const original = realizeLobbyPlan(galleryBase, gallerySlime, galleryPlanned, salt);
  if (placed.ok && original.ok) {
    assert(radii(placed.attractors) === radii(original.attractors), "same salt, new origin, radii stay put");
    assert(JSON.stringify(placed.attractors) !== JSON.stringify(original.attractors), "origin still moves the marks");
  }
}

const voidBase = translateArchetype("vertical-void");
const voidSlime = slimeControlsFromTranslation(voidBase);
const voidPlanned = planLobby("vertical-void", salt);
if (voidPlanned && voidPlanned.archetypeId === "vertical-void") {
  const illegal: LobbyPlan = { archetypeId: "vertical-void", plan: { ...voidPlanned.plan, core: "compact", aspect: 9 } };
  const repaired = repairLobbyPlan(illegal);
  assert(repaired.ok && repaired.plan.archetypeId === "vertical-void" && repaired.plan.plan.aspect === 1.15, "aspect is repaired into the compact band");
}

const seated: MorphPlan = {
  core: "compact",
  approach: "single",
  relation: "tight",
  cx: 8,
  cy: 10,
  axis: 0,
  span: 4,
  aspect: 1,
};

function realizeVoid(plan: MorphPlan) {
  return realizeLobbyPlan(voidBase, voidSlime, { archetypeId: "vertical-void", plan }, salt);
}

const voidA = realizeVoid(seated);
const voidB = realizeVoid(seated);
assert(voidA.ok && voidB.ok && JSON.stringify(voidA) === JSON.stringify(voidB), "vertical void same plan and salt are identical");
if (voidA.ok) {
  const drawn = attractorsFromVerticalVoidPlan(seated, salt.seed, salt.attempt);
  assert(JSON.stringify(voidA.attractors) === JSON.stringify(drawn), "vertical void attractors come from the stored plan");
  assert(Math.abs(voidA.attractors[0].x - seated.cx) < 1e-9, "stored cx is the core x");
  const shifted = realizeVoid({ ...seated, cx: 10 });
  if (shifted.ok) {
    assert(Math.abs(shifted.attractors[0].x - 10) < 1e-9, "changing cx moves the core");
    assert(shifted.attractors[0].x - voidA.attractors[0].x === 2, "the core moves by the cx delta");
    const mean = (marks: { x: number }[]) => marks.reduce((sum, mark) => sum + mark.x, 0) / marks.length;
    assert(mean(shifted.attractors) > mean(voidA.attractors) + 1, "changing cx moves the whole organization horizontally");
    assert(radii(shifted.attractors) === radii(voidA.attractors), "cx keeps the residual radii");
    const fresh = runAttractorsFor("vertical-void", salt.seed, voidBase.recipe.attractors ?? [], undefined, salt.attempt, salt.index);
    assert(JSON.stringify(shifted.attractors) !== JSON.stringify(fresh), "a mutated cx is not replaced by the seed plan");
  }
  const turned = realizeVoid({ ...seated, axis: Math.PI / 2 });
  if (turned.ok) {
    const aim = (marks: typeof voidA.attractors, cx: number, cy: number) => {
      const path = marks.find((mark) => mark.kind === "line" || mark.kind === "curve");
      return path ? Math.atan2(path.y - cy, path.x - cx) : 0;
    };
    const delta = Math.atan2(Math.sin(aim(turned.attractors, 8, 10) - aim(voidA.attractors, 8, 10)), Math.cos(aim(turned.attractors, 8, 10) - aim(voidA.attractors, 8, 10)));
    assert(Math.abs(delta - Math.PI / 2) < 1e-6, "changing axis turns the approach");
    assert(radii(turned.attractors) === radii(voidA.attractors), "axis keeps the residual radii");
    assert(turned.slime.voidRotation === Math.PI / 2 && voidA.slime.deposit === turned.slime.deposit, "axis sets void rotation and leaves the slime stream");
  }
  const expanded = realizeVoid({ ...seated, core: "expanded" });
  if (expanded.ok) {
    assert((expanded.attractors[0].radius ?? 0) >= 4.6, "expanded core uses the expanded radius family");
    assert((voidA.attractors[0].radius ?? 0) <= 2.3, "compact core uses the compact radius family");
    assert(expanded.attractors.filter((mark) => mark.hole || mark.kind === "ring").length === 1, "expanded core stays one hole");
  }
  const split = realizeVoid({ ...seated, core: "split" });
  if (split.ok) {
    assert(split.attractors.filter((mark) => mark.hole || mark.kind === "ring").length === 2, "split core draws a second hole");
  }
  const pair = realizeVoid({ ...seated, approach: "pair" });
  if (pair.ok) {
    const paths = (marks: typeof voidA.attractors) => marks.filter((mark) => mark.kind === "line" || mark.kind === "curve").length;
    assert(paths(pair.attractors) === 2 && paths(voidA.attractors) === 1, "approach pair adds a second path");
    assert(pair.attractors[0].radius === voidA.attractors[0].radius, "approach leaves the core radius");
  }
  const separated = realizeVoid({ ...seated, relation: "separated" });
  if (separated.ok) {
    const path = (marks: typeof voidA.attractors) => marks.find((mark) => mark.kind === "line" || mark.kind === "curve");
    const gap = (mark: NonNullable<ReturnType<typeof path>>) => Math.hypot((mark.x2 ?? mark.x) - 8, (mark.y2 ?? mark.y) - 10);
    const near = path(voidA.attractors);
    const far = path(separated.attractors);
    assert(near != null && far != null && gap(far) > gap(near), "separated relation stops the path farther from the core");
    assert(near?.radius === far?.radius, "relation keeps the path width from the salt");
  }
  const stretched = realizeVoid({ ...seated, aspect: 1.1 });
  if (stretched.ok) {
    assert(JSON.stringify(stretched.attractors) === JSON.stringify(voidA.attractors), "aspect does not redraw the attractors");
    assert(stretched.slime.voidElongation === 1.1 && voidA.slime.voidElongation === 1, "aspect sets void elongation");
    assert(stretched.slime.deposit === voidA.slime.deposit, "aspect leaves the rest of the slime stream");
  }
}

const hallPlanned = planLobby("continuous-hall", salt);
if (hallPlanned && hallPlanned.archetypeId === "continuous-hall" && hallPlanned.plan.figure !== "stroke") {
  const illegal: LobbyPlan = { archetypeId: "continuous-hall", plan: { ...hallPlanned.plan, figure: "stroke" } };
  const repaired = repairLobbyPlan(illegal);
  assert(
    repaired.ok && repaired.plan.archetypeId === "continuous-hall" && repaired.plan.plan.figure === hallPlanned.plan.figure,
    "figure is repaired back to the family",
  );
}

const sequencePlanned = planLobby("compressed-sequential", salt);
if (sequencePlanned && sequencePlanned.archetypeId === "compressed-sequential") {
  const illegal: LobbyPlan = {
    archetypeId: "compressed-sequential",
    plan: { ...sequencePlanned.plan, openHi: sequencePlanned.plan.openLo },
  };
  const repaired = repairLobbyPlan(illegal);
  assert(
    repaired.ok &&
      repaired.plan.archetypeId === "compressed-sequential" &&
      repaired.plan.plan.openHi === sequencePlanned.plan.openLo + 0.5,
    "openHi is lifted above openLo",
  );
  const tied = repairLobbyPlan({
    archetypeId: "compressed-sequential",
    plan: { ...sequencePlanned.plan, halo: "bare", attractorsOnly: false },
  });
  assert(tied.ok && tied.plan.archetypeId === "compressed-sequential" && tied.plan.plan.attractorsOnly === true, "attractorsOnly follows halo");
}

const rejected = repairLobbyPlan({
  archetypeId: "linear-gallery",
  plan: { ...(galleryPlanned && galleryPlanned.archetypeId === "linear-gallery" ? galleryPlanned.plan : planLinearGallery(1, 0, 0)), kind: "not-a-kind" as "enfilade" },
});
assert(!rejected.ok, "unknown gallery kind is rejected");

const recoveredFrom = realizeLobbyPlan(galleryBase, gallerySlime, galleryPlanned!, salt);
if (recoveredFrom.ok) {
  const recovered = realizeLobbyCatalogEntry({
    archetypeId: "linear-gallery",
    seed: salt.seed,
    run: salt.index + 1,
    recipe: recoveredFrom.translation.recipe,
  });
  assert(recovered != null && recovered.salt.attempt === salt.attempt, "older catalog row recovers the winning attempt");
  assert(recovered != null && JSON.stringify(recovered.attractors) === JSON.stringify(recoveredFrom.attractors), "recovered row matches the saved attractors");
  const stored = realizeLobbyCatalogEntry({
    archetypeId: "linear-gallery",
    lobbyPlan: recoveredFrom.plan,
    lobbySalt: salt,
  });
  assert(stored != null && JSON.stringify(stored.attractors) === JSON.stringify(recoveredFrom.attractors), "stored plan replays without scheduling");
}

const trailA = simulateLobbyCatalogEntry(
  { archetypeId: "vertical-void", lobbyPlan: voidPlanned!, lobbySalt: salt },
  1,
  4,
);
const trailB = simulateLobbyCatalogEntry(
  { archetypeId: "vertical-void", lobbyPlan: voidPlanned!, lobbySalt: salt },
  1,
  4,
);
assert(trailA != null && trailB != null && trailA.state.trails.length === trailB.state.trails.length, "evaluation seed repeats the trail length");
assert(
  trailA != null && trailB != null && trailA.state.trails.every((value, index) => value === trailB.state.trails[index]),
  "evaluation seed repeats the trail",
);

if (failed) {
  console.error(`${failed} checks failed`);
  process.exit(1);
}
console.log("verify-lobby-realization: all checks passed");
