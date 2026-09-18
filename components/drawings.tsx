import type { RatingsMap } from "@/lib/types";

function n(map: RatingsMap, id: string) {
  return map[id] ?? 1;
}

export function SectionDrawing({
  ratings,
  title,
}: {
  ratings: RatingsMap;
  title: string;
}) {
  const openness = n(ratings, "openness");
  const direction = n(ratings, "directionality");
  const hierarchy = n(ratings, "hierarchy");
  const complexity = n(ratings, "complexity");
  const centrality = n(ratings, "centrality");

  const voidW = 86 + openness * 30;
  const left = 48;
  const leftW = 62 - direction * 6;
  const mid = left + leftW;
  const voidStart = mid + 18;
  const tall = voidStart + voidW;
  const roof = 24 - hierarchy * 4;
  const ground = 160;
  const split = complexity >= 2;
  const platform = ground - 56 - centrality * 4;

  return (
    <svg viewBox="0 0 420 220" className="h-full w-full" role="img" aria-label={`${title} 2D wall section`}>
      <defs>
        <pattern id="sec-grid" width="18" height="18" patternUnits="userSpaceOnUse">
          <path d="M 18 0 L 0 0 0 18" fill="none" stroke="rgba(0,228,255,0.07)" strokeWidth="0.6" />
        </pattern>
      </defs>
      <rect width="420" height="220" fill="#071018" />
      <rect width="420" height="220" fill="url(#sec-grid)" />
      <g fill="none" stroke="#d7eef6" strokeWidth="1.25">
        <path d={`M 24 ${ground} H 398`} />
        <rect x={left} y={58} width={leftW} height={ground - 58} />
        <path d={`M ${mid} 96 H ${mid + 16} V ${ground}`} />
        <path d={`M ${voidStart} ${platform} H ${voidStart + 20} V ${ground}`} />
        <path d={`M ${voidStart + 8} ${roof + 40} H ${voidStart + voidW * 0.4} V ${roof} H ${tall} V ${ground}`} />
        <path d={`M ${tall} ${roof + 16} H 372 V ${ground}`} />
        <path d={`M ${mid - 6} ${platform - 8} H ${voidStart + voidW * 0.36}`} />
        {split ? <path d={`M ${voidStart + 26} ${ground - 36} H ${voidStart + 64} V ${ground}`} /> : null}
        <rect x={mid + 4} y={ground - 46} width="13" height="22" />
        <rect x={voidStart + voidW * 0.58} y={roof + 32} width="12" height="22" />
      </g>
      <g fill="#b7e3ee">
        <circle cx={mid + 10} cy={ground - 27} r="2.4" />
        <rect x={mid + 8.6} y={ground - 25} width="2.8" height="12" />
        <circle cx={voidStart + voidW * 0.26} cy={platform - 11} r="2.4" />
        <rect x={voidStart + voidW * 0.26 - 1.4} y={platform - 9} width="2.8" height="12" />
        <circle cx={voidStart + voidW * 0.68} cy={ground - 27} r="2.4" />
        <rect x={voidStart + voidW * 0.68 - 1.4} y={ground - 25} width="2.8" height="12" />
      </g>
      <g fill="none" stroke="#c5e6ee" strokeWidth="1.05">
        <path d="M 374 160 c 9 -24 22 -26 30 0" />
        <path d="M 381 160 v -20" />
        <path d="M 394 160 v -14" />
      </g>
      <g stroke="#7ad0e0" fill="none" strokeWidth="0.9">
        <path d="M 48 186 H 200" />
        <path d="M 48 183 V 189" />
        <path d="M 124 183 V 189" />
        <path d="M 200 183 V 189" />
      </g>
      <text x="48" y="204" fill="#7ea0ad" fontSize="8" letterSpacing="1.5">0</text>
      <text x="114" y="204" fill="#7ea0ad" fontSize="8" letterSpacing="1.5">10</text>
      <text x="186" y="204" fill="#7ea0ad" fontSize="8" letterSpacing="1.5">20 FT</text>
      <text x="262" y="204" fill="#9fd7e4" fontSize="8.4" letterSpacing="1.5">SECTION A-A′  ·  SCALE 1:200</text>
    </svg>
  );
}

export function AxonModel({ ratings }: { ratings: RatingsMap }) {
  const openness = n(ratings, "openness");
  const hierarchy = n(ratings, "hierarchy");
  const complexity = n(ratings, "complexity");
  const floors = 3 + (hierarchy >= 2 ? 1 : 0);
  const voidW = 34 + openness * 10;

  const iso = (x: number, y: number, z: number) => {
    const px = 208 + (x - y) * 0.9;
    const py = 178 - z * 0.56 - (x + y) * 0.3;
    return `${px},${py}`;
  };

  const story = 40;
  const W = 120;
  const D = 88;

  return (
    <svg viewBox="0 0 420 220" className="h-full w-full" role="img" aria-label="2.5D modular model">
      <rect width="420" height="220" fill="#071018" />
      <g fill="none" stroke="#d5eef5" strokeWidth="1.08">
        <path d={`M ${iso(0, 0, 0)} L ${iso(W, 0, 0)} L ${iso(W, D, 0)} L ${iso(0, D, 0)} Z`} fill="rgba(8,24,34,0.55)" />
        {Array.from({ length: floors }, (_, i) => {
          const z = i * story;
          const top = z + story;
          return (
            <g key={i}>
              <path d={`M ${iso(0, 0, z)} L ${iso(0, 0, top)} L ${iso(W, 0, top)} L ${iso(W, 0, z)}`} fill="rgba(0,228,255,0.04)" />
              <path d={`M ${iso(W, 0, z)} L ${iso(W, 0, top)} L ${iso(W, D, top)} L ${iso(W, D, z)}`} fill="rgba(255,122,50,0.05)" />
              <path d={`M ${iso(0, 0, top)} L ${iso(W, 0, top)} L ${iso(W, D, top)} L ${iso(0, D, top)} Z`} />
              <path d={`M ${iso(42, 0, z)} L ${iso(42 + voidW, 0, z)} L ${iso(42 + voidW, 0, top)} L ${iso(42, 0, top)}`} stroke="#7af6ff" />
              <path d={`M ${iso(48, 12, z)} L ${iso(62, 28, z + story * 0.5)} L ${iso(76, 44, top)}`} stroke="#ff9a4a" />
              <path d={`M ${iso(18, 8, z + 10)} L ${iso(30, 8, z + 10)} L ${iso(30, 8, z + 22)} L ${iso(18, 8, z + 22)} Z`} />
            </g>
          );
        })}
        {complexity >= 2 ? (
          <path d={`M ${iso(W, 20, 0)} L ${iso(W + 34, 20, 0)} L ${iso(W + 34, 20, story * 2)} L ${iso(W, 20, story * 2)}`} />
        ) : null}
        <path d={`M ${iso(0, 0, 0)} L ${iso(0, 0, floors * story)}`} />
        <path d={`M ${iso(W, 0, 0)} L ${iso(W, 0, floors * story)}`} />
        <path d={`M ${iso(W, D, 0)} L ${iso(W, D, floors * story)}`} />
      </g>
    </svg>
  );
}
