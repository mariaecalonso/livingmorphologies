"use client";

import { useEffect, useRef, useState } from "react";
import { previewSeconds, type PreviewSource, type StudyFrames, paintStudy } from "./study-draw";
import { renderStudy, StudyScore } from "./study-score";

type Transport = "idle" | "playing" | "paused";

const YELLOW = "/lab/physarum-video/media?clip=network";
const WHITE = Array.from({ length: 6 }, (_, index) => `/assets/skill0/study-field/${String(index).padStart(2, "0")}.png`);
const EXPORT_WIDTH = 3702;
const EXPORT_HEIGHT = 1080;

function sourceOf(): PreviewSource {
  if (typeof window === "undefined") return "yellow";
  return new URLSearchParams(window.location.search).get("source") === "white" ? "white" : "yellow";
}

function filmSeconds() {
  return previewSeconds(sourceOf());
}

function even(value: number) {
  return Math.max(2, Math.floor(value / 2) * 2);
}

function clockLabel(time: number) {
  const whole = Math.min(filmSeconds(), Math.max(0, Math.floor(time)));
  return `0:${String(whole).padStart(2, "0")}`;
}

export function StudyStage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const score = useRef(new StudyScore());
  const clock = useRef(0);
  const scrubbing = useRef(false);
  const framesRef = useRef<StudyFrames | null>(null);
  const [transport, setTransport] = useState<Transport>("idle");
  const [muted, setMuted] = useState(false);
  const [level, setLevel] = useState(0.85);
  const [shown, setShown] = useState(0);
  const [status, setStatus] = useState("");
  const [copying, setCopying] = useState(false);
  const [copied, setCopied] = useState(false);
  const videoBlob = useRef<Blob | null>(null);
  const copyingRef = useRef(false);
  const transportRef = useRef(transport);
  transportRef.current = transport;

  const paint = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d", { alpha: false });
    if (!canvas || !context) return;
    const bounds = canvas.getBoundingClientRect();
    const width = even(Math.min(1920, Math.max(2, bounds.width)));
    const height = even(width * (bounds.height / Math.max(1, bounds.width)));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    paintStudy(context, canvas.width, canvas.height, clock.current, framesRef.current, sourceOf());
  };
  const paintRef = useRef(paint);
  paintRef.current = paint;

  useEffect(() => {
    let alive = true;
    const redraw = () => paintRef.current();
    score.current.seconds = filmSeconds();
    const source = sourceOf();
    const ready = source === "white"
      ? loadFrames(WHITE).then((field) => ({ bio: [] as HTMLCanvasElement[], field }))
      : decodeGif(YELLOW).then((bio) => ({ bio, field: [] as HTMLCanvasElement[] }));
    void ready.then((frames) => {
      if (!alive) return;
      framesRef.current = frames;
      videoBlob.current = null;
      redraw();
    });
    const observer = new ResizeObserver(redraw);
    if (canvasRef.current) observer.observe(canvasRef.current);
    redraw();
    return () => {
      alive = false;
      observer.disconnect();
      void score.current.stop();
    };
  }, []);

  useEffect(() => {
    if (transport !== "playing") return;
    let handle = 0;
    const tick = () => {
      if (!scrubbing.current) {
        const scored = score.current.filmTime();
        if (scored != null) clock.current = scored;
      }
      if (clock.current >= filmSeconds()) {
        clock.current = filmSeconds();
        setShown(filmSeconds());
        paintRef.current();
        void score.current.stop();
        setTransport("paused");
        return;
      }
      setShown((current) => (Math.abs(current - clock.current) > 0.08 ? clock.current : current));
      paintRef.current();
      handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(handle);
  }, [transport]);

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
    if (copyingRef.current) return;
    const start = clock.current >= filmSeconds() - 0.05 ? 0 : clock.current;
    clock.current = start;
    setTransport("playing");
    score.current.seconds = filmSeconds();
    await score.current.start(start);
  };

  const pause = async () => {
    const scored = score.current.filmTime();
    if (scored != null) clock.current = Math.min(filmSeconds(), scored);
    await score.current.stop();
    setTransport("paused");
    setShown(clock.current);
    paintRef.current();
  };

  const restart = async () => {
    clock.current = 0;
    setShown(0);
    if (transportRef.current === "playing") await score.current.start(0);
    else {
      await score.current.stop();
      paintRef.current();
    }
  };

  actions.current = { play: () => void play(), pause: () => void pause() };

  const copyVideo = async () => {
    if (copyingRef.current) return;
    const existing = videoBlob.current;
    if (existing) {
      setCopying(true);
      setCopied(false);
      try {
        await postClipboard(existing);
        setCopied(true);
        setStatus("Video copied.");
      } catch {
        setStatus("The video could not be copied.");
      } finally {
        setCopying(false);
      }
      return;
    }
    const canvas = canvasRef.current;
    const studyFrames = framesRef.current;
    const source = sourceOf();
    const readyFrames = Boolean(studyFrames) && (source === "white" ? studyFrames.field.length > 0 : studyFrames.bio.length > 0);
    if (!canvas || !studyFrames || !readyFrames || typeof VideoEncoder === "undefined") {
      setStatus("This browser cannot encode the video.");
      return;
    }
    copyingRef.current = true;
    await pause();
    setCopying(true);
    setCopied(false);
    setStatus("Copying the video.");
    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = EXPORT_WIDTH;
    exportCanvas.height = EXPORT_HEIGHT;
    const context = exportCanvas.getContext("2d", { alpha: false });
    if (!context) {
      copyingRef.current = false;
      setCopying(false);
      setStatus("The video could not be copied.");
      return;
    }
    try {
      const { Muxer, ArrayBufferTarget } = await import("mp4-muxer");
      const base = {
        width: exportCanvas.width,
        height: exportCanvas.height,
        bitrate: 24_000_000,
        framerate: 30,
        avc: { format: "avc" as const },
        hardwareAcceleration: "prefer-software" as const,
      };
      let codec = "";
      for (const candidate of ["avc1.640033", "avc1.640032", "avc1.640028"]) {
        const supported = await VideoEncoder.isConfigSupported({ ...base, codec: candidate });
        if (supported.supported) {
          codec = candidate;
          break;
        }
      }
      if (!codec) throw new Error("video");
      let audioReady = false;
      let audioBuffer: AudioBuffer | null = null;
      if (typeof AudioEncoder !== "undefined") {
        score.current.seconds = filmSeconds();
        audioBuffer = await renderStudy(0, filmSeconds());
        const supported = await AudioEncoder.isConfigSupported({
          codec: "mp4a.40.2",
          sampleRate: audioBuffer.sampleRate,
          numberOfChannels: audioBuffer.numberOfChannels,
          bitrate: 128000,
        });
        audioReady = Boolean(supported.supported);
      }
      const target = new ArrayBufferTarget();
      const muxer = new Muxer({
        target,
        fastStart: "in-memory",
        firstTimestampBehavior: "cross-track-offset",
        video: { codec: "avc", width: exportCanvas.width, height: exportCanvas.height, frameRate: 30 },
        audio: audioReady && audioBuffer ? { codec: "aac", numberOfChannels: audioBuffer.numberOfChannels, sampleRate: audioBuffer.sampleRate } : undefined,
      });
      const videoEncoder = new VideoEncoder({
        output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
        error: () => undefined,
      });
      videoEncoder.configure({ ...base, codec, latencyMode: "quality" });
      if (audioReady && audioBuffer) await encodeAudio(muxer, audioBuffer);
      const frameCount = Math.round(filmSeconds() * 30);
      for (let frame = 0; frame <= frameCount; frame += 1) {
        const time = Math.min(filmSeconds(), frame / 30);
        paintStudy(context, exportCanvas.width, exportCanvas.height, time, studyFrames, sourceOf());
        const videoFrame = new VideoFrame(exportCanvas, { timestamp: Math.round(time * 1_000_000) });
        videoEncoder.encode(videoFrame, { keyFrame: frame % 60 === 0 });
        videoFrame.close();
        if (frame % 10 === 0) setStatus(`Copying ${Math.min(filmSeconds(), Math.round(time))} / ${filmSeconds()}`);
        await new Promise((resolve) => window.setTimeout(resolve, videoEncoder.encodeQueueSize > 6 ? 12 : 0));
      }
      await videoEncoder.flush();
      videoEncoder.close();
      muxer.finalize();
      const blob = new Blob([target.buffer], { type: "video/mp4" });
      videoBlob.current = blob;
      await postClipboard(blob);
      setCopied(true);
      setStatus("Video copied.");
    } catch {
      setStatus("The video could not be copied.");
    } finally {
      copyingRef.current = false;
      setCopying(false);
    }
  };

  return (
    <div className="cine" data-transport={transport}>
      <canvas
        ref={canvasRef}
        className="cine-picture"
        aria-label="Physarum growth study"
        onClick={() => {
          if (transport === "playing") void pause();
          else void play();
        }}
      />
      <p className="cine-time">{clockLabel(shown)} / 0:15</p>
      {status ? <p className="cine-status">{status}</p> : null}
      <div className="cine-transport">
        <button type="button" aria-label="Play" aria-pressed={transport === "playing"} onClick={() => void play()}>
          <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3.1 1.6v8.8l6.6-4.4z" /></svg>
        </button>
        <button type="button" aria-label="Pause" aria-pressed={transport === "paused"} onClick={() => void pause()}>
          <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.6 1.6h2.1v8.8H2.6zm4.7 0h2.1v8.8H7.3z" /></svg>
        </button>
        <button type="button" aria-label="Restart" onClick={() => void restart()}>
          <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M9.7 3.15A4.15 4.15 0 1 0 10.45 7" /><path d="M9.55 1.15v2.35H7.2" /></svg>
        </button>
        <button type="button" aria-label={copied ? "Video copied" : "Copy video"} aria-pressed={copying || copied} disabled={copying} onClick={() => void copyVideo()}>
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
          score.current.setMuted(next);
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
            score.current.setLevel(next);
            if (next === 0 && !muted) {
              setMuted(true);
              score.current.setMuted(true);
            }
            if (next > 0 && muted) {
              setMuted(false);
              score.current.setMuted(false);
            }
          }}
        />
      </div>
      <input
        className="cine-scrub"
        type="range"
        min={0}
        max={filmSeconds()}
        step={0.05}
        value={Math.min(filmSeconds(), shown)}
        aria-label="Film time"
        onPointerDown={() => {
          scrubbing.current = true;
        }}
        onPointerUp={() => {
          scrubbing.current = false;
          if (transportRef.current === "playing") void score.current.start(clock.current);
        }}
        onChange={(event) => {
          clock.current = Number(event.target.value);
          setShown(clock.current);
          paintRef.current();
        }}
      />
    </div>
  );
}

