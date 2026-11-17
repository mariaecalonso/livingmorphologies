"use client";

import { useEffect, useState } from "react";

let handoffArchetype: string | null = null;

/** The presentation sets this before the final catalogue mounts. It does not write a selection. */
export function armCatalogHandoff(archetypeId: string) {
  handoffArchetype = archetypeId;
}

export function takeCatalogHandoff() {
  return handoffArchetype;
}

export function clearCatalogHandoff() {
  handoffArchetype = null;
}

let flightActive = false;
let flightSettled = false;

export function catalogFlightActive() {
  return flightActive;
}

export function catalogFlightSettled() {
  return flightSettled;
}

type FlightBox = { left: number; top: number; width: number; height: number };

function frameBox(box: FlightBox): FlightBox {
  const frame = document.querySelector("body > .site-frame");
  if (!(frame instanceof HTMLElement)) return box;
  const rect = frame.getBoundingClientRect();
  const scale = rect.width / Math.max(1, frame.offsetWidth);
  return {
    left: (box.left - rect.left) / scale,
    top: (box.top - rect.top) / scale,
    width: box.width / scale,
    height: box.height / scale,
  };
}

function fitted(from: FlightBox, into: FlightBox): FlightBox {
  const aspect = from.width / Math.max(1, from.height);
  let width = into.width;
  let height = width / aspect;
  if (height > into.height) {
    height = into.height;
    width = height * aspect;
  }
  return {
    left: into.left + (into.width - width) / 2,
    top: into.top + (into.height - height) / 2,
    width,
    height,
  };
}

