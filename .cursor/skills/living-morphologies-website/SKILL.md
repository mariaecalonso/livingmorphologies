---
name: living-morphologies-website
description: >-
  Governs the website interface and presentation layer of the Living
  Morphologies project: UI, layout, navigation, visual language, and
  interaction design. Use when working on Skill 0, the Living Morphologies
  website, pages, layout, navigation, or interface components. Do not use for
  Physarum logic, 2D generation, evaluation, vertical propagation, seeds,
  simulation behavior, or stored results.
---

# Skill 0 – Living Morphologies Website

This skill controls website UI, layout, navigation, visual language, and interaction design.
It is separate from the computational and generative skills.
Do not modify Physarum logic, 2D generation logic, evaluation logic, vertical propagation logic, seeds, simulation behavior, or stored results unless explicitly requested.
The website currently anticipates four main sections: Home / Research / Lab / Results.
This section structure is provisional and may be renamed, reorganized, merged, split, or replaced as the project develops.
Development should happen incrementally, one page or interface component at a time.
Do not infer missing assignment content.
Do not add assignment-specific information unless I provide it later.
Do not make broad architectural or interface decisions unless I explicitly ask for them.
Preserve existing functionality unless a change is explicitly requested.
Do not modify any existing website code in this step.
Do not modify next.config.ts.

## Responsive Display Requirements

Desktop mode and its website pair, Laptop, are archived. The live website scale is Classroom, paired with Lab Presentation. The Edit control stays so that canvas can be zoomed and panned. Restore the Laptop / Desktop switch by setting `DESKTOP_MODE_ARCHIVED` to false in `components/display-sync.ts`.

The website must work well on both a regular laptop screen and the large classroom presentation display.
The classroom display resolution is approximately 7407 × 2160 px.
Do not design the interface as a fixed 7407 × 2160 canvas.
Use responsive layouts, flexible grids, scalable spacing, and adaptable content widths.
On very wide displays, make intentional use of the additional horizontal space rather than simply stretching text or controls.
Diagrams, catalogues, workflows, and Lab interfaces may expand horizontally on large displays while remaining fully usable on standard laptop screens.
Typography, navigation, controls, and interactive elements must remain legible and appropriately scaled at both display sizes.
Avoid layouts or interactions that only function correctly at one resolution or aspect ratio.

## Current Lab Mapping

The existing LivingInstrument currently rendered at / is not the final Home page concept.
Conceptually, this interface belongs to the Lab section of the website.
It currently combines functionality from Skill 1: architecture-to-physarum and Skill 2: physarum-2d-generation.
Do not treat this current instrument as the long-term Home page.
Do not move or refactor it yet unless explicitly requested.
When the website structure is developed further, the current instrument should eventually be incorporated into the /lab experience, while / becomes the project overview Home page.
Preserve all current Lab functionality while that transition is planned.

## Protected Lab Interface

The existing Lab interface rendered through LivingInstrument is considered a protected interface.
Do not redesign, restyle, restructure, resize, refactor, or visually reinterpret the internal Lab interface unless I explicitly request a Lab-specific change.
Do not modify the Lab’s typography, spacing, panel layout, controls, colors, borders, internal navigation, or hidden/visible states as part of general website design work.
Website-level design changes should apply only to the surrounding site shell, such as the global navigation, Home, Research, Results, page backgrounds, transitions, and shared outer layout.
The Lab should remain visually and functionally intact while it sits inside the larger Living Morphologies website.
Do not modify components/living-instrument.tsx or Lab-specific supporting components during general Skill 0 website work unless explicitly instructed.
Do not modify any Physarum, 2D, 3D, evaluation, catalog, simulation, seed, or propagation logic.
If a website-level style rule would unintentionally cascade into the Lab, isolate the new website styles so the Lab remains unchanged.

## Website Visual Identity

### Overall Direction

The main Living Morphologies website uses a dark architectural Liquid Glass visual language.
This visual identity applies to the website shell, global navigation, Home, Research, Results, transitions, and other future website-level interface elements.
It does not apply to the protected internal Lab interface unless I explicitly request a Lab redesign.

### Color System

Primary background: true RGB black #000000.
Primary accent: teal #0f7377.
Secondary accent: copper #c77e5f.
Primary text: white #ffffff.
Neutral secondary text and lines may use restrained gray values.
The interface should remain predominantly black with selective use of accent colors.

### Liquid Glass Style

Use translucent or semi-transparent interface surfaces selectively.
Glass elements should feel thin, refined, and architectural rather than soft, bubbly, or mobile-app-like.
Use subtle backdrop blur, faint internal gradients, thin luminous borders, and restrained edge highlights.
Preserve generous black negative space.
Teal, copper, white, and neutral gray may be used for edge illumination and active states.
Glow should remain controlled and should support hierarchy rather than decorate every element.
Static states should be subtle.
Hover, active, selected, or key interactive states may become brighter or more luminous.
Avoid generic cyberpunk, gaming UI, excessive neon, heavy glassmorphism, exaggerated reflections, or decorative effects without functional purpose.
Diagrams, research graphics, morphologies, and technical content must remain visually dominant over decorative glass effects.

