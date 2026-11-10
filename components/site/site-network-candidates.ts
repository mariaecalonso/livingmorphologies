import inputs from "@/data/skill5/site-inputs-v1.json";

export type PedestrianCandidate = {
  id: string;
  title: string;
  label: string;
  role: "access" | "baywalk";
  /** Parcel-edge contact, or the southern end of the recorded Baywalk. Not a moved copy. */
  measuredX: number;
  measuredZ: number;
  sidewalkX: number | null;
  sidewalkZ: number | null;
  path: readonly { x: number; z: number }[];
  sidewalk: string | null;
  side: string | null;
  gapFeet: number | null;
  lengthFeet: number | null;
  parcelDistanceFeet: number | null;
  limitation: string;
};

type Quantity = { id?: string; value?: number };
type Setting = { id?: string; value?: string };
type PointRecord = { x?: number; z?: number; role?: string };
type RecordGeometry = {
  type?: string;
  from?: PointRecord;
  to?: PointRecord;
  paths?: PointRecord[][];
};
type InputRecord = {
  id?: string;
  kind?: string;
  title?: string;
  quantities?: Quantity[];
  geometry?: RecordGeometry;
  settings?: Setting[];
  reliability?: string;
  gaps?: string[];
};

const SEARCH_FEET = 30;

function quantity(record: InputRecord, id: string) {
  const value = record.quantities?.find((item) => item.id === id)?.value;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function setting(record: InputRecord, id: string) {
  const value = record.settings?.find((item) => item.id === id)?.value;
  return typeof value === "string" && value.length > 0 ? value : null;
}

function point(value: PointRecord | undefined) {
  if (!value || typeof value.x !== "number" || typeof value.z !== "number") return null;
  if (!Number.isFinite(value.x) || !Number.isFinite(value.z)) return null;
  return { x: value.x, z: value.z, role: value.role ?? "" };
}

function limitation(record: InputRecord) {
  return [record.reliability, ...(record.gaps ?? [])].filter((item): item is string => typeof item === "string" && item.length > 0).join(" ");
}

function accessCandidate(record: InputRecord): PedestrianCandidate | null {
  if (record.kind !== "access" || typeof record.id !== "string" || typeof record.title !== "string") return null;
  const from = point(record.geometry?.from);
  const to = point(record.geometry?.to);
  const edge = to?.role === "parcel-edge" ? to : from?.role === "parcel-edge" ? from : to ?? from;
  if (!edge) return null;
  const sidewalk = from?.role === "sidewalk" ? from : null;
  const sidewalkName = setting(record, "sidewalk");
  return {
    id: record.id,
    title: record.title,
    label: sidewalkName ?? record.title,
    role: "access",
    measuredX: edge.x,
    measuredZ: edge.z,
    sidewalkX: sidewalk && (sidewalk.x !== edge.x || sidewalk.z !== edge.z) ? sidewalk.x : null,
    sidewalkZ: sidewalk && (sidewalk.x !== edge.x || sidewalk.z !== edge.z) ? sidewalk.z : null,
    path: [],
    sidewalk: sidewalkName,
    side: setting(record, "side"),
    gapFeet: quantity(record, "gap"),
    lengthFeet: null,
    parcelDistanceFeet: null,
    limitation: limitation(record),
  };
}

function baywalkCandidate(record: InputRecord): PedestrianCandidate | null {
  if (record.kind !== "baywalk" || typeof record.id !== "string" || typeof record.title !== "string") return null;
  const path = (record.geometry?.paths ?? []).flatMap((line) => line.map(point).filter((item): item is { x: number; z: number; role: string } => item !== null));
  if (path.length < 2) return null;
  const south = path.reduce((best, item) => item.z < best.z ? item : best, path[0]);
  return {
    id: record.id,
    title: record.title,
    label: "Baywalk",
    role: "baywalk",
    measuredX: south.x,
    measuredZ: south.z,
    sidewalkX: null,
    sidewalkZ: null,
    path,
    sidewalk: null,
    side: null,
    gapFeet: null,
    lengthFeet: quantity(record, "length"),
    parcelDistanceFeet: quantity(record, "parcelDistance"),
    limitation: limitation(record),
  };
}

/** Pedestrian access contacts and the named Baywalk from the site-analysis handoff. */
export function pedestrianCandidates(): PedestrianCandidate[] {
  const groups = (inputs as { groups?: { records?: InputRecord[] }[] }).groups ?? [];
  const records = groups.flatMap((group) => group.records ?? []);
  const candidates: PedestrianCandidate[] = [];
  for (const record of records) {
    const access = accessCandidate(record);
    if (access) candidates.push(access);
    const baywalk = baywalkCandidate(record);
    if (baywalk) candidates.push(baywalk);
  }
  return candidates;
}

/**
 * First open cell within 30 ft of a boundary contact, walking toward the parcel centroid.
 * The measured coordinate is not changed. A line with no parcel contact is not resolved.
 */
export function resolveCandidate(
  candidate: PedestrianCandidate,
  inside: (x: number, z: number) => boolean,
  cellFeet: number,
  towardX: number,
  towardZ: number,
): { x: number; z: number } | null {
  if (candidate.role !== "access") return null;
  if (inside(candidate.measuredX, candidate.measuredZ)) {
    return { x: candidate.measuredX, z: candidate.measuredZ };
  }
  const dx = towardX - candidate.measuredX;
  const dz = towardZ - candidate.measuredZ;
  const length = Math.hypot(dx, dz);
  if (length < 1e-6) return null;
  const step = Math.max(0.5, cellFeet * 0.5);
  for (let distance = step; distance <= SEARCH_FEET; distance += step) {
    const x = candidate.measuredX + (dx / length) * distance;
    const z = candidate.measuredZ + (dz / length) * distance;
    if (inside(x, z)) return { x, z };
  }
  return null;
}
