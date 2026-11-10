"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { BehaviorEvent, ClipFrame, SENTENCE_A, SENTENCE_B, STEPS_START, StepField, TITLE_EXIT, TITLE_REVEAL, VIDEOS_AT, bindPlayback, growthMediaReady, liveTime, pushPlayback, withSyncedFrame } from "./physarum-video-graphics";

type Transport = "idle" | "playing" | "paused";

const PROJECT = "/lab/physarum-video/media?clip=project";
const RECORDA = "/lab/physarum-video/media?clip=recorda";
const RECORDB = "/lab/physarum-video/media?clip=recordb";
const RECORDC = "/lab/physarum-video/media?clip=recordc";
const NETWORK = "/lab/physarum-video/media?clip=network";
const FRONT = "/lab/physarum-video/media?clip=front";
const ARRIVE = 1.35;
function frameBox(x: number, y: number, width: number, aspect: number, z: number) {
  return { x: `${x}%`, y: `${y}%`, w: `${width}%`, aspect, z };
}

const CLIPS = [
  { id: "network", delay: 0, frame: "field" as const, ...frameBox(4, 60, 78, 14.85, 2), crop: 1, source: { kind: "image" as const, src: NETWORK, start: 0, rate: 1, position: "50% 42%" } },
  { id: "record-b", delay: 0.55, frame: "field" as const, ...frameBox(3, 16, 30, 1.9, 5), crop: 1, source: { kind: "video" as const, src: RECORDB, start: 0.3, rate: 1, position: "50% 46%" } },
  { id: "record-c", delay: 1.2, frame: "vein" as const, ...frameBox(26, 5, 15, 1.12, 7), crop: 1, source: { kind: "video" as const, src: RECORDC, start: 0.4, rate: 1, position: "50% 48%" } },
  { id: "record-a", delay: 1.85, frame: "bark" as const, ...frameBox(44, 24, 20, 1.6, 6), crop: 1, source: { kind: "video" as const, src: RECORDA, start: 0.5, rate: 1, position: "62% 44%" } },
  { id: "project", delay: 2.45, frame: "web" as const, ...frameBox(63, 6.5, 11.5, 1, 8), crop: 1, source: { kind: "video" as const, src: PROJECT, start: 0.4, rate: 1, position: "42% 48%" } },
  { id: "front", delay: 3.05, frame: "spore" as const, ...frameBox(76, 46, 18, 1.78, 4), crop: 1, source: { kind: "image" as const, src: FRONT, start: 0, rate: 1, position: "50% 50%" } },
];

const WINDOWS = CLIPS.map((clip) => ({
  ...clip,
  at: VIDEOS_AT + clip.delay,
})).sort((left, right) => left.at - right.at);

const EXPORT_END = VIDEOS_AT + 3.05 + ARRIVE + 8;

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function openAmount(time: number, start: number, end: number) {
  return clamp01((time - start) / (end - start));
}

