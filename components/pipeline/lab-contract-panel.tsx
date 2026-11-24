import type { LabContractId } from "@/lib/lab-contracts";
import { labContract } from "@/lib/lab-contracts";
import styles from "./lab-contract-panel.module.css";

const LAB_NAMES: Record<string, string> = {
  "cluster-placement": "Cluster Placement",
  "cluster-assembly-catalog": "Cluster Assembly Catalog",
  interpretation: "Architectural Interpretation",
  enclosure: "Enclosure",
  slicing: "Slicing",
  drawing: "Drawing",
  rendering: "Rendering",
  "final-enclosed-model": "Final Enclosed Model",
};

function names(ids: readonly string[]) {
  if (ids.length === 0) return "None";
  return ids.map((id) => LAB_NAMES[id] ?? id).join(" · ");
}

function methodologyStatus(implemented: LabContractId | string, outputImplemented: string) {
  if (outputImplemented === "implemented") return "Output contract implemented";
  if (implemented === "interpretation") return "Reading implemented · Integrated Architectural Model not generated";
  return "Methodology not implemented";
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <p className={styles.row}>
      <span>{label}</span>
      <strong>{value}</strong>
    </p>
  );
}

export function LabContractPanel({
  labId,
  liveStatus,
  outputFulfilled = false,
  variant = "lab",
}: {
  labId: LabContractId;
  liveStatus?: string;
  outputFulfilled?: boolean;
  variant?: "lab" | "interpretation";
}) {
  const contract = labContract(labId);
  const input = contract.inputs.map((item) => item.type).join(" · ");
  const source = contract.inputs.map((item) => {
    if (item.type === "Selected Assembly for Development") return "Development checkpoint";
    if (item.type === "Current Integrated Architectural Model") return "Architectural Interpretation";
    if (item.type === "Final Enclosed Model") return "Enclosure checkpoint";
    if (item.type === "Slice sent from Slicing") return "Slicing";
    if (item.type === "Authoritative Site / Urban Context") return "Shared Site / Urban Context";
    if (item.type === "Selected Site Strategy Network") return "Published Site Strategy";
    if (item.type === "Designer Zoning for that network") return "Designer Zoning";
    if (item.type === "Finished Program Cluster catalog") return "Finished Program Clusters";
    if (item.type === "Client / program ranking context") return "Client ranking";
    if (item.type === "Zone Occupancy / PlacedCluster state") return "Cluster Placement";
    return item.source;
  }).filter((item, index, list) => list.indexOf(item) === index).join(" · ");

  if (variant === "interpretation") {
    return (
      <section
        className={styles.panel}
        data-lab-contract={contract.id}
        data-contract-kind={contract.kind}
        data-output-type={contract.output.type}
        data-output-implemented={contract.output.implemented}
        data-output-fulfilled={outputFulfilled ? "true" : "false"}
        data-geometry-required={contract.output.geometryRequired ? "true" : "false"}
      >
        <h2>Lab contract</h2>
        <Row label="Production input" value={input} />
        <Row label="Implemented" value="Live geometry reading" />
        <Row label="Expected output" value={contract.output.type} />
        <Row label="Output status" value={outputFulfilled ? liveStatus ?? "Complete" : `${liveStatus ?? "Not generated"} · readings are not this output`} />
      </section>
    );
  }

  return (
    <section
      className={styles.panel}
      data-lab-contract={contract.id}
      data-contract-kind={contract.kind}
      data-output-type={contract.output.type}
      data-output-implemented={contract.output.implemented}
      data-output-fulfilled={outputFulfilled ? "true" : "false"}
      data-geometry-required={contract.output.geometryRequired ? "true" : "false"}
    >
      <h2>Lab contract</h2>
      <Row label="Input" value={input} />
      <Row label="Source" value={source} />
      <Row label="Status" value={methodologyStatus(contract.id, contract.output.implemented)} />
      <Row label="Expected output" value={contract.output.type} />
      <Row label="Downstream" value={names(contract.downstream)} />
      {liveStatus ? <Row label="Live source" value={liveStatus} /> : null}
    </section>
  );
}
