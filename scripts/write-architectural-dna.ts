import { writeFileSync } from "node:fs";
import { SITE_ARCHETYPES } from "../lib/skill5/catalog";
import { applicableCriteria } from "../lib/skill5/architectural-dna";
import type { Rating } from "../lib/types";

type Basis = "geometry" | "review";
type Row = [string, Rating, Basis, string];

const TEXT: Record<string, Row[]> = {
  "vertical-void": [
    ["complexity", 2, "geometry", "The body is tall and nearly square in plan, with the highest lobby surface folding (isoperimetric 9.5) and a strong change in section area (0.64). The void is wrapped by many shifts rather than one simple figure."],
    ["proportionality", 1, "geometry", "The overall box is balanced, about 20 by 20 by 17 ft, while the section area still changes. The contrast is noticeable and not a set of extreme scales."],
    ["centrality", 1, "review", "The solid covers 77% of its plan and the centroid sits 0.20 off the envelope center, so the mass reads as a central body with a shifted core. Its position among other rooms is not in this mesh."],
    ["openness", 1, "geometry", "Only 27% of the envelope is solid, but 77% of the plan columns are occupied. The void is held inside a broad mass, which is a mixed open and enclosed condition."],
    ["connectivity", 1, "review", "The mesh is one body around an internal void. Links to rooms outside this tile are not present, so the moderate reading is provisional."],
    ["directionality", 0, "geometry", "Plan anisotropy is 1.08, the lowest in the set. Movement and view are not organized by one axis."],
    ["immersive", 2, "review", "The tall folded enclosure is the deepest lobby body in the set. Light, material, and sound are not in the mesh, so the atmospheric reading needs review."],
    ["visibility", 1, "review", "A broad occupied plan interrupts views across the tile. A vertical shaft may open one sightline, but that shaft was not separated from the solid."],
    ["receptivity", 1, "review", "The volume is open enough to enter and folded enough to feel controlled. Invitation is an interpretation of that mix, not a measured social condition."],
  ],
  "compressed-sequential": [
    ["complexity", 2, "geometry", "Section area changes more here than in any other tile (0.74), along a body whose surface is still clearly folded. The sequence is a stack of distinct geometric states."],
    ["proportionality", 2, "geometry", "The successive sections change size sharply inside one length. That is a strong contrast of spatial dimension, not a uniform tube."],
    ["centrality", 0, "review", "The centroid is pulled 0.25 off the envelope center, along the sequence rather than held as a middle node. Surrounding rooms are not in the mesh."],
    ["openness", 1, "geometry", "The solid is 26% of the envelope and 65% of the plan is occupied. Open pockets and enclosed stretches sit in the same sequence."],
    ["connectivity", 1, "review", "The sequence is one continuous body. How many adjacent spaces it would serve cannot be read from the mesh alone."],
    ["directionality", 2, "geometry", "Plan anisotropy is 2.49. One long axis organizes the sequence, with the section changes as the secondary event."],
    ["immersive", 2, "review", "The compressed, strongly changing section wraps the path. Sensory qualities beyond that enclosure were not measured."],
    ["visibility", 1, "review", "The long axis can carry a view, and the changing section interrupts it. Sightlines were not raycast."],
    ["receptivity", 1, "review", "Compression reads as controlled rather than openly welcoming. That social reading is provisional."],
  ],
  "continuous-hall": [
    ["complexity", 1, "geometry", "This is the simplest lobby solid: surface complexity 7.82 and a moderate section change of 0.43. The hall stays one recognizable figure."],
    ["proportionality", 0, "geometry", "The three axes are close, about 17 by 16 by 17 ft. Size relationships inside the body stay relatively uniform."],
    ["centrality", 1, "review", "The solid centroid is the most offset lobby mass, at 0.28, so it does not sit as a centered node. Its role in a larger plan is not in the mesh."],
    ["openness", 2, "geometry", "The solid is only 19% of the envelope, the lowest in the set, and only 56% of the plan is occupied. The hall is predominantly open."],
    ["connectivity", 2, "review", "The open continuous body reads as one linked hall. Connections beyond the tile were not measured, so this stays under review."],
    ["directionality", 2, "geometry", "Plan anisotropy is 2.54. A primary direction organizes the hall."],
    ["immersive", 1, "review", "The low solid fraction leaves the hall open rather than deeply enveloping. Atmosphere beyond enclosure was not measured."],
    ["visibility", 1, "review", "The open plan supports views along the hall, while the directional body limits the cross axis. Sightlines were not raycast."],
    ["receptivity", 2, "review", "The most open lobby body is the clearest invitation in the set. Whether that feels welcoming is still an interpretation."],
  ],
  "topographic-ground-field": [
    ["complexity", 2, "geometry", "Surface complexity is 8.86 and the section area changes by 0.58. The ground is built from many shifts rather than one plate."],
    ["proportionality", 1, "geometry", "The box is nearly equal, about 18 by 20 by 19 ft, while the ground section still varies. The contrast is noticeable and stays in balance."],
    ["centrality", 1, "review", "The field covers the middle of its envelope, with the centroid 0.22 off center. It is not a side piece, and it is not a single access node. Surroundings are absent."],
    ["openness", 1, "geometry", "The solid is 25% of the envelope and 67% of the plan is occupied. Open ground and covered ground are mixed."],
    ["connectivity", 2, "review", "The field is one distributed body, which can touch many edges. Those adjacent spaces are not in the mesh."],
    ["directionality", 1, "geometry", "Plan anisotropy is 1.45. A mild primary direction is present, and other directions remain."],
    ["immersive", 2, "review", "The folded ground surrounds the occupant more than a flat plate. Light and material were not measured."],
    ["visibility", 1, "review", "Two thirds of the plan columns are occupied, so views across the field are partial. Sightlines were not raycast."],
    ["receptivity", 1, "review", "The open ground is accessible, and the folds keep some control. Invitation remains interpretive."],
  ],
  "linear-gallery": [
    ["complexity", 1, "geometry", "Surface complexity is 7.98 and the section change is 0.52. The gallery has several events along one recognizable bar."],
    ["proportionality", 1, "geometry", "The bar is longer than it is thick, and the section changes are moderate. The size relationships stay readable."],
    ["centrality", 2, "review", "The centroid offset is 0.17 and the bar holds the middle of its envelope, closer to a spine than a side room. Other spaces are not in the mesh."],
    ["openness", 1, "geometry", "This is the most solid lobby mass, at 31% of the envelope, with 66% of the plan occupied. Enclosure and opening are mixed."],
    ["connectivity", 1, "review", "The bar is one piece. The number of rooms it would connect is not in the mesh."],
    ["directionality", 1, "geometry", "Plan anisotropy is 1.46. The gallery has a direction, and it is milder than a strongly axial hall."],
    ["immersive", 1, "review", "The enclosure is moderate. Sensory conditions beyond the solid were not measured."],
    ["visibility", 1, "review", "A linear figure can carry a view along its length and blocks the cross direction. Sightlines were not raycast."],
    ["receptivity", 1, "review", "The gallery is legible and not compressed shut. The social tone of that legibility needs review."],
  ],
  "open-hall": [
    ["complexity", 1, "geometry", "Surface complexity is 8.8 and the section change is 0.43. The hall is varied without becoming a stack of separate figures."],
    ["proportionality", 1, "geometry", "The plan is square, 20 by 20 ft, and the height is 15 ft. Proportions vary, and they stay in one family."],
    ["plate-articulation", 0, "geometry", "The section area stays relatively steady and the plan is one directional hall. The plate is not broken into shifts, recesses, or rotated parts."],
    ["openness", 2, "geometry", "The solid is 21% of the envelope and only half of the plan columns are occupied, the most open workspace footprint."],
    ["connectivity", 1, "review", "The open hall is one linked volume. Relationships to neighboring tiles are not in the mesh."],
    ["modularity", 0, "geometry", "The stored module is one continuous manifold body. Repeated, interchangeable units are not present in the mesh."],
    ["immersive", 1, "review", "The hall is open rather than deeply wrapped. Sensory immersion was not measured."],
    ["visibility", 2, "geometry", "Half of the plan is unoccupied, so views can cross the tile with little solid in the way."],
    ["collaboration", 1, "review", "The open volume can be shared, and no separate individual rooms were found. That social reading needs review."],
  ],
  terraced: [
    ["complexity", 1, "geometry", "Surface complexity is 8.75, with the steadiest workspace section (0.32). The terraces add events without dissolving the figure."],
    ["proportionality", 0, "geometry", "The axes stay close and each section has a similar area. The size relationships are relatively uniform."],
    ["plate-articulation", 1, "geometry", "The plan is broad, 78% occupied, and the surface is folded, while the section area barely changes. The plate is divided, not strongly shifted or recessed."],
    ["openness", 1, "geometry", "The solid is 30% of the envelope and 78% of the plan is occupied. The terraces are more enclosed than the open hall."],
    ["connectivity", 1, "review", "One body links the terraces. Links beyond the tile were not measured."],
    ["modularity", 1, "review", "Similar section areas suggest repeated terraces, but the units were not segmented into interchangeable pieces."],
    ["immersive", 1, "review", "The terraces wrap more than a flat slab and less than a folded chamber. Sensory measures are absent."],
    ["visibility", 1, "review", "A filled plan limits cross views, and the steps may open a diagonal. Sightlines were not raycast."],
    ["collaboration", 1, "review", "Shared treads and more enclosed pockets are both plausible. The mesh does not show how people would occupy them."],
  ],
  "flat-deep-plan": [
    ["complexity", 0, "geometry", "This is the simplest workspace surface (7.21) and a single thin plate, 8 ft on its short axis. The figure has few geometric events."],
    ["proportionality", 2, "geometry", "The plate is about 20 ft in one direction and 8 ft in another. That is the strongest dimensional contrast in the set."],
    ["plate-articulation", 0, "geometry", "The mass is one continuous slab. It does not break into projections, recesses, or rotated parts."],
    ["openness", 0, "geometry", "The solid fills 42% of the envelope, the highest in the set, and 73% of the plan is occupied. The plate is predominantly enclosed."],
    ["connectivity", 0, "review", "A deep filled plate shows few internal separations that would link distinct areas. Outside relationships are not in the mesh."],
    ["modularity", 0, "geometry", "The module is one fixed slab, with no repeated units in the mesh."],
    ["immersive", 0, "review", "The thin plate has little layering or surrounding depth. Sensory immersion was not measured, and the geometry does not support a deep reading."],
    ["visibility", 0, "geometry", "The short 8 ft dimension and the filled plan leave little room for a long unobstructed view across the tile."],
    ["collaboration", 0, "review", "No shared sub-space is separated from the deep plate. The individual reading is provisional."],
  ],
  "void-edge": [
    ["complexity", 1, "geometry", "Surface complexity is 8.42 and the section change is 0.42. The edge cut is a clear event in an otherwise readable plate."],
    ["proportionality", 2, "geometry", "One axis is about 20 ft and another is 9.4 ft. The edge void and the remaining plate are strongly different in scale."],
    ["plate-articulation", 1, "geometry", "Only 56% of the plan is occupied, so the plate is cut at the edge. The section area does not cascade through large shifts."],
    ["openness", 2, "geometry", "The solid is 27% of the envelope and just over half the plan is occupied. The edge is predominantly open to the outside of the tile."],
    ["connectivity", 1, "review", "The void touches the tile edge, which could meet another space. That neighbor is not in the mesh."],
    ["modularity", 0, "geometry", "The module is one body. The edge void does not produce repeated units."],
    ["immersive", 1, "review", "The remaining plate gives some enclosure beside an open edge. Sensory depth was not measured."],
    ["visibility", 2, "review", "The open edge clears a large part of the plan. Exact sightlines were not raycast."],
    ["collaboration", 1, "review", "The open edge can be shared and the remaining plate can be more private. Occupation was not measured."],
  ],
  undulated: [
    ["complexity", 1, "geometry", "The surface is the simplest in the set (7.14) and the section change is 0.38. The wave is one bend, not a field of intersections."],
    ["proportionality", 2, "geometry", "The body runs about 20 ft against an 11 ft cross dimension. The long and short directions are strongly differentiated."],
    ["plate-articulation", 1, "geometry", "The plate bends, and the section area stays in a narrow range. The articulation is a continuous variation, not a set of recesses or rotations."],
    ["openness", 1, "geometry", "The solid is 36% of the envelope and 66% of the plan is occupied. The wave is more enclosed than the open hall."],
    ["connectivity", 1, "review", "The undulation is one continuous body. Outside links were not measured."],
    ["modularity", 0, "geometry", "The wave is one piece. Repeated bays were not found in the mesh."],
    ["immersive", 1, "review", "The bend gives some enclosure without a deep surround. Sensory measures are absent."],
    ["visibility", 1, "review", "The long direction may carry a view, and the occupied plan interrupts the cross view. Sightlines were not raycast."],
    ["collaboration", 1, "review", "A single bending plate can be shared, and it does not separate individual rooms. The social reading needs review."],
  ],
  "stepped-amphitheater": [
    ["complexity", 1, "geometry", "Surface complexity is 8.66 and the section change is 0.53. The steps are a clear sequence, not a highly intersected mass."],
    ["proportionality", 1, "geometry", "The bowl changes section moderately inside a 20 by 16 by 13 ft body. The steps differ, and they stay one family of sizes."],
    ["circulation-integration", 1, "review", "A step can be both a seat and a path. No circulation line is stored in the mesh, so embedding is not demonstrated."],
    ["openness", 1, "geometry", "The solid is 28% of the envelope and 56% of the plan is occupied. The bowl is partly open, not a closed room."],
    ["connectivity", 0, "review", "The figure is one bowl. Links to surrounding spaces are not in the mesh."],
    ["spatial-permanence", 2, "review", "The bowl is a distinct gathering figure that movement would have to enter. Whether circulation actually constitutes that gathering was not measured."],
    ["immersive", 1, "review", "The steps give more enclosure than a flat field and less than a wrapped chamber. Sensory measures are absent."],
    ["visibility", 1, "review", "Half the plan is open toward the bowl. Long views were not raycast."],
    ["social-proximity", 1, "review", "One shared bowl brings people together without the compressed paths or separated identical rooms named in the definitions. The social reading needs review."],
  ],
  "void-field": [
    ["complexity", 2, "geometry", "Surface complexity is 9.19, among the highest, while the section stays even at 0.31. The field carries many small geometric events on one level figure."],
    ["proportionality", 0, "geometry", "The plan is nearly square and the section area barely changes. Dimensional relationships stay uniform."],
    ["circulation-integration", 0, "review", "The mesh is one filled mat. A path around or through a separate gathering figure is not visible."],
    ["openness", 0, "geometry", "91% of the plan columns are occupied and the solid is 38% of the envelope. At this sample the field is predominantly filled, not an open court. Holes smaller than the sample may remain."],
    ["connectivity", 0, "review", "The field does not resolve into linked rooms. Outside relationships are not in the mesh."],
    ["spatial-permanence", 0, "review", "No gathering figure separates itself from the field. Isolation from a circulation path was not directly drawn."],
    ["immersive", 1, "review", "The surface is busy and the body is shallow, about 13 ft against a 20 ft plan. Enclosure is moderate, and light was not measured."],
    ["visibility", 0, "review", "Almost every plan column contains solid, so views across the tile are frequently interrupted. Exact sightlines were not raycast."],
    ["social-proximity", 0, "review", "The broad even field matches a spread, low-pressure gathering more than a compressed room. Furniture and paths are not in the mesh."],
  ],
  "inserted-horizontal-plate": [
    ["complexity", 0, "geometry", "Surface complexity is 7.26 and the body is a compact 16 by 14 by 12 ft solid. The plate has few geometric events."],
    ["proportionality", 0, "geometry", "The three axes are the closest in the gathering set. Size relationships stay uniform."],
    ["circulation-integration", 1, "review", "A single inserted plate could sit beside or across a path. No path is stored in the mesh."],
    ["openness", 0, "geometry", "84% of the plan is occupied and the solid is 38% of the envelope. The plate reads as predominantly enclosed."],
    ["connectivity", 0, "review", "The compact solid does not branch into multiple linked spaces. Neighbors are not in the mesh."],
    ["spatial-permanence", 1, "review", "The plate is its own object, and whether a path runs beside it or through it cannot be seen."],
    ["immersive", 0, "review", "The compact, lightly folded solid has little surrounding depth. Sensory immersion was not measured."],
    ["visibility", 0, "review", "The filled plan leaves few open sightlines across the tile."],
    ["social-proximity", 1, "review", "One close shared volume is nearer a single gathering than a field of separated paths. Stimulation was not measured."],
  ],
  "contained-room-within-volume": [
    ["complexity", 0, "geometry", "This mesh has the fewest triangles and a low surface complexity of 7.47, with an almost constant section (0.30). It is one simple volume."],
    ["proportionality", 2, "geometry", "The room runs about 18 ft against a 9.5 ft cross section. Length and width are strongly differentiated."],
    ["circulation-integration", 0, "review", "The contained figure reads as a room apart from a path. A path inside the room was not found, and the research target of an embedded path is not visible."],
    ["openness", 1, "geometry", "The solid is 33% of the envelope and 61% of the plan is occupied. The room combines a contained interior with open sides of the envelope."],
    ["connectivity", 0, "review", "One contained body does not show multiple links. Adjacent spaces are absent."],
    ["spatial-permanence", 0, "review", "The room reads as a figure on its own, which matches gathering isolated from circulation. That isolation is interpretive because no path is drawn."],
    ["immersive", 1, "review", "The contained section gives enclosure, and the simple surface does not layer it. Sensory measures are absent."],
    ["visibility", 1, "review", "The long 18 ft dimension can carry a view, and the 9.5 ft width limits the cross view. Sightlines were not raycast."],
    ["social-proximity", 2, "review", "The small cross section, about 9.5 ft, compresses a shared room. Paths, furniture, and crowding were not measured."],
  ],
  "linear-edge-gallery": [
    ["complexity", 2, "geometry", "Surface complexity is 10.1, the highest in the set, on a shallow body whose section area barely changes. The edge is densely folded."],
    ["proportionality", 2, "geometry", "The gallery is about 20 ft long and 9.7 ft thick. The long edge and the thin section are strongly different."],
    ["circulation-integration", 1, "review", "A linear edge can act as a path beside gathering pockets. Those roles are not separated in the mesh."],
    ["openness", 2, "geometry", "The solid is 23% of the envelope and only 51% of the plan is occupied. The edge is predominantly open."],
    ["connectivity", 1, "review", "The gallery is one linear body that could touch several neighbors. Those neighbors are not in the mesh."],
    ["spatial-permanence", 1, "review", "Gathering pockets and the edge path are not distinguished as separate figures."],
    ["immersive", 1, "review", "The folded edge surrounds locally, and the body is only about 10 ft deep. Sensory measures are absent."],
    ["visibility", 2, "review", "Half the plan is open along the long edge, which supports a long view. Sightlines were not raycast."],
    ["social-proximity", 1, "review", "The thin gallery keeps people along one line and also stretches them apart. The social intensity needs review."],
  ],
};

const profiles = SITE_ARCHETYPES.map((entry) => {
  const rows = TEXT[entry.archetypeId];
  const expected = applicableCriteria(entry.program as "lobby" | "workspace" | "gathering").map((item) => item.id);
  if (!rows || rows.map((row) => row[0]).join() !== expected.join()) {
    throw new Error(`${entry.archetypeId} criteria ${rows?.map((row) => row[0]).join()} != ${expected.join()}`);
  }
  return {
    archetypeId: entry.archetypeId,
    moduleId: entry.moduleId,
    program: entry.program,
    ratings: rows.map(([criterionId, value, basis, justification]) => ({
      criterionId,
      value,
      basis,
      justification,
      analyzed: { value, basis, justification },
    })),
  };
});

writeFileSync("data/skill5/architectural-dna.json", `${JSON.stringify({ contract: "skill5-architectural-dna-v1", profiles }, null, 2)}\n`);
console.log(`wrote ${profiles.length} profiles`);