export function PhysarumVideoStage() {
  const [transport, setTransport] = useState<Transport>("idle");
  const [take, setTake] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [readyFile, setReadyFile] = useState<Blob | null>(null);
  const clock = useRef(0);
  const sceneRef = useRef<HTMLDivElement>(null);
  const exportCanvasRef = useRef<HTMLCanvasElement>(null);
  const exportStop = useRef<(() => void) | null>(null);
  const saveChoice = useRef<Promise<FileSystemFileHandle | null>>(Promise.resolve(null));
  const saveCancelled = useRef(false);
  const fileSink = useRef<FileSystemWritableFileStream | null>(null);
  const videoBlob = useRef<Blob | null>(null);
  const exportMode = useRef<"file" | "clipboard">("file");
  const [copying, setCopying] = useState(false);
  const [copyReady, setCopyReady] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (transport !== "playing" || exporting) return;
    let handle = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const step = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (growthMediaReady()) clock.current += step;
      pushPlayback(clock.current);
      handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(handle);
  }, [transport, take, exporting]);

  useEffect(() => {
    if (!exporting) return;
    const scene = sceneRef.current;
    const canvas = exportCanvasRef.current;
    if (!scene || !canvas || typeof VideoEncoder === "undefined") {
      setCopying(false);
      setExporting(false);
      return;
    }
    const sourceWidth = Math.max(2, scene.clientWidth);
    const sourceHeight = Math.max(2, scene.clientHeight);
    const even = (value: number) => Math.max(2, Math.floor(value / 2) * 2);
    canvas.width = even(Math.min(1920, sourceWidth));
    canvas.height = even(canvas.width * sourceHeight / sourceWidth);
    const context = canvas.getContext("2d");
    if (!context) {
      setCopying(false);
      setExporting(false);
      return;
    }
    let disposed = false;
    let frameHandle = 0;
    let encoder: VideoEncoder | null = null;
    let closed = false;
    const run = async () => {
      const { Muxer, ArrayBufferTarget } = await import("mp4-muxer");
      if (disposed) return;
      const width = canvas.width;
      const height = canvas.height;
      const base = {
        width,
        height,
        bitrate: 5_000_000,
        framerate: 30,
        avc: { format: "avc" as const },
        hardwareAcceleration: "prefer-software" as const,
      };
      const codecs = ["avc1.640028", "avc1.4D4028", "avc1.42E01E"];
      let codec = "";
      for (const candidate of codecs) {
        const supported = await VideoEncoder.isConfigSupported({ ...base, codec: candidate });
        if (supported.supported) {
          codec = candidate;
          break;
        }
      }
      if (disposed) return;
      if (!codec) {
        setCopying(false);
        setExporting(false);
        return;
      }
      const target = new ArrayBufferTarget();
      const muxer = new Muxer({
        target,
        fastStart: "in-memory",
        firstTimestampBehavior: "offset",
        video: { codec: "avc", width, height, frameRate: 30 },
      });
      let failed = false;
      let finish = () => {};
      encoder = new VideoEncoder({
        output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
        error: () => {
          failed = true;
          finish();
        },
      });
      encoder.configure({ ...base, codec, latencyMode: "quality" });
      let lastTimestamp = -1;
      let lastKey = -1;
      const capture = () => {
        if (!encoder || encoder.state !== "configured" || encoder.encodeQueueSize > 8) return;
        const timestamp = Math.round(clock.current * 1_000_000);
        if (timestamp <= lastTimestamp) return;
        const frame = new VideoFrame(canvas, { timestamp });
        const keyFrame = lastKey < 0 || timestamp - lastKey >= 2_000_000;
        encoder.encode(frame, { keyFrame });
        frame.close();
        lastTimestamp = timestamp;
        if (keyFrame) lastKey = timestamp;
      };
      finish = () => {
        if (closed) return;
        closed = true;
        cancelAnimationFrame(frameHandle);
        void (async () => {
          const sink = fileSink.current;
          try {
            if (encoder && encoder.state === "configured") {
              paintScene(context, canvas, scene);
              capture();
              await encoder.flush();
            }
            if (disposed) return;
            if (failed || saveCancelled.current || lastTimestamp < 0) {
              await sink?.abort();
              fileSink.current = null;
              if (exportMode.current === "clipboard") setCopyReady(false);
              return;
            }
            muxer.finalize();
            const blob = new Blob([target.buffer], { type: "video/mp4" });
            fileSink.current = null;
            if (blob.size < 1000) {
              await sink?.abort();
              return;
            }
            videoBlob.current = blob;
            if (exportMode.current === "clipboard") {
              await sink?.abort();
              await postClipboard(blob);
              setCopied(true);
              setCopyReady(false);
              return;
            }
            const handle = await saveChoice.current;
            if (sink) {
              await sink.write(blob);
              await sink.close();
            } else if (handle) await writeRecording(handle, blob);
            else setReadyFile(blob);
          } catch {
            if (sink) await sink.abort().catch(() => undefined);
            fileSink.current = null;
            if (exportMode.current === "clipboard" && videoBlob.current) setCopyReady(true);
          } finally {
            if (encoder && encoder.state !== "closed") encoder.close();
            setCopying(false);
            setExporting(false);
          }
        })();
      };
      exportStop.current = finish;
      const paint = () => {
        if (disposed || closed) return;
        try {
          if (encoder && encoder.encodeQueueSize > 4) {
            frameHandle = requestAnimationFrame(paint);
            return;
          }
          clock.current = Math.min(EXPORT_END, clock.current + 1 / 30);
          withSyncedFrame(() => pushPlayback(clock.current));
          paintScene(context, canvas, scene);
          capture();
        } catch {
          failed = true;
          finish();
          return;
        }
        if (clock.current >= EXPORT_END) finish();
        else frameHandle = requestAnimationFrame(paint);
      };
      paint();
    };
    void run().catch(() => {
      if (!disposed) {
        setCopying(false);
        setExporting(false);
      }
    });
    return () => {
      disposed = true;
      exportStop.current = null;
      cancelAnimationFrame(frameHandle);
      if (!closed && encoder && encoder.state !== "closed") {
        closed = true;
        encoder.close();
      }
    };
  }, [exporting, take]);

  const restart = () => {
    clock.current = 0;
    pushPlayback(0);
    setTake((current) => current + 1);
    setTransport("playing");
  };

  const beginRecording = () => {
    saveCancelled.current = false;
    setReadyFile(null);
    setCopied(false);
    clock.current = 0;
    pushPlayback(0);
    setTake((current) => current + 1);
    setTransport("playing");
    setExporting(true);
  };

  const copyVideo = () => {
    if (exporting) return;
    const existing = videoBlob.current;
    if (existing) {
      setCopying(true);
      setCopied(false);
      void postClipboard(existing).then(() => {
        setCopied(true);
        setCopyReady(false);
      }).catch(() => setCopyReady(true)).finally(() => setCopying(false));
      return;
    }
    exportMode.current = "clipboard";
    setCopying(true);
    setCopied(false);
    setCopyReady(false);
    fileSink.current = null;
    saveChoice.current = Promise.resolve(null);
    beginRecording();
  };

  const exportVideo = () => {
    if (readyFile) {
      saveRecording(readyFile, "physarum-video.mp4");
      setReadyFile(null);
      return;
    }
    if (exporting) return;
    exportMode.current = "file";
    fileSink.current = null;
    saveChoice.current = requestSaveFile("physarum-video.mp4", { "video/mp4": [".mp4"] }).then(async (handle: FileSystemFileHandle | null) => {
      if (!handle || saveCancelled.current) return null;
      try {
        fileSink.current = await handle.createWritable();
      } catch {
        fileSink.current = null;
      }
      return handle;
    }).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") {
        saveCancelled.current = true;
        exportStop.current?.();
      }
      return null;
    });
    beginRecording();
  };

  return (
    <div className="temp-physarum-video" data-transport={transport} data-take={take} data-exporting={exporting ? "on" : undefined}>
      <canvas ref={exportCanvasRef} className="pv-export-canvas" />
      <div className="pv-scene" key={take} ref={sceneRef}>
        <StepField />
        <BehaviorEvent part="trail" />
        <Intro />
        <VideoStack playing={transport === "playing"} />
        <BehaviorEvent part="word" />
      </div>
      <div className="temp-physarum-video-transport">
        <button type="button" aria-label="Play" aria-pressed={transport === "playing"} onClick={() => setTransport("playing")}>
          <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3.1 1.6v8.8l6.6-4.4z" /></svg>
        </button>
        <button type="button" aria-label="Pause" aria-pressed={transport === "paused"} onClick={() => setTransport((current) => (current === "playing" ? "paused" : current))}>
          <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.6 1.6h2.1v8.8H2.6zm4.7 0h2.1v8.8H7.3z" /></svg>
        </button>
        <button type="button" aria-label="Restart" onClick={restart}>
          <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M9.7 3.15A4.15 4.15 0 1 0 10.45 7" /><path d="M9.55 1.15v2.35H7.2" /></svg>
        </button>
      </div>
      <div className="pv-corner">
        <button type="button" className="pv-copy" aria-label={copied ? "Video copied" : "Copy video"} aria-pressed={copying || copied} data-ready={copied || copyReady ? "true" : undefined} onClick={copyVideo}>
          {copied ? (
            <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.15 6.2 4.7 8.75 9.85 3.2" /></svg>
          ) : (
            <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M4.4 1.5h6v6h-6z" /><path d="M1.6 4.3h6v6h-6z" /></svg>
          )}
        </button>
        <button type="button" className="pv-export" aria-label={readyFile ? "Save video" : "Export video"} aria-pressed={(exporting && exportMode.current === "file") || readyFile !== null} data-ready={readyFile ? "true" : undefined} onClick={exportVideo}>
          <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1.4v6.2M3.4 5.2 6 7.8l2.6-2.6M2 10.2h8" /></svg>
        </button>
      </div>
    </div>
  );
}

