import context from "@/data/skill5/herald-site.json";
import record from "@/data/skill5/urban-context.json";
import type { SiteContext } from "@/lib/skill5/site-model";
import {
  URBAN_LIMITS,
  groupOf,
  pointDistance,
  urbanReading,
  urbanRun,
  type UrbanRecord,
} from "@/lib/skill5/urban";

const site = context as SiteContext;
const urban = record as unknown as UrbanRecord;
const parcel = [...site.site.ring, site.site.ring[0]] as [number, number][];
const study = urbanReading(parcel, site.buildings, urban);

function count(code: number) {
  return urban.polygons.filter((polygon) => polygon.code === code).length;
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

assert(urban.polygons.length === 318, "polygon count");
assert(count(35) === 51, "high-density residential");
assert(count(110) === 27, "sales and services");
assert(count(113) === 5, "office");
assert(count(200) === 5, "hotel");
assert(count(420) === 3, "cultural");
assert(count(510) === 9, "municipal parks");
assert(count(180) === 6, "mixed");
assert(count(517) === 18, "private recreation");
assert(count(804) === 42, "vacant private");
assert(groupOf(180) === "mixed", "mixed stays mixed");
assert(groupOf(517) === "other", "private recreation stays other");
assert(groupOf(510) === "public", "municipal park group");
assert(groupOf(804) === "other", "vacant stays other");
assert(groupOf(640) === "other", "streets stay other");

const pace = urban.parkPoints.find((park) => park.name === "Margaret Pace Park");
const bicentennial = urban.parkPoints.find((park) => park.name === "Bicentennial Park");
const cemetery = urban.parkPoints.find((park) => park.name === "City Cementary");
assert(pace !== undefined && bicentennial !== undefined && cemetery !== undefined, "park names");
const paceGap = pointDistance(pace.x, pace.z, parcel);
const pacePoint = study.points.find((point) => point.id === pace.id);
assert(pacePoint !== undefined && Math.abs(pacePoint.distanceFeet - paceGap.feet) < 0.05, "pace distance");

const museums = study.points.filter((point) => point.kind === "museum").map((point) => point.name);
assert(museums.includes("Pérez Art Museum Miami"), "pamm");
assert(museums.includes("Patricia and Phillip Frost Museum of Science"), "frost");
const historical = study.points.find((point) => point.name === "Biscayne Park (historical)");
assert(historical?.filter === "other" && historical.note.includes("historical"), "historical park");
const ferre = study.points.find((point) => point.name === "Maurice A. Ferré Park");
const countyBicentennial = study.points.find((point) => point.name === "Bicentennial Park");
assert(ferre?.authority === "openstreetmap" && countyBicentennial?.authority === "parkfinder", "park records stay separate");
assert(ferre !== undefined && countyBicentennial !== undefined && Math.abs(ferre.x - countyBicentennial.x) + Math.abs(ferre.z - countyBicentennial.z) > 1, "park points are not the same coordinate");

const hilton = study.points.find((point) => point.name === "Hilton Miami Downtown");
assert(hilton?.status === "mapped" && hilton.authority === "openstreetmap", "hilton is mapped");
assert(study.points.every((point) => !("intensity" in point) && !("demand" in point)), "no invented demand");
assert(study.programs.length === 5, "five programs");
assert(study.programs.every((item) => item.text.includes("Nothing is placed on the parcel") && item.text.includes("no Physarum network")), "programs stay unplaced");
assert(study.programs[2].text.includes("not counted as office"), "mixed is not office");
assert(study.programs[4].text.includes("not a public park"), "private recreation");
assert(URBAN_LIMITS.some((limit) => limit.includes("not merged")), "name distinction");
assert(urban.parks.note.includes("no features"), "county park boundaries");

const centroidUses = study.parcelUses.filter((area) => area.containsCentroid);
const boundaryUses = study.parcelUses.filter((area) => !area.containsCentroid);
assert(centroidUses.length === 1 && centroidUses[0].code === 804, "centroid is vacant private land");
assert(boundaryUses.map((area) => area.code).join(",") === "641,932", "boundary codes");
assert(boundaryUses[0].boundaryVertices === 5 && boundaryUses[1].boundaryVertices === 2, "boundary vertex counts");

function nearest(group: "residential" | "commercial" | "office" | "cultural" | "hospitality" | "public" | "mixed") {
  const area = study.areas.filter((item) => item.group === group).sort((a, b) => a.distanceFeet - b.distanceFeet)[0];
  if (!area) throw new Error(`${group} is missing`);
  return area;
}

assert(Math.abs(nearest("residential").distanceFeet - 98.7) < 0.2 && nearest("residential").code === 35, "residential");
assert(Math.abs(nearest("commercial").distanceFeet - 289.3) < 0.2 && nearest("commercial").code === 110, "commercial");
assert(Math.abs(nearest("office").distanceFeet - 943.8) < 0.2 && nearest("office").code === 113, "office");
assert(Math.abs(nearest("cultural").distanceFeet - 146.9) < 0.2 && nearest("cultural").code === 420, "cultural");
assert(Math.abs(nearest("hospitality").distanceFeet - 435.5) < 0.2 && nearest("hospitality").code === 200, "hospitality");
assert(Math.abs(nearest("public").distanceFeet - 144.3) < 0.2 && nearest("public").code === 510, "public");
assert(Math.abs(nearest("mixed").distanceFeet - 605.3) < 0.2 && nearest("mixed").code === 180, "mixed distance");
assert(Math.abs(paceGap.feet - 1620.9) < 0.2, "pace feet");
assert(hilton !== undefined && Math.abs(hilton.distanceFeet - 846.6) < 0.2 && (hilton.county?.startsWith("110 ") ?? false), "hilton county class");
assert(hilton !== undefined && hilton.note.includes("not code 200"), "hilton is not a county hotel");

const land = urbanRun("land-use", ["residential", "commercial", "office", "cultural", "hospitality", "public"], ["park"], study);
const program = urbanRun("program", [], [], study);
assert(land.primary === "Residential · 35 · 99 ft", "land primary");
assert(land.secondary.includes("Centroid: 804") && land.secondary.includes("641 touches 5") && land.secondary.includes("932 touches 2"), "land secondary");
assert(program.title === "Program relevance", "program run");
const museumStation = study.points.find((point) => point.name === "MUSEUM PARK");
const arshtStation = study.points.find((point) => point.name === "ADRIENNE ARSHT CENTER");
assert(museumStation !== undefined && museumStation.note.includes("open flag is 0"), "museum park flag");
assert(arshtStation !== undefined && arshtStation.note.includes("open flag is 1"), "arsht flag");

console.log("urban checks passed");
console.log("parcel", study.parcelUses.map((area) => `${area.code} ${area.distanceFeet}`).join(" | ") || "none");
console.log("land", land.primary, "||", land.secondary);
for (const group of ["residential", "commercial", "office", "cultural", "hospitality", "public", "mixed"] as const) {
  const area = study.areas.filter((item) => item.group === group).sort((a, b) => a.distanceFeet - b.distanceFeet)[0];
  console.log(group, area ? `${area.code} ${area.distanceFeet.toFixed(1)} ${area.description}` : "none");
}
console.log("pace", paceGap.feet.toFixed(1));
console.log("hilton", hilton?.distanceFeet.toFixed(1), hilton?.county);
console.log("generators", study.points.length);
