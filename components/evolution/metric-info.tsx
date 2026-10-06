"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type ExplainSection = { label: string; text: string };

export function MetricInfo({ label, sections }: { label: string; sections: ExplainSection[] }) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | null>(null);
  const pinned = useRef(false);
  const token = useRef(Symbol());
  const [open, setOpen] = useState(false);
  const [placed, setPlaced] = useState(false);
  const [box, setBox] = useState({ top: 0, left: 0, fontSize: "16px" });

  const clearClose = () => {
    if (closeTimer.current != null) window.clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  const show = () => {
    clearClose();
    window.dispatchEvent(new CustomEvent("pareto-info-open", { detail: token.current }));
    setOpen(true);
  };
  const hide = () => {
    clearClose();
    closeTimer.current = window.setTimeout(() => {
      if (!pinned.current) setOpen(false);
    }, 140);
  };

  useEffect(() => {
    const onOther = (event: Event) => {
      if ((event as CustomEvent<symbol>).detail === token.current) return;
      pinned.current = false;
      setOpen(false);
    };
    window.addEventListener("pareto-info-open", onOther);
    return () => window.removeEventListener("pareto-info-open", onOther);
  }, []);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !panelRef.current) return;
    const place = () => {
      const trigger = triggerRef.current;
      const panel = panelRef.current;
      if (!trigger || !panel) return;
      const triggerBox = trigger.getBoundingClientRect();
      const panelBox = panel.getBoundingClientRect();
      const margin = 10;
      let top = triggerBox.top - panelBox.height - margin;
      let left = triggerBox.left;
      if (top < margin) top = triggerBox.bottom + margin;
      if (left + panelBox.width > window.innerWidth - margin) left = window.innerWidth - margin - panelBox.width;
      if (left < margin) left = margin;
      if (top + panelBox.height > window.innerHeight - margin) top = Math.max(margin, window.innerHeight - margin - panelBox.height);
      const page = document.querySelector(".evo-page");
      const fontSize = page ? getComputedStyle(page).fontSize : "16px";
      setBox({ top, left, fontSize });
      setPlaced(true);
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, label]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      pinned.current = false;
      setOpen(false);
      triggerRef.current?.focus();
    };
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      pinned.current = false;
      setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  useEffect(() => () => clearClose(), []);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="pareto-info"
        data-open={open || undefined}
        aria-expanded={open}
        aria-label={`About ${label}`}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={(event) => {
          if (panelRef.current?.contains(event.relatedTarget as Node)) return;
          hide();
        }}
        onClick={() => {
          const next = !pinned.current;
          pinned.current = next;
          clearClose();
          if (next) show();
          else setOpen(false);
        }}
      >
        i
      </button>
      {open
        ? createPortal(
            <div
              ref={panelRef}
              className="pareto-explain"
              role="dialog"
              aria-label={label}
              style={{ top: box.top, left: box.left, fontSize: box.fontSize, visibility: placed ? "visible" : "hidden" }}
              onMouseEnter={show}
              onMouseLeave={hide}
            >
              <p className="pareto-explain-title">{label}</p>
              <dl>
                {sections.map((section) => (
                  <div key={section.label}>
                    <dt>{section.label}</dt>
                    <dd>{section.text}</dd>
                  </div>
                ))}
              </dl>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