function paintScene(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, scene: HTMLDivElement) {
  const bounds = scene.getBoundingClientRect();
  const scaleX = canvas.width / Math.max(1, bounds.width);
  const scaleY = canvas.height / Math.max(1, bounds.height);
  context.setTransform(scaleX, 0, 0, scaleY, -bounds.left * scaleX, -bounds.top * scaleY);
  context.globalAlpha = 1;
  context.globalCompositeOperation = "source-over";
  context.filter = "none";
  context.fillStyle = "#000000";
  context.fillRect(bounds.left, bounds.top, bounds.width, bounds.height);
  scene.querySelectorAll<HTMLCanvasElement>(".pv-step-field").forEach((field) => {
    if (field.width <= 0) return;
    context.globalAlpha = Number(getComputedStyle(field).opacity) || 0;
    context.drawImage(field, bounds.left, bounds.top, bounds.width, bounds.height);
    context.globalAlpha = 1;
  });
  paintVectors(context, scene, bounds, scaleX, scaleY, "svg.pv-diagram, svg.pv-opening");
  const windows = [...scene.querySelectorAll<HTMLElement>(".pv-window")].sort((left, right) => (
    Number(getComputedStyle(left).zIndex || 0) - Number(getComputedStyle(right).zIndex || 0)
  ));
  context.filter = "grayscale(1) contrast(1.45) brightness(1.12)";
  context.globalCompositeOperation = "screen";
  windows.forEach((figure) => {
    const media = figure.querySelector<HTMLVideoElement | HTMLImageElement>("video, img");
    const footage = figure.querySelector<HTMLElement>(".pv-footage");
    if (!media || !footage) return;
    const box = clipBox(footage);
    if (box.width < 1 || box.height < 1) return;
    const frame = coverFrame(media, box);
    if (!frame) return;
    const crop = Number(media.dataset.crop) || 1;
    if (crop !== 1) {
      const position = getComputedStyle(media).objectPosition.split(" ");
      const horizontal = position[0]?.endsWith("%") ? Number.parseFloat(position[0]) / 100 : 0.5;
      const vertical = position[1]?.endsWith("%") ? Number.parseFloat(position[1]) / 100 : 0.5;
      const anchorX = box.left + box.width * horizontal;
      const anchorY = box.top + box.height * vertical;
      frame.x = anchorX - (anchorX - frame.x) * crop;
      frame.y = anchorY - (anchorY - frame.y) * crop;
      frame.width *= crop;
      frame.height *= crop;
    }
    context.save();
    context.beginPath();
    context.rect(box.left, box.top, box.width, box.height);
    context.clip();
    context.drawImage(media, frame.x, frame.y, frame.width, frame.height);
    context.restore();
  });
  context.filter = "none";
  context.globalCompositeOperation = "source-over";
  paintVectors(context, scene, bounds, scaleX, scaleY, "svg.pv-frame-svg");
  context.globalAlpha = 1;
  scene.querySelectorAll<HTMLElement>(".pv-fragment, .pv-echo, .pv-name, .pv-species, .pv-line, .pv-word").forEach((element) => {
    const opacity = stackedOpacity(element, scene);
    if (opacity < 0.02) return;
    const box = element.getBoundingClientRect();
    if (element.classList.contains("pv-rule")) {
      context.globalAlpha = opacity;
      context.fillStyle = "rgba(255, 255, 255, 0.72)";
      context.fillRect(box.left, box.top, box.width, box.height);
      return;
    }
    const sweeps = [...element.querySelectorAll<HTMLElement>(":scope .pv-sweep")];
    if (sweeps.length > 0) {
      sweeps.forEach((sweep) => {
        const reveal = Number(sweep.dataset.reveal ?? "1");
        if (reveal <= 0.02) return;
        const sweepBox = sweep.getBoundingClientRect();
        const style = getComputedStyle(sweep);
        context.save();
        context.beginPath();
        context.rect(sweepBox.left, sweepBox.top, sweepBox.width * reveal, sweepBox.height);
        context.clip();
        context.globalAlpha = opacity;
        context.fillStyle = style.color === "transparent" || style.color === "rgba(0, 0, 0, 0)" ? "#ffffff" : style.color;
        context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        context.textBaseline = "top";
        context.letterSpacing = style.letterSpacing;
        context.fillText(sweep.innerText, sweepBox.left, sweepBox.top);
        context.restore();
      });
      return;
    }
    const clipped = clipBox(element);
    if (clipped.width < 1 || clipped.height < 1) return;
    const style = getComputedStyle(element);
    context.save();
    context.beginPath();
    context.rect(clipped.left, clipped.top, clipped.width, clipped.height);
    context.clip();
    context.globalAlpha = opacity;
    context.globalCompositeOperation = element.classList.contains("pv-word") ? "difference" : "source-over";
    context.fillStyle = style.color;
    context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    context.textBaseline = "top";
    context.letterSpacing = style.letterSpacing;
    const lineHeight = Number.parseFloat(style.lineHeight) || Number.parseFloat(style.fontSize) * 1.45;
    element.innerText.split("\n").forEach((line, index) => {
      context.fillText(line, box.left, box.top + index * lineHeight);
    });
    context.restore();
  });
  context.globalAlpha = 1;
  context.globalCompositeOperation = "source-over";
}

