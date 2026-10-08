"use client";

import { TYPOLOGIES } from "@/lib/catalog";

const ACTIVE =
  "border-[var(--cyan)] bg-[linear-gradient(90deg,rgba(15,115,119,0.14),rgba(199,126,95,0.14))] text-white";
const IDLE =
  "border-[rgba(242,242,238,0.16)] text-[var(--muted)] hover:border-[rgba(242,242,238,0.32)] hover:text-[var(--text)]";

/** The Physarum catalog rail: fifteen archetypes, grouped by typology, glass panel, teal-to-copper wash when active. */
export function ArchetypeRail({
  activeId,
  onPick,
  note,
  chosen,
  disabled,
  title,
  framed = false,
}: {
  activeId: string | null;
  onPick: (id: string) => void;
  note?: (id: string) => string;
  chosen?: (id: string) => boolean;
  disabled?: (id: string) => boolean;
  title?: string;
  framed?: boolean;
}) {
  return (
    <aside className="lab-rail runs-aside panel m-2 flex w-[17.25rem] shrink-0 flex-col" aria-label={title ?? "Archetype"}>
      {framed ? (
        <div className="frame-title">
          <h2 className="panel-title">{title ?? "Archetype"}</h2>
        </div>
      ) : (
        <header className="panel-header">
          <div className="panel-header-content">
            <p className="hud-panel-kicker">Input</p>
            <h2 className="panel-title">{title ?? "Archetype"}</h2>
          </div>
        </header>
      )}
      <div className="lab-rail-groups">
        {TYPOLOGIES.map((typology) => (
          <section key={typology.id} className="lab-rail-group" aria-label={typology.label}>
            <p className="eyebrow">{typology.label}</p>
            <div className="lab-rail-items">
              {typology.archetypes.map((item) => {
                const off = disabled?.(item.id) ?? false;
                const active = item.id === activeId;
                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={off}
                    title={off ? "Search not run yet" : undefined}
                    data-chosen={chosen?.(item.id) ? "true" : undefined}
                    onClick={() => {
                      if (!off) onPick(item.id);
                    }}
                    className={`lab-rail-item ${active ? ACTIVE : IDLE}`}
                  >
                    {item.name}
                    {note?.(item.id) ?? ""}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </aside>
  );
}