function loadFrames(urls: string[]) {
  return Promise.all(urls.map((url) => new Promise<HTMLCanvasElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      canvas.getContext("2d")?.drawImage(image, 0, 0);
      resolve(canvas);
    };
    image.onerror = () => reject(new Error(url));
    image.src = url;
  })));
}

async function decodeGif(url: string) {
  const data = await fetch(url).then((response) => response.arrayBuffer());
  const decoder = new ImageDecoder({ data, type: "image/gif" });
  await decoder.tracks.ready;
  const count = decoder.tracks.selectedTrack?.frameCount ?? 0;
  const frames: HTMLCanvasElement[] = [];
  for (let index = 0; index < count; index += 1) {
    const { image } = await decoder.decode({ frameIndex: index });
    const canvas = document.createElement("canvas");
    canvas.width = image.displayWidth;
    canvas.height = image.displayHeight;
    canvas.getContext("2d")?.drawImage(image, 0, 0);
    image.close();
    frames.push(canvas);
  }
  decoder.close();
  return frames;
}

async function postClipboard(blob: Blob) {
  const response = await fetch("/lab/physarum-video/copy", {
    method: "POST",
    headers: { "content-type": "video/mp4" },
    body: blob,
  });
  if (!response.ok) throw new Error("The video could not be copied.");
}

