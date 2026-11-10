import { FACE_IDS, type FaceId, type Vec3 } from "../lib/skill4/contract";
import { extractFaceProfile } from "../lib/skill4/face-profile";
import { connectionProcess, type ProcessSection } from "../lib/skill4/section-hybrid";
import { loadSkill3HandoffRecords } from "../lib/skill4/skill3-handoff";
import { loadModuleMap } from "../lib/skill4/tiles";

type Ready = Extract<ReturnType<typeof loadModuleMap> extends Map<string, infer V> ? V : never, { status: "ready" }>;

const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const len = (a: Vec3) => Math.hypot(a.x, a.y, a.z);
const norm = (a: Vec3): Vec3 => {
  const span = len(a) || 1;
  return { x: a.x / span, y: a.y / span, z: a.z / span };
};

function upright(section: ProcessSection) {
  const normal = section.planeNormal;
  const vertical = Math.abs(normal.y) < 0.72;
  const up = vertical ? { x: 0, y: 1, z: 0 } : norm(section.planeU);
  const view = { x: -normal.x, y: -normal.y, z: -normal.z };
  const right = norm(cross(view, up));
  const lifted = norm(cross(right, view));
  return { vertical, right, up: lifted };
}

function hausdorff(a: Vec3[], b: Vec3[]) {
  const directed = (from: Vec3[], to: Vec3[]) => {
    let worst = 0;
    for (const point of from) {
      let best = Infinity;
      for (const other of to) {
        const dx = point.x - other.x;
        const dy = point.y - other.y;
        const dz = point.z - other.z;
        best = Math.min(best, dx * dx + dy * dy + dz * dz);
      }
      worst = Math.max(worst, Math.sqrt(best));
    }
    return worst;
  };
  return Math.max(directed(a, b), directed(b, a));
}

function spanOf(values: number[]) {
  return Math.max(...values) - Math.min(...values);
}

function orientation(section: ProcessSection) {
  const frame = upright(section);
  const rows = section.outer.map((point, index) => {
    const delta = sub(point, section.planeOrigin);
    return {
      right: dot(delta, frame.right),
      up: dot(delta, frame.up),
      u: section.profile[index].u,
      v: section.profile[index].v,
    };
  });
  const mean = (key: "right" | "up" | "u" | "v") => rows.reduce((sum, row) => sum + row[key], 0) / rows.length;
  const mu = { right: mean("right"), up: mean("up"), u: mean("u"), v: mean("v") };
  const options = [
    { name: "upright", map: (row: (typeof rows)[number]) => ({ x: row.u, y: row.v }) },
    { name: "rotated-90", map: (row: (typeof rows)[number]) => ({ x: -row.v, y: row.u }) },
    { name: "rotated-180", map: (row: (typeof rows)[number]) => ({ x: -row.u, y: -row.v }) },
    { name: "rotated-270", map: (row: (typeof rows)[number]) => ({ x: row.v, y: -row.u }) },
    { name: "mirrored", map: (row: (typeof rows)[number]) => ({ x: -row.u, y: row.v }) },
  ];
  let best = { name: "none", error: Infinity };
  for (const option of options) {
    const mapped = rows.map(option.map);
    const mx = mapped.reduce((sum, point) => sum + point.x, 0) / mapped.length;
    const my = mapped.reduce((sum, point) => sum + point.y, 0) / mapped.length;
    let error = 0;
    mapped.forEach((point, index) => {
      error += (point.x - mx - (rows[index].right - mu.right)) ** 2 + (point.y - my - (rows[index].up - mu.up)) ** 2;
    });
    if (error < best.error) best = { name: option.name, error };
  }
  const height = spanOf(rows.map((row) => row.up));
  const width = spanOf(rows.map((row) => row.right));
  const profileHeight = spanOf(rows.map((row) => row.v));
  const profileWidth = spanOf(rows.map((row) => row.u));
  return {
    vertical: frame.vertical,
    best: best.name,
    error: Math.sqrt(best.error / rows.length),
    worldAspect: height / Math.max(width, 1e-6),
    profileAspect: profileHeight / Math.max(profileWidth, 1e-6),
  };
}

