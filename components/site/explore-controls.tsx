"use client";

import type { ReactNode } from "react";

const iconProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export function SunIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="3.1" />
      <path d="M12 3.2v2.1M12 18.7v2.1M3.2 12h2.1M18.7 12h2.1M5.8 5.8l1.5 1.5M16.7 16.7l1.5 1.5M18.2 5.8l-1.5 1.5M7.3 16.7l-1.5 1.5" />
    </svg>
  );
}

export function WindIcon() {
  return (
    <svg {...iconProps}>
      <path d="M4 8.2h8.8a2.1 2.1 0 1 0-1.8-2.1" />
      <path d="M4 12h12.2a2.1 2.1 0 1 1-1.8 2.1" />
      <path d="M4 15.8h6.4" />
    </svg>
  );
}

export function ViewsIcon() {
  return (
    <svg {...iconProps}>
      <path d="M2.8 12S6.2 6.6 12 6.6 21.2 12 21.2 12 17.8 17.4 12 17.4 2.8 12 2.8 12z" />
      <circle cx="12" cy="12" r="2.1" />
    </svg>
  );
}

export function WalkIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="14.2" cy="4.6" r="1.5" />
      <path d="M8.2 20.2 10.6 14l3.1 2.1 1.7 4.1M10.6 14 8.6 9.4 12.2 8l2.5 3.4 3.4-1.3" />
    </svg>
  );
}

export function UrbanIcon() {
  return (
    <svg {...iconProps}>
      <path d="M4 20.2V9.2L8.2 7v13.2M10 20.2V5.2L15.4 3v17.2M17.2 20.2v-7.6L20.4 11v9.2M3 20.2h18" />
    </svg>
  );
}

export function GridIcon() {
  return (
    <svg {...iconProps}>
      <path d="M4.5 4.5h15v15h-15zM12 4.5v15M4.5 12h15" />
    </svg>
  );
}

export function ShadowIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="8" cy="8" r="2.3" />
      <path d="M5 20.2 9.2 12h9.2L14.6 20.2z" />
    </svg>
  );
}

export function PathIcon() {
  return (
    <svg {...iconProps}>
      <path d="M4 17.5c4.2 0 4.2-7 8.2-7s4 7 7.8 7" />
      <circle cx="16.2" cy="7.2" r="1.5" />
    </svg>
  );
}

export function RoadIcon() {
  return (
    <svg {...iconProps}>
      <path d="M7 20 10.2 4M17 20 13.8 4M12 7.2v2.2M12 12.2v2.2M12 17.2v2" />
    </svg>
  );
}

export function NetworkIcon() {
  return (
    <svg {...iconProps}>
      <path d="M5 19V7.5M5 12.5h8M13 12.5V19M13 8h6.2M19.2 8v7.5" />
    </svg>
  );
}

export function BaywalkIcon() {
  return (
    <svg {...iconProps}>
      <path d="M3.5 14.5c3.2 0 4.2-5.2 8.5-5.2s5.2 5.2 8.5 5.2" />
      <path d="M3.5 18.8h17" />
    </svg>
  );
}

export function AccessIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="7" cy="15" r="1.7" />
      <circle cx="17" cy="8" r="1.7" />
      <path d="M8.6 14.1 15.3 8.9" />
    </svg>
  );
}

export function LandIcon() {
  return (
    <svg {...iconProps}>
      <path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />
    </svg>
  );
}

export function PinIcon() {
  return (
    <svg {...iconProps}>
      <path d="M12 20.5s5.5-4.8 5.5-9.2a5.5 5.5 0 1 0-11 0c0 4.4 5.5 9.2 5.5 9.2z" />
      <circle cx="12" cy="11.2" r="1.6" />
    </svg>
  );
}

export function LinkIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="7" cy="12" r="2" />
      <circle cx="17" cy="7.5" r="2" />
      <circle cx="16.2" cy="17" r="2" />
      <path d="M8.8 11.2 15.2 8.3M8.7 13.2 14.4 16.2" />
    </svg>
  );
}

export function ProgramIcon() {
  return (
    <svg {...iconProps}>
      <path d="M6 19V10.5M12 19V6M18 19v-6" />
    </svg>
  );
}

export function WinterIcon() {
  return (
    <svg {...iconProps}>
      <path d="M12 3.5v17M5.2 6.8l13.6 10.4M18.8 6.8 5.2 17.2M4 12h16" />
    </svg>
  );
}