function stackedOpacity(element: Element, scene: HTMLElement) {
  let opacity = 1;
  let node: Element | null = element;
  while (node && node !== scene.parentElement) {
    opacity *= Number(getComputedStyle(node).opacity);
    node = node.parentElement;
  }
  return opacity;
}

function paintVectors(context: CanvasRenderingContext2D, scene: HTMLDivElement, bounds: DOMRect, scaleX: number, scaleY: number, selector: string) {
  scene.querySelectorAll<SVGSVGElement>(selector).forEach((svg) => {
    const opacity = stackedOpacity(svg, scene);
    const matrix = svg.getScreenCTM();
    if (opacity < 0.02 || !matrix) return;
    context.save();
    context.setTransform(matrix.a * scaleX, matrix.b * scaleY, matrix.c * scaleX, matrix.d * scaleY, (matrix.e - bounds.left) * scaleX, (matrix.f - bounds.top) * scaleY);
    svg.querySelectorAll<SVGGeometryElement>("path, circle").forEach((shape) => {
      const style = getComputedStyle(shape);
      const shapeOpacity = Number(style.opacity);
      if (!shapeOpacity || style.display === "none") return;
      context.globalAlpha = opacity * shapeOpacity;
      context.lineWidth = Number.parseFloat(style.strokeWidth) || 1;
      context.lineCap = "round";
      context.lineJoin = "round";
      const dash = shape.getAttribute("stroke-dasharray");
      context.setLineDash(dash && dash !== "none" ? dash.split(/[\s,]+/).map(Number) : []);
      context.lineDashOffset = Number(shape.getAttribute("stroke-dashoffset") || 0);
      context.strokeStyle = style.stroke;
      context.fillStyle = style.fill;
      if (shape instanceof SVGPathElement) {
        const path = new Path2D(shape.getAttribute("d") || "");
        if (style.fill !== "none") context.fill(path);
        if (style.stroke !== "none") context.stroke(path);
      } else if (shape instanceof SVGCircleElement) {
        context.beginPath();
        context.arc(shape.cx.baseVal.value, shape.cy.baseVal.value, shape.r.baseVal.value, 0, Math.PI * 2);
        if (style.fill !== "none") context.fill();
        if (style.stroke !== "none") context.stroke();
      }
    });
    context.restore();
  });
}

