import { existsSync } from "node:fs";
import { join } from "node:path";
import type { LabDemoMedia } from "@/lib/home-lab-demo-chapters";

export type { LabDemoMedia };

/** Drop `public/lab-demo/walk.mp4` and, if you have one, `public/lab-demo/poster.webp`. */
export function loadLabDemo(): LabDemoMedia {
  const dir = join(process.cwd(), "public", "lab-demo");
  return {
    src: existsSync(join(dir, "walk.mp4")) ? "/lab-demo/walk.mp4" : null,
    poster: existsSync(join(dir, "poster.webp")) ? "/lab-demo/poster.webp" : null,
  };
}
