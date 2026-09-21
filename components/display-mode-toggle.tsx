import type { MouseEventHandler } from "react";

export type DisplayMode = "desktop" | "presentation";

type DisplayModeToggleProps = {
  mode: DisplayMode;
  onModeChange: (mode: DisplayMode) => void;
};

export function DisplayModeToggle({
  mode,
  onModeChange,
}: DisplayModeToggleProps) {
  const nextMode: DisplayMode = mode === "desktop" ? "presentation" : "desktop";
  const actionLabel = `Display mode: ${mode}. Switch to ${nextMode} mode`;
  const handleClick: MouseEventHandler<HTMLButtonElement> = () => {
    onModeChange(nextMode);
  };

  return (
    <button
      type="button"
      className="display-mode-toggle"
      aria-label={actionLabel}
      aria-pressed={mode === "presentation"}
      title={actionLabel}
      data-display-mode={mode}
      onClick={handleClick}
    >
      <svg
        className="display-mode-toggle__icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        aria-hidden="true"
      >
        <rect x="3" y="5" width="18" height="14" />
        <path d="M3 9h18M8 21h8M12 19v2" />
      </svg>
      <span className="display-mode-toggle__tooltip" role="tooltip">
        {actionLabel}
      </span>
    </button>
  );
}
