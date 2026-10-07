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
}: {
  activeId: string | null;
  onPick: (id: string) => void;
  note?: (id: string) => string;
  chosen?: (id: string) => boolean;
  disabled?: (id: string) => boolean;
  title?: string;
}) {
  return (
    <aside className="lab-rail runs-aside panel m-2 flex w-[15.5rem] shrink-0 flex-col" aria-label={title ?? "Archetype"}>
      <header className="panel-header">
        <div className="panel-header-content">
          <p className="hud-panel-kicker">Input</p>
          <h2 className="panel-title">Archetype</h2>
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        {TYPOLOGIES.map((typology) => (
          <section key={typology.id} className="flex min-h-0 flex-1 flex-col gap-1.5">
            <p className="eyebrow shrink-0">{typology.label}</p>
            <div className="flex min-h-0 flex-1 flex-col gap-1.5">
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
                    className={`flex min-h-0 flex-1 items-center border px-1.5 py-1.5 text-left text-[0.58rem] leading-tight tracking-[0.08em] uppercase transition disabled:opacity-30 ${
                      active ? ACTIVE : IDLE
                    }`}
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
