"use client";

import Link from "next/link";
import { GenerativeSystemTracks } from "@/components/home-generative-system";
import { PrecedentDiagram } from "@/components/home-precedent";
import { WorkflowLightCircles, WorkflowLightFilter } from "@/components/workflow-light";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from "react";
import {
  WORKFLOW_BOARD_STOPS,
  WORKFLOW_CARD,
  WORKFLOW_LIGHT,
  WORKFLOW_LINK,
  WORKFLOW_STAGES,
  WORKFLOW_WORLD,
  cardRect,
  frameCamera,
  frameRadius,
  frameRoute,
  glide,
  macroBounds,
  connectorPath,
  OVERVIEW_FILL,
  macroCenterT,
  macroPose,
  macroRouteDuration,
  mixCamera,
  toScreen,
  workflowStage,
  type Camera,
  type WorkflowStage,
  type WorkflowTone,
} from "@/lib/home-workflow-camera";

const DETAIL_FILL = 0.98;
const MOTION = { zoomIn: 1560, zoomOut: 1480, bridge: 3200 };

type Chrome = { id: string | null; settled: boolean };

function reduced() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export const WORKFLOW_OVERVIEW_EVENT = "lm-workflow-overview";

export function HomeWorkflowPrototype() {
  const router = useRouter();
  const stageRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<SVGGElement>(null);
  const [chrome, setChrome] = useState<Chrome>({ id: null, settled: false });
  const api = useRef<{
    open: (id: string) => void;
    overview: () => void;
    next: () => void;
    previous: () => void;
    advance: () => void;
  } | null>(null);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    const world = worldRef.current;
    const dot = dotRef.current;
    const root = stage?.closest<HTMLElement>(".wf-proto");
    if (!stage || !world || !dot || !root) return;

    const circles = [...dot.querySelectorAll("circle")];
    const cards = new Map<string, HTMLElement>();
    const spine = stage.querySelector<SVGElement>(".wf-proto-spine");
    const layer = stage.querySelector<HTMLElement>(".wf-board-layer");
    const controls = stage.querySelector<HTMLElement>(".wf-proto-controls");
    const section = stage.closest<HTMLElement>("#workflow");
    const macroFace = section?.querySelector<HTMLElement>(".wf-heading-face.is-macro");
    const detailFace = section?.querySelector<HTMLElement>(".wf-heading-face.is-detail");
    const labelEl = section?.querySelector<HTMLElement>("[data-wf-label]");
    const indexEl = section?.querySelector<HTMLElement>("[data-wf-index]");
    stage.querySelectorAll<HTMLElement>("[data-stage]").forEach((node) => {
      const id = node.dataset.stage;
      if (id) cards.set(id, node);
    });

    let camera: Camera = { x: 0, y: 0, scale: 1 };
    let macroT = 0;
    let idleDir = 1;
    let focusId: string | null = null;
    let settled = false;
    let busy = false;
    let visible = true;
    let away = false;
    let motion = 0;
    let frameOpacity = 1;
    let lastId: string | null = null;
    let frame = 0;
    let last = performance.now();
    let alive = true;

    const viewSize = () => ({ w: stage.clientWidth, h: stage.clientHeight });
    const macroCamera = () => frameCamera(viewSize().w, viewSize().h, macroBounds(), OVERVIEW_FILL);
    const detailCamera = (item: WorkflowStage) => frameCamera(viewSize().w, viewSize().h, cardRect(item), DETAIL_FILL);
    const stopAt = (id: string) => macroCenterT(id);

    const zoomOf = (focus: WorkflowStage | null) => {
      if (!focus) return 0;
      const macro = macroCamera().scale;
      const detail = detailCamera(focus).scale;
      if (macro <= 0 || detail <= macro || camera.scale <= 0) return 0;
      const amount = Math.log(camera.scale / macro) / Math.log(detail / macro);
      return Math.min(1, Math.max(0, amount));
    };

    const paint = () => {
      world.style.transform = `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})`;
      world.style.setProperty("--wf-inv", camera.scale > 0 ? String(1 / camera.scale) : "1");
      const focus = focusId ? workflowStage(focusId) : null;
      const depth = settled ? 1 : zoomOf(focus);
      const cover = settled ? 1 : glide(Math.min(1, Math.max(0, (depth - 0.8) / 0.2)));

      if (spine) spine.style.opacity = (busy ? frameOpacity : 1 - depth).toFixed(3);
      const pose = macroPose(macroT);
      cards.forEach((node, id) => {
        const onFrame = pose.nodeId === id && pose.phase === "frame";
        node.classList.toggle("is-lit", !busy && onFrame && depth < 0.35);
        node.classList.toggle("is-focus", false);
        const shown = id === focusId ? 1 - depth * 0.35 : 1 - depth;
        node.style.opacity = (busy ? frameOpacity : shown).toFixed(3);
      });
      const stageBox = stage.getBoundingClientRect();
      const headBox = section?.querySelector("[data-wf-heading]")?.getBoundingClientRect();
      const titleSize = labelEl ? parseFloat(getComputedStyle(labelEl).fontSize) : 24;
      const shell = root.closest<HTMLElement>(".site-shell");
      const classroom = shell?.getAttribute("data-site-display") === "classroom";
      const fitted = cardRect(WORKFLOW_STAGES[0]).w * macroCamera().scale / 12;
      let nameSize = Math.max(8, Math.min(15, fitted, titleSize * 0.58));
      if (classroom && shell) {
        const frame = shell.clientHeight || stage.clientHeight;
        nameSize = Math.min(frame * 0.014, titleSize * 0.476);
      }
      const lift = focusId ? glide(depth) : 0;
      root.querySelectorAll<HTMLElement>("[data-floating-label]").forEach((label) => {
        const id = label.dataset.floatingLabel;
        const item = id ? workflowStage(id) : null;
        if (!item) return;
        const rect = cardRect(item);
        const local = toScreen({ x: rect.x, y: rect.y }, camera);
        const cardX = local.x;
        const cardY = local.y;
        const cardW = rect.w * camera.scale;
        const cardH = rect.h * camera.scale;
        const rise = id === focusId ? depth : 0;
        const up = glide(Math.min(1, rise / 0.45));
        const across = glide(Math.min(1, Math.max(0, (rise - 0.4) / 0.6)));
        const fromX = cardX;
        const fromY = cardY + Math.max(0, cardH - nameSize * 2.4);
        const headX = headBox ? headBox.left - stageBox.left : fromX;
        const headY = headBox ? headBox.top - stageBox.top : fromY;
        const x = fromX + (headX - fromX) * across;
        const y = fromY + (headY - fromY) * up;
        const rising = up > 0.12;
        const onFrame = pose.nodeId === id && pose.phase === "frame";
        label.classList.toggle("is-rising", rising);
        label.classList.toggle("is-lit", !busy && onFrame && depth < 0.35);
        label.style.width = rising ? "auto" : `${Math.max(0, cardW).toFixed(1)}px`;
        label.style.height = rising ? "auto" : `${Math.max(0, cardH).toFixed(1)}px`;
        label.style.transform = rising
          ? `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`
          : `translate(${cardX.toFixed(1)}px, ${cardY.toFixed(1)}px)`;
        label.style.fontSize = `${(nameSize + (titleSize - nameSize) * Math.min(1, rise)).toFixed(2)}px`;
        label.style.opacity = id === focusId ? "1" : (1 - lift).toFixed(3);
        label.querySelector(".wf-proto-index")?.classList.toggle("is-copper", item.order % 2 === 0);
      });
      if (layer) {
        layer.style.opacity = cover.toFixed(3);
        layer.style.visibility = cover > 0.02 ? "visible" : "hidden";
      }
      if (controls) {
        controls.style.opacity = cover.toFixed(3);
        controls.style.pointerEvents = "none";
      }
      if (macroFace) {
        const leave = settled ? 1 : glide(Math.min(1, Math.max(0, (depth - 0.08) / 0.34)));
        macroFace.style.opacity = (1 - leave).toFixed(3);
        macroFace.style.transform = `translateX(${(-56 * leave).toFixed(1)}px)`;
        macroFace.setAttribute("aria-hidden", leave > 0.55 ? "true" : "false");
      }
      if (detailFace) {
        detailFace.style.opacity = settled ? "1" : "0";
        detailFace.setAttribute("aria-hidden", settled ? "false" : "true");
      }
      if (focus && labelEl) labelEl.textContent = focus.label;
      if (focus && indexEl) {
        indexEl.textContent = String(focus.order).padStart(2, "0");
        indexEl.classList.toggle("is-copper", focus.order % 2 === 0);
      }

      const trailSpan = 1 / Math.max(1, macroRouteDuration());
      const samples = WORKFLOW_LIGHT.trailMs.map((ms) => macroPose(Math.min(1, Math.max(0, macroT - ms * trailSpan * idleDir))));
      const boost = pose.phase === "frame" ? 1.12 : 1;
      dot.style.opacity = busy ? "0" : (1 - depth).toFixed(3);
      dot.dataset.tone = focus && depth > 0.45 ? focus.tone : toneAt(macroT);
      dot.dataset.phase = pose.phase;
      dot.removeAttribute("clip-path");
      circles.forEach((circle, index) => {
        const at = toScreen(samples[index].point, camera);
        circle.setAttribute("cx", at.x.toFixed(1));
        circle.setAttribute("cy", at.y.toFixed(1));
        circle.setAttribute("r", (WORKFLOW_LIGHT.radii[index] * boost).toFixed(2));
        circle.setAttribute("opacity", String(WORKFLOW_LIGHT.opacity[index]));
      });
    };

    const tween = (ms: number, step: (t: number) => void, ease: (t: number) => number = glide) =>
      new Promise<void>((resolve) => {
        const ticket = motion;
        const length = reduced() ? 0 : ms;
        if (!alive || ticket !== motion) return resolve();
        if (length <= 0) {
          step(1);
          paint();
          resolve();
          return;
        }
        const start = performance.now();
        const run = (now: number) => {
          if (!alive || ticket !== motion) return resolve();
          const t = Math.min(1, (now - start) / length);
          step(ease(t));
          paint();
          if (t < 1) requestAnimationFrame(run);
          else resolve();
        };
        requestAnimationFrame(run);
      });

    const revealMacro = () => {
      settled = false;
      delete root.dataset.settled;
    };

    const settleDetail = (id: string) => {
      lastId = id;
      focusId = id;
      macroT = stopAt(id);
      camera = detailCamera(workflowStage(id) as WorkflowStage);
      settled = true;
      root.dataset.settled = "detail";
      paint();
      setChrome({ id, settled: true });
    };

    const settleMacro = (id: string | null) => {
      focusId = null;
      settled = false;
      delete root.dataset.settled;
      camera = macroCamera();
      idleDir = 1;
      if (id) macroT = stopAt(id);
      paint();
      setChrome({ id: null, settled: false });
    };

    const restart = () => {
      motion += 1;
      busy = false;
      lastId = null;
      idleDir = 1;
      macroT = 0;
      focusId = null;
      settled = false;
      delete root.dataset.settled;
      camera = macroCamera();
      frameOpacity = 1;
      paint();
      setChrome({ id: null, settled: false });
    };

    const open = async (id: string) => {
      if (busy || settled || !workflowStage(id)) return;
      const ticket = motion;
      busy = true;
      focusId = id;
      setChrome({ id, settled: false });
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      if (!alive || ticket !== motion) return;
      const fromCamera = { ...camera };
      const fromT = macroT;
      const targetCam = detailCamera(workflowStage(id) as WorkflowStage);
      const view = viewSize();
      await tween(
        MOTION.zoomIn,
        (t) => {
          frameOpacity = 1 - glide(Math.min(1, t / 0.22));
          const zoom = glide(Math.min(1, Math.max(0, (t - 0.16) / 0.84)));
          camera = mixCamera(fromCamera, targetCam, zoom, view);
          macroT = fromT + (stopAt(id) - fromT) * zoom;
        },
        (t) => t,
      );
      if (!alive || ticket !== motion) return;
      busy = false;
      settleDetail(id);
    };

    const overview = async () => {
      if (!focusId) return;
      motion += 1;
      const ticket = motion;
      const id = focusId;
      busy = true;
      revealMacro();
      setChrome({ id, settled: false });
      const fromCamera = { ...camera };
      const view = viewSize();
      const macro = macroCamera();
      await tween(
        MOTION.zoomOut,
        (t) => {
          frameOpacity = t;
          camera = mixCamera(fromCamera, macro, t, view);
        },
      );
      if (!alive || ticket !== motion) return;
      busy = false;
      settleMacro(id);
    };

    const travel = async (targetId: string) => {
      if (busy || !focusId || !workflowStage(targetId)) return;
      const ticket = motion;
      const current = focusId;
      const target = workflowStage(targetId) as WorkflowStage;
      busy = true;
      revealMacro();
      setChrome({ id: current, settled: false });
      macroT = stopAt(current);
      const startCam = { ...camera };
      const view = viewSize();
      const fromT = macroT;
      const toT = stopAt(targetId);
      let handed = false;
      await tween(
        MOTION.bridge,
        (u) => {
          const macro = macroCamera();
          const endCam = detailCamera(target);
          if (u < 0.42) {
            camera = mixCamera(startCam, macro, glide(u / 0.42), view);
            frameOpacity = 1;
          } else if (u < 0.56) {
            camera = macro;
            frameOpacity = 1 - glide((u - 0.42) / 0.14);
          } else {
            camera = mixCamera(macro, endCam, glide((u - 0.56) / 0.44), view);
            frameOpacity = 0;
            if (!handed) {
              handed = true;
              focusId = targetId;
              setChrome({ id: targetId, settled: false });
            }
          }
          macroT = fromT + (toT - fromT) * u;
        },
        (t) => t,
      );
      if (!alive || ticket !== motion) return;
      busy = false;
      settleDetail(targetId);
    };

    const presentation = () => stage.closest<HTMLElement>(".site-shell")?.dataset.siteDisplay === "classroom";

    api.current = {
      open,
      overview,
      next: () => {
        if (busy) return;
        const item = focusId ? workflowStage(focusId) : null;
        if (item?.next) void travel(item.next);
      },
      previous: () => {
        if (busy) return;
        const item = focusId ? workflowStage(focusId) : null;
        if (item?.previous) void travel(item.previous);
        else if (focusId) void overview();
      },
      advance: () => {
        if (busy) return;
        if (settled && focusId) {
          const item = workflowStage(focusId);
          if (item?.next) void travel(item.next);
          return;
        }
        if (!focusId) {
          const nextId = lastId ? workflowStage(lastId)?.next : WORKFLOW_STAGES[0]?.id;
          if (nextId) void open(nextId);
        }
      },
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.repeat || !visible || !presentation()) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (event.key === "ArrowRight") {
        event.preventDefault();
        api.current?.advance();
      } else if (event.key === " ") {
        if (target?.closest("a, button")) return;
        event.preventDefault();
        api.current?.advance();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        api.current?.previous();
      } else if (event.key === "Escape") {
        event.preventDefault();
        void api.current?.overview();
      }
    };
    window.addEventListener("keydown", onKey);
    const onOverviewRequest = () => {
      void overview();
    };
    window.addEventListener(WORKFLOW_OVERVIEW_EVENT, onOverviewRequest);

    const loop = (now: number) => {
      if (!alive) return;
      const dt = Math.min(48, now - last);
      last = now;
      if (!busy && !focusId && visible && !reduced()) {
        macroT += (dt / macroRouteDuration()) * idleDir;
        if (macroT >= 1) {
          macroT = 1;
          idleDir = -1;
        } else if (macroT <= 0) {
          macroT = 0;
          idleDir = 1;
        }
        paint();
      }
      frame = requestAnimationFrame(loop);
    };

    camera = macroCamera();
    paint();
    frame = requestAnimationFrame(loop);
    const observer = new ResizeObserver(() => {
      if (busy) return;
      camera = focusId ? detailCamera(workflowStage(focusId) as WorkflowStage) : macroCamera();
      paint();
    });
    observer.observe(stage);
    const shell = stage.closest<HTMLElement>(".site-shell");
    let intersection: IntersectionObserver | null = null;
    const connect = () => {
      intersection?.disconnect();
      if (!section) return;
      const rootView = shell?.dataset.siteDisplay === "classroom" ? shell : section.closest(".site-main");
      intersection = new IntersectionObserver(
        (entries) => {
          const entry = entries[entries.length - 1];
          const rootHeight = entry?.rootBounds?.height ?? 0;
          const seen = entry?.intersectionRect.height ?? 0;
          const ratio = rootHeight > 0 ? seen / rootHeight : 0;
          visible = ratio >= 0.45;
          if (rootHeight > 0 && ratio < 0.08) {
            if (!away) {
              away = true;
              restart();
            }
          } else if (visible) {
            away = false;
          }
        },
        { root: rootView, threshold: Array.from({ length: 11 }, (_, index) => index / 10) },
      );
      intersection.observe(section);
    };
    connect();
    const displayObserver = new MutationObserver(connect);
    if (shell) displayObserver.observe(shell, { attributes: true, attributeFilter: ["data-site-display"] });

    return () => {
      alive = false;
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(WORKFLOW_OVERVIEW_EVENT, onOverviewRequest);
      cancelAnimationFrame(frame);
      observer.disconnect();
      intersection?.disconnect();
      displayObserver.disconnect();
      api.current = null;
    };
  }, []);

  const active = chrome.id ? workflowStage(chrome.id) : null;

  return (
    <div className="wf-proto" data-workflow-trial="spatial">
      <div
        className="wf-proto-stage"
        ref={stageRef}
      >
        <div className="wf-macro">
          <div
            className="wf-proto-world"
            ref={worldRef}
            style={{ width: WORKFLOW_WORLD.width, height: WORKFLOW_WORLD.height }}
          >
            <svg className="wf-proto-spine" viewBox={`0 0 ${WORKFLOW_WORLD.width} ${WORKFLOW_WORLD.height}`} aria-hidden="true">
              <defs>
                <linearGradient id="wf-spine-gradient" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={WORKFLOW_WORLD.width} y2="0">
                  <stop offset="0%" stopColor={WORKFLOW_LINK.from} />
                  <stop offset="100%" stopColor={WORKFLOW_LINK.to} />
                </linearGradient>
              </defs>
              <path d={connectorPath()} />
            </svg>
            {WORKFLOW_STAGES.map((stage) => {
              const rect = cardRect(stage);
              return (
                <button
                  key={stage.id}
                  type="button"
                  className="wf-proto-card wf-frame"
                  data-stage={stage.id}
                  data-tone={stage.tone}
                  style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h, borderRadius: WORKFLOW_CARD.radius }}
                  onClick={() => api.current?.open(stage.id)}
                >
                  <span className={stage.order % 2 === 0 ? "wf-proto-index is-copper" : "wf-proto-index"}>{String(stage.order).padStart(2, "0")}</span>
                  <span className="wf-proto-label">{stage.label}</span>
                </button>
              );
            })}
          </div>
          <svg className="wf-proto-dot" aria-hidden="true">
            <defs>
              <WorkflowLightFilter id="wf-proto-glow" />
            </defs>
            <g ref={dotRef} className="wf-proto-pulse" data-tone="neutral" filter="url(#wf-proto-glow)">
              <WorkflowLightCircles />
            </g>
          </svg>
        </div>

        <div className="wf-board-layer">
          {active ? (
            <WorkflowBoard key={active.id} stage={active} run={chrome.settled} />
          ) : null}
        </div>

        <div className="wf-proto-controls">
          <button type="button" className="wf-proto-overview" onClick={() => api.current?.overview()} disabled={!chrome.settled}>
            Overview
          </button>
          <button
            type="button"
            className="wf-proto-arrow is-prev"
            aria-label={active?.previous ? "Previous workflow" : "Zoom out to overview"}
            onClick={() => api.current?.previous()}
            disabled={!chrome.settled || !active}
          >
            <span aria-hidden="true">←</span>
          </button>
          {chrome.settled && active ? (
            <div className="wf-board-exits">
              {active.lab?.map((item) => (
                <Link
                  key={item.href}
                  className="wf-board-exit"
                  href={item.href}
                  onClick={(event) => enterLab(router, event, item.href)}
                >
                  <span>{item.label}</span>
                  <span aria-hidden="true">→</span>
                </Link>
              ))}
            </div>
          ) : null}
          {active?.next ? (
            <button
              type="button"
              className="wf-proto-arrow is-next"
              aria-label="Next workflow"
              onClick={() => api.current?.next()}
              disabled={!chrome.settled}
            >
              <span aria-hidden="true">→</span>
            </button>
          ) : null}
        </div>
      </div>
      <div className="wf-proto-labels" aria-hidden="true">
        {WORKFLOW_STAGES.map((stage) => (
          <span key={stage.id} className="wf-floating-label" data-floating-label={stage.id} data-tone={stage.tone}>
            <span className={stage.order % 2 === 0 ? "wf-proto-index is-copper" : "wf-proto-index"}>{String(stage.order).padStart(2, "0")}</span>
            <span className="wf-proto-label">{stage.label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function enterLab(router: { push: (href: string) => void }, event: MouseEvent<HTMLAnchorElement>, href: string) {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();
  const path = href.split("?")[0] ?? href;
  const stage = event.currentTarget.closest<HTMLElement>(".wf-proto-stage");
  if (!stage || reduced()) {
    router.push(href);
    return;
  }
  stage.dataset.handoff = "lab";
  const veil = document.createElement("div");
  veil.className = "lm-lab-veil";
  document.body.appendChild(veil);
  requestAnimationFrame(() => veil.classList.add("is-in"));
  window.setTimeout(() => {
    const started = performance.now();
    const finish = () => {
      veil.classList.remove("is-in");
      veil.classList.add("is-out");
      window.setTimeout(() => veil.remove(), 620);
    };
    const watch = () => {
      const current = window.location.pathname;
      if (current === path || current.startsWith(`${path}/`) || performance.now() - started > 2500) {
        finish();
        return;
      }
      requestAnimationFrame(watch);
    };
    router.push(href);
    requestAnimationFrame(watch);
  }, 700);
}

function WorkflowBoard({ stage, run }: { stage: WorkflowStage; run: boolean }) {
  const dotRef = useRef<SVGGElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const linked = stage.id !== "decomposition" && !stage.detailAsset;

  useEffect(() => {
    const dot = dotRef.current;
    const board = boardRef.current;
    const path = pathRef.current;
    if (!linked || !board || !path) return;
    const circles = [...(dot?.querySelectorAll("circle") ?? [])];
    const svg = path.ownerSVGElement;
    const dotSvg = dot?.ownerSVGElement ?? null;
    const gradient = svg?.querySelector("linearGradient");
    let route: ReturnType<typeof frameRoute> | null = null;
    let litId: string | null = null;
    let t = 0;
    let dir = 1;
    let duration = 16000;
    let frame = 0;
    let last = performance.now();
    let alive = true;
    const measure = () => {
      const width = board.clientWidth;
      const height = board.clientHeight;
      if (width < 2 || height < 2) return;
      const box = board.getBoundingClientRect();
      const frames = [...board.querySelectorAll<HTMLElement>(".wf-frame")].map((node) => {
        const rect = node.getBoundingClientRect();
        const radius = frameRadius(rect.width, rect.height);
        node.style.borderRadius = `${radius}px`;
        return {
          id: node.dataset.frame ?? "",
          center: { x: rect.left - box.left + rect.width / 2, y: rect.top - box.top + rect.height / 2 },
          width: rect.width,
          height: rect.height,
          radius,
        };
      });
      if (frames.length < 2) {
        route = null;
        return;
      }
      route = frameRoute(frames);
      duration = route.duration;
      const view = `0 0 ${width} ${height}`;
      svg?.setAttribute("viewBox", view);
      dotSvg?.setAttribute("viewBox", view);
      gradient?.setAttribute("x2", String(width));
      path.setAttribute("d", route.path);
    };
    const place = () => {
      if (!route) return;
      const pose = route.pose(t);
      const nextLit = pose.phase === "frame" ? pose.nodeId : null;
      if (nextLit !== litId) {
        board.querySelectorAll<HTMLElement>(".wf-frame.is-lit").forEach((node) => node.classList.remove("is-lit"));
        if (nextLit) board.querySelector(`[data-frame="${nextLit}"]`)?.classList.add("is-lit");
        litId = nextLit;
      }
      WORKFLOW_LIGHT.trailMs.forEach((ms, index) => {
        const circle = circles[index];
        if (!circle) return;
        const point = route!.pose(Math.min(1, Math.max(0, t - (ms / duration) * dir))).point;
        circle.setAttribute("cx", point.x.toFixed(2));
        circle.setAttribute("cy", point.y.toFixed(2));
      });
    };
    const loop = (now: number) => {
      if (!alive) return;
      const dt = Math.min(48, now - last);
      last = now;
      if (!reduced() && run && route) {
        t += (dt / duration) * dir;
        if (t >= 1) {
          t = 1;
          dir = -1;
        } else if (t <= 0) {
          t = 0;
          dir = 1;
        }
      }
      place();
      frame = requestAnimationFrame(loop);
    };
    measure();
    place();
    frame = requestAnimationFrame(loop);
    const observer = new ResizeObserver(() => {
      measure();
      place();
    });
    observer.observe(board);
    return () => {
      alive = false;
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [linked, run, stage.id]);

  return (
    <article className="wf-board" data-tone={stage.tone} ref={boardRef} aria-label={stage.label}>
      {stage.id === "decomposition" ? (
        <PrecedentDiagram />
      ) : stage.detailAsset ? (
        <>
          <img src={stage.detailAsset} alt="" />
          {stage.id === "generative-system" ? <GenerativeSystemTracks /> : null}
        </>
      ) : (
        <>
          <svg className="wf-board-path" aria-hidden="true">
            <defs>
              <linearGradient id="wf-board-gradient" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor={WORKFLOW_LINK.from} />
                <stop offset="100%" stopColor={WORKFLOW_LINK.to} />
              </linearGradient>
            </defs>
            <path ref={pathRef} />
          </svg>
          {WORKFLOW_BOARD_STOPS.map((stop, stopIndex) => (
            <span
              key={`${stage.id}-${stopIndex}`}
              className="wf-frame"
              data-frame={String(stopIndex)}
              data-tone={stage.tone}
              style={{ left: `${stop.x * 100}%`, top: `${stop.y * 100}%` }}
            />
          ))}
        </>
      )}
      {linked ? <svg className="wf-board-dot" aria-hidden="true" style={{ opacity: run ? 1 : 0 }}>
        <defs>
          <WorkflowLightFilter id="wf-board-glow" />
        </defs>
        <g ref={dotRef} className="wf-proto-pulse" data-tone={stage.tone} filter="url(#wf-board-glow)">
          <WorkflowLightCircles />
        </g>
      </svg> : null}
    </article>
  );
}

function toneAt(t: number): WorkflowTone {
  const index = WORKFLOW_STAGES.findIndex((stage, stageIndex) => {
    const next = WORKFLOW_STAGES[stageIndex + 1];
    return next == null || t < (macroCenterT(stage.id) + macroCenterT(next.id)) / 2;
  });
  return WORKFLOW_STAGES[Math.max(0, index)]?.tone ?? "neutral";
}
