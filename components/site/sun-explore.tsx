"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ExploreSegment, ExploreSlider } from "./explore-controls";
import { missingClockNote, resolveZonedClock, solarAt, type SunSample, type ZonedClock } from "@/lib/skill5/solar";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function clockTime(minutes: number) {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${pad(hour)}:${pad(minute)}`;
}

function minutesOf(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

function formatClock(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  const suffix = hour >= 12 ? "PM" : "AM";
  return `${hour % 12 || 12}:${pad(minute)} ${suffix}`;
}

function formatDay(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return `${MONTHS[month - 1].slice(0, 3)} ${day}, ${year}`;
}

function composeTime(hour12: number, minute: number, suffix: "AM" | "PM") {
  const hour = (hour12 % 12) + (suffix === "PM" ? 12 : 0);
  return clockTime(hour * 60 + Math.max(0, Math.min(59, minute)));
}

function daySamples(latitude: number, longitude: number, date: string) {
  const gap = resolveZonedClock(date, "02:30").status === "missing";
  const samples: { minute: number; altitude: number }[] = [];
  for (let minute = 0; minute < 1440; minute += 10) {
    if (gap && minute >= 120 && minute < 180) continue;
    samples.push({ minute, altitude: solarAt(latitude, longitude, date, clockTime(minute)).altitude });
  }
  if (samples.length === 0) return { samples, noon: 12 * 60, morning: null, afternoon: null };
  let noon = samples.reduce((best, item) => (item.altitude > best.altitude ? item : best), samples[0]);
  for (let minute = Math.max(0, noon.minute - 10); minute <= Math.min(1439, noon.minute + 10); minute += 1) {
    if (gap && minute >= 120 && minute < 180) continue;
    const altitude = solarAt(latitude, longitude, date, clockTime(minute)).altitude;
    if (altitude > noon.altitude) noon = { minute, altitude };
  }
  let rise: number | null = null;
  let set: number | null = null;
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1];
    const next = samples[index];
    if (rise === null && previous.altitude <= 0 && next.altitude > 0) rise = next.minute;
    if (previous.altitude > 0 && next.altitude <= 0) set = previous.minute;
  }
  return {
    samples,
    noon: noon.minute,
    morning: rise === null ? null : Math.round((rise + noon.minute) / 2),
    afternoon: set === null ? null : Math.round((noon.minute + set) / 2),
  };
}

function SunPath({
  samples,
  minutes,
  altitude,
}: {
  samples: readonly { minute: number; altitude: number }[];
  minutes: number;
  altitude: number | null;
}) {
  const altitudes = samples.map((sample) => sample.altitude);
  const maxAlt = Math.max(8, ...altitudes);
  const minAlt = Math.min(-8, ...altitudes);
  const x = (minute: number) => 14 + (minute / 1440) * 252;
  const y = (value: number) => 12 + (1 - (value - minAlt) / (maxAlt - minAlt)) * 86;
  const horizon = y(0);
  const runs: { above: boolean; points: string }[] = [];
  samples.forEach((sample, index) => {
    const above = sample.altitude >= 0;
    const point = `${x(sample.minute).toFixed(1)},${y(sample.altitude).toFixed(1)}`;
    const previous = runs[runs.length - 1];
    if (!previous || previous.above !== above || (index > 0 && sample.minute - samples[index - 1].minute > 15)) {
      const bridge = index > 0 ? `${x(samples[index - 1].minute).toFixed(1)},${y(samples[index - 1].altitude).toFixed(1)} ${point}` : point;
      runs.push({ above, points: bridge });
    } else previous.points += ` ${point}`;
  });
  const marker = altitude === null ? null : { cx: x(minutes), cy: y(altitude) };
  return (
    <svg className="site-explore-path" viewBox="0 0 280 112" role="img" aria-label="Solar altitude across the selected day">
      <line x1="14" x2="266" y1={horizon} y2={horizon} />
      {runs.map((run, index) => (
        <polyline key={index} points={run.points} data-above={run.above ? "yes" : "no"} />
      ))}
      {marker ? (
        <>
          <line x1={marker.cx} x2={marker.cx} y1={marker.cy} y2={horizon} />
          <circle cx={marker.cx} cy={marker.cy} r="4.2" data-above={altitude !== null && altitude >= 0 ? "yes" : "no"} />
        </>
      ) : null}
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 5.5v13l11-6.5z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 5.5h3.2v13H7zM13.8 5.5H17v13h-3.2z" />
    </svg>
  );
}

export function SunExplore({
  latitude,
  longitude,
  date,
  time,
  sun,
  clock,
  occurrenceIndex,
  onDate,
  onTime,
  onOccurrence,
}: {
  latitude: number;
  longitude: number;
  date: string;
  time: string;
  sun: SunSample | null;
  clock: ZonedClock | null;
  occurrenceIndex: number;
  onDate: (value: string) => void;
  onTime: (value: string) => void;
  onOccurrence: (index: number) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const issued = useRef<string | null>(null);
  const timeRef = useRef(time);
  const dateRef = useRef(date);
  const onTimeRef = useRef(onTime);
  timeRef.current = time;
  dateRef.current = date;
  onTimeRef.current = onTime;
  const [playing, setPlaying] = useState(false);
  const [open, setOpen] = useState<"date" | "time" | null>(null);
  const [cursor, setCursor] = useState(date.slice(0, 7));
  const [minuteDraft, setMinuteDraft] = useState<string | null>(null);
  const day = useMemo(() => daySamples(latitude, longitude, date), [latitude, longitude, date]);
  const minutes = minutesOf(time);
  const [hourText, minuteText] = time.split(":");
  const hour24 = Number(hourText);
  const minute = Number(minuteText);
  const suffix: "AM" | "PM" = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 || 12;

  useEffect(() => {
    if (issued.current === `${date}|${time}`) return;
    setPlaying(false);
  }, [time, date]);

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      let next = (minutesOf(timeRef.current) + 5) % 1440;
      if (next >= 120 && next < 180 && resolveZonedClock(dateRef.current, clockTime(next)).status === "missing") next = (next + 60) % 1440;
      const value = clockTime(next);
      issued.current = `${dateRef.current}|${value}`;
      onTimeRef.current(value);
    }, 80);
    return () => window.clearInterval(id);
  }, [playing]);

  useEffect(() => {
    setCursor(date.slice(0, 7));
  }, [date]);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(null);
    };
    document.addEventListener("pointerdown", close);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useLayoutEffect(() => {
    const popover = root.current?.querySelector(".site-explore-popover");
    const panel = root.current?.closest(".site-explore");
    if (!(popover instanceof HTMLElement) || !(panel instanceof HTMLElement)) return;
    const box = popover.getBoundingClientRect();
    const bounds = panel.getBoundingClientRect();
    popover.dataset.flip = box.bottom > bounds.bottom - 8 ? "up" : "";
  }, [open, cursor]);

  const commitTime = (value: string) => {
    setPlaying(false);
    issued.current = `${date}|${value}`;
    onTime(value);
  };
  const jump = (value: number | null) => {
    if (value === null) return;
    commitTime(clockTime(value));
  };
  const [cursorYear, cursorMonth] = cursor.split("-").map(Number);
  const firstWeekday = new Date(cursorYear, cursorMonth - 1, 1).getDay();
  const dayCount = new Date(cursorYear, cursorMonth, 0).getDate();
  const selectedDay = date.startsWith(cursor) ? Number(date.slice(8)) : null;
  const near = (target: number | null) => target !== null && Math.abs(minutes - target) <= 5;

  return (
    <div className="site-explore-sun" ref={root}>
      <div className="site-explore-fields">
        <div className="site-explore-picker">
          <span>Date</span>
          <button type="button" aria-expanded={open === "date"} aria-label="Date" onClick={() => setOpen(open === "date" ? null : "date")}>{formatDay(date)}</button>
          {open === "date" ? (
            <div className="site-explore-popover" role="dialog" aria-label="Choose a date">
              <div className="site-explore-calendar-nav">
                <button type="button" aria-label="Previous month" onClick={() => setCursor(shiftMonth(cursor, -1))}>‹</button>
                <strong>{MONTHS[cursorMonth - 1]} {cursorYear}</strong>
                <button type="button" aria-label="Next month" onClick={() => setCursor(shiftMonth(cursor, 1))}>›</button>
              </div>
              <div className="site-explore-calendar">
                {WEEKDAYS.map((dayName, index) => <span key={`${dayName}-${index}`}>{dayName}</span>)}
                {Array.from({ length: firstWeekday }, (_, index) => <span key={`empty-${index}`} />)}
                {Array.from({ length: dayCount }, (_, index) => {
                  const dayNumber = index + 1;
                  const value = `${cursorYear}-${pad(cursorMonth)}-${pad(dayNumber)}`;
                  return (
                    <button key={value} type="button" data-active={dayNumber === selectedDay || undefined} aria-pressed={dayNumber === selectedDay} onClick={() => { onDate(value); setOpen(null); }}>
                      {dayNumber}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
        <div className="site-explore-picker">
          <span>Time</span>
          <button type="button" aria-expanded={open === "time"} aria-label="Time" onClick={() => setOpen(open === "time" ? null : "time")}>{formatClock(time)}</button>
          {open === "time" ? (
            <div className="site-explore-popover site-explore-time" role="dialog" aria-label="Choose a time">
              <div className="site-explore-hours">
                {Array.from({ length: 12 }, (_, index) => {
                  const hour = index + 1;
                  return (
                    <button key={hour} type="button" data-active={hour === hour12 || undefined} aria-pressed={hour === hour12} onClick={() => commitTime(composeTime(hour, minute, suffix))}>
                      {hour}
                    </button>
                  );
                })}
              </div>
              <label>
                <span>Minute</span>
                <input
                  inputMode="numeric"
                  aria-label="Minute"
                  value={minuteDraft ?? pad(minute)}
                  onChange={(event) => {
                    const raw = event.target.value.replace(/\D/g, "").slice(0, 2);
                    setMinuteDraft(raw);
                    if (raw === "") return;
                    const value = Number(raw);
                    if (value <= 59) commitTime(composeTime(hour12, value, suffix));
                  }}
                  onBlur={() => setMinuteDraft(null)}
                />
              </label>
              <div className="site-explore-meridiem">
                {(["AM", "PM"] as const).map((item) => (
                  <button key={item} type="button" data-active={suffix === item || undefined} aria-pressed={suffix === item} onClick={() => commitTime(composeTime(hour12, minute, item))}>{item}</button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
      <div className="site-explore-sun-tools">
        <ExploreSegment
          label="Sun scenarios"
          value={near(day.morning) ? "morning" : near(day.noon) ? "noon" : near(day.afternoon) ? "afternoon" : "none"}
          options={[
            { id: "morning", label: "Morning", title: day.morning === null ? "Morning" : `Morning ${formatClock(clockTime(day.morning))}` },
            { id: "noon", label: "Noon", title: `Solar noon ${formatClock(clockTime(day.noon))}` },
            { id: "afternoon", label: "Afternoon", title: day.afternoon === null ? "Afternoon" : `Afternoon ${formatClock(clockTime(day.afternoon))}` },
          ]}
          onChange={(id) => jump(id === "morning" ? day.morning : id === "noon" ? day.noon : day.afternoon)}
        />
        <button type="button" className="site-explore-play" aria-pressed={playing} aria-label={playing ? "Pause sun" : "Play sun across the day"} onClick={() => setPlaying((value) => !value)}>
          {playing ? <PauseIcon /> : <PlayIcon />}
        </button>
      </div>
      <SunPath samples={day.samples} minutes={minutes} altitude={sun?.altitude ?? null} />
      <ExploreSlider
        label=""
        valueLabel={formatClock(time)}
        min={0}
        max={1439}
        step={5}
        value={minutes}
        ariaLabel="Time of day"
        onChange={(value) => commitTime(clockTime(value))}
      />
      {clock?.status === "ambiguous" ? (
        <ExploreSegment
          label="Daylight saving occurrence"
          value={String(occurrenceIndex)}
          options={clock.occurrences.map((item, index) => ({
            id: String(index),
            label: compactZone(item.name, item.offsetMinutes),
            title: zoneClock(item.name, item.offsetMinutes),
          }))}
          onChange={(id) => onOccurrence(Number(id))}
        />
      ) : null}
      {clock?.status === "missing" ? <p className="site-note">{missingClockNote(date)}</p> : null}
    </div>
  );
}

function shiftMonth(cursor: string, delta: number) {
  const [year, month] = cursor.split("-").map(Number);
  const next = new Date(year, month - 1 + delta, 1);
  return `${next.getFullYear()}-${pad(next.getMonth() + 1)}`;
}

function compactZone(name: string, offsetMinutes: number) {
  const hours = Math.abs(offsetMinutes) / 60;
  const label = Number.isInteger(hours) ? String(hours) : hours.toFixed(2);
  const short = name === "Eastern Standard Time" ? "EST" : name === "Eastern Daylight Time" ? "EDT" : name;
  return `${short} ${offsetMinutes < 0 ? "−" : "+"}${label}`;
}

function zoneClock(name: string, offsetMinutes: number) {
  const hours = Math.abs(offsetMinutes) / 60;
  const label = Number.isInteger(hours) ? String(hours) : hours.toFixed(2);
  return `${name}, UTC${offsetMinutes < 0 ? "−" : "+"}${label}`;
}
