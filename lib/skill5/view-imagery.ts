import context from "@/data/skill5/herald-site.json";
import { feetPerDegree, localToGeo, type GeoOrigin } from "@/lib/skill5/geo";
import type { SiteContext } from "@/lib/skill5/site-model";
import { photoReview } from "@/lib/skill5/view-photo-reviews";

const site = context as SiteContext;

const USER_AGENT = "LivingMorphologies/1.0 (site analysis lab; educational)";
const VIEWPOINT_METERS = 50;
const REFERENCE_METERS = 80;
const SAME_FACE_DEGREES = 60;
const COMMONS_FAR_METERS = 1500;
const COMMONS_NEAR_METERS = 400;

const GENERIC = new Set([
  "academy", "and", "arts", "avenue", "boulevard", "building", "center", "centre", "concert",
  "downtown", "florida", "for", "hall", "hotel", "house", "miami", "open", "performing",
  "plaza", "school", "street", "the", "tower", "unnamed",
]);

const REJECT_TITLE = /station|terminal|\bbus\b|symposium|portrait|secretary|people mover|logo|icon|map\b|diagram|blueprint|floor ?plan|seal\b|flag\b|wordmark|pictogram|coat of arms|symbol|badge|svg/i;
const ALLOWED_LICENSE = /public domain|cc0|cc[- ]by|gfdl/i;
const BLOCKED_LICENSE = /fair use|non-free|all rights reserved/i;

export type ImageryHighlight = {
  id: string;
  title: string;
  kind: "obstacle" | "waterfront" | "open";
  x: number;
  z: number;
  targetId: string | null;
};

export type ViewPhoto = {
  id: string;
  role: "viewpoint" | "reference" | "historical";
  imageUrl: string;
  pageUrl: string;
  title?: string;
  author: string;
  license: string;
  source: "Wikimedia Commons" | "Panoramax" | "Openverse" | "Florida Memory";
  captured: { lat: number; lon: number } | null;
};

type LatLon = { lat: number; lon: number };

type StreetPhoto = {
  lat: number;
  lon: number;
  azimuth: number;
  fov: number;
  imageUrl: string;
  pageUrl: string;
  author: string;
  license: string;
};

const memory = new Map<string, { expires: number; value: unknown }>();

async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = memory.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as T;
  const value = await load();
  memory.set(key, { expires: Date.now() + 60 * 60 * 1000, value });
  return value;
}

async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { accept: "application/json", "user-agent": USER_AGENT },
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json();
}

function metersBetween(a: LatLon, b: LatLon) {
  const scale = feetPerDegree((a.lat + b.lat) / 2);
  const east = (b.lon - a.lon) * scale.east * 0.3048;
  const north = (b.lat - a.lat) * scale.north * 0.3048;
  return Math.hypot(east, north);
}

