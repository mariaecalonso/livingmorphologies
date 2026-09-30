import type { ReactNode } from "react";

export function EvolutionHeader({ title, detail, aside }: { title: string; detail: string; aside?: ReactNode }) {
  return (
    <header className="evo-header">
      <div>
        <p className="display evo-header-title">{title}</p>
        <p className="eyebrow evo-header-detail">{detail}</p>
      </div>
      {aside}
    </header>
  );
}