export function SpringIcon() {
  return (
    <svg {...iconProps}>
      <path d="M12 20.2V9.5" />
      <path d="M12 14c-3.2-.8-4.6-3.6-3.4-6.2 3.2.6 4.6 3.2 3.4 6.2zM12 16.2c3.2-.8 4.6-3.6 3.4-6.2-3.2.6-4.6 3.2-3.4 6.2z" />
    </svg>
  );
}

export function AutumnIcon() {
  return (
    <svg {...iconProps}>
      <path d="M12 20.2c0-5.2 1.6-7.2 5.6-8.2-3.6-.2-5.4-2.2-5.6-6 0 3.8-2 5.8-5.6 6 4 1 5.6 3 5.6 8.2z" />
    </svg>
  );
}

export function YearIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="7.2" />
      <path d="M12 8.2V12l2.6 1.6" />
    </svg>
  );
}

export function ParkIcon() {
  return (
    <svg {...iconProps}>
      <path d="M12 20v-5.5M12 14.5c-3.6 0-5.2-2.6-5.2-5.2C10 8.2 12 5 12 5s2 3.2 5.2 4.3c0 2.6-1.6 5.2-5.2 5.2z" />
    </svg>
  );
}

export function CultureIcon() {
  return (
    <svg {...iconProps}>
      <path d="M5 18.5V8.5M12 18.5V8.5M19 18.5V8.5M3.5 8.5h17M4.2 18.5h15.6M3.5 6.2 12 3.5l8.5 2.7" />
    </svg>
  );
}

export function HotelIcon() {
  return (
    <svg {...iconProps}>
      <path d="M4 16.5V10h5.2a3 3 0 0 1 3 3v3.5M4 16.5h16V19M14 16.5V13h6v3.5" />
    </svg>
  );
}

export function TransitIcon() {
  return (
    <svg {...iconProps}>
      <rect x="6" y="3.5" width="12" height="12" rx="2" />
      <path d="M6 10h12M9 19.5 12 16l3 3.5" />
    </svg>
  );
}

export function EducationIcon() {
  return (
    <svg {...iconProps}>
      <path d="M3 10.2 12 6l9 4.2-9 4.2-9-4.2z" />
      <path d="M7 12.2v3.6c1.8 1.3 8.2 1.3 10 0v-3.6" />
    </svg>
  );
}

export function OtherIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="6.5" cy="12" r="1.2" />
      <circle cx="12" cy="12" r="1.2" />
      <circle cx="17.5" cy="12" r="1.2" />
    </svg>
  );
}

export function ExploreSegment<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { id: T; label: string; title?: string; icon?: ReactNode }[];
  onChange: (id: T) => void;
}) {
  return (
    <div className="site-explore-segment" role="group" aria-label={label}>
      {options.map((option) => {
        const active = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            data-active={active || undefined}
            aria-pressed={active}
            title={option.title ?? option.label}
            aria-label={option.title ?? option.label}
            onClick={() => onChange(option.id)}
          >
            {option.icon}
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function ExploreToggles<T extends string>({
  label,
  options,
  selected,
  columns,
  onToggle,
}: {
  label: string;
  options: readonly { id: T; label: string; title?: string; swatch?: string; icon?: ReactNode }[];
  selected: readonly T[];
  columns?: number;
  onToggle: (id: T) => void;
}) {
  return (
    <div className="site-explore-toggles" role="group" aria-label={label} data-columns={columns}>
      {options.map((option) => {
        const active = selected.includes(option.id);
        return (
          <button
            key={option.id}
            type="button"
            data-active={active || undefined}
            aria-pressed={active}
            title={option.title ?? option.label}
            aria-label={option.title ?? option.label}
            onClick={() => onToggle(option.id)}
          >
            {option.swatch ? <i style={{ background: option.swatch }} /> : option.icon}
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function ExploreSlider({
  label,
  valueLabel,
  min,
  max,
  step,
  value,
  ariaLabel,
  onChange,
}: {
  label: string;
  valueLabel: string;
  min: number;
  max: number;
  step: number;
  value: number;
  ariaLabel: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="site-explore-slider">
      {label ? <span>{label}</span> : null}
      <strong>{valueLabel}</strong>
      <input
        className="site-analysis-range"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={ariaLabel}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}
