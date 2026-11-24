import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { readDevelopmentCheckpoint } from "./development-checkpoint";
import type { ClusterAssemblyRecord } from "./placed-cluster";
import { readSiteContextSource, SITE_CONTEXT_PATH, type SiteContextSource } from "./site-context-source";

/**
 * Input / output authority names live in `lib/lab-contracts.ts`.
 * This file stores pipeline revisions. It is not a second contract registry.
 */

export const DOWNSTREAM_PIPELINE_CONTRACT = "skill5-downstream-pipeline-v1" as const;
export const INTERPRETATION_AUTHORITY_CONTRACT = "skill5-interpretation-authority-v1" as const;
export const ENCLOSURE_AUTHORITY_CONTRACT = "skill5-enclosure-authority-v1" as const;
export const FINAL_ENCLOSED_MODEL_CONTRACT = "skill5-final-enclosed-model-v1" as const;
export const SLICING_CONTRACT = "skill5-slicing-v1" as const;
export const DRAWING_CONTRACT = "skill5-drawing-v1" as const;
export const RENDERING_CONTRACT = "skill5-rendering-v1" as const;

const FILE = path.join(process.cwd(), "data", "skill5", "downstream-pipeline.json");

export class DownstreamPipelineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DownstreamPipelineError";
  }
}

export type LineageStatus = "no-source" | "awaiting" | "current-source" | "stale-source";
export type GeometryStatus = "no-source" | "source-ready" | "working" | "stale-source" | "complete";
export type SliceType = "horizontal" | "vertical";
export type DrawingType = "floor-plan" | "section";

export type SlicePlane = {
  origin: { x: number; y: number; z: number };
  normal: { x: number; y: number; z: number };
};

export type StoredInterpretation = {
  interpretationRevisionId: string | null;
  derivedFromAssemblyId: string | null;
  derivedFromAssemblyRevision: string | null;
  outputGeometryRef: string | null;
  updatedAt: string | null;
  previous: StoredInterpretationSnapshot[];
};

export type StoredInterpretationSnapshot = {
  interpretationRevisionId: string;
  derivedFromAssemblyId: string | null;
  derivedFromAssemblyRevision: string | null;
  outputGeometryRef: string | null;
  updatedAt: string;
};

export type StoredEnclosure = {
  enclosureRevisionId: string | null;
  derivedFromInterpretationRevisionId: string | null;
  finalEnclosedModelRef: string | null;
  updatedAt: string | null;
  previous: StoredEnclosureSnapshot[];
};

export type StoredEnclosureSnapshot = {
  enclosureRevisionId: string;
  derivedFromInterpretationRevisionId: string | null;
  finalEnclosedModelRef: string | null;
  updatedAt: string;
};

export type StoredFinalModel = {
  modelRevisionId: string | null;
  enclosureRevisionId: string | null;
  sourceInterpretationRevisionId: string | null;
  geometryRef: string | null;
  updatedAt: string | null;
  units: "foot";
  axes: { x: "east"; y: "up"; z: "north" };
  siteModelRef: typeof SITE_CONTEXT_PATH;
};

export type StoredSlice = {
  sliceId: string;
  name: string;
  type: SliceType;
  sourceFinalModelRevisionId: string | null;
  plane: SlicePlane;
  createdAt: string;
  updatedAt: string;
  geometryRef: string | null;
};

export type StoredDrawing = {
  drawingId: string;
  sourceSliceId: string;
  sourceFinalModelRevisionId: string | null;
  drawingType: DrawingType;
  siteContextRevision: string;
  createdAt: string;
  updatedAt: string;
  outputRef: string | null;
};

export type StoredRendering = {
  derivedFromFinalModelRevisionId: string | null;
  updatedAt: string | null;
  outputs: { id: string; sourceFinalModelRevisionId: string; createdAt: string }[];
};

export type DownstreamPipelineFile = {
  contract: typeof DOWNSTREAM_PIPELINE_CONTRACT;
  interpretation: StoredInterpretation;
  enclosure: StoredEnclosure;
  finalEnclosedModel: StoredFinalModel;
  slices: StoredSlice[];
  drawings: StoredDrawing[];
  rendering: StoredRendering;
};

