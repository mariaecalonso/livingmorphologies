export default function VerticalLoading() {
  return (
    <main className="flex h-full flex-col bg-black text-[var(--text)]" aria-busy="true" aria-live="polite">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-3 py-2">
        <div>
          <p className="display text-[0.95rem] text-white">Preparing Skill 3</p>
          <p className="mt-0.5 text-[0.62rem] uppercase tracking-[0.16em] text-[var(--muted)]">
            Loading continuation data and 3D morphology
          </p>
        </div>
      </header>
    </main>
  );
}