console.log("loading");
const loaded = loadModuleMap(loadSkill3HandoffRecords());
const ready = [...loaded.values()].filter((item): item is Ready => item.status === "ready" && !!item.geometry);
console.log("ready", ready.length, ready.map((item) => `${item.identity?.name}:${item.geometry.triangles}`).join(", "));
const sample = ready.filter((_, index) => index % 4 === 0).slice(0, 4);
const partner = ready[Math.min(1, ready.length - 1)];
const faces: FaceId[] = ["N", "E", "W", "T"];
let planeWorst = 0;
let cutWorst = 0;
let relativeWorst = 0;
let copied = 0;
let checked = 0;
let missing = 0;
const orientationCounts = new Map<string, number>();
const problems: string[] = [];

for (const module of sample) {
  for (const face of faces) {
    const started = Date.now();
    const otherFace = face === "S" ? "N" : "S";
    const process = connectionProcess(module, face, partner, otherFace);
    console.log("cut", module.identity?.name, face, `${Date.now() - started}ms`, process?.a.length ?? 0);
    const sections = process?.a ?? [];
    if (sections.length === 0) {
      missing += 1;
      problems.push(`${module.identity?.name ?? module.moduleId} ${face}: no sections`);
      continue;
    }
    for (const section of sections) {
      checked += 1;
      if (section.copied) copied += 1;
      let plane = 0;
      for (const point of section.outer) {
        plane = Math.max(plane, Math.abs(dot(sub(point, section.planeOrigin), section.planeNormal)));
      }
      planeWorst = Math.max(planeWorst, plane);
      const raw = extractFaceProfile(module.geometry, module.faces[face], section.depth);
      const loops = raw.loops.filter((loop) => loop.closed && loop.points.length >= 3);
      const areaOf = (points: { u: number; v: number }[]) => {
        let sum = 0;
        for (let index = 0; index < points.length; index += 1) {
          const next = points[(index + 1) % points.length];
          sum += points[index].u * next.v - next.u * points[index].v;
        }
        return Math.abs(sum) * 0.5;
      };
      const outer = [...loops].sort((a, b) => areaOf(b.points) - areaOf(a.points))[0];
      const distance = outer ? hausdorff(section.outer, outer.points.map((point) => point.position)) : Infinity;
      cutWorst = Math.max(cutWorst, distance === Infinity ? 0 : distance);
      const diagonal = Math.hypot(
        spanOf(section.outer.map((point) => point.x)),
        spanOf(section.outer.map((point) => point.y)),
        spanOf(section.outer.map((point) => point.z)),
      );
      const relative = distance === Infinity ? Infinity : distance / Math.max(diagonal, 1e-6);
      relativeWorst = Math.max(relativeWorst, relative === Infinity ? 0 : relative);
      const pose = orientation(section);
      const key = `${pose.vertical ? "vertical" : "plan"}:${pose.best}`;
      orientationCounts.set(key, (orientationCounts.get(key) ?? 0) + 1);
      if (plane > 1e-3 || !outer || relative > 0.12 || (pose.vertical && pose.best !== "upright")) {
        problems.push([
          `${module.identity?.name ?? module.moduleId} ${section.label}`,
          `plane ${plane.toFixed(4)}`,
          `cut ${distance === Infinity ? "none" : distance.toFixed(4)}`,
          `pose ${pose.best}`,
          section.copied ? "copied" : "cut",
          `aspect world ${pose.worldAspect.toFixed(2)} profile ${pose.profileAspect.toFixed(2)}`,
        ].join(" | "));
      }
    }
  }
}

console.log(JSON.stringify({
  modules: ready.length,
  checked,
  missing,
  copied,
  planeWorst,
  cutWorst,
  relativeWorst,
  orientation: Object.fromEntries(orientationCounts),
  problems: problems.slice(0, 40),
  problemCount: problems.length,
}, null, 2));
