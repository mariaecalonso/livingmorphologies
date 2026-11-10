/** Solar position for the stored site axes: +X east, +Y up, +Z north. */

export const MIAMI_TIME_ZONE = "America/New_York";

export const SUNLIT_LAND = "#787878";
export const SUNLIT_SITE = "#848484";
export const SHADOW_TONE = "#080808";

export type SunSample = {
  altitude: number;
  azimuth: number;
  above: boolean;
  /** Unit vector toward the sun. */
  toSun: [number, number, number];
  /** Ground-shadow length divided by object height. Null below the horizon. */
  shadowPerFoot: number | null;
};

const DEG = Math.PI / 180;

function wrap360(degrees: number) {
  return ((degrees % 360) + 360) % 360;
}

function zonedOffsetMs(timeZone: string, instant: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const hour = value("hour") % 24;
  const asUtc = Date.UTC(value("year"), value("month") - 1, value("day"), hour, value("minute"), value("second"));
  return asUtc - instant.getTime();
}

/** Wall-clock time in a time zone, as an absolute instant. */
export function zonedInstant(date: string, time: string, timeZone: string) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const wall = Date.UTC(year, month - 1, day, hour, minute, 0);
  let utc = wall;
  for (let pass = 0; pass < 3; pass += 1) {
    utc = wall - zonedOffsetMs(timeZone, new Date(utc));
  }
  return new Date(utc);
}

function julianDay(instant: Date) {
  let year = instant.getUTCFullYear();
  let month = instant.getUTCMonth() + 1;
  const day = instant.getUTCDate() + (instant.getUTCHours() + instant.getUTCMinutes() / 60 + instant.getUTCSeconds() / 3600) / 24;
  if (month <= 2) {
    year -= 1;
    month += 12;
  }
  const century = Math.floor(year / 100);
  const gregorian = 2 - century + Math.floor(century / 4);
  return Math.floor(365.25 * (year + 4716)) + Math.floor(30.6001 * (month + 1)) + day + gregorian - 1524.5;
}

/**
 * Geometric solar position from the NOAA Global Monitoring Laboratory spreadsheet equations,
 * which follow Jean Meeus, Astronomical Algorithms.
 * https://gml.noaa.gov/grad/solcalc/calcdetails.html
 * Azimuth is degrees clockwise from north. Atmospheric refraction is not applied.
 * This is not a JPL Horizons ephemeris. The separate airless Horizons check is recorded in
 * data/skill5/solar-provenance.json.
 */
export function solarPosition(latitude: number, longitude: number, instant: Date): SunSample {
  const century = (julianDay(instant) - 2451545) / 36525;
  const meanLongitude = wrap360(280.46646 + century * (36000.76983 + century * 0.0003032));
  const anomalyDeg = 357.52911 + century * (35999.05029 - 0.0001537 * century);
  const anomaly = anomalyDeg * DEG;
  const eccentricity = 0.016708634 - century * (0.000042037 + 0.0000001267 * century);
  const center = Math.sin(anomaly) * (1.914602 - century * (0.004817 + 0.000014 * century))
    + Math.sin(2 * anomaly) * (0.019993 - 0.000101 * century)
    + Math.sin(3 * anomaly) * 0.000289;
  const omega = (125.04 - 1934.136 * century) * DEG;
  const apparent = (meanLongitude + center - 0.00569 - 0.00478 * Math.sin(omega)) * DEG;
  const obliquitySeconds = 21.448 - century * (46.815 + century * (0.00059 - century * 0.001813));
  const meanObliquity = (23 + (26 + obliquitySeconds / 60) / 60) * DEG;
  const obliquity = meanObliquity + 0.00256 * DEG * Math.cos(omega);
  const declination = Math.asin(Math.sin(obliquity) * Math.sin(apparent));
  const tanHalf = Math.tan(obliquity / 2);
  const y = tanHalf * tanHalf;
  const meanLong = meanLongitude * DEG;
  const equationOfTime = 4 * (180 / Math.PI) * (
    y * Math.sin(2 * meanLong)
    - 2 * eccentricity * Math.sin(anomaly)
    + 4 * eccentricity * y * Math.sin(anomaly) * Math.cos(2 * meanLong)
    - 0.5 * y * y * Math.sin(4 * meanLong)
    - 1.25 * eccentricity * eccentricity * Math.sin(2 * anomaly)
  );
  const utcMinutes = instant.getUTCHours() * 60 + instant.getUTCMinutes() + instant.getUTCSeconds() / 60;
  const solarMinutes = ((utcMinutes + equationOfTime + 4 * longitude) % 1440 + 1440) % 1440;
  const hourAngle = (solarMinutes / 4 - 180) * DEG;
  const lat = latitude * DEG;
  const elevation = Math.asin(
    Math.sin(lat) * Math.sin(declination) + Math.cos(lat) * Math.cos(declination) * Math.cos(hourAngle),
  );
  const azimuth = Math.atan2(
    Math.sin(hourAngle),
    Math.cos(hourAngle) * Math.sin(lat) - Math.tan(declination) * Math.cos(lat),
  ) + Math.PI;
  const east = Math.sin(azimuth) * Math.cos(elevation);
  const north = Math.cos(azimuth) * Math.cos(elevation);
  const up = Math.sin(elevation);
  const length = Math.hypot(east, up, north) || 1;
  const above = elevation > 0;
  return {
    altitude: elevation * (180 / Math.PI),
    azimuth: wrap360(azimuth * (180 / Math.PI)),
    above,
    toSun: [east / length, up / length, north / length],
    shadowPerFoot: above ? 1 / Math.tan(elevation) : null,
  };
}

