import { LAB_WORKSPACES } from "@/lib/site-map";

const NOTES = {
  physarum: {
    start: 0,
    lines: [
      { at: 0, text: "An archetype carries the architectural criteria, and those criteria set the agent." },
      { at: 10.82, text: "Runs lay out a field of sections for that archetype." },
      { at: 20.81, text: "The catalog keeps the saved plates." },
    ],
  },
  optimization: {
    start: 30.97,
    lines: [
      { at: 30.97, text: "Four generations search outward from the Physarum translation." },
      { at: 42.12, text: "Pareto holds the candidates that are not dominated." },
      { at: 52.28, text: "The catalog keeps the plates chosen to continue." },
    ],
  },
  vertical: {
    start: 62.44,
    lines: [
      { at: 62.44, text: "A plate is carried upward, and time becomes height." },
      { at: 73.59, text: "The 3D catalog opens once that height is verified." },
      { at: 83.75, text: "The final archive keeps one morphology for each archetype." },
    ],
  },
  hybrid: {
    start: 93.74,
    lines: [
      { at: 93.74, text: "Modules are placed together on the aggregation canvas." },
      { at: 104.89, text: "The catalog tests the joint between their faces." },
    ],
  },
} as const;

export const LAB_DEMO_CHAPTERS = LAB_WORKSPACES.map((workspace) => ({
  id: workspace.id,
  label: workspace.label,
  start: NOTES[workspace.id].start,
  lines: NOTES[workspace.id].lines,
}));

export type LabDemoChapter = (typeof LAB_DEMO_CHAPTERS)[number];

export type LabDemoMedia = {
  src: string | null;
  poster: string | null;
};

export function labDemoChapterAt(time: number) {
  let index = 0;
  LAB_DEMO_CHAPTERS.forEach((chapter, item) => {
    if (chapter.start <= time + 0.05) index = item;
  });
  return index;
}

export function labDemoLinesVisible(time: number, lines: readonly { at: number }[]) {
  const count = lines.filter((line) => line.at <= time + 0.05).length;
  return Math.max(1, count);
}