export function assemblyRevisionSignature(assembly: ClusterAssemblyRecord | null) {
  if (!assembly) return null;
  const occupancy = assembly.occupancy
    .map((item) => `${item.zoneId}:${item.programId}:${item.finishedClusterId}:${item.transform.x}:${item.transform.y}:${item.transform.z}:${item.transform.rotationY}`)
    .join(";");
  return `${assembly.assemblyId}|${assembly.selectedNetworkId}|${assembly.zoningSignature}|${occupancy}|${assembly.updatedAt}`;
}

function emptyInterpretation(): StoredInterpretation {
  return {
    interpretationRevisionId: null,
    derivedFromAssemblyId: null,
    derivedFromAssemblyRevision: null,
    outputGeometryRef: null,
    updatedAt: null,
    previous: [],
  };
}

function emptyEnclosure(): StoredEnclosure {
  return {
    enclosureRevisionId: null,
    derivedFromInterpretationRevisionId: null,
    finalEnclosedModelRef: null,
    updatedAt: null,
    previous: [],
  };
}

function emptyFinalModel(): StoredFinalModel {
  return {
    modelRevisionId: null,
    enclosureRevisionId: null,
    sourceInterpretationRevisionId: null,
    geometryRef: null,
    updatedAt: null,
    units: "foot",
    axes: { x: "east", y: "up", z: "north" },
    siteModelRef: SITE_CONTEXT_PATH,
  };
}

