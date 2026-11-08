"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { TYPOLOGIES, defaultRatings, groupsForArchetype } from "@/lib/catalog";
import { ratingLabel } from "@/lib/physarum";
import type { ChapterContent } from "@/components/demo-workflow/demo-chapter";
import { LabRun } from "@/components/demo-workflow/lab-run";
import { OptimizationStage } from "@/components/demo-workflow/optimization-stage";
import { SelectedCatalog } from "@/components/demo-workflow/selected-catalog";
import styles from "@/components/demo-workflow/generative-chapter.module.css";

const ARCHETYPE = "vertical-void";

const CATALOG_ARCHETYPES = TYPOLOGIES.flatMap((typology) =>
  typology.archetypes.map((item) => ({ id: item.id, name: item.name, typology: typology.id, typologyLabel: typology.label })),
);
const CATALOG_ORDER = [
  ...CATALOG_ARCHETYPES.filter((item) => item.id === ARCHETYPE),
  ...CATALOG_ARCHETYPES.filter((item) => item.id !== ARCHETYPE),
];

/** Same fit the Physarum Logic catalog uses, so a sparse plate fills its cell. */
function contentScale(img: HTMLImageElement) {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx || !img.naturalWidth || !img.naturalHeight) return 1;
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, size, size);
  const ratio = img.naturalWidth / img.naturalHeight;
  const dw = ratio > 1 ? size : size * ratio;
  const dh = ratio > 1 ? size / ratio : size;
  ctx.drawImage(img, (size - dw) / 2, (size - dh) / 2, dw, dh);
  const data = ctx.getImageData(0, 0, size, size).data;
  let minX = size;
  let minY = size;
  let maxX = 0;
  let maxY = 0;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const pixel = (y * size + x) * 4;
      if (data[pixel] + data[pixel + 1] + data[pixel + 2] <= 40) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < minX) return 1;
  const fill = Math.max(maxX - minX + 1, maxY - minY + 1) / size;
  return Math.min(1, 0.78 / fill);
}

function CatalogPlate({ src }: { src: string }) {
  const [scale, setScale] = useState(1);
  return (
    <span className={styles.iterationCell}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" decoding="async" style={{ transform: `scale(${scale})` }} onLoad={(event) => setScale(contentScale(event.currentTarget))} />
    </span>
  );
}

/** The locked criteria for the demonstrated archetype. */
function criteriaFor(archetypeId: string) {
  const typology = TYPOLOGIES.find((item) => item.archetypes.some((entry) => entry.id === archetypeId)) ?? TYPOLOGIES[0];
  const archetype = typology.archetypes.find((entry) => entry.id === archetypeId) ?? typology.archetypes[0];
  return groupsForArchetype(typology.id, archetype, defaultRatings(archetype));
}

function HudSlider({ label, aside, value, min, max }: { label: string; aside?: string; value: number; min: number; max: number }) {
  const span = max - min;
  const share = span === 0 ? 0 : Math.max(0, Math.min(100, ((value - min) / span) * 100));
  return (
    <p className={styles.hud} style={{ "--share": `${share}%` } as CSSProperties}>
      <span>{label}{aside ? <b>{aside}</b> : null}</span>
      <i aria-hidden="true" />
    </p>
  );
}

function CriteriaConfiguration() {
  const groups = useMemo(() => criteriaFor(ARCHETYPE), []);
  return (
    <div className={styles.labPanel}>
      {groups.map((group) => (
        <div key={group.id} className={styles.criteriaGroup}>
          <p className={styles.groupName}>{group.title}</p>
          <p className={styles.groupSub}>{group.subtitle}</p>
          {group.criteria.map((item) => (
            <HudSlider key={item.id} label={item.label} aside={ratingLabel(item.rating)} value={item.rating} min={0} max={2} />
          ))}
          <p className={styles.scale}><span>Low</span><span>Medium</span><span>High</span></p>
          <p className={styles.descriptor}><span>{group.title} descriptor</span> {group.descriptor}</p>
        </div>
      ))}
    </div>
  );
}

/** The Physarum Logic catalog: every saved Skill 1 iteration for one archetype, then the next. */
function FirstPopulation() {
  const [index, setIndex] = useState(0);
  const [held, setHeld] = useState(false);
  const [images, setImages] = useState<string[]>([]);
  const [loadedId, setLoadedId] = useState("");
  const [status, setStatus] = useState<"loading" | "ready" | "missing">("loading");
  const active = CATALOG_ORDER[index] ?? CATALOG_ORDER[0];
  const visible = loadedId === active.id ? images : [];
  useEffect(() => {
    if (held || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => {
      setIndex((current) => (current >= CATALOG_ORDER.length - 1 ? current : current + 1));
    }, 3400);
    return () => window.clearInterval(id);
  }, [held]);
  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetch(`/demo/skill1/${active.id}/entries.json`, { signal: controller.signal });
        if (!response.ok) throw new Error(String(response.status));
        const entries = (await response.json()) as { image?: string }[];
        const next = entries.map((entry) => entry.image).filter((src): src is string => Boolean(src));
        if (controller.signal.aborted) return;
        setImages(next);
        setLoadedId(active.id);
        setStatus(next.length ? "ready" : "missing");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setImages([]);
        setStatus("missing");
      }
    };
    void load();
    return () => controller.abort();
  }, [active.id]);
  const choose = (id: string) => {
    const next = CATALOG_ORDER.findIndex((item) => item.id === id);
    if (next < 0) return;
    setHeld(true);
    setIndex(next);
  };
  return (
    <div className={styles.skillCatalog}>
      <div className={styles.catalogHead}>
        <p className={styles.catalogIdentity}>
          {active.name}
          <span>{visible.length ? `${visible.length} iterations` : status === "missing" ? "Catalog plates are not stored" : "Loading saved plates"}</span>
        </p>
        <div className={styles.catalogTabs}>
          {TYPOLOGIES.map((typology) => (
            <button key={typology.id} type="button" aria-pressed={typology.id === active.typology} onClick={() => choose(typology.archetypes[0]?.id ?? active.id)}>
              {typology.label}
            </button>
          ))}
        </div>
      </div>
      <div className={styles.catalogTabs}>
        {TYPOLOGIES.find((item) => item.id === active.typology)?.archetypes.map((item) => (
          <button key={item.id} type="button" aria-pressed={item.id === active.id} onClick={() => choose(item.id)}>
            {item.name}
          </button>
        ))}
      </div>
      <div className={styles.iterationSheet} style={{ "--cols": 20 } as CSSProperties}>
        {visible.map((src) => (
          <CatalogPlate key={src} src={src} />
        ))}
      </div>
    </div>
  );
}

/** Chapter 02: Physarum logic, the first population, optimization, then the selected candidates. */
export function useGenerativeContent(): ChapterContent {
  return useMemo(() => ({
    visuals: [],
    details: [],
    boards: [
      {
        layout: styles.logic,
        details: [
          <CriteriaConfiguration key="criteria" />,
          <div key="lab" className={styles.labBay}>
            <LabRun watch />
          </div>,
        ],
      },
      {
        layout: styles.open,
        details: [<FirstPopulation key="population" />],
      },
      {
        layout: styles.optPage,
        details: [<OptimizationStage key="optimization" />],
      },
      {
        layout: styles.optPage,
        details: [<SelectedCatalog key="selected" />],
      },
    ],
  }), []);
}
