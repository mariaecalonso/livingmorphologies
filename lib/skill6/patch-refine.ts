/**
 * Finer implicit blends for the two verified near-contact joints.
 * Reads the baseline study. Does not rewrite it, the catalog, or the pose library.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Skill6Pose, Vec3 } from "./contract";
import { measureEnvelope, validateSpec } from "./envelope";
import {
  blendPatch,
  collectInterface,
  elevatePose,
  groundLift,
  joinedAssembly,
  lowestVertexZ,
  measurePatch,
  posedMesh,
  translateMesh,
  type PatchMesh,
} from "./patch";
import { loadArchetypeMeshes } from "./source";

const CASES = [
  { id: "flat-self", hostId: "flat-deep-plan", guestId: "flat-deep-plan", hostInstanceId: "t00", guestInstanceId: "t01", spec: { yaw: 180, pitch: -40, roll: 0, axis: [-1, 0, 0] as Vec3, axisName: "-X", gap: 0.1, mirrorX: false } },
  { id: "flat-plate", hostId: "flat-deep-plan", guestId: "inserted-horizontal-plate", hostInstanceId: "t00", guestInstanceId: "t01", spec: { yaw: 180, pitch: 0, roll: 0, axis: [-1, 0, 0] as Vec3, axisName: "-X", gap: 0.1, mirrorX: false } },
];

const SETTINGS = [
  { id: "baseline", radius: undefined, cell: undefined, maxCells: undefined },
  { id: "r40-c16", radius: 0.4, cell: 0.16, maxCells: 96 },
  { id: "r38-c14", radius: 0.38, cell: 0.14, maxCells: 110 },
  { id: "r36-c12", radius: 0.36, cell: 0.12, maxCells: 120 },
  { id: "r32-c12", radius: 0.32, cell: 0.12, maxCells: 120 },
  { id: "r42-c14", radius: 0.42, cell: 0.14, maxCells: 110 },
] as const;

function meshJson(mesh: PatchMesh | null) {
  if (!mesh) return null;
  return { positions: Array.from(mesh.positions), indices: Array.from(mesh.indices) };
}

function choose(rows: { id: string; oneSolid: boolean; selfIntersections: number; cell: number; radius: number; addedVolume: number | null; hostOverlap: number | null; guestOverlap: number | null }[]) {
  const valid = rows.filter((row) => row.oneSolid && row.selfIntersections === 0 && (row.hostOverlap ?? 0) > 0.2 && (row.guestOverlap ?? 0) > 0.2);
  return valid.sort((left, right) => left.radius - right.radius || left.cell - right.cell || (left.addedVolume ?? Infinity) - (right.addedVolume ?? Infinity))[0] ?? null;
}

async function main() {
  const meshes = loadArchetypeMeshes();
  const byId = new Map(meshes.map((mesh) => [mesh.archetypeId, mesh]));
  const home: Skill6Pose = { basis: [1, 0, 0, 0, 1, 0, 0, 0, 1], translation: [0, 0, 0] };
  const views: Record<string, unknown> = {};
  const pairs = [];

  for (const item of CASES) {
    const host = byId.get(item.hostId);
    const guest = byId.get(item.guestId);
    if (!host || !guest) throw new Error(`Missing ${item.id}`);
    const before = validateSpec(host, guest, item.spec);
    if (!before.accepted) throw new Error(`${item.id} lost its verified joint`);
    const samples = collectInterface(host, guest, home, before.pose);
    const rows = [];
    const built = new Map<string, PatchMesh>();
    for (const setting of SETTINGS) {
      const patch = blendPatch(host, guest, home, before.pose, samples, setting.radius == null ? {} : { radius: setting.radius, cell: setting.cell, maxCells: setting.maxCells });
      const measure = patch.mesh ? await measurePatch(host, guest, home, before.pose, patch.mesh) : null;
      const radius = setting.radius ?? Number(patch.note.match(/radius ([0-9.]+)/)?.[1] ?? 0.45);
      const cell = setting.cell ?? 0.22;
      const added = measure?.joinedVolume != null && measure.hostVolume != null && measure.guestVolume != null
        ? measure.joinedVolume - measure.hostVolume - measure.guestVolume
        : null;
      if (patch.mesh) built.set(setting.id, patch.mesh);
      rows.push({
        id: setting.id,
        radius,
        cell,
        buildMilliseconds: patch.milliseconds,
        validationMilliseconds: measure?.milliseconds ?? 0,
        note: patch.note,
        triangles: measure?.triangles ?? 0,
        patchVolume: measure?.volume ?? null,
        addedVolume: added,
        hostOverlap: measure?.hostOverlap ?? null,
        guestOverlap: measure?.guestOverlap ?? null,
        patchStatus: measure?.patchStatus ?? "no mesh",
        joinedStatus: measure?.joinedStatus ?? "not-run",
        joinedComponents: measure?.joinedComponents ?? null,
        selfIntersections: measure?.selfIntersections ?? null,
        oneSolid: measure?.oneSolid ?? false,
        extent: measure?.extent ?? null,
      });
      console.log(`${item.id} ${setting.id} solid ${measure?.oneSolid ?? false} added ${added?.toFixed(2) ?? "—"} ${patch.milliseconds}+${measure?.milliseconds ?? 0}ms`);
    }
    const selected = choose(rows);
    const selectedMesh = selected ? built.get(selected.id) ?? null : null;
    const union = selectedMesh ? await joinedAssembly(host, guest, home, before.pose, selectedMesh) : null;
    const hostMesh = posedMesh(host, home);
    const guestMesh = posedMesh(guest, before.pose);
    const lift = groundLift([hostMesh, guestMesh, ...(selectedMesh ? [selectedMesh] : [])]);
    const seatedHost = elevatePose(home, lift);
    const seatedGuest = elevatePose(before.pose, lift);
    const after = measureEnvelope(host, guest, seatedHost, seatedGuest);
    const seatedLowest = Math.min(lowestVertexZ(host, seatedHost), lowestVertexZ(guest, seatedGuest));
    const moves = (["+X", "-X", "+Y", "-Y", "+Z"] as const).map((name) => {
      const offset: Vec3 = name === "+X" ? [8, 0, 0] : name === "-X" ? [-8, 0, 0] : name === "+Y" ? [0, 8, 0] : name === "-Y" ? [0, -8, 0] : [0, 0, 8];
      const moved = elevatePose(seatedGuest, 0);
      moved.translation = [moved.translation[0] + offset[0], moved.translation[1] + offset[1], moved.translation[2] + offset[2]];
      const parts = [posedMesh(host, seatedHost), posedMesh(guest, moved)].map((mesh) => translateMesh(mesh, groundLift([posedMesh(host, seatedHost), posedMesh(guest, moved)])));
      let lowest = Infinity;
      for (const mesh of parts) {
        for (let index = 2; index < mesh.positions.length; index += 3) lowest = Math.min(lowest, mesh.positions[index]);
      }
      return { direction: name, lowestAfterSeat: lowest };
    });
    const center = samples.reduce<Vec3>((sum, sample) => [sum[0] + sample.host[0], sum[1] + sample.host[1], sum[2] + sample.host[2]], [0, 0, 0])
      .map((value) => value / Math.max(1, samples.length)) as Vec3;
    const seatedCenter: Vec3 = [center[0], center[1], center[2] + lift];
    views[item.id] = {
      center: seatedCenter,
      samples: samples.filter((_, index) => index % Math.ceil(samples.length / 500) === 0).map((sample) => ({
        host: [sample.host[0], sample.host[1], sample.host[2] + lift],
        guest: [sample.guest[0], sample.guest[1], sample.guest[2] + lift],
      })),
      nearHost: meshJson(translateMesh(hostMesh, lift)),
      nearGuest: meshJson(translateMesh(guestMesh, lift)),
      patch: meshJson(selectedMesh ? translateMesh(selectedMesh, lift) : null),
      union: meshJson(union ? translateMesh(union, lift) : null),
      selected: selected?.id ?? null,
    };
    pairs.push({
      id: item.id,
      classification: selected ? "patched-near-contact" as const : "failed-patch" as const,
      hostInstanceId: item.hostInstanceId,
      guestInstanceId: item.guestInstanceId,
      hostArchetypeId: item.hostId,
      guestArchetypeId: item.guestId,
      rigidPose: before.pose,
      seatedHostPose: seatedHost,
      seatedGuestPose: seatedGuest,
      spec: item.spec,
      before: { contactArea: before.contactArea, residualGap: before.residualGap, normalAlignment: before.normalAlignment, deepestCrossing: before.deepestCrossing, lowestZ: Math.min(lowestVertexZ(host, home), lowestVertexZ(guest, before.pose)) },
      afterSeat: { contactArea: after.contactArea, residualGap: after.residualGap, normalAlignment: after.normalAlignment, lowestZ: seatedLowest, lift },
      relativeUnchanged: Math.abs((seatedGuest.translation[0] - seatedHost.translation[0]) - before.pose.translation[0]) < 1e-6
        && Math.abs((seatedGuest.translation[1] - seatedHost.translation[1]) - before.pose.translation[1]) < 1e-6
        && Math.abs((seatedGuest.translation[2] - seatedHost.translation[2]) - (before.pose.translation[2] + 0)) < 1e-4,
      growth: moves,
      trials: rows,
      selected,
      connection: selected ? {
        contract: "skill6-patch-connection-v1",
        classification: "patched-near-contact",
        hostInstanceId: item.hostInstanceId,
        guestInstanceId: item.guestInstanceId,
        hostArchetypeId: item.hostId,
        guestArchetypeId: item.guestId,
        rigidPose: before.pose,
        parameters: { radius: selected.radius, cell: selected.cell, method: "implicit-blend" },
        contact: { contactArea: before.contactArea, residualGap: before.residualGap, normalAlignment: before.normalAlignment, deepestCrossing: before.deepestCrossing, kind: "near-contact" },
        patch: { id: selected.id, patchVolume: rows.find((row) => row.id === selected.id)?.patchVolume ?? null, addedVolume: selected.addedVolume, hostOverlap: selected.hostOverlap, guestOverlap: selected.guestOverlap },
        boolean: { status: "NoError", components: 1, selfIntersections: 0, oneSolid: true },
        ground: { lift, minZBefore: Math.min(lowestVertexZ(host, home), lowestVertexZ(guest, before.pose)), minZAfter: seatedLowest },
        geometry: `patch:${item.id}:${selected.id}`,
        provenance: "rule-based-envelope pose, implicit blend refined from the 0.45 / 0.22 baseline. Source meshes were not edited.",
      } : null,
    });
  }

  const directory = path.join(process.cwd(), "data", "skill6");
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, "patch-refined.json"), JSON.stringify({
    version: 1,
    baselinePreserved: "data/skill6/patch-prototype.json",
    note: "Near-contact is not recorded as exact surface contact. Direct contact would require a residual at or under 0.05. These joints remain near-contact and carry a separate patch.",
    pairs,
  }, null, 2));
  const viewDirectory = path.join(process.env.TEMP ?? directory, "skill6-patch-refined");
  mkdirSync(viewDirectory, { recursive: true });
  writeFileSync(path.join(viewDirectory, "views.json"), JSON.stringify(views));
  console.log(path.join(viewDirectory, "views.json"));
  console.log("patch refinement stored");
}

main();