function emptyFile(): DownstreamPipelineFile {
  return {
    contract: DOWNSTREAM_PIPELINE_CONTRACT,
    interpretation: emptyInterpretation(),
    enclosure: emptyEnclosure(),
    finalEnclosedModel: emptyFinalModel(),
    slices: [],
    drawings: [],
    rendering: { derivedFromFinalModelRevisionId: null, updatedAt: null, outputs: [] },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function readString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function nextId(prefix: string, ids: readonly string[]) {
  let max = 0;
  const pattern = new RegExp(`^${prefix}(\\d+)$`);
  for (const id of ids) {
    const match = pattern.exec(id);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `${prefix}${String(max + 1).padStart(2, "0")}`;
}

function defaultPlane(type: SliceType): SlicePlane {
  return type === "horizontal"
    ? { origin: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 } }
    : { origin: { x: 0, y: 0, z: 0 }, normal: { x: 1, y: 0, z: 0 } };
}

export function readDownstreamPipelineFile(): DownstreamPipelineFile {
  try {
    const body = JSON.parse(readFileSync(FILE, "utf8")) as unknown;
    if (!isRecord(body) || body.contract !== DOWNSTREAM_PIPELINE_CONTRACT) return emptyFile();
    const interpretation = isRecord(body.interpretation) ? body.interpretation : {};
    const enclosure = isRecord(body.enclosure) ? body.enclosure : {};
    const finalModel = isRecord(body.finalEnclosedModel) ? body.finalEnclosedModel : {};
    const rendering = isRecord(body.rendering) ? body.rendering : {};
    return {
      contract: DOWNSTREAM_PIPELINE_CONTRACT,
      interpretation: {
        interpretationRevisionId: readString(interpretation.interpretationRevisionId),
        derivedFromAssemblyId: readString(interpretation.derivedFromAssemblyId),
        derivedFromAssemblyRevision: readString(interpretation.derivedFromAssemblyRevision),
        outputGeometryRef: readString(interpretation.outputGeometryRef),
        updatedAt: readString(interpretation.updatedAt),
        previous: Array.isArray(interpretation.previous) ? interpretation.previous.flatMap((item) => {
          if (!isRecord(item) || typeof item.interpretationRevisionId !== "string") return [];
          return [{
            interpretationRevisionId: item.interpretationRevisionId,
            derivedFromAssemblyId: readString(item.derivedFromAssemblyId),
            derivedFromAssemblyRevision: readString(item.derivedFromAssemblyRevision),
            outputGeometryRef: readString(item.outputGeometryRef),
            updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : "",
          }];
        }) : [],
      },
      enclosure: {
        enclosureRevisionId: readString(enclosure.enclosureRevisionId),
        derivedFromInterpretationRevisionId: readString(enclosure.derivedFromInterpretationRevisionId),
        finalEnclosedModelRef: readString(enclosure.finalEnclosedModelRef),
        updatedAt: readString(enclosure.updatedAt),
        previous: Array.isArray(enclosure.previous) ? enclosure.previous.flatMap((item) => {
          if (!isRecord(item) || typeof item.enclosureRevisionId !== "string") return [];
          return [{
            enclosureRevisionId: item.enclosureRevisionId,
            derivedFromInterpretationRevisionId: readString(item.derivedFromInterpretationRevisionId),
            finalEnclosedModelRef: readString(item.finalEnclosedModelRef),
            updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : "",
          }];
        }) : [],
      },
      finalEnclosedModel: {
        modelRevisionId: readString(finalModel.modelRevisionId),
        enclosureRevisionId: readString(finalModel.enclosureRevisionId),
        sourceInterpretationRevisionId: readString(finalModel.sourceInterpretationRevisionId),
        geometryRef: readString(finalModel.geometryRef),
        updatedAt: readString(finalModel.updatedAt),
        units: "foot",
        axes: { x: "east", y: "up", z: "north" },
        siteModelRef: SITE_CONTEXT_PATH,
      },
      slices: Array.isArray(body.slices) ? body.slices.flatMap((item) => {
        if (!isRecord(item) || typeof item.sliceId !== "string" || typeof item.name !== "string") return [];
        const type = item.type === "vertical" ? "vertical" : item.type === "horizontal" ? "horizontal" : null;
        if (!type) return [];
        return [{
          sliceId: item.sliceId,
          name: item.name,
          type,
          sourceFinalModelRevisionId: readString(item.sourceFinalModelRevisionId),
          plane: isRecord(item.plane) ? {
            origin: { x: Number(isRecord(item.plane.origin) ? item.plane.origin.x : 0) || 0, y: Number(isRecord(item.plane.origin) ? item.plane.origin.y : 0) || 0, z: Number(isRecord(item.plane.origin) ? item.plane.origin.z : 0) || 0 },
            normal: { x: Number(isRecord(item.plane.normal) ? item.plane.normal.x : 0) || 0, y: Number(isRecord(item.plane.normal) ? item.plane.normal.y : 0) || 0, z: Number(isRecord(item.plane.normal) ? item.plane.normal.z : 0) || 0 },
          } : defaultPlane(type),
          createdAt: typeof item.createdAt === "string" ? item.createdAt : "",
          updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : "",
          geometryRef: readString(item.geometryRef),
        }];
      }) : [],
      drawings: Array.isArray(body.drawings) ? body.drawings.flatMap((item) => {
        if (!isRecord(item) || typeof item.drawingId !== "string" || typeof item.sourceSliceId !== "string") return [];
        const drawingType = item.drawingType === "section" ? "section" : item.drawingType === "floor-plan" ? "floor-plan" : null;
        if (!drawingType) return [];
        return [{
          drawingId: item.drawingId,
          sourceSliceId: item.sourceSliceId,
          sourceFinalModelRevisionId: readString(item.sourceFinalModelRevisionId),
          drawingType,
          siteContextRevision: typeof item.siteContextRevision === "string" ? item.siteContextRevision : "",
          createdAt: typeof item.createdAt === "string" ? item.createdAt : "",
          updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : "",
          outputRef: readString(item.outputRef),
        }];
      }) : [],
      rendering: {
        derivedFromFinalModelRevisionId: readString(rendering.derivedFromFinalModelRevisionId),
        updatedAt: readString(rendering.updatedAt),
        outputs: Array.isArray(rendering.outputs) ? rendering.outputs.flatMap((item) => {
          if (!isRecord(item) || typeof item.id !== "string" || typeof item.sourceFinalModelRevisionId !== "string") return [];
          return [{ id: item.id, sourceFinalModelRevisionId: item.sourceFinalModelRevisionId, createdAt: typeof item.createdAt === "string" ? item.createdAt : "" }];
        }) : [],
      },
    };
  } catch {
    return emptyFile();
  }
}

function writeFile(document: DownstreamPipelineFile) {
  writeFileSync(FILE, `${JSON.stringify(document, null, 2)}\n`, "utf8");
  return document;
}

function lineage(hasSource: boolean, derivedFrom: string | null, live: string | null, hasWorking: boolean): LineageStatus {
  if (!hasSource || !live) return "no-source";
  if (!hasWorking) return "awaiting";
  return derivedFrom === live ? "current-source" : "stale-source";
}

/**
 * Interpretation geometry completeness. A revision id is not a Current Integrated Architectural Model.
 * Readings and null outputGeometryRef never count as complete.
 */
export function interpretationGeometryStatus(input: {
  selectedAssemblyId: string | null;
  liveAssemblyRevision: string | null;
  interpretationRevisionId: string | null;
  derivedFromAssemblyRevision: string | null;
  outputGeometryRef: string | null;
}): GeometryStatus {
  if (!input.selectedAssemblyId || !input.liveAssemblyRevision) return "no-source";
  const matches = input.derivedFromAssemblyRevision === input.liveAssemblyRevision;
  if (input.outputGeometryRef && matches) return "complete";
  if (input.interpretationRevisionId || input.outputGeometryRef) {
    return matches ? "working" : "stale-source";
  }
  return "source-ready";
}

export function completeInterpretationRevision(document: DownstreamPipelineFile, liveAssemblyRevision: string | null) {
  if (!document.interpretation.outputGeometryRef) return null;
  if (!liveAssemblyRevision || document.interpretation.derivedFromAssemblyRevision !== liveAssemblyRevision) return null;
  return document.interpretation.interpretationRevisionId;
}

export type ResolvedInterpretation = {
  contract: typeof INTERPRETATION_AUTHORITY_CONTRACT;
  sourceAssemblyId: string | null;
  sourceAssemblyRevision: string | null;
  sourceNetworkId: string | null;
  sourceZoningSignature: string | null;
  sourceOccupancyIds: string[];
  sourceFinishedClusterIds: string[];
  occupancyCount: number;
  sourceReady: boolean;
  interpretationRevisionId: string | null;
  updatedAt: string | null;
  status: GeometryStatus;
  geometryStatus: GeometryStatus;
  outputGeometryRef: string | null;
  productionImplementation: "selected-assembly-reading";
  legacyImplementation: "skill6-assembled";
  legacyMatchesProductionSource: false;
  previous: StoredInterpretationSnapshot[];
};

export type ResolvedEnclosure = {
  contract: typeof ENCLOSURE_AUTHORITY_CONTRACT;
  sourceInterpretationRevisionId: string | null;
  enclosureRevisionId: string | null;
  updatedAt: string | null;
  status: LineageStatus;
  validInput: boolean;
  inputGeometryStatus: GeometryStatus;
  finalEnclosedModelRef: string | null;
  previous: StoredEnclosureSnapshot[];
};

export type ResolvedFinalModel = {
  contract: typeof FINAL_ENCLOSED_MODEL_CONTRACT;
  modelRevisionId: string | null;
  enclosureRevisionId: string | null;
  sourceInterpretationRevisionId: string | null;
  updatedAt: string | null;
  geometryRef: string | null;
  units: "foot";
  axes: { x: "east"; y: "up"; z: "north" };
  siteModelRef: typeof SITE_CONTEXT_PATH;
  status: LineageStatus;
};

export type ResolvedSlice = StoredSlice & {
  liveFinalModelRevisionId: string | null;
  status: LineageStatus;
  geometryStatus: "not-implemented";
};

export type ResolvedDrawing = StoredDrawing & {
  liveSliceSourceFinalModelRevisionId: string | null;
  liveFinalModelRevisionId: string | null;
  liveSiteContextRevision: string;
  status: LineageStatus;
  outputStatus: "not-implemented";
};

export type ResolvedRendering = {
  contract: typeof RENDERING_CONTRACT;
  sourceFinalModelRevisionId: string | null;
  siteContext: SiteContextSource;
  status: LineageStatus;
  outputStatus: "not-implemented";
  outputs: StoredRendering["outputs"];
};

export type ResolvedPipeline = {
  contract: typeof DOWNSTREAM_PIPELINE_CONTRACT;
  interpretation: ResolvedInterpretation;
  enclosure: ResolvedEnclosure;
  finalEnclosedModel: ResolvedFinalModel;
  slicing: { contract: typeof SLICING_CONTRACT; slices: ResolvedSlice[] };
  drawing: { contract: typeof DRAWING_CONTRACT; drawings: ResolvedDrawing[] };
  rendering: ResolvedRendering;
  siteContext: SiteContextSource;
};

export function resolveDownstreamPipeline(document = readDownstreamPipelineFile()): ResolvedPipeline {
  const checkpoint = readDevelopmentCheckpoint();
  const siteContext = readSiteContextSource();
  const assembly = checkpoint.assembly;
  const sourceAssemblyRevision = assemblyRevisionSignature(assembly);
  const geometryStatus = interpretationGeometryStatus({
    selectedAssemblyId: checkpoint.selectedAssemblyId,
    liveAssemblyRevision: sourceAssemblyRevision,
    interpretationRevisionId: document.interpretation.interpretationRevisionId,
    derivedFromAssemblyRevision: document.interpretation.derivedFromAssemblyRevision,
    outputGeometryRef: document.interpretation.outputGeometryRef,
  });
  const liveCompleteInterpretation = completeInterpretationRevision(document, sourceAssemblyRevision);
  const enclosureStatus = lineage(
    Boolean(liveCompleteInterpretation),
    document.enclosure.derivedFromInterpretationRevisionId,
    liveCompleteInterpretation,
    Boolean(document.enclosure.enclosureRevisionId),
  );
  const liveModelRevision = liveCompleteInterpretation ? document.finalEnclosedModel.modelRevisionId : null;
  const finalStatus = lineage(
    Boolean(liveCompleteInterpretation) && Boolean(document.enclosure.enclosureRevisionId),
    document.finalEnclosedModel.enclosureRevisionId,
    document.enclosure.enclosureRevisionId,
    Boolean(liveModelRevision),
  );
  const slices: ResolvedSlice[] = document.slices.map((slice) => ({
    ...slice,
    liveFinalModelRevisionId: liveModelRevision,
    status: lineage(Boolean(liveModelRevision), slice.sourceFinalModelRevisionId, liveModelRevision, Boolean(slice.sourceFinalModelRevisionId)),
    geometryStatus: "not-implemented",
  }));
  const drawings: ResolvedDrawing[] = document.drawings.map((drawing) => {
    const slice = slices.find((item) => item.sliceId === drawing.sourceSliceId) ?? null;
    const liveSliceModel = slice?.sourceFinalModelRevisionId ?? null;
    const drawingLineage = lineage(
      Boolean(liveModelRevision) && Boolean(slice),
      drawing.sourceFinalModelRevisionId,
      liveModelRevision,
      Boolean(drawing.sourceFinalModelRevisionId),
    );
    const sliceStale = slice ? slice.status === "stale-source" : true;
    const siteStale = drawing.siteContextRevision !== siteContext.revision;
    return {
      ...drawing,
      liveSliceSourceFinalModelRevisionId: liveSliceModel,
      liveFinalModelRevisionId: liveModelRevision,
      liveSiteContextRevision: siteContext.revision,
      status: !slice ? "no-source" : drawingLineage === "current-source" && !sliceStale && !siteStale ? "current-source" : drawingLineage === "no-source" ? "no-source" : "stale-source",
      outputStatus: "not-implemented",
    };
  });
  const renderingStatus = lineage(
    Boolean(liveModelRevision),
    document.rendering.derivedFromFinalModelRevisionId ?? liveModelRevision,
    liveModelRevision,
    Boolean(liveModelRevision),
  );
  return {
    contract: DOWNSTREAM_PIPELINE_CONTRACT,
    interpretation: {
      contract: INTERPRETATION_AUTHORITY_CONTRACT,
      sourceAssemblyId: checkpoint.selectedAssemblyId,
      sourceAssemblyRevision,
      sourceNetworkId: assembly?.selectedNetworkId ?? null,
      sourceZoningSignature: assembly?.zoningSignature ?? null,
      sourceOccupancyIds: assembly?.occupancy.map((item) => item.occupancyId) ?? [],
      sourceFinishedClusterIds: assembly?.sourceFinishedClusterIds ?? [],
      occupancyCount: assembly?.occupancy.length ?? 0,
      sourceReady: geometryStatus !== "no-source",
      interpretationRevisionId: document.interpretation.interpretationRevisionId,
      updatedAt: document.interpretation.updatedAt,
      status: geometryStatus,
      geometryStatus,
      outputGeometryRef: document.interpretation.outputGeometryRef,
      productionImplementation: "selected-assembly-reading",
      legacyImplementation: "skill6-assembled",
      legacyMatchesProductionSource: false,
      previous: document.interpretation.previous,
    },
    enclosure: {
      contract: ENCLOSURE_AUTHORITY_CONTRACT,
      sourceInterpretationRevisionId: liveCompleteInterpretation,
      enclosureRevisionId: document.enclosure.enclosureRevisionId,
      updatedAt: document.enclosure.updatedAt,
      status: enclosureStatus,
      validInput: Boolean(liveCompleteInterpretation),
      inputGeometryStatus: geometryStatus,
      finalEnclosedModelRef: liveCompleteInterpretation ? document.enclosure.finalEnclosedModelRef : null,
      previous: document.enclosure.previous,
    },
    finalEnclosedModel: {
      contract: FINAL_ENCLOSED_MODEL_CONTRACT,
      modelRevisionId: liveModelRevision,
      enclosureRevisionId: document.finalEnclosedModel.enclosureRevisionId,
      sourceInterpretationRevisionId: document.finalEnclosedModel.sourceInterpretationRevisionId,
      updatedAt: document.finalEnclosedModel.updatedAt,
      geometryRef: document.finalEnclosedModel.geometryRef,
      units: "foot",
      axes: document.finalEnclosedModel.axes,
      siteModelRef: SITE_CONTEXT_PATH,
      status: finalStatus,
    },
    slicing: { contract: SLICING_CONTRACT, slices },
    drawing: { contract: DRAWING_CONTRACT, drawings },
    rendering: {
      contract: RENDERING_CONTRACT,
      sourceFinalModelRevisionId: liveModelRevision,
      siteContext,
      status: renderingStatus,
      outputStatus: "not-implemented",
      outputs: document.rendering.outputs,
    },
    siteContext,
  };
}

/**
 * Records a working Interpretation revision against the live Selected Assembly.
 * Does not generate geometry. Previous working revisions are kept.
 */
export function stampInterpretationRevision() {
  const checkpoint = readDevelopmentCheckpoint();
  if (!checkpoint.selectedAssemblyId || !checkpoint.assembly) {
    throw new DownstreamPipelineError("No Selected Assembly for Development is available.");
  }
  const document = readDownstreamPipelineFile();
  const now = new Date().toISOString();
  if (document.interpretation.interpretationRevisionId) {
    document.interpretation.previous.push({
      interpretationRevisionId: document.interpretation.interpretationRevisionId,
      derivedFromAssemblyId: document.interpretation.derivedFromAssemblyId,
      derivedFromAssemblyRevision: document.interpretation.derivedFromAssemblyRevision,
      outputGeometryRef: document.interpretation.outputGeometryRef,
      updatedAt: document.interpretation.updatedAt ?? now,
    });
  }
  const interpretationRevisionId = nextId("I", [
    ...document.interpretation.previous.map((item) => item.interpretationRevisionId),
    document.interpretation.interpretationRevisionId ?? "",
  ]);
  document.interpretation.interpretationRevisionId = interpretationRevisionId;
  document.interpretation.derivedFromAssemblyId = checkpoint.selectedAssemblyId;
  document.interpretation.derivedFromAssemblyRevision = assemblyRevisionSignature(checkpoint.assembly);
  document.interpretation.outputGeometryRef = null;
  document.interpretation.updatedAt = now;
  writeFile(document);
  return resolveDownstreamPipeline(document);
}

/**
 * Records a working Enclosure revision against the live Interpretation revision.
 * Also advances the Final Enclosed Model checkpoint. No geometry is generated.
 */
export function stampEnclosureRevision() {
  const checkpoint = readDevelopmentCheckpoint();
  const document = readDownstreamPipelineFile();
  const liveAssemblyRevision = assemblyRevisionSignature(checkpoint.assembly);
  const interpretationRevisionId = completeInterpretationRevision(document, liveAssemblyRevision);
  if (!interpretationRevisionId) {
    throw new DownstreamPipelineError("Enclosure requires a complete Current Integrated Architectural Model. A reading, a revision stamp, or a null outputGeometryRef is not valid input.");
  }
  const now = new Date().toISOString();
  if (document.enclosure.enclosureRevisionId) {
    document.enclosure.previous.push({
      enclosureRevisionId: document.enclosure.enclosureRevisionId,
      derivedFromInterpretationRevisionId: document.enclosure.derivedFromInterpretationRevisionId,
      finalEnclosedModelRef: document.enclosure.finalEnclosedModelRef,
      updatedAt: document.enclosure.updatedAt ?? now,
    });
  }
  const enclosureRevisionId = nextId("E", [
    ...document.enclosure.previous.map((item) => item.enclosureRevisionId),
    document.enclosure.enclosureRevisionId ?? "",
  ]);
  const modelRevisionId = nextId("M", [document.finalEnclosedModel.modelRevisionId ?? ""]);
  document.enclosure.enclosureRevisionId = enclosureRevisionId;
  document.enclosure.derivedFromInterpretationRevisionId = interpretationRevisionId;
  document.enclosure.finalEnclosedModelRef = `final-enclosed:${modelRevisionId}`;
  document.enclosure.updatedAt = now;
  document.finalEnclosedModel = {
    modelRevisionId,
    enclosureRevisionId,
    sourceInterpretationRevisionId: interpretationRevisionId,
    geometryRef: null,
    updatedAt: now,
    units: "foot",
    axes: { x: "east", y: "up", z: "north" },
    siteModelRef: SITE_CONTEXT_PATH,
  };
  document.rendering.derivedFromFinalModelRevisionId = modelRevisionId;
  document.rendering.updatedAt = now;
  writeFile(document);
  return resolveDownstreamPipeline(document);
}

export function createSliceDefinition(input: { name?: string; type: SliceType; plane?: SlicePlane }) {
  const document = readDownstreamPipelineFile();
  const now = new Date().toISOString();
  const sliceId = nextId("S", document.slices.map((item) => item.sliceId));
  const type = input.type;
  const record: StoredSlice = {
    sliceId,
    name: input.name?.trim() || sliceId,
    type,
    sourceFinalModelRevisionId: document.finalEnclosedModel.modelRevisionId,
    plane: input.plane ?? defaultPlane(type),
    createdAt: now,
    updatedAt: now,
    geometryRef: null,
  };
  document.slices.push(record);
  writeFile(document);
  return resolveDownstreamPipeline(document);
}

export function createDrawingFromSlice(sliceId: string) {
  const document = readDownstreamPipelineFile();
  const slice = document.slices.find((item) => item.sliceId === sliceId);
  if (!slice) throw new DownstreamPipelineError("That slice is not in the Slicing catalog.");
  const siteContext = readSiteContextSource();
  const now = new Date().toISOString();
  const drawingId = nextId("D", document.drawings.map((item) => item.drawingId));
  const record: StoredDrawing = {
    drawingId,
    sourceSliceId: slice.sliceId,
    sourceFinalModelRevisionId: document.finalEnclosedModel.modelRevisionId,
    drawingType: slice.type === "horizontal" ? "floor-plan" : "section",
    siteContextRevision: siteContext.revision,
    createdAt: now,
    updatedAt: now,
    outputRef: null,
  };
  document.drawings.push(record);
  writeFile(document);
  return resolveDownstreamPipeline(document);
}
