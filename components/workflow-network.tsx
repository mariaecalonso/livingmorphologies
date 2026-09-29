import type { CSSProperties } from "react";
import { MockMorphology } from "@/components/evolution/mock-morphology";

/** Illustrative lineage shared by every stage of the strip. Placeholder fields, not simulation output. */
const LINEAGE = { seed: 7407, founder: 4 };
const VARIANTS = [2, 4, 6];
const STACK_LAYERS = 5;

function InputMarkers() {
  const dots = [];
  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 8; col += 1) dots.push(<circle key={`${row}-${col}`} cx={18 + col * 24} cy={16 + row * 22} r={0.9} />);
  }
  return (
    <svg className="workflow-input" viewBox="0 0 200 100" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <g fill="rgba(242, 242, 238, 0.28)">{dots}</g>
      <g fill="none" stroke="rgba(242, 242, 238, 0.62)" strokeWidth={1} vectorEffect="non-scaling-stroke">
        <rect x={30} y={27} width={58} height={44} vectorEffect="non-scaling-stroke" />
        <path d="M30 49 H88 M59 27 V71" strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
        <path d="M112 38 h10 M117 33 v10 M150 60 h10 M155 55 v10" vectorEffect="non-scaling-stroke" />
        <path d="M110 80 H180" vectorEffect="non-scaling-stroke" />
      </g>
      <g fill="rgba(242, 242, 238, 0.7)">
        <rect x={128} y={70} width={6} height={10} />
        <rect x={146} y={62} width={6} height={18} />
        <rect x={164} y={54} width={6} height={26} />
      </g>
    </svg>
  );
}

/** Decorative left-to-right strip: criteria, one field, related variations, vertical stacking. */
export function WorkflowNetwork() {
  return (
    <div className="workflow-network" aria-hidden="true">
      <div className="workflow-zone">
        <InputMarkers />
      </div>
      <span className="workflow-link" />
      <div className="workflow-zone">
        <span className="workflow-morph">
          <MockMorphology seed={LINEAGE.seed} generation={1} founder={LINEAGE.founder} />
        </span>
      </div>
      <span className="workflow-link" />
      <div className="workflow-zone">
        <span className="workflow-variants">
          {VARIANTS.map((generation) => (
            <span key={generation} className="workflow-morph">
              <MockMorphology seed={LINEAGE.seed} generation={generation} founder={LINEAGE.founder} />
            </span>
          ))}
        </span>
      </div>
      <span className="workflow-link" />
      <div className="workflow-zone">
        <span className="workflow-stack">
          {Array.from({ length: STACK_LAYERS }, (_, layer) => (
            <span key={layer} className="workflow-stack-layer" style={{ "--layer": layer } as CSSProperties}>
              <MockMorphology seed={LINEAGE.seed} generation={VARIANTS[VARIANTS.length - 1]} founder={LINEAGE.founder} />
            </span>
          ))}
        </span>
      </div>
    </div>
  );
}
