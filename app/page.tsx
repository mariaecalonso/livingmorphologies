import { HomePage } from "@/components/home-page";
import type { LabDemoMedia } from "@/lib/home-lab-demo";
import { loadHomeResultPlates } from "@/lib/home-result-plates";
import presentation from "@/public/demo/home/presentation.json";

export const metadata = {
  title: "Home · Living Morphologies",
};

export default function Home() {
  // presentation.plates is unused legacy. See lib/publication-sources.ts.
  return (
    <HomePage
      plates={loadHomeResultPlates()}
      demo={presentation.labDemo as LabDemoMedia}
    />
  );
}
