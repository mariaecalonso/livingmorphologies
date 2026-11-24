export type PackedMesh = { positions: string; indices: string };

export type PortalReadout = {
  center: { x: number; y: number; z: number };
  normal: { x: number; y: number; z: number };
  areaSqFt: number;
  radiusFt: number;
  section: "boundary" | "circle";
  loop: { x: number; y: number; z: number }[];
};

export type ClusterAssemblyReport = {
  iteration: number;
  seed: number;
  networkId: string;
  zoningSource: "designer";
  arrangement: string;
  scale: "1 model unit = 1 foot";
  anchors: { id: string; role: string; label: string; x: number; z: number }[];
  branches: { x0: number; z0: number; x1: number; z1: number }[];
  zones: { kind: "lobby" | "gathering" | "workspace"; points: { x: number; z: number }[] }[];
  recordedLinks: { from: string; to: string; statement: string; built: boolean }[];
  placements: {
    programId: string;
    name: string;
    clusterId: string;
    anchorId: string;
    role: string;
    kind: "lobby" | "gathering" | "workspace";
    pocket: ("lobby" | "gathering" | "workspace")[];
    anchor: { x: number; z: number };
    pose: { yaw: number; east: number; north: number; lift: number };
  }[];
  link: {
    statement: string;
    fromLabel: string;
    toLabel: string;
    fromCluster: string;
    toCluster: string;
    fromAnchor: { x: number; z: number };
    toAnchor: { x: number; z: number };
    fromPose: { yaw: number; east: number; north: number; lift: number };
    toPose: { yaw: number; east: number; north: number; lift: number };
    anchorSeparationFt: number;
    separationFt: number;
    portalA: PortalReadout;
    portalB: PortalReadout;
    direction: { x: number; y: number; z: number };
    distanceFt: number;
    hybridGenerated: boolean;
    validationPassed: boolean;
    joinedSolid: boolean;
    parcelFit: boolean;
    note: string;
  };
  meshes: {
    clusters: { programId: string; positions: string; indices: string }[];
    hybrid: PackedMesh | null;
    wrap: PackedMesh | null;
  };
};
