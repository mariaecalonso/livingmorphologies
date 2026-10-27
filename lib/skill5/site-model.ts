export type XZ = [number, number];

export type SiteRoadKind = "local" | "ramp" | "expressway" | "causeway";

export type SiteWidthSource = "width-tag" | "lanes" | "display" | "pavement-edge" | "estimated";

export type SiteRoad = {
  name: string;
  kind: SiteRoadKind;
  /** Half-width of the drawn surface, in international feet. See widthSource. */
  displayHalfWidthFeet: number;
  /** width-tag is a mapped width. lanes is a lane count times 12 feet. display is a class width. pavement-edge is measured from Miami-Dade pavement edges. */
  widthSource?: SiteWidthSource;
  /** Half-width at each path vertex, in international feet. Null keeps displayHalfWidthFeet. */
  halfWidthFeet?: Array<number | null>;
  /** Lateral shift of the drawn center toward the left of travel, in international feet. The stored path stays the source centerline. */
  centerShiftFeet?: Array<number | null>;
  /** The source marks a bridge or an upper layer. Without deckFeet, the mesh is only separated in the drawing. */
  elevated?: boolean;
  /** Height of the roadway surface above the model ground, in international feet. One value per path vertex. Null where no deck return was found. */
  deckFeet?: Array<number | null>;
  path: XZ[];
};

export type SiteHeightSource = "osm-height" | "county" | "osm-levels" | "estimated";

export type SiteBuilding = {
  id: number;
  name: string | null;
  /** International feet. Null when no height source applies and the footprint stays flat. */
  heightFeet: number | null;
  /** osm-height and county are tagged heights. osm-levels is a provisional story count. estimated is a reference mass, not a survey. */
  heightSource?: SiteHeightSource | null;
  ring: XZ[];
  holes?: XZ[][];
  /** County footprints omit this. osm means the county extract had no host footprint. */
  footprintSource?: "osm";
};

export type SiteSource = {
  id: string;
  title: string;
  url: string;
  retrieved: string;
  note: string;
};

export type SiteContext = {
  contract: "skill5-site-context-v1";
  retrieved: string;
  origin: { lat: number; lon: number; note: string };
  axes: { x: "east"; y: "up"; z: "north"; unit: "foot" };
  site: {
    folio: string;
    address: string;
    city: string;
    lotSizeSqFt: number;
    ringAreaSqFt: number;
    widthFeet: number;
    depthFeet: number;
    ring: XZ[];
  };
  water: { ring: XZ[]; note: string };
  coastline: { osmIds: number[]; sourceTag: string; path: XZ[] };
  roads: SiteRoad[];
  buildings: SiteBuilding[];
  limitations: string[];
  sources: SiteSource[];
};
