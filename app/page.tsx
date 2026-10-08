import { HomePage } from "@/components/home-page";
import { loadLabDemo } from "@/lib/home-lab-demo";
import { loadHomeResultPlates } from "@/lib/home-result-plates";

export const metadata = {
  title: "Home · Living Morphologies",
};

export default function Home() {
  return <HomePage plates={loadHomeResultPlates()} demo={loadLabDemo()} />;
}
