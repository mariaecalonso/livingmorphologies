import type { ReactNode } from "react";

export function Panel({
  children,
  className = "",
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section className={`panel hud-panel overflow-hidden ${padded ? "p-3" : ""} ${className}`}>
      {children}
    </section>
  );
}

export function PanelHeader({
  kicker,
  title,
  aside,
}: {
  kicker?: string;
  title: string;
  aside?: ReactNode;
}) {
  return (
    <header className="panel-header hud-panel-header mb-2 flex items-start justify-between gap-3">
      <div className="panel-header-content hud-panel-header-content">
        {kicker ? <p className="eyebrow hud-panel-kicker mb-1">{kicker}</p> : null}
        <h2 className="panel-title hud-panel-title cyan-glow">{title}</h2>
      </div>
      {aside ? <div className="panel-header-aside hud-panel-aside shrink-0">{aside}</div> : null}
    </header>
  );
}

export function IconFormal() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.2">
      <path d="M12 3 21 8.5v7L12 21 3 15.5v-7L12 3Z" />
      <path d="M12 3v18M3 8.5h18" />
    </svg>
  );
}

export function IconSpatial() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.2">
      <circle cx="12" cy="12" r="3.2" />
      <circle cx="12" cy="12" r="7" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </svg>
  );
}

export function IconAtmospheric() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.2">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 4v2.4M12 17.6V20M4 12h2.4M17.6 12H20M6.4 6.4l1.7 1.7M15.9 15.9l1.7 1.7M17.6 6.4l-1.7 1.7M8.1 15.9l-1.7 1.7" />
    </svg>
  );
}

export function IconSection() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.3">
      <path d="M4 18V6h7l3 4h6v8" />
      <path d="M4 18h16" />
    </svg>
  );
}

export function IconModel() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.3">
      <path d="M4 16 12 4l8 12-8 4-8-4Z" />
      <path d="M12 4v16M4 16l8-4 8 4" />
    </svg>
  );
}

export function IconSave() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M5 4h11l3 3v13H5V4Z" />
      <path d="M8 4v5h8V4M8 20v-6h8v6" />
    </svg>
  );
}
