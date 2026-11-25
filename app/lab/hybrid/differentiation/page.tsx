import { redirect } from "next/navigation";
import { DifferentiationReview } from "@/components/hybrid/differentiation-review";
import { PROGRAM_CLUSTER_2_ARCHIVED } from "@/lib/site-map";

export const metadata = {
  title: "Differentiation Test -+ Hybrid Connection -+ Living Morphologies",
};

export default function DifferentiationPage() {
  if (PROGRAM_CLUSTER_2_ARCHIVED) redirect("/lab/hybrid");
  return <DifferentiationReview />;
}
