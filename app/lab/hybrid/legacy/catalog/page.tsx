import { HybridAssembly } from "@/components/hybrid/hybrid-assembly";

export const metadata = {
  title: "Catalog -+ Hybrid Cluster archive -+ Living Morphologies",
};

/** Older two-parent assembly catalog. Off the live tabs. Data stays in the browser catalog. */
export default function LegacyHybridCatalogPage() {
  return <HybridAssembly view="catalog" />;
}
