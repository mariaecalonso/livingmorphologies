import { WORKFLOW_LIGHT } from "@/lib/home-workflow-camera";

/** Head size on the 7407 sheet. Steps 01 and 02 use the shared light, scaled to the diagram. */
const ARTBOARD_HEAD = 18;
const ARTBOARD = ARTBOARD_HEAD / WORKFLOW_LIGHT.radii[WORKFLOW_LIGHT.radii.length - 1];

export function WorkflowLightFilter({ id, artboard = false }: { id: string; artboard?: boolean }) {
  const blur = WORKFLOW_LIGHT.blur * (artboard ? ARTBOARD : 1);
  return (
    <filter id={id} x="-180%" y="-180%" width="460%" height="460%">
      <feGaussianBlur stdDeviation={blur} result="blur" />
      <feMerge>
        <feMergeNode in="blur" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  );
}

export function WorkflowLightCircles({ artboard = false }: { artboard?: boolean }) {
  const last = WORKFLOW_LIGHT.trailMs.length - 1;
  const scale = artboard ? ARTBOARD : 1;
  return WORKFLOW_LIGHT.trailMs.map((ms, index) => (
    <circle
      key={`${index}-${ms}`}
      className={index === last ? "head" : "trail"}
      r={WORKFLOW_LIGHT.radii[index] * scale}
      opacity={WORKFLOW_LIGHT.opacity[index]}
    />
  ));
}

type PathMotion = {
  path: string;
  dur: string;
  calcMode?: "linear" | "spline";
  keyPoints?: string;
  keyTimes?: string;
  keySplines?: string;
  opacityValues?: string;
  opacityTimes?: string;
  trailScale?: number;
};

/** White elongated light. Trailing marks follow the head from the shared light. */
export function WorkflowPathLight({
  id,
  motion,
  color,
}: {
  id: string;
  motion: PathMotion;
  color?: string;
}) {
  const last = WORKFLOW_LIGHT.trailMs.length - 1;
  const trailScale = motion.trailScale ?? 1;
  return WORKFLOW_LIGHT.trailMs.map((ms, index) => {
    const head = index === last;
    const lag = (ms * trailScale) / 1000;
    return (
      <g key={`${index}-${ms}`} className="wf-proto-pulse" filter={`url(#${id}-glow)`} opacity="0">
        {motion.opacityValues ? (
          <animate attributeName="opacity" begin="indefinite" dur={motion.dur} repeatCount="indefinite" calcMode="linear" values={motion.opacityValues} keyTimes={motion.opacityTimes} />
        ) : null}
        <circle
          className={head ? "head" : "trail"}
          r={WORKFLOW_LIGHT.radii[index] * ARTBOARD}
          opacity={WORKFLOW_LIGHT.opacity[index]}
          style={color ? { fill: color } : undefined}
        />
        <animateMotion
          id={head ? id : undefined}
          begin={head ? "indefinite" : `${id}.begin+${lag}s`}
          dur={motion.dur}
          repeatCount="indefinite"
          calcMode={motion.calcMode ?? "linear"}
          keyPoints={motion.keyPoints}
          keyTimes={motion.keyTimes}
          keySplines={motion.calcMode === "spline" ? motion.keySplines : undefined}
          path={motion.path}
        />
      </g>
    );
  });
}

export function beginWorkflowLights(root: SVGSVGElement) {
  root.querySelectorAll<SVGAnimationElement>("animate, animateMotion").forEach((ride) => {
    if (ride.tagName.toLowerCase() === "animatemotion" && !ride.id) return;
    ride.beginElement();
  });
}