export function solarAt(latitude: number, longitude: number, date: string, time: string, timeZone = MIAMI_TIME_ZONE) {
  return solarPosition(latitude, longitude, zonedInstant(date, time, timeZone));
}

export type SolarNoonSample = {
  month: number;
  date: string;
  time: string;
  zone: string;
  offsetMinutes: number;
  altitude: number;
  azimuth: number;
  shadowPerFoot: number | null;
  above: boolean;
};

function clockTime(minutes: number) {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function highestAltitude(
  latitude: number,
  longitude: number,
  date: string,
  fromMinute: number,
  toMinute: number,
  step: number,
  timeZone: string,
) {
  let best: { minute: number; sample: SunSample } | null = null;
  for (let minute = fromMinute; minute <= toMinute; minute += step) {
    const sample = solarPosition(latitude, longitude, zonedInstant(date, clockTime(minute), timeZone));
    if (!best || sample.altitude > best.sample.altitude) best = { minute, sample };
  }
  return best;
}

/**
 * Solar position at the highest altitude on the 21st of each month.
 * The sample is the validated geometric position. It is not hours of sun,
 * seasonal exposure, or a shaded area of the parcel.
 */
export function monthlySolarNoon(latitude: number, longitude: number, year: number, timeZone = MIAMI_TIME_ZONE): SolarNoonSample[] {
  if (!Number.isInteger(year) || year < 1) return [];
  const rows: SolarNoonSample[] = [];
  for (let month = 1; month <= 12; month += 1) {
    const date = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-21`;
    const coarse = highestAltitude(latitude, longitude, date, 11 * 60, 14 * 60 + 30, 10, timeZone);
    if (!coarse) continue;
    const fine = highestAltitude(
      latitude,
      longitude,
      date,
      Math.max(0, coarse.minute - 10),
      Math.min(23 * 60 + 59, coarse.minute + 10),
      1,
      timeZone,
    ) ?? coarse;
    const time = clockTime(fine.minute);
    const clock = resolveZonedClock(date, time, timeZone);
    const occurrence = clock.status === "unique" ? clock.occurrence : clock.status === "ambiguous" ? clock.occurrences[0] : null;
    if (!occurrence) continue;
    const sample = solarPosition(latitude, longitude, occurrence.instant);
    rows.push({
      month,
      date,
      time,
      zone: occurrence.name,
      offsetMinutes: occurrence.offsetMinutes,
      altitude: sample.altitude,
      azimuth: sample.azimuth,
      shadowPerFoot: sample.shadowPerFoot,
      above: sample.above,
    });
  }
  return rows;
}

export type ZonedOccurrence = {
  instant: Date;
  /** Minutes added to UTC to get local time. Eastern Standard Time is −300. */
  offsetMinutes: number;
  name: string;
};

export type ZonedClock =
  | { status: "unique"; occurrence: ZonedOccurrence }
  | { status: "ambiguous"; occurrences: ZonedOccurrence[] }
  | { status: "missing" };

function wallParts(timeZone: string, instant: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(instant);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
  };
}

function zoneName(timeZone: string, instant: Date) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "long" }).formatToParts(instant);
  return parts.find((part) => part.type === "timeZoneName")?.value ?? timeZone;
}

/**
 * Every real instant whose wall clock matches the typed date and time.
 * A spring-forward gap returns none. A fall-back hour returns both occurrences, earlier first.
 */
export function resolveZonedClock(date: string, time: string, timeZone = MIAMI_TIME_ZONE): ZonedClock {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  if (![year, month, day, hour, minute].every(Number.isFinite)) return { status: "missing" };
  const wall = Date.UTC(year, month - 1, day, hour, minute, 0);
  const wanted = {
    year: String(year).padStart(4, "0"),
    month: String(month).padStart(2, "0"),
    day: String(day).padStart(2, "0"),
    hour: String(hour).padStart(2, "0"),
    minute: String(minute).padStart(2, "0"),
  };
  const found: ZonedOccurrence[] = [];
  const seen = new Set<number>();
  for (let offsetMinutes = -14 * 60; offsetMinutes <= 14 * 60; offsetMinutes += 15) {
    const utc = wall - offsetMinutes * 60_000;
    if (seen.has(utc)) continue;
    const instant = new Date(utc);
    const offset = zonedOffsetMs(timeZone, instant);
    if (Math.abs(offset - offsetMinutes * 60_000) > 500) continue;
    const parts = wallParts(timeZone, instant);
    if (parts.year !== wanted.year || parts.month !== wanted.month || parts.day !== wanted.day || parts.hour !== wanted.hour || parts.minute !== wanted.minute) continue;
    seen.add(utc);
    found.push({ instant, offsetMinutes, name: zoneName(timeZone, instant) });
  }
  found.sort((a, b) => a.instant.getTime() - b.instant.getTime());
  if (found.length === 0) return { status: "missing" };
  if (found.length === 1) return { status: "unique", occurrence: found[0] };
  return { status: "ambiguous", occurrences: found };
}

/** Why a typed Miami time has no instant. Used for the spring-forward gap. */
export function missingClockNote(date: string, timeZone = MIAMI_TIME_ZONE) {
  const early = resolveZonedClock(date, "01:30", timeZone);
  const late = resolveZonedClock(date, "03:30", timeZone);
  if (early.status === "unique" && late.status === "unique" && early.occurrence.offsetMinutes !== late.occurrence.offsetMinutes) {
    return `This clock time does not occur. At 2:00 AM the clock advances from ${early.occurrence.name} to 3:00 AM ${late.occurrence.name}.`;
  }
  return "This clock time does not occur in Miami.";
}
