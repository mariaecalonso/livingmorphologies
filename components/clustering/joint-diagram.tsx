import record from "@/data/skill6/assembled/joint-diagram.json";
import styles from "@/components/clustering/joint-diagram.module.css";

const PLATES = "/clustering/joint";

function title(id: string) {
  return id.replace(/-/g, " ");
}

const STEPS = [
  {
    name: "Tiles placed",
    plate: `${PLATES}/01-tiles.webp`,
    lines: [`Rigid seating · ${record.direction} · ${record.placement}`, `Residual ${record.residualGap.toFixed(3)} · area ${record.contactArea.toFixed(1)}`],
  },
  {
    name: "Contact region",
    plate: `${PLATES}/02-contact.webp`,
    lines: [`${record.sampleCount} samples · ${record.plane.join("–")} plane`, "Near contact · gap 0.05 – 0.18"],
  },
  {
    name: "Patch",
    plate: `${PLATES}/03-patch.webp`,
    lines: [`Implicit blend · r ${record.patch.radius} · voxel ${record.patch.cell}`, `${record.patch.extent[1].toFixed(1)} × ${record.patch.extent[2].toFixed(1)} · volume ${record.patch.volume.toFixed(1)} · ${record.patch.bodies} body`],
  },
  {
    name: "Raw union",
    plate: `${PLATES}/04-union.webp`,
    lines: [`Tiles + patch · ${record.union.solids} solid · ${record.union.cavities} cavities`, `Seam creases ${record.refined.seamCreasesBefore} · lift ${record.lift.toFixed(2)}`],
  },
  {
    name: "Refined",
    plate: `${PLATES}/05-refined.webp`,
    lines: [`Seam fillet + rim pass · ${record.refined.solids} solid`, `Seam creases ${record.refined.seamCreasesBefore} → ${record.refined.seamCreasesAfter} · min Z 0`],
  },
] as const;

/** One joint from placement to refined mass. The same five steps in the lab and in the workflow chapter. */
export function JointDiagram() {
  return (
    <div className={styles.diagram} data-joint-diagram="">
      <p className={styles.heading}>
        Joint refinement · {title(record.host)} × {title(record.guest)}
      </p>
      <ol className={styles.steps}>
        {STEPS.map((step, index) => (
          <li key={step.name} className={styles.step}>
            <p className={styles.label}>
              <b>{String(index + 1).padStart(2, "0")}</b> {step.name}
            </p>
            <div className={styles.frame} data-primary={index === STEPS.length - 1 ? "" : undefined}>
              <img src={step.plate} alt="" />
            </div>
            <p className={styles.caption}>
              {step.lines.map((line) => (
                <span key={line}>{line}</span>
              ))}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}