function heading(from: LatLon, to: LatLon) {
  const phi1 = (from.lat * Math.PI) / 180;
  const phi2 = (to.lat * Math.PI) / 180;
  const dLon = ((to.lon - from.lon) * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLon);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function angleBetween(a: number, b: number) {
  const delta = Math.abs(a - b) % 360;
  return delta > 180 ? 360 - delta : delta;
}

function box(point: LatLon, meters: number) {
  const scale = feetPerDegree(point.lat);
  const dLat = meters / (scale.north * 0.3048);
  const dLon = meters / (scale.east * 0.3048);
  return [point.lon - dLon, point.lat - dLat, point.lon + dLon, point.lat + dLat];
}

function plain(value: unknown) {
  return String(value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function searchPhrase(title: string) {
  const primary = (title.split("-")[0] ?? title).replace(/\s+/g, " ").trim();
  const words = primary.split(/[^A-Za-z0-9]+/).filter(Boolean);
  if (words.length < 2 || words.every((word) => GENERIC.has(word.toLowerCase()))) return null;
  return words.join(" ");
}

function licenseName(value: string) {
  if (!value || BLOCKED_LICENSE.test(value) || !ALLOWED_LICENSE.test(value)) return null;
  return value.replace(/\s+/g, " ").trim();
}

async function streetPhotos(point: LatLon, meters: number): Promise<StreetPhoto[]> {
  const key = `panoramax:${point.lat.toFixed(4)}:${point.lon.toFixed(4)}:${meters}`;
  return cached(key, async () => {
    const url = `https://api.panoramax.xyz/api/search?limit=20&bbox=${box(point, meters).map((item) => item.toFixed(6)).join(",")}`;
    let body: unknown;
    try {
      body = await getJson(url);
    } catch {
      return [];
    }
    const features = (body as { features?: unknown[] }).features ?? [];
    const photos: StreetPhoto[] = [];
    for (const feature of features) {
      const item = feature as {
        id?: string;
        geometry?: { coordinates?: number[] };
        assets?: { thumb?: { href?: string } };
        links?: { rel?: string; href?: string }[];
        providers?: { name?: string }[];
        properties?: Record<string, unknown>;
      };
      const [lon, lat] = item.geometry?.coordinates ?? [];
      const azimuth = Number(item.properties?.["view:azimuth"]);
      const accuracy = Number(item.properties?.["quality:horizontal_accuracy"]);
      const statedFov = Number((item.properties?.["pers:interior_orientation"] as { field_of_view?: number } | undefined)?.field_of_view);
      const imageUrl = item.assets?.thumb?.href;
      if (!item.id || !Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(azimuth)) continue;
      if (!Number.isFinite(accuracy) || accuracy > 30 || !imageUrl) continue;
      const fov = statedFov > 15 && statedFov < 150 ? statedFov : 70;
      const instance = item.links?.find((link) => link.rel === "via")?.href?.replace(/\/$/, "");
      photos.push({
        lat,
        lon,
        azimuth,
        fov,
        imageUrl,
        pageUrl: `${instance || "https://panoramax.openstreetmap.fr"}/#pic=${item.id}`,
        author: plain(item.properties?.["geovisio:producer"]) || plain(item.providers?.[0]?.name) || "Panoramax contributor",
        license: plain(item.properties?.license) || "CC BY-SA 4.0",
      });
    }
    return photos;
  });
}

function aimed(photo: StreetPhoto, from: LatLon, target: LatLon) {
  const toward = heading(photo, target);
  const face = heading(from, target);
  return angleBetween(photo.azimuth, toward) <= photo.fov / 2 && angleBetween(face, toward) <= SAME_FACE_DEGREES;
}

function readGps(latValue: string | undefined, lonValue: string | undefined): LatLon | null {
  const lat = Number(plain(latValue));
  const lon = Number(plain(lonValue));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

function fromStreet(highlight: ImageryHighlight, photo: StreetPhoto, role: ViewPhoto["role"]): ViewPhoto {
  return {
    id: highlight.id,
    role,
    imageUrl: photo.imageUrl,
    pageUrl: photo.pageUrl,
    author: photo.author,
    license: photo.license,
    source: "Panoramax",
    captured: { lat: photo.lat, lon: photo.lon },
  };
}

type Identity = {
  centroid: LatLon;
  name: string | null;
  address: string | null;
  otherNames: string[];
};

function buildingRecord(targetId: string | null) {
  const numeric = Number(targetId?.replace(/^building:/, ""));
  if (!Number.isFinite(numeric)) return null;
  return site.buildings.find((building) => building.id === numeric) ?? null;
}

async function identifyFootprint(highlight: ImageryHighlight): Promise<Identity | null> {
  const record = buildingRecord(highlight.targetId);
  if (!record || highlight.kind !== "obstacle") return null;
  let x = 0;
  let z = 0;
  for (const [px, pz] of record.ring) {
    x += px;
    z += pz;
  }
  const centroid = localToGeo(x / record.ring.length, z / record.ring.length, site.origin);
  return cached(`osm:${highlight.targetId}`, async () => {
    const pad = 0.00055;
    const bbox = [centroid.lon - pad, centroid.lat - pad, centroid.lon + pad, centroid.lat + pad].join(",");
    let xml = "";
    try {
      const response = await fetch(`https://www.openstreetmap.org/api/0.6/map?bbox=${bbox}`, {
        headers: { "user-agent": USER_AGENT },
        signal: AbortSignal.timeout(12000),
      });
      if (response.ok) xml = await response.text();
    } catch {
      xml = "";
    }
    const ways = [...xml.matchAll(/<way [^>]*>([\s\S]*?)<\/way>/g)].map((match) => {
      const tags: Record<string, string> = {};
      for (const tag of match[1].matchAll(/<tag k="([^"]+)" v="([^"]+)"/g)) tags[tag[1]] = tag[2];
      return tags;
    }).filter((tags) => tags.building);
    const meters = (record.heightFeet ?? 0) * 0.3048;
    const matched = ways.filter((tags) => {
      const height = Number(tags.height);
      return Number.isFinite(height) && Math.abs(height - meters) < 1.5;
    });
    const chosen = matched.length === 1 ? matched[0] : null;
    const number = chosen?.["addr:housenumber"];
    const street = chosen?.["addr:street"];
    return {
      centroid,
      name: chosen?.name && chosen.name !== record.name ? chosen.name : null,
      address: number && street ? `${number} ${street}` : null,
      otherNames: ways.map((tags) => tags.name).filter((name): name is string => Boolean(name) && name !== chosen?.name),
    };
  });
}

function phrasesFor(highlight: ImageryHighlight, identity: Identity | null) {
  const phrases: string[] = [];
  const add = (value: string | null | undefined) => {
    const phrase = value ? searchPhrase(value) ?? (value.trim().length > 8 ? value.trim() : null) : null;
    if (phrase && !phrases.some((item) => item.toLowerCase() === phrase.toLowerCase())) phrases.push(phrase);
  };
  if (highlight.title !== "Unnamed building") {
    add(highlight.title);
    add(highlight.title.split("-").slice(1).join("-"));
    if (highlight.title.toLowerCase().includes("arsht")) add("Adrienne Arsht Center");
  }
  add(identity?.name);
  if (identity?.address) phrases.push(identity.address);
  return phrases;
}

function titleRejects(title: string, otherNames: readonly string[]) {
  if (REJECT_TITLE.test(title)) return true;
  return otherNames.some((name) => name.length > 4 && title.toLowerCase().includes(name.toLowerCase()));
}

async function commonsByPhrase(phrase: string, highlight: ImageryHighlight, target: LatLon): Promise<ViewPhoto | null> {
  const pages = await cached(`commons:${phrase.toLowerCase()}`, async () => {
    const params = new URLSearchParams({
      action: "query",
      format: "json",
      formatversion: "2",
      generator: "search",
      gsrsearch: `intitle:"${phrase}"`,
      gsrnamespace: "6",
      gsrlimit: "8",
      prop: "imageinfo",
      iiprop: "url|mime|size|extmetadata",
      iiurlwidth: "960",
    });
    try {
      return await getJson(`https://commons.wikimedia.org/w/api.php?${params}`);
    } catch {
      return null;
    }
  });
  return bestCommons(pages, phrase, highlight, target, null);
}

function bestCommons(pages: unknown, phrase: string | null, highlight: ImageryHighlight, target: LatLon, otherNames: readonly string[] | null): ViewPhoto | null {
  const list = (pages as { query?: { pages?: unknown[] } } | null)?.query?.pages ?? [];
  const ranked: { photo: ViewPhoto; score: number }[] = [];
  for (const page of list) {
    const item = page as {
      title?: string;
      imageinfo?: { thumburl?: string; descriptionurl?: string; mime?: string; width?: number; extmetadata?: Record<string, { value?: string }> }[];
    };
    const info = item.imageinfo?.[0];
    const meta = info?.extmetadata ?? {};
    const title = item.title ?? "";
    const license = licenseName(plain(meta.LicenseShortName?.value));
    const gps = readGps(meta.GPSLatitude?.value, meta.GPSLongitude?.value);
    if (!info?.thumburl || !info.descriptionurl || !license) continue;
    if (!/^image\/(jpeg|png|webp)$/.test(info.mime ?? "")) continue;
    if ((info.width ?? 0) < 400 || titleRejects(title, otherNames ?? [])) continue;
    if (phrase && !title.toLowerCase().includes(phrase.toLowerCase())) continue;
    const distance = gps ? metersBetween(gps, target) : null;
    if (distance !== null && distance > COMMONS_FAR_METERS) continue;
    ranked.push({
      score: distance !== null && distance <= COMMONS_NEAR_METERS ? 2 : 1,
      photo: {
        id: highlight.id,
        role: "reference",
        imageUrl: info.thumburl,
        pageUrl: info.descriptionurl,
        author: plain(meta.Artist?.value) || "Wikimedia Commons",
        license,
        source: "Wikimedia Commons",
        captured: gps,
      },
    });
  }
  ranked.sort((a, b) => b.score - a.score);
  return ranked[0]?.photo ?? null;
}

async function commonsNearFootprint(highlight: ImageryHighlight, identity: Identity): Promise<ViewPhoto | null> {
  const hits = await cached(`geosearch:${identity.centroid.lat.toFixed(4)}:${identity.centroid.lon.toFixed(4)}`, async () => {
    const url = `https://commons.wikimedia.org/w/api.php?action=query&format=json&formatversion=2&list=geosearch&gsnamespace=6&gsprimary=all&gslimit=8&gsradius=40&gscoord=${identity.centroid.lat}|${identity.centroid.lon}`;
    try {
      return await getJson(url);
    } catch {
      return null;
    }
  }) as { query?: { geosearch?: { title?: string; dist?: number }[] } } | null;
  const titles = (hits?.query?.geosearch ?? []).filter((hit) => (hit.dist ?? 999) <= 25 && hit.title && !titleRejects(hit.title, identity.otherNames)).map((hit) => hit.title).slice(0, 4);
  if (titles.length === 0) return null;
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    prop: "imageinfo",
    iiprop: "url|mime|size|extmetadata",
    iiurlwidth: "960",
    titles: titles.join("|"),
  });
  try {
    const pages = await getJson(`https://commons.wikimedia.org/w/api.php?${params}`);
    return bestCommons(pages, null, highlight, identity.centroid, identity.otherNames);
  } catch {
    return null;
  }
}

async function openverseReference(phrase: string, highlight: ImageryHighlight): Promise<ViewPhoto | null> {
  const body = await cached(`openverse:${phrase.toLowerCase()}`, async () => {
    try {
      return await getJson(`https://api.openverse.org/v1/images/?q=${encodeURIComponent(phrase)}&page_size=5`);
    } catch {
      return null;
    }
  }) as { results?: { title?: string; url?: string; thumbnail?: string; foreign_landing_url?: string; license?: string; creator?: string }[] } | null;
  for (const item of body?.results ?? []) {
    const code = (item.license ?? "").toLowerCase();
    const license = licenseName(code === "pdm" || code === "cc0" || code === "publicdomain" ? "Public domain" : code === "by" || code === "cc-by" ? "CC BY" : code === "by-sa" || code === "cc-by-sa" ? "CC BY-SA" : "");
    const title = item.title ?? "";
    if (!license || !item.thumbnail || !item.foreign_landing_url) continue;
    if (!title.toLowerCase().includes(phrase.toLowerCase()) || REJECT_TITLE.test(title)) continue;
    return {
      id: highlight.id,
      role: "reference",
      imageUrl: item.thumbnail,
      pageUrl: item.foreign_landing_url,
      author: plain(item.creator) || "Openverse",
      license,
      source: "Openverse",
      captured: null,
    };
  }
  return null;
}

async function directedWaterfront(observer: LatLon, target: LatLon, highlight: ImageryHighlight): Promise<ViewPhoto | null> {
  const nearby = await streetPhotos(observer, 120);
  const street = nearby
    .filter((photo) => metersBetween(photo, observer) <= 80 && aimed(photo, observer, target))
    .sort((a, b) => metersBetween(a, observer) - metersBetween(b, observer))[0];
  return street ? fromStreet(highlight, street, "viewpoint") : null;
}

async function referenceFor(highlight: ImageryHighlight, target: LatLon): Promise<ViewPhoto | null> {
  const key = highlight.targetId ? `settled:${highlight.targetId}` : "";
  if (key) {
    const saved = memory.get(key);
    if (saved && saved.expires > Date.now()) return saved.value as ViewPhoto | null;
  }
  const identity = highlight.title === "Unnamed building" || !searchPhrase(highlight.title) ? await identifyFootprint(highlight) : null;
  let photo: ViewPhoto | null = null;
  for (const phrase of phrasesFor(highlight, identity)) {
    photo = await commonsByPhrase(phrase, highlight, identity?.centroid ?? target);
    if (photo) break;
  }
  if (!photo && identity && !identity.name && !identity.address) photo = await commonsNearFootprint(highlight, identity);
  if (!photo) {
    for (const phrase of phrasesFor(highlight, identity)) {
      photo = await openverseReference(phrase, highlight);
      if (photo) break;
    }
  }
  if (key) memory.set(key, { expires: Date.now() + 60 * 60 * 1000, value: photo });
  return photo;
}

/** Keyless photographs for the current highlights. A miss is omitted and stays “No photograph”. */
export async function matchHighlightPhotos(origin: { x: number; z: number }, highlights: readonly ImageryHighlight[], geoOrigin: GeoOrigin): Promise<ViewPhoto[]> {
  const observer = localToGeo(origin.x, origin.z, geoOrigin);
  const chosen = highlights.slice(0, 5);
  const nearby = await streetPhotos(observer, VIEWPOINT_METERS);
  const photos = await Promise.all(chosen.map(async (highlight) => {
    const target = localToGeo(highlight.x, highlight.z, geoOrigin);
    const review = photoReview(highlight.targetId, highlight.kind);
    if (review?.display && review.imageUrl && review.pageUrl && review.author && review.license && review.source && (review.role === "reference" || review.role === "viewpoint" || review.role === "historical")) {
      return {
        id: highlight.id,
        role: review.role,
        imageUrl: review.imageUrl,
        pageUrl: review.pageUrl,
        title: review.title,
        author: review.author,
        license: review.license,
        source: review.source,
        captured: review.captured ?? null,
      };
    }
    if (review && !review.display) return null;
    const viewpoint = nearby
      .filter((photo) => metersBetween(photo, observer) <= VIEWPOINT_METERS && aimed(photo, observer, target))
      .sort((a, b) => angleBetween(a.azimuth, heading(a, target)) - angleBetween(b.azimuth, heading(b, target)))[0];
    if (viewpoint) return fromStreet(highlight, viewpoint, "viewpoint");
    if (highlight.kind !== "obstacle") return directedWaterfront(observer, target, highlight);
    const street = (await streetPhotos(target, REFERENCE_METERS))
      .filter((photo) => metersBetween(photo, target) <= REFERENCE_METERS && aimed(photo, observer, target))
      .sort((a, b) => metersBetween(a, target) - metersBetween(b, target))[0];
    if (street) return fromStreet(highlight, street, "reference");
    return referenceFor(highlight, target);
  }));
  return photos.filter((photo): photo is ViewPhoto => photo !== null);
}
