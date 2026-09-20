import ranking from "./ranking.json";
export const metadata = {
  title: "Void Field · 50 iterations",
};
export default function VoidSearchGallery() {
  return (
    <main className="min-h-full bg-[#071018] px-5 py-6 text-[#def7ff]">
      <p className="text-[0.62rem] uppercase tracking-[0.18em] text-[var(--muted)]">
        Skill 1 · Void Field only
      </p>
      <h1 className="mt-1 text-xl uppercase tracking-[0.12em]">50 iterations</h1>
      <p className="mt-2 max-w-3xl text-sm text-[var(--muted)]">
        600 steps, 1000 agents. Left is the slime network, right is architecture.
        Ranked by Visually Exposed Core, Isolated Anchor, and Expansive Commons.
        Run 48 is the selected winner. Click a frame to open it full size.
      </p>
      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {ranking.map((row) => {
          const passes = Object.values(row.questions).filter(Boolean).length;
          const labels = [
            row.questions.openCore ? "core" : null,
            row.questions.isolated ? "isolated" : null,
            row.questions.expansive ? "commons" : null,
          ]
            .filter(Boolean)
            .join(" · ");
          return (
            <article
              key={row.file}
              className={`border bg-[#0b1820] ${
                row.rank === 1 ? "border-[var(--orange)]" : "border-[rgba(0,228,255,0.16)]"
              }`}
            >
              <a href={`/void-search/${row.file}`} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/void-search/${row.file}`}
                  alt={`Void Field run ${String(row.index).padStart(2, "0")}`}
                  className="block w-full bg-[#05080c]"
                />
              </a>
              <div className="flex items-start justify-between gap-2 px-3 py-2 text-[0.78rem]">
                <strong>
                  #{String(row.rank).padStart(2, "0")} · run {String(row.index).padStart(2, "0")}
                </strong>
                <span className={passes === 3 ? "text-[#7af0c4]" : "text-[var(--orange-hot)]"}>
                  {row.score} · {passes}/3
                </span>
              </div>
              <p className="px-3 pb-3 text-[0.68rem] uppercase tracking-[0.08em] text-[var(--muted)]">
                seed {row.seed} · {labels || "none"}
              </p>
            </article>
          );
        })}
      </div>
    </main>
  );
}