function clipBox(element: HTMLElement) {
  const box = element.getBoundingClientRect();
  const clip = getComputedStyle(element).clipPath;
  const match = /inset\(([^)]+)\)/.exec(clip);
  if (!match) return box;
  const parts = match[1].trim().split(/\s+/);
  const [top, right, bottom, left] = parts.length === 4 ? parts : parts.length === 2 ? [parts[0], parts[1], parts[0], parts[1]] : [parts[0], parts[0], parts[0], parts[0]];
  const length = (token: string, size: number) => (token.endsWith("%") ? (size * Number.parseFloat(token)) / 100 : Number.parseFloat(token));
  const insetTop = length(top, box.height);
  const insetRight = length(right, box.width);
  const insetBottom = length(bottom, box.height);
  const insetLeft = length(left, box.width);
  return new DOMRect(box.left + insetLeft, box.top + insetTop, box.width - insetLeft - insetRight, box.height - insetTop - insetBottom);
}

function coverFrame(media: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement, box: DOMRect) {
  const width = media instanceof HTMLVideoElement ? media.videoWidth : media instanceof HTMLImageElement ? media.naturalWidth : media.width;
  const height = media instanceof HTMLVideoElement ? media.videoHeight : media instanceof HTMLImageElement ? media.naturalHeight : media.height;
  if (!width || !height) return null;
  const scale = Math.max(box.width / width, box.height / height);
  const drawnWidth = width * scale;
  const drawnHeight = height * scale;
  const position = getComputedStyle(media).objectPosition.split(" ");
  const horizontal = position[0]?.endsWith("%") ? Number.parseFloat(position[0]) / 100 : 0.5;
  const vertical = position[1]?.endsWith("%") ? Number.parseFloat(position[1]) / 100 : 0.5;
  return {
    x: box.left + (box.width - drawnWidth) * horizontal,
    y: box.top + (box.height - drawnHeight) * vertical,
    width: drawnWidth,
    height: drawnHeight,
  };
}

