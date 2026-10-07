import Link from "next/link";
import { Skill2SelectionBoard } from "@/components/skill2-selected-candidate";
import { VerticalProcess } from "@/components/vertical-process";
import { VerticalSelectionNotice } from "@/components/vertical-selection";
import { buildDevelopmentFixture } from "@/lib/skill3/fixture";
import { selectionFromQuery } from "@/lib/skill3/selection";

export const metadata = {
  title: "Vertical Propagation -+ Living Morphologies",
};

export const dynamic = "force-dynamic";

export default async function VerticalPropagationPage({
  searchParams,
}: {
  searchParams: Promise<{
    fixture?: string;
    archetype?: string | string[];
    candidate?: string | string[];
  }>;
}) {
  const params = await searchParams;
  if (params.fixture === "1") {
    return <VerticalProcess initial={buildDevelopmentFixture()} candidate={null} provenance={null} />;
  }

  const requested = selectionFromQuery(params);
  if ("error" in requested) return <VerticalSelectionNotice title="This candidate could not be opened." detail={requested.error} />;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Skill2SelectionBoard />
      <p className="skill2-fixture-link">
        <Link href="/lab/vertical?fixture=1">Development fixture</Link>
      </p>
      <div className="min-h-0 flex-1">
        <VerticalProcess initial={null} candidate={null} provenance={null} />
      </div>
    </div>
  );
}
