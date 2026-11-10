"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { BufferAttribute, BufferGeometry, CanvasTexture, LineBasicMaterial, OrthographicCamera, PerspectiveCamera, SRGBColorSpace, type Sprite } from "three";
import { siteAnalysis, type AnalysisMark, type AnalysisTone } from "@/lib/skill5/site-analysis";
import type { SiteContext, XZ } from "@/lib/skill5/site-model";

export type SiteAnalysisLayers = {
  access: boolean;
  sunWind: boolean;
  viewsNoise: boolean;
  opportunities: boolean;
};

const TONE: Record<AnalysisTone, string> = {
  paper: "#f2f2ee",
  teal: "#7db8b8",
  copper: "#c77e5f",
};

function AnalysisLines({ marks, y }: { marks: readonly AnalysisMark[]; y: number }) {
  const geometry = useMemo(() => {
    const positions: number[] = [];
    for (const mark of marks) {
      for (const path of mark.lines) {
        for (let index = 1; index < path.length; index += 1) {
          positions.push(path[index - 1][0], y, path[index - 1][1], path[index][0], y, path[index][1]);
        }
      }
    }
    const next = new BufferGeometry();
    next.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
    return next;
  }, [marks, y]);
  const material = useMemo(() => {
    const color = TONE[marks[0]?.tone ?? "paper"];
    return new LineBasicMaterial({ color, transparent: true, opacity: 0.92, depthTest: false });
  }, [marks]);
  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);
  if (marks.length === 0) return null;
  return <lineSegments geometry={geometry} material={material} raycast={() => undefined} />;
}

function AnalysisLabel({ text, at, tone }: { text: string; at: XZ; tone: AnalysisTone }) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 96;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = TONE[tone];
    context.font = "300 42px Helvetica, Arial, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(text.toUpperCase(), canvas.width / 2, canvas.height / 2);
    const map = new CanvasTexture(canvas);
    map.colorSpace = SRGBColorSpace;
    return map;
  }, [text, tone]);
  const sprite = useRef<Sprite>(null);
  useEffect(() => () => texture?.dispose(), [texture]);
  useFrame(({ camera, size }) => {
    const object = sprite.current;
    if (!object) return;
    const width = camera instanceof OrthographicCamera
      ? Math.abs(camera.right - camera.left) / camera.zoom
      : camera instanceof PerspectiveCamera
        ? 2 * Math.tan((camera.fov * Math.PI) / 360) * camera.position.distanceTo(object.getWorldPosition(object.position.clone()))
        : size.width;
    const feet = width / Math.max(1, size.width);
    object.scale.set(feet * Math.max(78, text.length * 7.4), feet * 14, 1);
  });
  if (!texture) return null;
  return (
    <sprite ref={sprite} position={[at[0], 8, at[1]]} raycast={() => undefined}>
      <spriteMaterial map={texture} transparent depthTest={false} toneMapped={false} />
    </sprite>
  );
}

function MarkGroup({ marks }: { marks: readonly AnalysisMark[] }) {
  const byTone = new Map<AnalysisTone, AnalysisMark[]>();
  for (const mark of marks) {
    const list = byTone.get(mark.tone) ?? [];
    list.push(mark);
    byTone.set(mark.tone, list);
  }
  return (
    <>
      {[...byTone.values()].map((group) => (
        <AnalysisLines key={group[0].tone} marks={group} y={3.2} />
      ))}
      {marks.map((mark) => (
        <AnalysisLabel key={mark.id} text={mark.label} at={mark.labelAt} tone={mark.tone} />
      ))}
    </>
  );
}

export function SiteAnalysisLayer({ context, layers }: { context: SiteContext; layers: SiteAnalysisLayers }) {
  const diagram = useMemo(() => siteAnalysis(context), [context]);
  return (
    <>
      {layers.access ? <MarkGroup marks={diagram.access} /> : null}
      {layers.sunWind ? <MarkGroup marks={diagram.sunWind} /> : null}
      {layers.viewsNoise ? <MarkGroup marks={diagram.viewsNoise} /> : null}
      {layers.opportunities ? <MarkGroup marks={diagram.opportunities} /> : null}
    </>
  );
}