function flicker(time: number, at: number) {
  const delta = time - at;
  if (delta < 0) return 0;
  if (delta < 0.03) return 0.12;
  if (delta < 0.055) return 1;
  if (delta < 0.08) return 0.22;
  if (delta < 0.11) return 0.9;
  return 1;
}

function sweep(time: number, start: number, duration: number) {
  return clamp01((time - start) / duration);
}

const BANDS = 9;

function assemble(time: number, at: number) {
  const linear = sweep(time, at, ARRIVE);
  return linear * linear * (3 - 2 * linear);
}

function bandMask(progress: number, index: number) {
  const stops: string[] = [];
  for (let band = 0; band < BANDS; band += 1) {
    const top = (band / BANDS) * 100;
    const span = 100 / BANDS;
    const order = ((band * 5 + index * 3) % BANDS) / BANDS;
    const local = clamp01((progress - order * 0.48) / 0.52);
    const eased = local * local * (3 - 2 * local);
    const mid = top + span * 0.5;
    const half = span * 0.5 * eased;
    stops.push(`transparent ${top.toFixed(2)}%`);
    stops.push(`transparent ${(mid - half).toFixed(2)}%`);
    stops.push(`#000 ${(mid - half).toFixed(2)}%`);
    stops.push(`#000 ${(mid + half).toFixed(2)}%`);
    stops.push(`transparent ${(mid + half).toFixed(2)}%`);
    stops.push(`transparent ${(top + span).toFixed(2)}%`);
  }
  return `linear-gradient(to bottom, ${stops.join(",")})`;
}

function applyMask(node: HTMLElement, mask: string) {
  node.style.maskImage = mask;
  node.style.setProperty("-webkit-mask-image", mask);
}

