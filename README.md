# LIVING MORPHOLOGIES
The official interface is the architectural source-of-truth board: typology → archetype → catalog criteria → descriptors. Skill 1 maps those ratings into Physarum agent behavior for every archetype in every typology. Generate runs the 20×20 agent field as a 2D plan, with an iteration timeline beside it.
Catalog data in `lib/catalog.ts` is the source of truth for ratings and descriptors. Do not rewrite those values from the prototype generator.
## Run
```bash
npm install
npm run dev
```
Open [http://127.0.0.1:43141](http://127.0.0.1:43141).
```bash
npx tsx lib/skill1/verify.ts   # traces every archetype and distinguishes Void Field from Contained Room
npm run search:void            # 50 Void Field seeds → screenshots + scores
npm run search:contained       # 50 Contained Room seeds → screenshots + scores
npm run build
npm start
```
## Stack
Next.js, TypeScript, Tailwind.
## Skills
Cursor skill definitions live in `.cursor/skills/`.
- Skill 1 (`architecture-to-physarum`) is complete: all 15 archetypes translate into Physarum behavior. The Skill 2 payload is `Skill1Handoff` from `toHandoff()`.
- Skill 2 (`physarum-2d-generation`) starts from that handoff. Do not rewrite Skill 1 translation or `lib/catalog.ts`.
- Skill 3 (`vertical-propagation`) starts only after Skill 2 has selected 15 2D outcomes.
