import record from "@/data/skill5/miami-tmy3-wind.json";

export const WIND_SOURCE = record.source;

/** Hours slower than this are calm. They stay in the speed average and leave the direction count. */
export const CALM_METERS_PER_SECOND = 0.5;

export const METERS_PER_SECOND_TO_MPH = 2.2369362920544;

export const SECTOR_COUNT = 16;

export const SECTOR_NAMES = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"] as const;

export const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] as const;

export const WIND_SEASONS = [
  { id: "winter", label: "Winter", months: [12, 1, 2] },
  { id: "spring", label: "Spring", months: [3, 4, 5] },
  { id: "summer", label: "Summer", months: [6, 7, 8] },
  { id: "autumn", label: "Autumn", months: [9, 10, 11] },
  { id: "year", label: "Full year", months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
] as const;

export const WIND_CONDITIONS = [
  { id: "all", label: "All hours" },
  { id: "day", label: "Daytime" },
  { id: "strong", label: "Median and above" },
] as const;

export type WindSeasonId = (typeof WIND_SEASONS)[number]["id"];
export type WindCondition = (typeof WIND_CONDITIONS)[number]["id"];

type WindHour = {
  month: number;
  hour: number;
  direction: number;
  speed: number;
};

const hours: WindHour[] = record.hours.map(([month, hour, direction, tenths]) => ({
  month,
  hour,
  direction,
  speed: tenths / 10,
}));

export function windHours() {
  return hours;
}

export function windSeason(id: string) {
  return WIND_SEASONS.find((season) => season.id === id) ?? WIND_SEASONS[4];
}

export function sectorIndex(direction: number) {
  const wrapped = ((direction % 360) + 360) % 360;
  return Math.floor(((wrapped + 11.25) % 360) / 22.5);
}

export function sectorCenter(index: number) {
  return index * 22.5;
}

/** Where the air moves, in stored site axes. East is +X and north is +Z. */
export function travelVector(fromDegrees: number) {
  const radians = (fromDegrees * Math.PI) / 180;
  return { east: -Math.sin(radians), north: -Math.cos(radians) };
}

export function metersPerSecondToMph(speed: number) {
  return speed * METERS_PER_SECOND_TO_MPH;
}

/** Miles per hour for the one-decimal m/s value that the panel shows. */
export function displayedMph(metersPerSecond: number) {
  return metersPerSecondToMph(Number(metersPerSecond.toFixed(1)));
}

export const WIND_HISTORY_NOTE = "Composite historical year, about 1973–2005, from Miami International Airport. Not measured at One Herald Plaza, and not a live forecast.";

export const WIND_CALM_NOTE = "Average speed includes calm hours. The percentage leaves them out.";

export const WIND_DIRECTION_NOTE = "Most frequent is the fullest wedge. Vector mean is speed-weighted.";

export function stationDistanceKm(latitude: number, longitude: number) {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const lat1 = toRadians(latitude);
  const lat2 = toRadians(WIND_SOURCE.lat);
  const dLat = lat2 - lat1;
  const dLon = toRadians(WIND_SOURCE.lon - longitude);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6371.0088 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export type WindSector = {
  index: number;
  name: (typeof SECTOR_NAMES)[number];
  center: number;
  hours: number;
  meanSpeed: number;
  meanFrom: number;
};

export type WindSummary = {
  season: WindSeasonId;
  month: number;
  condition: WindCondition;
  hours: number;
  calmHours: number;
  meanSpeed: number;
  medianSpeed: number;
  prevailing: WindSector | null;
  sectors: WindSector[];
  vectorFrom: number | null;
};

function circularMean(directions: readonly number[]) {
  if (directions.length === 0) return 0;
  let north = 0;
  let east = 0;
  for (const direction of directions) {
    const radians = (direction * Math.PI) / 180;
    east += Math.sin(radians);
    north += Math.cos(radians);
  }
  return (Math.atan2(east, north) * 180 / Math.PI + 360) % 360;
}

function median(values: readonly number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function includesMonth(months: readonly number[], month: number) {
  return months.includes(month);
}

function inPeriod(hour: WindHour, seasonId: string, month: number) {
  const season = windSeason(seasonId);
  if (!includesMonth(season.months, hour.month)) return false;
  return month === 0 || !includesMonth(season.months, month) || hour.month === month;
}

/** EPW hour 8 is 7:01–8:00 and hour 19 is 6:01–7:00 PM, local standard time. */
export function isDaytimeHour(hour: number) {
  return hour >= 8 && hour <= 19;
}

export function windSummary(seasonId: string, month: number, condition: WindCondition): WindSummary {
  const season = windSeason(seasonId);
  const period = hours.filter((hour) => inPeriod(hour, season.id, month));
  const medianSpeed = median(period.map((hour) => hour.speed));
  const chosen = period.filter((hour) => {
    if (condition === "day") return isDaytimeHour(hour.hour);
    if (condition === "strong") return hour.speed >= medianSpeed;
    return true;
  });
  const moving = chosen.filter((hour) => hour.speed >= CALM_METERS_PER_SECOND);
  const buckets = Array.from({ length: SECTOR_COUNT }, () => [] as WindHour[]);
  for (const hour of moving) buckets[sectorIndex(hour.direction)].push(hour);
  const sectors: WindSector[] = buckets.map((rows, index) => ({
    index,
    name: SECTOR_NAMES[index],
    center: sectorCenter(index),
    hours: rows.length,
    meanSpeed: rows.length === 0 ? 0 : rows.reduce((sum, hour) => sum + hour.speed, 0) / rows.length,
    meanFrom: circularMean(rows.map((hour) => hour.direction)),
  }));
  const prevailing = sectors
    .filter((sector) => sector.hours > 0)
    .sort((a, b) => b.hours - a.hours || b.meanSpeed - a.meanSpeed || a.index - b.index)[0] ?? null;
  let velocityEast = 0;
  let velocityNorth = 0;
  for (const hour of moving) {
    const travel = travelVector(hour.direction);
    velocityEast += travel.east * hour.speed;
    velocityNorth += travel.north * hour.speed;
  }
  const vectorFrom = moving.length === 0 ? null : (Math.atan2(-velocityEast, -velocityNorth) * 180 / Math.PI + 360) % 360;
  const meanSpeed = chosen.length === 0 ? 0 : chosen.reduce((sum, hour) => sum + hour.speed, 0) / chosen.length;
  return {
    season: season.id,
    month: month !== 0 && includesMonth(season.months, month) ? month : 0,
    condition,
    hours: chosen.length,
    calmHours: chosen.length - moving.length,
    meanSpeed,
    medianSpeed,
    prevailing,
    sectors,
    vectorFrom,
  };
}

export function seasonalComparison(condition: WindCondition) {
  return WIND_SEASONS.filter((season) => season.id !== "year").map((season) => ({
    id: season.id,
    label: season.label,
    summary: windSummary(season.id, 0, condition),
  }));
}

export function periodLabel(seasonId: string, month: number) {
  const season = windSeason(seasonId);
  if (month !== 0 && includesMonth(season.months, month)) return MONTH_NAMES[month - 1];
  return season.label;
}

export function conditionLabel(condition: WindCondition) {
  return WIND_CONDITIONS.find((item) => item.id === condition)?.label ?? "All hours";
}

export type WindRunRecord = {
  id: string;
  season: WindSeasonId;
  month: number;
  condition: WindCondition;
  hours: number;
  calmHours: number;
  prevailingFrom: number | null;
  prevailingName: string | null;
  prevailingShare: number | null;
  meanSpeed: number;
};

/** The saved direction is the selected rose wedge. With no wedge selected, it is the most frequent wedge. */
export function windRunRecord(index: number, summary: WindSummary, sectorIndex: number | null = null): WindRunRecord {
  const moving = summary.hours - summary.calmHours;
  const selected = sectorIndex === null ? null : summary.sectors[sectorIndex] ?? null;
  const direction = selected && selected.hours > 0 ? selected : summary.prevailing;
  return {
    id: `${summary.season}-${summary.month}-${summary.condition}-${index}`,
    season: summary.season,
    month: summary.month,
    condition: summary.condition,
    hours: summary.hours,
    calmHours: summary.calmHours,
    prevailingFrom: direction?.meanFrom ?? null,
    prevailingName: direction?.name ?? null,
    prevailingShare: direction && moving > 0 ? direction.hours / moving : null,
    meanSpeed: summary.meanSpeed,
  };
}
