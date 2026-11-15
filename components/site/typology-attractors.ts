/**
 * Architectural planning markers for Site Strategy.
 * These records are a design-intent overlay. They are not simulation nodes.
 */

export const TYPOLOGY_INTENTS = ["lobby", "gathering", "workspace"] as const;

export type TypologyIntent = (typeof TYPOLOGY_INTENTS)[number];

export type TypologyAttractor = {
  id: string;
  typology: TypologyIntent;
  x: number;
  z: number;
};

export type TypologyOverlay = {
  points: TypologyAttractor[];
  visible: boolean;
  types: Record<TypologyIntent, boolean>;
};

const STORAGE_KEY = "living-morphologies.typology-attractors";

const EMPTY_TYPES: Record<TypologyIntent, boolean> = { lobby: true, gathering: true, workspace: true };

export const EMPTY_TYPOLOGY_OVERLAY: TypologyOverlay = { points: [], visible: true, types: { ...EMPTY_TYPES } };

let serial = 1;

export function createTypologyAttractor(typology: TypologyIntent, x: number, z: number): TypologyAttractor {
  serial += 1;
  return { id: `intent-${Date.now().toString(36)}-${serial}`, typology, x, z };
}

export function isTypologyIntent(value: unknown): value is TypologyIntent {
  return value === "lobby" || value === "gathering" || value === "workspace";
}

export function parseTypologyOverlay(value: unknown): TypologyOverlay {
  if (!value || typeof value !== "object") return { ...EMPTY_TYPOLOGY_OVERLAY, types: { ...EMPTY_TYPES } };
  const body = value as { points?: unknown; visible?: unknown; types?: unknown };
  const seen = new Set<string>();
  const points = Array.isArray(body.points) ? body.points.flatMap((item): TypologyAttractor[] => {
    if (!item || typeof item !== "object") return [];
    const point = item as { id?: unknown; typology?: unknown; x?: unknown; z?: unknown };
    if (typeof point.id !== "string" || !isTypologyIntent(point.typology)) return [];
    if (typeof point.x !== "number" || typeof point.z !== "number" || !Number.isFinite(point.x) || !Number.isFinite(point.z)) return [];
    if (seen.has(point.id)) return [];
    seen.add(point.id);
    return [{ id: point.id, typology: point.typology, x: point.x, z: point.z }];
  }) : [];
  const types = { ...EMPTY_TYPES };
  if (body.types && typeof body.types === "object") {
    const record = body.types as Partial<Record<TypologyIntent, unknown>>;
    for (const kind of TYPOLOGY_INTENTS) {
      if (typeof record[kind] === "boolean") types[kind] = record[kind];
    }
  }
  return { points, visible: body.visible !== false, types };
}

export function readTypologyOverlay(): TypologyOverlay {
  if (typeof window === "undefined") return { ...EMPTY_TYPOLOGY_OVERLAY, types: { ...EMPTY_TYPES } };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...EMPTY_TYPOLOGY_OVERLAY, types: { ...EMPTY_TYPES } };
    return parseTypologyOverlay(JSON.parse(raw) as unknown);
  } catch {
    return { ...EMPTY_TYPOLOGY_OVERLAY, types: { ...EMPTY_TYPES } };
  }
}

export function writeTypologyOverlay(overlay: TypologyOverlay) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(overlay));
  } catch {
    /* The canvas still holds the markers. */
  }
}
