"use client";

import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { ProcessMorphology } from "@/components/vertical-process-stage";
import { readHumanScale, type ScaleReading } from "@/lib/demo-workflow/human-scale-reading";
import { scaleFigureMesh } from "@/lib/demo-workflow/scale-figure";
import { createProcessIsoCamera, PROCESS_ISO_PITCH, processIsoFit, type ProcessIsoCamera } from "@/lib/skill3/process-iso-camera";
import { MODULE_HALF } from "@/lib/skill3/view-project";
import type { IsoMesh } from "@/lib/scan/isomesh";
import styles from "@/components/demo-workflow/vertical-chapter.module.css";

function scaleCamera() {
  const camera = createProcessIsoCamera();
  camera.zoom = 1.12;
  return camera;
}

const FIGURE = [1, 0.5, 0.16] as [number, number, number];

function project(x: number, y: number, z: number, width: number, height: number, yaw: number) {
  const aspect = width / Math.max(1, height);
  const fit = processIsoFit(PROCESS_ISO_PITCH, aspect, 1.12);
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(PROCESS_ISO_PITCH);
  const sp = Math.sin(PROCESS_ISO_PITCH);
  const x1 = x * cy + z * sy;
  const z1 = -x * sy + z * cy;
  const y2 = y * cp - z1 * sp;
  return { x: (x1 * fit / aspect + 1) * 0.5 * width, y: (1 - y2 * fit) * 0.5 * height };
}

function drawMark(ctx: CanvasRenderingContext2D, width: number, height: number, reading: ScaleReading, yaw: number) {
  const figure = reading.figures[0];
  if (!figure) return;
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(73, 215, 222, 0.7)";
  ctx.fillStyle = "rgba(73, 215, 222, 0.14)";
  if (reading.mark === "height") {
    const foot = project(figure.x, figure.floor, figure.z, width, height, yaw);
    const head = project(figure.x, figure.floor + 6, figure.z, width, height, yaw);
    ctx.beginPath();
    ctx.moveTo(foot.x, foot.y);
    ctx.lineTo(head.x, head.y);
    ctx.stroke();
    return;
  }
  if (reading.mark === "passage" && reading.axis) {
    const from = project(figure.x - reading.axis.x * 1.6, figure.floor + 0.05, figure.z - reading.axis.z * 1.6, width, height, yaw);
    const to = project(figure.x + reading.axis.x * 1.6, figure.floor + 0.05, figure.z + reading.axis.z * 1.6, width, height, yaw);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    return;
  }
  const radius = reading.mark === "shelter" ? 2.1 : reading.mark === "opening" ? 1.5 : 0.9;
  ctx.beginPath();
  const steps = 16;
  for (let step = 0; step <= steps; step += 1) {
    const angle = (step / steps) * Math.PI * 2;
    const point = project(figure.x + Math.cos(angle) * radius, figure.floor + 0.04, figure.z + Math.sin(angle) * radius, width, height, yaw);
    if (step === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  }
  ctx.closePath();
  if (reading.mark !== "ground") ctx.fill();
  ctx.stroke();
}

function drawBox(ctx: CanvasRenderingContext2D, width: number, height: number, yaw: number) {
  const corners: { x: number; y: number }[] = [];
  for (const x of [-MODULE_HALF, MODULE_HALF]) {
    for (const y of [-MODULE_HALF, MODULE_HALF]) {
      for (const z of [-MODULE_HALF, MODULE_HALF]) corners.push(project(x, y, z, width, height, yaw));
    }
  }
  const edges: Array<[number, number]> = [
    [0, 1], [0, 2], [0, 4],
    [3, 1], [3, 2], [3, 7],
    [5, 1], [5, 4], [5, 7],
    [6, 2], [6, 4], [6, 7],
  ];
  ctx.beginPath();
  ctx.strokeStyle = "rgba(242, 242, 238, 0.32)";
  ctx.lineWidth = 0.8;
  for (const [a, b] of edges) {
    ctx.moveTo(corners[a].x, corners[a].y);
    ctx.lineTo(corners[b].x, corners[b].y);
  }
  ctx.stroke();
}

function ScaleOverlay({ reading, camera }: { reading: ScaleReading; camera: MutableRefObject<ProcessIsoCamera> }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;
    let frame = 0;
    const paint = () => {
      const width = Math.max(1, parent.clientWidth);
      const height = Math.max(1, parent.clientHeight);
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const yaw = camera.current.yaw;
      drawBox(ctx, width, height, yaw);
      drawMark(ctx, width, height, reading, yaw);
    };
    const loop = () => {
      paint();
      frame = window.requestAnimationFrame(loop);
    };
    loop();
    const observer = new ResizeObserver(paint);
    observer.observe(parent);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [camera, reading]);
  return <canvas ref={ref} className={styles.figure} data-ready="" aria-hidden="true" />;
}

/** One selected module with its 6 ft figure and the stored spatial reading. */
export function HumanScaleModel({ mesh, cacheIdentity }: { mesh: IsoMesh; cacheIdentity: string }) {
  const camera = useRef(scaleCamera());
  const reading = useMemo(() => readHumanScale(mesh), [mesh]);
  const figures = useMemo(() => (reading.figures.length ? scaleFigureMesh(reading.figures) : null), [reading]);
  return (
    <>
      <div className={`${styles.stage} final-spread-scale`}>
        <ProcessMorphology
          mesh={mesh}
          cacheIdentity={cacheIdentity}
          isoCamera={camera}
          orbit
          turnSeconds={48}
          wire
          wireBands={24}
          wireBright={1.15}
          wireLift={0.73}
          accent={figures}
          accentTint={FIGURE}
        />
        <ScaleOverlay reading={reading} camera={camera} />
      </div>
      <p className="final-spread-line">{reading.line}</p>
    </>
  );
}