function VideoStack({ playing }: { playing: boolean }) {
  const [shown, setShown] = useState(0);
  const nodes = useRef<Array<HTMLElement | null>>([]);
  const clips = useRef<Array<HTMLElement | null>>([]);
  const fissures = useRef<Array<HTMLElement | null>>([]);
  useEffect(() => bindPlayback((time) => {
    let count = 0;
    while (count < WINDOWS.length && time >= WINDOWS[count].at) count += 1;
    setShown((current) => (current === count ? current : count));
    for (let index = 0; index < count; index += 1) {
      const node = nodes.current[index];
      if (!node) continue;
      const item = WINDOWS[index];
      const opened = assemble(time, item.at);
      const frame = node.querySelector<HTMLElement>(".pv-frame-svg");
      if (frame) frame.style.opacity = String(Math.max(0, (opened - 0.74) / 0.26));
      const fissure = fissures.current[index];
      if (fissure) {
        const grow = clamp01(opened / 0.14);
        const fade = 1 - clamp01((opened - 0.22) / 0.42);
        fissure.style.opacity = String(grow * fade);
        fissure.style.transform = `scaleX(${grow.toFixed(3)})`;
      }
      const clip = clips.current[index];
      if (!clip) continue;
      const mask = opened > 0.985 ? "none" : bandMask(opened, index);
      applyMask(clip, mask);
      clip.dataset.locked = opened > 0.9 ? "1" : "0";
      clip.style.setProperty("--pv-scan", `${((time * 18 + index * 23) % 100).toFixed(1)}%`);
      const media = clip.querySelector<HTMLElement>("video, img");
      if (!media) continue;
      const tearing = opened < 0.72 && Math.sin(time * 62 + index * 2.4) > 0.15;
      const slide = (1 - opened) * (index % 2 === 0 ? 1 : -1);
      const kick = tearing ? (Math.sin(time * 130 + index) > 0 ? 1 : -1) : 0;
      const x = clip.clientWidth * (slide * 0.12 + kick * 0.045);
      const y = tearing ? Math.sin(time * 90 + index) * clip.clientHeight * 0.03 : 0;
      media.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) scale(${item.crop})`;
      const flash = opened > 0.8 && opened < 0.92 ? 0.7 : 0;
      media.style.filter = flash > 0 ? `grayscale(1) contrast(1.55) brightness(${(1.12 + flash).toFixed(2)})` : "";
    }
  }), []);
  return (
    <>
      {WINDOWS.map((item, index) => {
        if (index >= shown) return null;
        const opened = assemble(liveTime.current, item.at);
        const mask = opened > 0.985 ? "none" : bandMask(opened, index);
        const grow = clamp01(opened / 0.14);
        const fade = 1 - clamp01((opened - 0.22) / 0.42);
        return (
          <figure
            key={item.id}
            ref={(node) => { nodes.current[index] = node; }}
            className="pv-window"
            style={{ left: item.x, top: item.y, width: item.w, aspectRatio: item.aspect, zIndex: item.z }}
          >
            <div
              className="pv-footage"
              ref={(node) => { clips.current[index] = node; }}
              data-locked={opened > 0.9 ? "1" : "0"}
              style={{ maskImage: mask, WebkitMaskImage: mask }}
            >
              {item.source.kind === "video" ? (
                <ClipVideo src={item.source.src} start={item.source.start} rate={item.source.rate} position={item.source.position} crop={item.crop} playing={playing} />
              ) : (
                <img src={item.source.src} alt="" style={{ objectPosition: item.source.position, transformOrigin: item.source.position, transform: `scale(${item.crop})` }} />
              )}
            </div>
            <div className="pv-fissure" ref={(node) => { fissures.current[index] = node; }} style={{ opacity: grow * fade, transform: `scaleX(${grow})` }} />
            <ClipFrame id={item.frame} open={Math.max(0, (opened - 0.74) / 0.26)} />
          </figure>
        );
      })}
    </>
  );
}

function Intro() {
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const apply = (time: number) => applyIntro(root.current, time);
    apply(liveTime.current);
    return bindPlayback(apply);
  }, []);
  return (
    <div ref={root} className="pv-intro">
      <div className="pv-lockup">
        <span className="pv-charge pv-charge-b" />
        <p className="pv-echo">PHYSARUM</p>
        <h1 className="pv-name" style={{ fontSize: "7.2rem" }}>
          {"PHYSARUM".split("").map((letter, index) => (
            <span key={`${letter}-${index}`}>{letter}</span>
          ))}
        </h1>
        <p className="pv-species pv-species-echo">POLYCEPHALUM</p>
        <p className="pv-species" style={{ letterSpacing: "0.14em" }}>POLYCEPHALUM</p>
      </div>
      <div className="pv-sentences">
        <WordLine start={SENTENCE_A} className="pv-line pv-line-a" rows={["A single-celled, bright yellow slime mold."]} />
        <WordLine start={SENTENCE_B} className="pv-line pv-line-b" rows={["It moves by pushing its cytoplasm back and forth", "like currents through its tube network."]} />
      </div>
    </div>
  );
}

function applyIntro(root: HTMLDivElement | null, time: number) {
  if (!root) return;
  const titleLeave = sweep(time, TITLE_EXIT, 0.5);
  const sentenceLeave = sweep(time, STEPS_START - 0.28, 0.46);
  const hidden = time >= STEPS_START + 0.22;
  root.style.visibility = hidden ? "hidden" : "";
  root.style.transform = "";
  if (hidden) return;
  const reveal = sweep(time, TITLE_REVEAL, 0.9);
  const ease = reveal * reveal * (3 - 2 * reveal);
  const scale = 0.74 + ease * 0.26;
  const charge = sweep(time, TITLE_REVEAL, 0.55);
  const chargeFade = ease * (1 - sweep(time, TITLE_REVEAL + 0.7, 0.4));
  const speciesOn = sweep(time, TITLE_REVEAL + 0.22, 0.45);
  const lockup = root.querySelector<HTMLElement>(".pv-lockup");
  if (lockup) {
    const slit = 1 - ease;
    lockup.style.transform = `translate3d(${-titleLeave * 70}vw, 0, 0) scale(${scale})`;
    lockup.style.opacity = String((1 - titleLeave) * ease);
    lockup.style.clipPath = `inset(${(18 + slit * 10).toFixed(2)}% ${(slit * 48).toFixed(2)}% ${(28 + slit * 22).toFixed(2)}% 0)`;
  }
  const sentences = root.querySelector<HTMLElement>(".pv-sentences");
  if (sentences) {
    sentences.style.transform = `translate(-50%, -50%) translate3d(${-sentenceLeave * 110}vw, 0, 0)`;
    sentences.style.opacity = String(time < SENTENCE_A ? 0 : 1 - sentenceLeave);
  }
  const chargeBar = root.querySelector<HTMLElement>(".pv-charge-b");
  if (chargeBar) {
    chargeBar.style.top = `${46 - charge * 8}%`;
    chargeBar.style.width = `${charge * 34}%`;
    chargeBar.style.opacity = String(chargeFade * 0.7);
  }
  const echoLine = root.querySelector<HTMLElement>(".pv-echo");
  if (echoLine) echoLine.style.opacity = "1";
  const name = root.querySelector<HTMLElement>(".pv-name");
  if (name) name.style.letterSpacing = `${0.16 - ease * 0.04}em`;
  const speciesEcho = root.querySelector<HTMLElement>(".pv-species-echo");
  if (speciesEcho) speciesEcho.style.opacity = String(speciesOn);
  const species = root.querySelector<HTMLElement>(".pv-species:not(.pv-species-echo)");
  if (species) {
    species.style.opacity = String(speciesOn * flicker(time, 0.48));
    species.style.clipPath = `inset(0 ${(1 - speciesOn) * 100}% 0 0)`;
  }
  root.querySelectorAll<HTMLElement>(".pv-line").forEach((line) => {
    const first = line.querySelector<HTMLElement>(".pv-sweep");
    const start = first ? Number(first.dataset.start) : 0;
    line.style.display = time < start ? "none" : "";
  });
  root.querySelectorAll<HTMLElement>(".pv-sweep").forEach((span) => {
    const reveal = sweep(time, Number(span.dataset.start), 0.2);
    const mask = sweepMask(reveal);
    const lead = Math.min(100, reveal * 100);
    const sweeping = reveal > 0.001 && reveal < 0.995;
    span.style.maskImage = mask;
    span.style.setProperty("-webkit-mask-image", mask);
    span.style.color = sweeping ? "transparent" : "#ffffff";
    span.style.backgroundImage = sweeping ? `linear-gradient(90deg, rgba(255,255,255,0.72) 0%, rgba(255,255,255,0.82) ${Math.max(0, lead - 20)}%, #ffffff ${Math.max(0, lead - 7)}%, rgba(126,158,156,0.72) ${lead}%, transparent ${lead + 0.8}%)` : "";
    span.style.backgroundClip = sweeping ? "text" : "";
    span.style.setProperty("-webkit-background-clip", sweeping ? "text" : "");
    span.style.textShadow = reveal >= 0.995 ? "0 0 14px rgba(255,255,255,0.34)" : "";
  });
}

type SavePickerWindow = Window & {
  showSaveFilePicker?: (options: {
    suggestedName?: string;
    types?: Array<{ description?: string; accept: Record<string, string[]> }>;
  }) => Promise<FileSystemFileHandle>;
};

function requestSaveFile(name: string, accept: Record<string, string[]>): Promise<FileSystemFileHandle | null> {
  const options = {
    suggestedName: name,
    types: [{ description: "Video", accept }],
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

async function postClipboard(blob: Blob) {
  const response = await fetch("/lab/physarum-video/copy", {
    method: "POST",
    headers: { "content-type": "video/mp4" },
    body: blob,
  });
  if (!response.ok) throw new Error("The video could not be copied.");
}

async function writeRecording(handle: FileSystemFileHandle, blob: Blob) {
  const writable = await handle.createWritable();
  await writable.write(blob);
  await writable.close();
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

function sweepMask(amount: number) {
  const edge = amount * 124;
  const solid = Math.max(0, edge - 16);
  return `linear-gradient(90deg, #000 0%, #000 ${solid}%, transparent ${Math.min(124, edge)}%)`;
}

function WordLine({ start, className, rows }: { start: number; className: string; rows: string[] }) {
  let seen = 0;
  return (
    <p className={className} style={{ display: "none" }}>
      {rows.map((row) => {
        const words = row.split(/\s+/).filter(Boolean);
        const offset = seen;
        seen += words.length;
        return (
          <span key={row} className="pv-word-row">
            {words.map((word, index) => (
              <span key={`${word}-${index}`} className="pv-sweep" data-start={start + (offset + index) * 0.29}>{word}</span>
            ))}
          </span>
        );
      })}
    </p>
  );
}

function ClipVideo({ src, start, rate, position, crop, playing }: { src: string; start: number; rate: number; position: string; crop: number; playing: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    video.playbackRate = rate;
    const seek = () => {
      video.currentTime = start;
    };
    if (video.readyState >= 1) seek();
    else video.addEventListener("loadedmetadata", seek, { once: true });
  }, [rate, start]);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    if (playing) void video.play().catch(() => undefined);
    else video.pause();
  }, [playing]);
  return <video ref={ref} src={src} muted loop playsInline data-crop={crop} style={{ objectPosition: position, transformOrigin: position, transform: `scale(${crop})` }} />;
}
