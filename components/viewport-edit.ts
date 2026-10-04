export const VIEWPORT_INTERACTIVE =
  "a, button, input, textarea, select, label, summary, [contenteditable='true']";

const MIN_ZOOM = 0.4;
const MAX_ZOOM = 4;
/** Continuous gain for sub-notch deltas (trackpad pixel streams). */
const WHEEL_GAIN = 0.0015;
/**
 * One mouse detent on this machine is deltaY ±100 (wheelDelta ±120).
 * Two of those detents double the scale. Smaller deltas stay on WHEEL_GAIN.
 */
const NOTCH_PX = 100;
const NOTCH_EXPONENT = Math.log(Math.SQRT2);

export type Viewport = { scale: number; x: number; y: number };
type PinchEvent = Event & { scale: number; clientX: number; clientY: number };

export const IDENTITY_VIEWPORT: Viewport = { scale: 1, x: 0, y: 0 };

function clampZoom(value: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

function eventInShell(shell: HTMLElement, target: EventTarget | null) {
  return target instanceof Node && shell.contains(target);
}

/** Pixel delta for one wheel event, matching the original deltaMode normalization. */
function wheelPixels(event: WheelEvent) {
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1;
  return event.deltaY * unit;
}

/**
 * Mouse detents are exact multiples of 100px. Trackpad events are smaller or
 * fractional, so they keep the continuous gain instead of snapping to a step.
 */
function wheelScale(event: WheelEvent) {
  const pixels = wheelPixels(event);
  const steps = pixels / NOTCH_PX;
  const nearest = Math.round(steps);
  const isNotch = !event.ctrlKey && Math.abs(pixels) >= NOTCH_PX && Math.abs(steps - nearest) < 0.001;
  return Math.exp(isNotch ? -nearest * NOTCH_EXPONENT : -pixels * WHEEL_GAIN);
}

export function isViewportInteractive(target: EventTarget | null, selector = VIEWPORT_INTERACTIVE) {
  return target instanceof Element && Boolean(target.closest(selector));
}

/**
 * Editor viewport only. Scale and pan live on the canvas transform and are
 * never written into layout, stored positions, or the fitted frame size.
 */
export function applyViewport(canvas: HTMLElement, view: Viewport, resetButton: HTMLButtonElement | null) {
  const identity = view.scale === 1 && view.x === 0 && view.y === 0;
  canvas.style.transform = identity ? "" : `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
  if (resetButton) {
    if (identity) resetButton.removeAttribute("data-active");
    else resetButton.dataset.active = "true";
  }
}

export function zoomViewportAt(canvas: HTMLElement, view: Viewport, clientX: number, clientY: number, nextScale: number) {
  const next = clampZoom(nextScale);
  const rect = canvas.getBoundingClientRect();
  if (view.scale <= 0 || rect.width < 1 || rect.height < 1) return;
  const px = clientX - rect.left;
  const py = clientY - rect.top;
  view.x += px * (1 - next / view.scale);
  view.y += py * (1 - next / view.scale);
  view.scale = next;
}

export function resetViewport(canvas: HTMLElement, view: Viewport, resetButton: HTMLButtonElement | null) {
  view.scale = 1;
  view.x = 0;
  view.y = 0;
  applyViewport(canvas, view, resetButton);
}

/**
 * Shared Classroom / Lab Presentation editor. Identity clears the transform,
 * which restores the already-fitted frame.
 */
export function bindViewportEdit(options: {
  shell: HTMLElement;
  canvas: HTMLElement;
  view: Viewport;
  resetButton: { current: HTMLButtonElement | null };
  onExit: () => void;
  interactiveSelector?: string;
}) {
  const { shell, canvas, view, resetButton, onExit, interactiveSelector } = options;
  const kept = shell.scrollTop;
  shell.dataset.siteEdit = "on";
  shell.scrollTop = kept;
  const hold = window.requestAnimationFrame(() => {
    shell.scrollTop = kept;
  });

  let drag: { id: number; x: number; y: number; ox: number; oy: number } | null = null;
  let pinchBase = view.scale;
  let gesturing = false;

  const paint = () => applyViewport(canvas, view, resetButton.current);

  const onWheel = (event: WheelEvent) => {
    if (!eventInShell(shell, event.target)) return;
    event.preventDefault();
    if (event.ctrlKey && gesturing) return;
    zoomViewportAt(canvas, view, event.clientX, event.clientY, view.scale * wheelScale(event));
    paint();
  };

  const onGestureStart = (event: Event) => {
    if (!eventInShell(shell, event.target)) return;
    event.preventDefault();
    gesturing = true;
    pinchBase = view.scale;
  };

  const onGestureChange = (event: Event) => {
    if (!eventInShell(shell, event.target)) return;
    event.preventDefault();
    const pinch = event as PinchEvent;
    zoomViewportAt(canvas, view, pinch.clientX, pinch.clientY, pinchBase * pinch.scale);
    paint();
  };

  const onGestureEnd = (event: Event) => {
    if (!eventInShell(shell, event.target)) return;
    event.preventDefault();
    gesturing = false;
  };

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0 && event.button !== 1) return;
    if (!eventInShell(shell, event.target)) return;
    if (event.button === 0 && isViewportInteractive(event.target, interactiveSelector)) return;
    event.preventDefault();
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, ox: view.x, oy: view.y };
    try {
      shell.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic or already-released pointers can reject capture. Drag still tracks the shell.
    }
    shell.dataset.panning = "on";
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!drag || drag.id !== event.pointerId) return;
    view.x = drag.ox + (event.clientX - drag.x);
    view.y = drag.oy + (event.clientY - drag.y);
    paint();
  };

  const endPan = (event: PointerEvent) => {
    if (!drag || drag.id !== event.pointerId) return;
    drag = null;
    shell.removeAttribute("data-panning");
  };

  const onKey = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    onExit();
  };

  window.addEventListener("wheel", onWheel, { capture: true, passive: false });
  shell.addEventListener("pointerdown", onPointerDown);
  shell.addEventListener("pointermove", onPointerMove);
  shell.addEventListener("pointerup", endPan);
  shell.addEventListener("pointercancel", endPan);
  shell.addEventListener("gesturestart", onGestureStart);
  shell.addEventListener("gesturechange", onGestureChange);
  shell.addEventListener("gestureend", onGestureEnd);
  window.addEventListener("keydown", onKey);
  paint();

  return () => {
    window.cancelAnimationFrame(hold);
    window.removeEventListener("wheel", onWheel, { capture: true });
    shell.removeEventListener("pointerdown", onPointerDown);
    shell.removeEventListener("pointermove", onPointerMove);
    shell.removeEventListener("pointerup", endPan);
    shell.removeEventListener("pointercancel", endPan);
    shell.removeEventListener("gesturestart", onGestureStart);
    shell.removeEventListener("gesturechange", onGestureChange);
    shell.removeEventListener("gestureend", onGestureEnd);
    window.removeEventListener("keydown", onKey);
    shell.removeAttribute("data-panning");
    shell.removeAttribute("data-site-edit");
    canvas.style.transform = "";
    view.scale = 1;
    view.x = 0;
    view.y = 0;
    resetButton.current?.removeAttribute("data-active");
    shell.scrollTop = kept;
  };
}
