import { VerticalCatalogue } from "@/components/vertical-catalogue";

export const metadata = {
  title: "3D Catalogue -+ Living Morphologies",
};

export default function VerticalCataloguePage() {
  return (
    <VerticalCatalogue
      initial={null}
      candidate={{
        archetypeId: "vertical-void",
        archetypeName: "Vertical Void",
        typologyId: "lobby",
        candidateId: 351,
      }}
    />
  );
}