/** The enlarged model leaves the catalogue and lands on its final-catalog slot. */
function launchCatalogFlight() {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const canvas = document.querySelector("[data-demo-catalog] .vertical-catalogue-stage canvas");
  if (reduced || !(canvas instanceof HTMLCanvasElement) || canvas.width < 2) {
    armCatalogHandoff("vertical-void");
    window.dispatchEvent(new Event("lm-catalog-handoff"));
    return;
  }
  const stage = canvas.getBoundingClientRect();
  const copy = document.createElement("canvas");
  copy.width = canvas.width;
  copy.height = canvas.height;
  const ctx = copy.getContext("2d", { willReadFrequently: true });
  if (!ctx || stage.width < 8) {
    armCatalogHandoff("vertical-void");
    window.dispatchEvent(new Event("lm-catalog-handoff"));
    return;
  }
  canvas.parentElement?.dispatchEvent(new Event("lm-catalog-home"));
  ctx.drawImage(canvas, 0, 0);
  const pixels = ctx.getImageData(0, 0, copy.width, copy.height).data;
  const step = 4;
  let weight = 0;
  let centerX = 0;
  let centerY = 0;
  for (let y = 0; y < copy.height; y += step) {
    for (let x = 0; x < copy.width; x += step) {
      const index = (y * copy.width + x) * 4;
      const light = pixels[index] + pixels[index + 1] + pixels[index + 2];
      if (light < 150) continue;
      weight += light;
      centerX += x * light;
      centerY += y * light;
    }
  }
  const reach = Math.min(copy.width, copy.height) * 0.42;
  let minX = copy.width;
  let minY = copy.height;
  let maxX = 0;
  let maxY = 0;
  if (weight > 0) {
    centerX /= weight;
    centerY /= weight;
    for (let y = 0; y < copy.height; y += step) {
      for (let x = 0; x < copy.width; x += step) {
        if (Math.hypot(x - centerX, y - centerY) > reach) continue;
        const index = (y * copy.width + x) * 4;
        if (pixels[index] + pixels[index + 1] + pixels[index + 2] < 120) continue;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  const found = maxX > minX && maxY > minY;
  const cropX = found ? Math.max(0, minX - step * 3) : copy.width * 0.22;
  const cropY = found ? Math.max(0, minY - step * 3) : copy.height * 0.12;
  const crop = found
    ? { x: cropX, y: cropY, w: Math.min(copy.width - cropX, maxX + step * 3 - cropX), h: Math.min(copy.height - cropY, maxY + step * 3 - cropY) }
    : { x: cropX, y: cropY, w: copy.width * 0.56, h: copy.height * 0.72 };
  const plate = document.createElement("canvas");
  plate.width = Math.max(2, Math.round(crop.w));
  plate.height = Math.max(2, Math.round(crop.h));
  const plateCtx = plate.getContext("2d", { willReadFrequently: true });
  if (!plateCtx) {
    armCatalogHandoff("vertical-void");
    window.dispatchEvent(new Event("lm-catalog-handoff"));
    return;
  }
  plateCtx.drawImage(copy, crop.x, crop.y, crop.w, crop.h, 0, 0, plate.width, plate.height);
  const plateImage = plateCtx.getImageData(0, 0, plate.width, plate.height);
  const ink = plateImage.data;
  for (let index = 0; index < ink.length; index += 4) {
    const light = ink[index] + ink[index + 1] + ink[index + 2];
    ink[index + 3] = light < 42 ? 0 : Math.min(255, Math.round((light - 42) * 1.45));
  }
  plateCtx.putImageData(plateImage, 0, 0);
  const scaleX = stage.width / copy.width;
  const scaleY = stage.height / copy.height;
  const from = frameBox({
    left: stage.left + crop.x * scaleX,
    top: stage.top + crop.y * scaleY,
    width: crop.w * scaleX,
    height: crop.h * scaleY,
  });
  const layer = document.createElement("div");
  layer.className = "catalog-flight";
  const image = document.createElement("img");
  image.alt = "";
  image.src = plate.toDataURL("image/png");
  layer.append(image);
  let shown = from;
  const place = (box: FlightBox, opacity: number) => {
    shown = box;
    layer.style.left = `${box.left}px`;
    layer.style.top = `${box.top}px`;
    layer.style.width = `${box.width}px`;
    layer.style.height = `${box.height}px`;
    layer.style.opacity = String(opacity);
  };
  place(from, 1);
  const frame = document.querySelector("body > .site-frame");
  (frame ?? document.body).append(layer);
  flightSettled = false;
  flightActive = true;

  const holdMs = 1100;
  const flyMs = 2400;
  const started = performance.now();
  let handed = false;
  const wait = (now: number) => {
    if (!layer.isConnected) return;
    const held = now - started;
    if (!handed && held >= holdMs) {
      handed = true;
      canvas.style.visibility = "hidden";
      armCatalogHandoff("vertical-void");
      window.dispatchEvent(new Event("lm-catalog-handoff"));
    }
    const board = document.querySelector('article[aria-label="03 Vertical Propagation, Final View"]');
    const slot = board?.querySelector('.final-item[aria-label="Vertical Void"]') ?? null;
    const target = slot?.querySelector(".final-mesh") ?? slot;
    const landed = target ? frameBox(target.getBoundingClientRect()) : null;
    const boardBox = board ? frameBox(board.getBoundingClientRect()) : null;
    const onBoard = handed && landed != null && boardBox != null && landed.width > 12 && landed.height > 12 && landed.top > boardBox.top - 8 && landed.bottom < boardBox.bottom + 8;
    if (!onBoard && held < 3200) {
      const lift = Math.min(1, held / holdMs);
      const grow = 1 + lift * 0.08;
      const width = from.width * grow;
      const height = from.height * grow;
      place({
        left: from.left - (width - from.width) / 2,
        top: from.top - lift * from.height * 0.14 - (height - from.height) / 2,
        width,
        height,
      }, 1);
      window.requestAnimationFrame(wait);
      return;
    }
    const into = landed && landed.width > 12
      ? { left: landed.left, top: landed.top, width: landed.width, height: landed.height }
      : { left: shown.left + shown.width * 0.2, top: shown.top - 36, width: shown.width * 0.42, height: shown.height * 0.42 };
    const origin = shown;
    const to = fitted(origin, into);
    const flyFrom = performance.now();
    const fly = (frame: number) => {
      const amount = Math.min(1, (frame - flyFrom) / flyMs);
      const ease = amount < 0.5 ? 2 * amount * amount : 1 - ((-2 * amount + 2) ** 2) / 2;
      const arc = Math.sin(Math.PI * amount) * -Math.min(origin.height * 0.04, 18);
      place({
        left: origin.left + (to.left - origin.left) * ease,
        top: origin.top + (to.top - origin.top) * ease + arc,
        width: origin.width + (to.width - origin.width) * ease,
        height: origin.height + (to.height - origin.height) * ease,
      }, amount > 0.9 ? 1 - (amount - 0.9) / 0.1 : 1);
      if (amount < 1) window.requestAnimationFrame(fly);
      else {
        layer.remove();
        flightActive = false;
        flightSettled = true;
        window.dispatchEvent(new Event("lm-catalog-arrived"));
      }
    };
    window.requestAnimationFrame(fly);
  };
  window.requestAnimationFrame(wait);
}

type Reading = {
  signedVolume: number | null;
  solidFraction: number | null;
  components: number | null;
  boundaryEdges: number | null;
  nonManifoldEdges: number | null;
  triangles: number | null;
  manifold: "PASS" | "FAIL" | null;
  preflight: "PASS" | "FAIL" | null;
  bounds: { min: [number, number, number]; max: [number, number, number] } | null;
};

const AXES = ["Width", "Height", "Depth"] as const;

function standing(reading: Reading) {
  if (
    reading.manifold == null
    || reading.preflight == null
    || reading.components == null
    || reading.boundaryEdges == null
    || reading.nonManifoldEdges == null
  ) return null;
  const validated = reading.manifold === "PASS"
    && reading.preflight === "PASS"
    && reading.components === 1
    && reading.boundaryEdges === 0
    && reading.nonManifoldEdges === 0;
  return validated ? "Validated" : "Review";
}

/** Stored readings for one continuation. Figures come from the solidified record; missing ones stay out. */
export function CatalogInspection({
  archetypeId,
  candidateId,
  continuationId,
  archetypeName,
  onBack,
}: {
  archetypeId: string;
  candidateId: number;
  continuationId: string;
  archetypeName: string;
  onBack: () => void;
}) {
  const key = `${archetypeId}:${candidateId}:${continuationId}`;
  const [query, setQuery] = useState(key);
  const [reading, setReading] = useState<Reading | null>(null);
  const [ready, setReady] = useState(false);
  if (query !== key) {
    setQuery(key);
    setReading(null);
    setReady(false);
  }

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({
      archetype: archetypeId,
      candidate: String(candidateId),
      continuation: continuationId,
    });
    void fetch(`/api/vertical/solidified?${params}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return null;
        const body = await response.json() as { reading?: Reading | null };
        return body.reading ?? null;
      })
      .then((next) => {
        if (controller.signal.aborted) return;
        setReading(next);
        setReady(true);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setReading(null);
        setReady(true);
      });
    return () => controller.abort();
  }, [archetypeId, candidateId, continuationId]);

  const bounds = reading?.bounds ?? null;
  const spans = bounds ? bounds.max.map((value, index) => value - bounds.min[index]) : null;
  const peak = spans ? Math.max(...spans, 0.001) : 1;
  const status = reading ? standing(reading) : null;
  const selected = continuationId === "N24";
  const mass = reading?.solidFraction == null ? null : Math.max(0, Math.min(1, reading.solidFraction));
  const draw = spans
    ? {
      width: `${(spans[0] / peak) * 64}px`,
      height: `${(spans[1] / peak) * 64}px`,
      depth: `${(spans[2] / peak) * 28}px`,
    }
    : null;

  return (
    <div className="catalog-inspection" data-ready={ready ? "" : undefined} data-selected={selected ? "" : undefined}>
      <section className="catalog-plate">
        <div className="catalog-plate-head">
          <div>
            <p className="catalog-inspection-id">{continuationId}</p>
            <p className="catalog-inspection-name">{archetypeName}</p>
            {!ready ? <p className="catalog-inspection-note">Reading the stored record</p> : null}
            {ready && reading ? <p className="catalog-inspection-note">Solidified record</p> : null}
            {ready && !reading ? <p className="catalog-inspection-note">Solidification record unavailable</p> : null}
          </div>
          {status ? <span className="catalog-stamp" data-status={status === "Validated" ? "validated" : "review"}>{status}</span> : null}
        </div>
        {draw && spans ? (
          <div className="catalog-measure" aria-label="Bounding box">
            <span className="catalog-cube" style={{ width: draw.width, height: draw.height }} aria-hidden="true">
              <i className="catalog-cube-top" />
              <i className="catalog-cube-front" />
              <i className="catalog-cube-side" style={{ width: draw.depth }} />
            </span>
            <div className="catalog-axes">
              {spans.map((span, index) => (
                <p key={AXES[index]}>
                  <span>{AXES[index]}</span>
                  <strong>{span.toFixed(1)}</strong>
                  <em>ft</em>
                </p>
              ))}
            </div>
          </div>
        ) : null}
      </section>
      {reading ? (
        <section className="catalog-plate">
          <div className="catalog-reading">
            {mass != null ? (
              <p className="catalog-mass">
                <span className="catalog-column" aria-hidden="true"><i style={{ height: `${mass * 100}%` }} /></span>
                <span>Mass {Math.round(mass * 100)}%</span>
              </p>
            ) : null}
            <div>
              {reading.signedVolume != null ? (
                <p className="catalog-inspection-volume">
                  <strong>{Math.round(reading.signedVolume).toLocaleString("en-US")}</strong>
                  <span>ft³</span>
                </p>
              ) : null}
              <ul className="catalog-checks">
                {reading.boundaryEdges != null ? (
                  <li><i data-mark={reading.boundaryEdges === 0 ? "pass" : "review"} />{reading.boundaryEdges === 0 ? "Closed shell" : "Open boundary"}</li>
                ) : null}
                {reading.components != null ? (
                  <li><i data-mark="part" />{reading.components === 1 ? "One component" : `${reading.components} components`}</li>
                ) : null}
                {reading.manifold != null ? (
                  <li><i data-mark={reading.manifold === "PASS" ? "pass" : "review"} />{reading.manifold === "PASS" ? "Manifold" : "Not manifold"}</li>
                ) : null}
              </ul>
            </div>
          </div>
        </section>
      ) : null}
      <button
        type="button"
        className="catalog-advance"
        onClick={selected ? launchCatalogFlight : undefined}
      >
        Include in the final catalog
      </button>
      <button type="button" className="vertical-catalogue-reset" onClick={onBack}>Back to catalogue</button>
    </div>
  );
}
