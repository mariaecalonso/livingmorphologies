# Network constrained void (provisional)

Experimental study only. Not part of the live Site Integration stage bar.

## Route

- UI: `/lab/site/network-void`
- API: `POST /api/skill5/network-void`

## Authority

This study does **not** read Site Strategy, designer zoning, or the selected Cluster Assembly (A07). It uses fixed test poses and a provisional domain polygon so the void algorithm can run in isolation.

## Code map

| Area | Path |
| --- | --- |
| Algorithm | `lib/skill5/network-constrained-void.ts` |
| Domain union | `lib/skill5/network-void-domain.ts` |
| Frozen cluster solids | `lib/skill5/network-void-assembly.ts` |
| Browser shell | `components/site/network-void-process.tsx` |
| Proofs | `scripts/prove-network-void.ts`, `scripts/prove-network-void-domain.ts`, `scripts/benchmark-void-boundary.ts` |

## Data dependencies

- Final cluster shrink-wrap meshes: `data/skill4/final-clusters/{pairId}/{clusterId}.json`
- Pair index: `data/skill4/final-clusters-pairs/{pairId}.json`

## Continue development

1. Clone the repo and install dependencies (`npm install`).
2. Read the algorithm entrypoint `generateNetworkConstrainedVoid` in `network-constrained-void.ts`.
3. Open `/lab/site/network-void` in the dev server (`npm run dev`).
4. Adjust cell, shelter, and minimum-gap in the UI; optional continuous boundary toggles the distance-field rebuild path.
5. Run `npx tsx scripts/prove-network-void.ts` for a headless smoke check.

Do not promote this route onto the Site Integration tabs without an explicit contract change in `lab-shell` and `lab-contracts`.