"use client";

import { useEffect, useRef, useState } from "react";
import { FILM_MEDIA, ORGANISM_INTRO_SECONDS } from "@/lib/cinematic-intro";

type Transport = "idle" | "playing" | "paused";

function clockLabel(time: number) {
  const whole = Math.max(0, Math.floor(time));
  const minutes = Math.floor(whole / 60);
  const seconds = whole % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function saveRecording(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  const host = window.top?.document.body ?? document.body;
  host.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

type SavePickerWindow = Window & {
  showSaveFilePicker?: (options: {
    suggestedName?: string;
    types?: Array<{ description?: string; accept: Record<string, string[]> }>;
  }) => Promise<FileSystemFileHandle>;
};

function requestSaveFile(name: string) {
  const options = {
    suggestedName: name,
    types: [{ description: "Video", accept: { "video/mp4": [".mp4"] } }],
  };
  const views: SavePickerWindow[] = [window];
  if (window.top && window.top !== window) views.push(window.top);
  for (const view of views) {
    const openPicker = view.showSaveFilePicker;
    if (typeof openPicker !== "function") continue;
    try {
      return openPicker.call(view, options);
    } catch {
      continue;
    }
  }
  return Promise.resolve(null);
}

async function originalFilm() {
  const response = await fetch(FILM_MEDIA.opening);
  if (!response.ok) throw new Error("The film could not be read.");
  return response.blob();
}

async function postClipboard(blob: Blob) {
  const response = await fetch("/lab/physarum-video/copy", {
    method: "POST",
    headers: { "content-type": "video/mp4" },
    body: blob,
  });
  if (!response.ok) throw new Error("The video could not be copied.");
}

export function CinematicStage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const scrubbing = useRef(false);
  const filmBlob = useRef<Blob | null>(null);
  const [transport, setTransport] = useState<Transport>("idle");
  const [muted, setMuted] = useState(false);
  const [level, setLevel] = useState(0.85);
  const [shown, setShown] = useState(0);
  const [duration, setDuration] = useState(ORGANISM_INTRO_SECONDS);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const transportRef = useRef(transport);
  transportRef.current = transport;

  const actions = useRef({ play: () => {}, pause: () => {} });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.repeat) return;
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLButtonElement) return;
      event.preventDefault();
      if (transportRef.current === "playing") actions.current.pause();
      else actions.current.play();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const play = async () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = muted;
    video.volume = level;
    if (video.currentTime >= (Number.isFinite(video.duration) ? video.duration : duration) - 0.05) video.currentTime = 0;
    await video.play().catch(() => undefined);
  };

  const pause = () => {
    videoRef.current?.pause();
  };

  const restart = async () => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = 0;
    setShown(0);
    if (transportRef.current === "playing") {
      video.muted = muted;
      video.volume = level;
      await video.play().catch(() => undefined);
    }
  };

  actions.current = { play: () => void play(), pause };

  const readFilm = async () => {
    if (filmBlob.current) return filmBlob.current;
    const blob = await originalFilm();
    filmBlob.current = blob;
    return blob;
  };

  const copyVideo = async () => {
    if (busy) return;
    setBusy(true);
    setCopied(false);
    setStatus("Copying the film.");
    try {
      await postClipboard(await readFilm());
      setCopied(true);
      setStatus("Video copied.");
    } catch {
      setStatus("The video could not be copied.");
    } finally {
      setBusy(false);
    }
  };

  const saveFilm = async () => {
    if (busy) return;
    setBusy(true);
    setStatus("Saving the film.");
    const name = "physarum-organism-intro.mp4";
    try {
      const blob = await readFilm();
      const handle = await requestSaveFile(name).catch(() => null);
      if (handle) {
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
      } else saveRecording(blob, name);
      setStatus("Film saved.");
    } catch {
      setStatus("The film could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  const length = Number.isFinite(duration) && duration > 0 ? duration : ORGANISM_INTRO_SECONDS;

  return (
    <div className="cine" data-transport={transport}>
      <video
        ref={videoRef}
        className="cine-picture"
        src={FILM_MEDIA.opening}
        playsInline
        preload="auto"
        aria-label="Living Morphologies introduction"
        onLoadedMetadata={(event) => {
          const video = event.currentTarget;
          if (Number.isFinite(video.duration) && video.duration > 0) setDuration(video.duration);
        }}
        onTimeUpdate={(event) => {
          if (!scrubbing.current) setShown(event.currentTarget.currentTime);
        }}
        onPlay={() => setTransport("playing")}
        onPause={() => setTransport("paused")}
        onEnded={(event) => {
          setTransport("paused");
          setShown(event.currentTarget.duration || length);
        }}
        onClick={() => {
          if (transport === "playing") pause();
          else void play();
        }}
      />
      <p className="cine-time">{clockLabel(shown)} / {clockLabel(Math.round(length))}</p>
      {status ? <p className="cine-status">{status}</p> : null}
      <div className="cine-transport">
        <button type="button" aria-label="Play" aria-pressed={transport === "playing"} onClick={() => void play()}>
          <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3.1 1.6v8.8l6.6-4.4z" /></svg>
        </button>
        <button type="button" aria-label="Pause" aria-pressed={transport === "paused"} onClick={pause}>
          <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.6 1.6h2.1v8.8H2.6zm4.7 0h2.1v8.8H7.3z" /></svg>
        </button>
        <button type="button" aria-label="Restart" onClick={() => void restart()}>
          <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M9.7 3.15A4.15 4.15 0 1 0 10.45 7" /><path d="M9.55 1.15v2.35H7.2" /></svg>
        </button>
        <button type="button" aria-label={copied ? "Video copied" : "Copy video"} aria-pressed={busy || copied} disabled={busy} onClick={() => void copyVideo()}>
          {copied ? (
            <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.15 6.2 4.7 8.75 9.85 3.2" /></svg>
          ) : (
            <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M4.4 1.5h6v6h-6z" /><path d="M1.6 4.3h6v6h-6z" /></svg>
          )}
        </button>
      </div>
      <div className="cine-tools">
        <button type="button" aria-label={muted ? "Unmute" : "Mute"} aria-pressed={muted} onClick={() => {
          const next = !muted;
          setMuted(next);
          const video = videoRef.current;
          if (video) video.muted = next;
        }}>
          <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 4.2h2.1L7.2 2v8L4.1 7.8H2z" />{muted ? <path d="M8.2 4.4 11 7.2M11 4.4 8.2 7.2" style={{ fill: "none", stroke: "currentColor", strokeWidth: 1.1 }} /> : null}</svg>
        </button>
        <input
          className="cine-volume"
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={level}
          aria-label="Volume"
          onChange={(event) => {
            const next = Number(event.target.value);
            setLevel(next);
            const video = videoRef.current;
            if (video) video.volume = next;
            if (next === 0 && !muted) {
              setMuted(true);
              if (video) video.muted = true;
            }
            if (next > 0 && muted) {
              setMuted(false);
              if (video) video.muted = false;
            }
          }}
        />
        <button type="button" aria-label="Export with sound" disabled={busy} onClick={() => void saveFilm()}>
          <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1.4v6.2M3.4 5.2 6 7.8l2.6-2.6M2 10.2h8" /></svg>
        </button>
      </div>
      <input
        className="cine-scrub"
        type="range"
        min={0}
        max={length}
        step={0.05}
        value={Math.min(length, shown)}
        aria-label="Film time"
        onPointerDown={() => {
          scrubbing.current = true;
        }}
        onPointerUp={() => {
          scrubbing.current = false;
        }}
        onChange={(event) => {
          const time = Number(event.target.value);
          setShown(time);
          const video = videoRef.current;
          if (video) video.currentTime = time;
        }}
      />
    </div>
  );
}
