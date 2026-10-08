import { HomePage } from "@/components/home-page";
import type { LabDemoMedia } from "@/lib/home-lab-demo";
import type { HomeResultPlates } from "@/lib/home-result-plates";
import presentation from "@/public/demo/home/presentation.json";

export const metadata = {
  title: "Home · Living Morphologies",
};

export default function Home() {
  return (
    <HomePage
      plates={presentation.plates as HomeResultPlates}
      demo={presentation.labDemo as LabDemoMedia}
    />
  );
}