async function encodeAudio(muxer: { addAudioChunk: (chunk: EncodedAudioChunk, meta?: EncodedAudioChunkMetadata) => void }, buffer: AudioBuffer) {
  const encoder = new AudioEncoder({
    output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
    error: () => undefined,
  });
  encoder.configure({
    codec: "mp4a.40.2",
    sampleRate: buffer.sampleRate,
    numberOfChannels: buffer.numberOfChannels,
    bitrate: 128000,
  });
  const channels = buffer.numberOfChannels;
  const rate = buffer.sampleRate;
  const sources = Array.from({ length: channels }, (_, index) => buffer.getChannelData(index));
  const size = 1024;
  for (let offset = 0; offset < buffer.length; offset += size) {
    const frames = Math.min(size, buffer.length - offset);
    const data = new Float32Array(channels * frames);
    for (let channel = 0; channel < channels; channel += 1) {
      data.set(sources[channel].subarray(offset, offset + frames), channel * frames);
    }
    const audio = new AudioData({
      format: "f32-planar",
      sampleRate: rate,
      numberOfFrames: frames,
      numberOfChannels: channels,
      timestamp: Math.round((offset / rate) * 1_000_000),
      data,
    });
    encoder.encode(audio);
    audio.close();
  }
  await encoder.flush();
  encoder.close();
}