### Border / Effect Language

Use thin rounded rectangular outlines where appropriate.
Corners should be softly rounded (`--frame-radius`, currently 16px), not excessively pill-shaped.
Frames share a luminous edge and a soft atmospheric halo (`--frame-glow` on primary frames, `--frame-glow-soft` on smaller or secondary tiles). Neutral frames use white. Colored frames keep the same rounded rectangle, thin edge, and halo, using copper (`--frame-glow-copper`) or teal (`--frame-glow-teal`) to match the border. The most important frame in a layout uses `.frame-primary`: a slightly thicker 1.5px edge with the full teal → white → copper gradient running left to right, like the active workspace title, and a subtle teal glow on the left and copper on the right. Keep the color subtle. Human-selected morphologies use it too.
Borders may use controlled teal-to-copper, white-to-dark, or subtle multi-stop gradients on active or identity states.
Three levels of treatment may be used:
Gradient — clean thin gradient edge with little or no glow.
Blur — soft atmospheric halo.
Together — gradient edge plus controlled glow/blur for focal states.
These are hierarchy tools. Smaller frames glow less than primary ones.

### Layout, Connection, and Black Space

Frames are not the only graphic method. A layout should make the workflow or thinking logic visible.
Hierarchy comes from frame size and position first: one dominant frame, a narrower column of supporting frames, and a secondary frame. Decoration should not be needed to show what matters most.
Connecting lines carry the logic between frames. Use thin white leader lines that start at a small dot on the subject and run orthogonally, with right-angle elbows, through the black gutters to the frame they explain. Lines may cross frame edges so the frames read as one argument. Use dashed leaders to tie labels to objects, and a single fading line with dots for sequences or timelines.
The travelling light and every line attached to a frame are measured from the live frames, never from fixed numbers. When a frame on the light path moves, resizes, changes shape, appears, or disappears, the light route and its attached lines rebuild automatically (`boardLayoutSignature` in `lib/home-workflow-camera.ts`). A new frame joins the route with the `.wf-frame` class, or `data-route-end` for the last stop, and needs no extra wiring.
Motion is subtle but engaging, modelled on the Non-Dominated Sorting board. Content builds in when it is revealed (a frame lights up or a board opens), never on a constant loop. Points fade in one by one in a short stagger, plates and captions rise 4px while fading in, and bars and arrows grow from their start. Each piece runs about half a second to a second, with tens of milliseconds between items, using the shared `wf-opt-in`, `wf-opt-fill`, and `wf-opt-pop` keyframes in `app/globals.css`. Animate opacity and transform only. Do not bounce, spin, flash, or add colour, and do not delay reading for long.
Empty black space is intentional and must be planned in every layout. It keeps the layout organized and clean. Leave it inside bigger frames, between their tiles, plates, and iterations, and between the bigger frames themselves. Space between groups is larger than space within a group, so the main categories read before the subcategories. Never pack frames edge to edge. When content must fit, shrink the items before removing the space. Keep gutters wide enough to act as channels for the connecting lines. Frames do not need to fill their container. Inset content inside frames, and let small images float in black rather than stretching to fill.
Section titles sit small and centered above their frame, not crowded inside it.
Reserve teal and copper for the subject of the argument. Key regions may get a glowing white outline. Everything else stays greyscale.

### Typography System

Primary display font: Neuropol Regular.
Use Neuropol for major page titles, section titles, navigation emphasis, large labels, and identity moments.
Do not use Neuropol for long paragraphs or dense technical text.
Secondary typography reference: Acumin Variable Concept Thin.
Use the secondary typeface for body text, captions, metadata, UI labels, research descriptions, criteria, and technical information.
If Acumin is not available in the project, do not silently replace it. Use an existing temporary fallback such as Rajdhani or Source Sans 3 and clearly preserve the intention to replace it later.
Keep typography thin, precise, spacious, and highly legible.
Uppercase may be used for short interface labels and navigation where appropriate.
Avoid excessive tracking in body text.
Typography must scale responsively across laptop and large presentation screens.

### Responsive Behavior

Preserve this visual identity on both standard laptop displays and the approximately 7407 × 2160 px classroom screen.
Do not scale the interface by simply making everything larger on the presentation display.
Use responsive typography, spacing, grid behavior, and content widths.
Large screens should use additional horizontal space intentionally.

### Lab Protection

Do not allow website-level typography, border, background, blur, glow, button, or layout styles to cascade into the protected Lab interface.
Scope website-level visual styles so that the existing Lab remains visually unchanged.
