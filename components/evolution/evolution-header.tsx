export function EvolutionHeader({ title, detail }: { title: string; detail: string }) {
  return (
    <header className="evo-header">
      <div>
        <p className="display evo-header-title">{title}</p>
        <p className="eyebrow evo-header-detail">{detail}</p>
      </div>
      <span className="evo-mock-badge" title="Demonstration data. Not connected to the evolutionary search.">
        Mock data
      </span>
    </header>
  );
}
