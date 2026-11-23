"use client";

import { useEffect, useRef, useState } from "react";
import { DesignOrganization } from "@/components/client-design-organization";
import styles from "@/components/home-client.module.css";
import { CLIENT_PROFILE, ORGANIZATION, PRECEDENTS } from "@/lib/client/ecologic-studio";

/** The classroom frame. The backdrop and the collage clips share its coordinates. */
const FIELD = { width: 1920, height: 560 } as const;

type SectionId = "profile" | "design" | "operations" | "space-program";
type View = SectionId | "about";
type MethodologyId = "bio" | "computational" | "integrated";

const SECTIONS: readonly { id: SectionId; label: string }[] = [
  { id: "design", label: "Design + Organization" },
  { id: "operations", label: "Operations + Working Modes" },
  { id: "space-program", label: "Proposed Program" },
];

const VIEW_LABELS: Record<View, string> = {
  ...(Object.fromEntries(SECTIONS.map((section) => [section.id, section.label])) as Record<SectionId, string>),
  about: `About ${CLIENT_PROFILE.name}`,
};

type HeroProject = {
  /** The collage region the image fills: the main field, the teal lobe at top right, or the copper wedge at bottom right. */
  id: "hortus" | "airoffice" | "airbubble";
  name: string;
  series?: string;
  year: number;
  href: string;
  src: string;
  alt: string;
  photographer: string;
  /** Overrides the region's default crop so the subject stays inside its mask. */
  position?: string;
  /** For a gallery diagram drawn on white, so it reads on the dark field. */
  invert?: boolean;
};

/** The right-hand collage. Authentic photographs from each project's official ecoLogicStudio gallery. */
const HERO_PROJECTS: HeroProject[] = [
  {
    id: "hortus",
    name: "H.O.R.T.U.S. XL",
    series: "Astaxanthin.g",
    year: 2019,
    href: "https://www.ecologicstudio.com/projects/h-o-r-t-u-s-xl-astaxanthin-g",
    src: "/home/client/hortus-xl-people-naaro.jpg",
    alt: "H.O.R.T.U.S. XL Astaxanthin.g, a 3D-printed bio-sculpture inhabited by microalgae, tended by two people at La Fabrique du Vivant, Centre Pompidou",
    photographer: "NAARO",
  },
  {
    id: "airoffice",
    name: "AIR.office",
    year: 2023,
    href: "https://www.ecologicstudio.com/projects/airoffice",
    src: "/home/client/airoffice-croizier.jpg",
    alt: "AIR.office at Haleon headquarters in Nyon: microalgae photobioreactors hung in a timber lattice",
    photographer: "Matthieu Croizier",
  },
  {
    id: "airbubble",
    name: "AirBubble",
    year: 2021,
    href: "https://www.ecologicstudio.com/projects/airbubble-playground-and-exhibition",
    src: "/home/client/airbubble-dusk-wirkus.jpg",
    alt: "AirBubble playground in Warsaw at dusk, its ring of microalgae bioreactors lit beside the Vistula",
    photographer: "Maja Wirkus",
  },
];

/** Each Design Methodology stage swaps the collage for projects that show that stage. Images come from each project's official gallery. */
const METHOD_COLLAGES: Record<MethodologyId, HeroProject[]> = {
  bio: [
    {
      id: "hortus",
      name: "H.O.R.T.U.S. XL",
      series: "Astaxanthin.g",
      year: 2019,
      href: "https://www.ecologicstudio.com/projects/h-o-r-t-u-s-xl-astaxanthin-g",
      src: "/home/client/hortus-xl-chlorella-inoculation-naaro.jpg",
      alt: "H.O.R.T.U.S. XL: inoculating living Chlorella cultures on jellified medium in the 3D-printed bio-pixels",
      photographer: "NAARO",
      position: "38% 50%",
    },
    {
      id: "airoffice",
      name: "AIR.office",
      year: 2023,
      href: "https://www.ecologicstudio.com/projects/airoffice",
      src: "/home/client/airoffice-bioreactors-croizier.jpg",
      alt: "AIR.office: living green microalgae cultures in glass photobioreactors hung in the timber frame",
      photographer: "Matthieu Croizier",
      position: "50% 52%",
    },
    {
      id: "airbubble",
      name: "H.O.R.T.U.S. XL",
      series: "Astaxanthin.g",
      year: 2019,
      href: "https://www.ecologicstudio.com/projects/h-o-r-t-u-s-xl-astaxanthin-g",
      src: "/home/client/hortus-xl-naaro.jpg",
      alt: "H.O.R.T.U.S. XL Astaxanthin.g: the 3D-printed bio-sculpture with living green cultures, photographed in the gallery",
      photographer: "NAARO",
      position: "50% 45%",
    },
  ],
  computational: [
    {
      id: "hortus",
      name: "GAN-Physarum",
      year: 2022,
      href: "https://www.ecologicstudio.com/projects/gan-physarum-la-derive-numerique",
      src: "/home/client/gan-physarum-paris-network.png",
      alt: "GAN-Physarum Paris: an AI-generated Physarum network growing through a 10 km frame of the city",
      photographer: "ecoLogicStudio",
      position: "50% 50%",
    },
    {
      id: "airoffice",
      name: "Deep Green",
      year: 2021,
      href: "https://www.ecologicstudio.com/projects/deep-green",
      src: "/home/client/deep-green-guatemala-rainwater-network.jpg",
      alt: "Deep Green: rain water collection analysis for Guatemala City, computed from water flow simulation and minimal networks on the terrain mesh",
      photographer: "ecoLogicStudio",
      position: "50% 32%",
    },
    {
      id: "airbubble",
      name: "H.O.R.T.U.S. XL",
      series: "Algorithmic geometry",
      year: 2019,
      href: "https://www.ecologicstudio.com/projects/h-o-r-t-u-s-xl-astaxanthin-g",
      src: "/home/client/hortus-xl-coral-algorithm-diagram.jpg",
      alt: "H.O.R.T.U.S. XL: the algorithmic design technique inspired by the morphogenesis of coral colonies",
      photographer: "ecoLogicStudio",
      position: "50% 46%",
      invert: true,
    },
  ],
  integrated: HERO_PROJECTS,
};

/** Design + Organization hides the main field and keeps only the two right-hand windows. */
const DESIGN_PROJECTS: HeroProject[] = [
  {
    id: "airoffice",
    name: "Otrivin Air Lab",
    series: "Bio-design workshop",
    year: 2022,
    href: "https://www.ecologicstudio.com/projects/otrivin-air-lab",
    src: "/home/client/otrivin-air-lab-workshop-naaro.jpg",
    alt: "Otrivin Air Lab at the Building Centre, London: people at work among the microalgae photobioreactors of the living showroom and bio-design workshop",
    photographer: "NAARO",
    position: "50% 70%",
  },
  {
    id: "airbubble",
    name: "Pasquero + Poletto",
    series: "GAN-Physarum",
    year: 2022,
    href: "https://www.ecologicstudio.com/projects/gan-physarum-la-derive-numerique",
    src: "/home/client/pasquero-poletto-gan-physarum-naaro.jpg",
    alt: "Claudia Pasquero and Marco Poletto with GAN-Physarum, la dérive numérique, at the Réseaux-Mondes exhibition, Centre Pompidou",
    photographer: "NAARO",
    position: "50% 0%",
  },
];

/** How long each Design frame holds a project, and how long the two frames stay out of step. */
const DESIGN_SLIDE_MS = 6000;
const DESIGN_STAGGER_MS = 3000;

/** Design holds these two projects only, so the rotation does not bring back projects from the other tabs. */
const DESIGN_SLIDES: Record<"airoffice" | "airbubble", readonly HeroProject[]> = {
  airoffice: [DESIGN_PROJECTS[0]],
  airbubble: [DESIGN_PROJECTS[1]],
};

const DESIGN_FADE_MS = 800;

/** The incoming photograph is already opaque. Only the outgoing one dissolves, so the two never ghost. */
function useSlide(length: number, interval: number, delay: number) {
  const indexRef = useRef(0);
  const [index, setIndex] = useState(0);
  const [leaving, setLeaving] = useState<number | null>(null);
  useEffect(() => {
    if (length < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let fade = 0;
    let intervalId = 0;
    const advance = () => {
      const current = indexRef.current;
      const next = (current + 1) % length;
      indexRef.current = next;
      setLeaving(current);
      setIndex(next);
      window.clearTimeout(fade);
      fade = window.setTimeout(() => setLeaving(null), DESIGN_FADE_MS);
    };
    const startId = window.setTimeout(() => {
      advance();
      intervalId = window.setInterval(advance, interval);
    }, delay);
    return () => {
      window.clearTimeout(startId);
      window.clearInterval(intervalId);
      window.clearTimeout(fade);
    };
  }, [length, interval, delay]);
  return { index: length > 0 ? index % length : 0, leaving };
}

/** Operations: Urban Algae Canopy above, GAN-Physarum below. */
const OPERATIONS_PROJECTS: HeroProject[] = [
  {
    id: "airoffice",
    name: "Urban Algae Canopy",
    series: "Expo Milano",
    year: 2015,
    href: "https://www.ecologicstudio.com/projects/expo-milano-2015-urban-algae-folly",
    src: "/home/client/urban-algae-canopy-expo-2015.jpg",
    alt: "Urban Algae Canopy at Expo Milano 2015: the Urban Algae Folly, a white pavilion of living microalgae panels in the Future Food District",
    photographer: "ecoLogicStudio",
    position: "32% 42%",
  },
  {
    id: "airbubble",
    name: "GAN-Physarum",
    series: "La Dérive Numérique",
    year: 2022,
    href: "https://www.ecologicstudio.com/projects/gan-physarum-la-derive-numerique",
    src: "/home/client/gan-physarum-paris-network.png",
    alt: "GAN-Physarum Paris: an AI-generated Physarum network growing through a 10 km frame of the city",
    photographer: "ecoLogicStudio",
    position: "50% 50%",
  },
];

/** Spatial Requirements: Deep Green in the upper window, H.O.R.T.U.S. XL in the lower window. */
const SPACE_PROJECTS: HeroProject[] = [
  {
    id: "airoffice",
    name: "Deep Green",
    year: 2021,
    href: "https://www.ecologicstudio.com/projects/deep-green",
    src: "/home/client/deep-green-guatemala-rainwater-network.jpg",
    alt: "Deep Green: rain water collection analysis for Guatemala City, computed from water flow simulation and minimal networks on the terrain mesh",
    photographer: "ecoLogicStudio",
    position: "50% 32%",
  },
  {
    id: "airbubble",
    name: "H.O.R.T.U.S. XL",
    series: "Chlorella inoculation",
    year: 2019,
    href: "https://www.ecologicstudio.com/projects/h-o-r-t-u-s-xl-astaxanthin-g",
    src: "/home/client/hortus-xl-chlorella-inoculation-naaro.jpg",
    alt: "H.O.R.T.U.S. XL: inoculating living Chlorella cultures on jellified medium in the 3D-printed bio-pixels",
    photographer: "NAARO",
    position: "58% 42%",
  },
];

/** Every image a region can show, so a stage change crossfades between images that are already loaded. */
const COLLAGE_LAYERS = HERO_PROJECTS.map((slot) => {
  const sets = [HERO_PROJECTS, ...Object.values(METHOD_COLLAGES), DESIGN_PROJECTS, OPERATIONS_PROJECTS, SPACE_PROJECTS];
  const images = sets.map((set) => set.find((project) => project.id === slot.id)).filter((project): project is HeroProject => Boolean(project));
  return { id: slot.id, images: images.filter((image, index) => images.findIndex((other) => other.src === image.src) === index) };
});

/** The supplied backdrop, drawn at exactly the frame size. Its glow replaces the procedural membranes. */
const BACKGROUND_SRC = "/home/client/els-client-background.png";

/**
 * Photo boundaries in frame coordinates, each about 8px inside a rim of the backdrop so its glow stays visible:
 * AIR.office fills the teal lobe at top right, AirBubble sits under the copper sweep, and H.O.R.T.U.S. XL takes the dark field between.
 */
const COLLAGE_CLIPS: Record<HeroProject["id"], string> = {
  hortus:
    "M640,0 H1374 V358 C1340,370 1320,384 1300,404 C1280,424 1262,444 1246,462 C1230,478 1215,488 1200,493 C1170,511 1120,540 1075,560 H640 Z",
  airoffice:
    "M1712,0 H1920 V264 C1880,262 1840,262 1800,268 C1760,274 1720,284 1680,292 C1620,302 1560,308 1520,308 C1480,306 1450,294 1425,276 C1400,258 1388,236 1389,214 C1390,192 1402,172 1422,155 C1460,124 1520,88 1580,58 C1630,34 1680,14 1712,0 Z",
  airbubble:
    "M1920,560 H1110 C1150,546 1185,532 1205,522 C1240,500 1262,478 1280,456 C1300,438 1340,412 1360,402 C1400,384 1440,368 1480,353 C1540,334 1600,322 1660,313 C1740,302 1840,294 1920,296 Z",
};

/** The curved part of each secondary boundary, without the frame edges, so only the organic seams are softened. */
const COLLAGE_EDGES: Partial<Record<HeroProject["id"], string>> = {
  hortus:
    "M1374,358 C1340,370 1320,384 1300,404 C1280,424 1262,444 1246,462 C1230,478 1215,488 1200,493 C1170,511 1120,540 1075,560",
  airoffice:
    "M1920,264 C1880,262 1840,262 1800,268 C1760,274 1720,284 1680,292 C1620,302 1560,308 1520,308 C1480,306 1450,294 1425,276 C1400,258 1388,236 1389,214 C1390,192 1402,172 1422,155 C1460,124 1520,88 1580,58 C1630,34 1680,14 1712,0",
  airbubble:
    "M1110,560 C1150,546 1185,532 1205,522 C1240,500 1262,478 1280,456 C1300,438 1340,412 1360,402 C1400,384 1440,368 1480,353 C1540,334 1600,322 1660,313 C1740,302 1840,294 1920,296",
};

/** Photo boxes, matching the percentages in home-client.module.css. */
const PHOTO_BOX = {
  hortus: { x: 1920 * 0.3333, y: 0, w: 1920 * 0.3823, h: 560 },
  airoffice: { x: 1920 * 0.71875, y: 0, w: 1920 * 0.28125, h: 560 * 0.57143 },
  airbubble: { x: 1920 * 0.6667, y: 560 * 0.51786, w: 1920 * 0.3333, h: 560 * 0.48214 },
} as const;

function photoMaskTransform(box: { x: number; y: number; w: number; h: number }) {
  return `translate(${-box.x} ${-box.y})`;
}

function ProjectCollage({ projects, cycle = false }: { projects: HeroProject[]; cycle?: boolean }) {
  const top = useSlide(cycle ? DESIGN_SLIDES.airoffice.length : 0, DESIGN_SLIDE_MS, DESIGN_SLIDE_MS);
  const bottom = useSlide(cycle ? DESIGN_SLIDES.airbubble.length : 0, DESIGN_SLIDE_MS, DESIGN_SLIDE_MS + DESIGN_STAGGER_MS);
  const slideState = { airoffice: top, airbubble: bottom };
  return (
    <div className={styles.hero} data-cycle={cycle ? "true" : undefined}>
      <ul className={styles.projects} aria-label={`Selected ${CLIENT_PROFILE.name} projects`}>
        {COLLAGE_LAYERS.map(({ id, images: stored }) => {
          const current = projects.find((item) => item.id === id);
          const slides = cycle && (id === "airoffice" || id === "airbubble") ? DESIGN_SLIDES[id] : null;
          const images = slides ?? stored;
          const state = slides ? slideState[id] : null;
          const project = slides ? slides[state.index] : (current ?? stored[0]);
          const caption = slides ? slides[state.leaving ?? state.index] : project;
          const title = [caption.name, caption.series].filter(Boolean).join(" ");
          const shown = Boolean(slides || current);
          return (
            <li key={id} className={styles.project} data-project={id} data-hidden={shown ? undefined : true} aria-hidden={shown ? undefined : true}>
              <a
                href={caption.href}
                target="_blank"
                rel="noopener noreferrer"
                tabIndex={shown ? undefined : -1}
                title={`${title} (${caption.year}) · Image © ${caption.photographer}`}
                aria-label={`${title}, ${caption.year}. Image © ${caption.photographer}`}
              >
                <span className={styles.projectMedia} style={{ clipPath: `url(#eco-collage-${id})` }}>
                {images.map((image, imageIndex) => {
                  const active = slides ? imageIndex === state.index : shown && image.src === project.src;
                  const leaving = Boolean(slides && state.leaving != null && imageIndex === state.leaving);
                  return (
                    <img
                      key={image.src}
                      src={image.src}
                      alt={active ? `${image.alt}. Image © ${image.photographer}` : ""}
                      aria-hidden={active ? undefined : true}
                      data-active={slides ? (active ? "true" : "false") : active}
                      data-leaving={leaving ? "true" : undefined}
                      data-invert={image.invert || undefined}
                      style={
                        active && project.src.endsWith("gan-physarum-paris-network.png")
                          ? { objectPosition: "48% 50%", transform: "scale(1.7)", transformOrigin: "46% 58%" }
                          : active && project.position
                            ? { objectPosition: project.position }
                            : image.position
                              ? { objectPosition: image.position }
                              : undefined
                      }
                      draggable={false}
                    />
                  );
                })}
                </span>
                {slides ? (
                  <span className={styles.projectLabel} data-active="true">
                    <span>{caption.name}</span>
                    <span>{[caption.series, caption.year].filter(Boolean).join(" · ")}</span>
                    <span>© {caption.photographer}</span>
                  </span>
                ) : (
                  images.map((image) => {
                    const active = shown && image.src === project.src;
                    return (
                      <span key={image.src} className={styles.projectLabel} data-active={active} aria-hidden="true">
                        <span>{image.name}</span>
                        <span>{[image.series, image.year].filter(Boolean).join(" · ")}</span>
                      </span>
                    );
                  })
                )}
              </a>
            </li>
          );
        })}
      </ul>
      <svg className={styles.clips} aria-hidden="true">
        <defs>
          {Object.entries(COLLAGE_CLIPS).map(([id, d]) => (
            <clipPath key={id} id={`eco-collage-${id}`} clipPathUnits="objectBoundingBox">
              <path transform={`scale(${1 / FIELD.width} ${1 / FIELD.height})`} d={d} />
            </clipPath>
          ))}
          <filter id="eco-edge-blur" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="16" />
          </filter>
          <mask id="eco-fade-hortus" maskContentUnits="objectBoundingBox">
            <svg x="0" y="0" width="1" height="1" viewBox={`0 0 ${PHOTO_BOX.hortus.w} ${PHOTO_BOX.hortus.h}`} preserveAspectRatio="none">
              <g transform={photoMaskTransform(PHOTO_BOX.hortus)}>
                <linearGradient id="eco-hortus-left" gradientUnits="userSpaceOnUse" x1="640" y1="0" x2="900" y2="0">
                  <stop offset="0%" stopColor="#000000" />
                  <stop offset="22%" stopColor="#2a2a2a" />
                  <stop offset="48%" stopColor="#6a6a6a" />
                  <stop offset="74%" stopColor="#b0b0b0" />
                  <stop offset="100%" stopColor="#ffffff" />
                </linearGradient>
                <linearGradient id="eco-hortus-right" gradientUnits="userSpaceOnUse" x1="1180" y1="0" x2="1374" y2="0">
                  <stop offset="0%" stopColor="#ffffff" />
                  <stop offset="35%" stopColor="#d0d0d0" />
                  <stop offset="68%" stopColor="#6a6a6a" />
                  <stop offset="100%" stopColor="#000000" />
                </linearGradient>
                <path d={COLLAGE_CLIPS.hortus} fill="#ffffff" />
                <rect x="640" y="0" width="260" height="560" fill="url(#eco-hortus-left)" />
                <rect x="1180" y="0" width="194" height="360" fill="url(#eco-hortus-right)" />
                <path d={COLLAGE_EDGES.hortus} fill="none" stroke="#000000" strokeWidth="72" strokeLinecap="round" filter="url(#eco-edge-blur)" />
              </g>
            </svg>
          </mask>
          <mask id="eco-fade-airoffice" maskContentUnits="objectBoundingBox">
            <svg x="0" y="0" width="1" height="1" viewBox={`0 0 ${PHOTO_BOX.airoffice.w} ${PHOTO_BOX.airoffice.h}`} preserveAspectRatio="none">
              <g transform={photoMaskTransform(PHOTO_BOX.airoffice)}>
                <path d={COLLAGE_CLIPS.airoffice} fill="#ffffff" />
                <path d={COLLAGE_EDGES.airoffice} fill="none" stroke="#000000" strokeWidth="64" strokeLinecap="round" filter="url(#eco-edge-blur)" />
              </g>
            </svg>
          </mask>
          <mask id="eco-fade-airbubble" maskContentUnits="objectBoundingBox">
            <svg x="0" y="0" width="1" height="1" viewBox={`0 0 ${PHOTO_BOX.airbubble.w} ${PHOTO_BOX.airbubble.h}`} preserveAspectRatio="none">
              <g transform={photoMaskTransform(PHOTO_BOX.airbubble)}>
                <linearGradient id="eco-airbubble-left" gradientUnits="userSpaceOnUse" x1="1280" y1="0" x2="1560" y2="0">
                  <stop offset="0%" stopColor="#000000" />
                  <stop offset="30%" stopColor="#141414" />
                  <stop offset="58%" stopColor="#555555" />
                  <stop offset="82%" stopColor="#b0b0b0" />
                  <stop offset="100%" stopColor="#ffffff" />
                </linearGradient>
                <path d={COLLAGE_CLIPS.airbubble} fill="#ffffff" />
                <rect x="1280" y="290" width="280" height="270" fill="url(#eco-airbubble-left)" />
                <path d={COLLAGE_EDGES.airbubble} fill="none" stroke="#000000" strokeWidth="70" strokeLinecap="round" filter="url(#eco-edge-blur)" />
              </g>
            </svg>
          </mask>
        </defs>
      </svg>
    </div>
  );
}

function ModeIcon({ kind }: { kind: "target" | "group" | "flask" | "social" }) {
  if (kind === "target") {
    return (
      <g fill="none" stroke="#ffffff" strokeWidth="1.2" strokeLinecap="round">
        <circle r="6.2" />
        <circle r="1.45" fill="#ffffff" stroke="none" />
        <path d="M0-10.4V-7.4M0 7.4V10.4M-10.4 0H-7.4M7.4 0H10.4" />
      </g>
    );
  }
  if (kind === "flask") {
    return (
      <g fill="none" stroke="#ffffff" strokeWidth="1.2" strokeLinejoin="round" strokeLinecap="round">
        <path d="M-2.9-9.4H2.9M-1.85-9.4V-6.1L-7.1 2.8C-8.2 5.3-7.1 7.4-4.8 7.4H4.8C7.1 7.4 8.2 5.3 7.1 2.8L1.85-6.1V-9.4" />
        <path d="M-5.2 1.6H5.2" />
      </g>
    );
  }
  const social = kind === "social";
  return (
    <g fill="none" stroke="#ffffff" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx={social ? -6.2 : -6.4} cy="-1.6" r="2" />
      <path d={social ? "M-9.6 5.6c.2-2.4 1.6-3.5 3.4-3.5s3.2 1.1 3.4 3.5" : "M-10 5.4c.2-2.5 1.7-3.6 3.6-3.6s3.4 1.1 3.6 3.6"} />
      <circle cx={social ? 6.2 : 6.4} cy="-1.6" r="2" />
      <path d={social ? "M2.8 5.6c.2-2.4 1.6-3.5 3.4-3.5s3.2 1.1 3.4 3.5" : "M2.8 5.4c.2-2.5 1.7-3.6 3.6-3.6s3.4 1.1 3.6 3.6"} />
      <circle cy={social ? -4.4 : -3.6} r={social ? 2.7 : 2.45} />
      <path d={social ? "M-4.6 6.4c.3-3.2 2.1-4.8 4.6-4.8s4.3 1.6 4.6 4.8" : "M-4.2 6.2c.3-3 2-4.5 4.2-4.5s3.9 1.5 4.2 4.5"} />
    </g>
  );
}

const WORKING_MODE_STEPS = [
  { id: "focused", label: "Focused", icon: "target" },
  { id: "collaborative", label: "Collaborative", icon: "group" },
  { id: "experimental", label: "Experimental", icon: "flask" },
  { id: "social", label: "Social", icon: "social" },
] as const;

function WorkingModesDiagram() {
  const radius = 24;
  const step = 76;
  const cx = 30;
  const top = 28;
  const height = top + step * 3 + radius + 8;
  return (
    <svg className={styles.modesDiagram} viewBox={`0 0 250 ${height}`} role="img" aria-label="Working modes: Focused, Collaborative, Experimental, and Social">
      <defs>
        <filter id="ops-mode-glow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="2.2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {WORKING_MODE_STEPS.slice(0, -1).map((mode, index) => {
        const y = top + index * step;
        return <line key={mode.id} x1={cx} y1={y + radius} x2={cx} y2={y + step - radius} stroke="#ffffff" strokeWidth="1.15" />;
      })}
      {WORKING_MODE_STEPS.map((mode, index) => {
        const y = top + index * step;
        return (
          <g key={mode.id}>
            <circle cx={cx} cy={y} r={radius} fill="rgba(255,255,255,0.04)" stroke="#ffffff" strokeWidth="1.25" filter="url(#ops-mode-glow)" />
            <g transform={`translate(${cx} ${y})`}>
              <ModeIcon kind={mode.icon} />
            </g>
            <text x={cx + radius + 14} y={y} dominantBaseline="middle" fontSize="12.5">
              {mode.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function WorkLeisureDiagram() {
  const day = [
    { n: "01", lines: ["400–500 people · Focused work, research,", "design, collaboration, prototyping"], width: 340 },
    { n: "02", lines: ["Biological research lab"], width: 214 },
    { n: "03", lines: ["Interdisciplinary design studios"], width: 262 },
    { n: "04", lines: ["Shared research + collaboration"], width: 276 },
    { n: "05", lines: ["Public waterfront"], width: 188 },
  ];
  const evening = [
    { n: "01", lines: ["~800 people · Waterfront gathering,", "exhibitions, cultural events, and social activities"], width: 400 },
    { n: "02", lines: ["Closed/secured research lab"], width: 236 },
    { n: "03", lines: ["Closed/secured design studios"], width: 248 },
    { n: "04", lines: ["Events + exhibitions + workshops"], width: 268 },
    { n: "05", lines: ["Public waterfront"], width: 188 },
  ];
  const radius = 168;
  const gap = 28;
  const leftCenter = 500;
  const rightCenter = 680;
  const centerY = 290;
  const angles = [-50, -25, 0, 25, 50];
  const pills = (items: { n: string; lines: string[]; width: number }[], center: number, side: "left" | "right") =>
    items.map((item, index) => {
      const height = item.lines.length > 1 ? 52 : 40;
      const degrees = side === "left" ? 180 + angles[index] : -angles[index];
      const inner = polar(center, centerY, radius + gap, degrees);
      const x = side === "left" ? -item.width : 0;
      const badgeX = side === "left" ? -44 : 8;
      const textX = side === "left" ? -52 : 52;
      return (
        <g key={`${side}-${item.n}`} transform={`translate(${inner.x} ${inner.y})`}>
          <rect x={x} y={-height / 2} width={item.width} height={height} rx={height / 2} fill="#101010" />
          <rect x={x} y={-height / 2} width={item.width} height={height} rx={height / 2} fill="none" stroke="#ffffff" strokeWidth="1.5" filter="url(#ops-pill)" />
          <rect x={badgeX} y={-13} width={36} height={26} rx="13" fill="url(#ops-badge)" />
          <text x={badgeX + 18} y="0" textAnchor="middle" dominantBaseline="middle" fill="#161616" fontSize="12" fontWeight="700">{item.n}</text>
          <text x={textX} y="0" textAnchor={side === "left" ? "end" : "start"} dominantBaseline="middle" fill="#ffffff" fontSize="13">
            {item.lines.length === 1 ? item.lines[0] : item.lines.map((line, lineIndex) => (
              <tspan key={line} x={textX} dy={lineIndex === 0 ? -8 : 16}>{line}</tspan>
            ))}
          </text>
        </g>
      );
    });
  return (
    <div className={styles.leisure}>
      <svg viewBox="0 0 1240 560" role="img" aria-label="Daytime workplace and evening gathering">
        <defs>
          <linearGradient id="ops-lens" x1="590" y1="148" x2="590" y2="432" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="16%" stopColor="#d4d4d4" />
            <stop offset="38%" stopColor="#a8a8a8" />
            <stop offset="52%" stopColor="#a3a3a3" />
            <stop offset="74%" stopColor="#d8d8d8" />
            <stop offset="100%" stopColor="#ffffff" />
          </linearGradient>
          <linearGradient id="ops-badge" x1="0" y1="0" x2="1" y2="0.6">
            <stop offset="0%" stopColor="#f7f7f7" />
            <stop offset="100%" stopColor="#c8c8c8" />
          </linearGradient>
          <filter id="ops-rim" x="-55%" y="-55%" width="210%" height="210%">
            <feGaussianBlur stdDeviation="11" result="wide" />
            <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="tight" />
            <feMerge>
              <feMergeNode in="wide" />
              <feMergeNode in="tight" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="ops-pill" x="-20%" y="-90%" width="140%" height="280%">
            <feGaussianBlur stdDeviation="4.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <clipPath id="ops-clip-left">
            <circle cx={leftCenter} cy={centerY} r={radius} />
          </clipPath>
          <clipPath id="ops-clip-lens" clipPath="url(#ops-clip-left)">
            <circle cx={rightCenter} cy={centerY} r={radius} />
          </clipPath>
        </defs>
        <circle cx={leftCenter} cy={centerY} r={radius} fill="#262626" />
        <circle cx={rightCenter} cy={centerY} r={radius} fill="#262626" />
        <rect x="470" y="130" width="240" height="320" fill="url(#ops-lens)" clipPath="url(#ops-clip-lens)" />
        <g fill="none" stroke="#ffffff" strokeWidth="2.8" filter="url(#ops-rim)">
          <circle cx={leftCenter} cy={centerY} r={radius} />
          <circle cx={rightCenter} cy={centerY} r={radius} />
        </g>
        <text className={styles.leisureTitle} x="422" y="256" textAnchor="middle" fill="#ffffff" fontSize="22">DAYTIME</text>
        <text x="422" y="278" textAnchor="middle" fill="rgba(255,255,255,0.92)" fontSize="14" letterSpacing="0.6">WORKPLACE</text>
        <text className={styles.leisureTitle} x="758" y="312" textAnchor="middle" fill="#ffffff" fontSize="22">EVENING</text>
        <text x="758" y="344" textAnchor="middle" fill="rgba(255,255,255,0.92)" fontSize="14" letterSpacing="0.6">GATHERING</text>
        {pills(day, leftCenter, "left")}
        {pills(evening, rightCenter, "right")}
      </svg>
    </div>
  );
}

function polar(cx: number, cy: number, radius: number, degrees: number) {
  const radians = (degrees * Math.PI) / 180;
  return { x: cx + Math.cos(radians) * radius, y: cy - Math.sin(radians) * radius };
}

const PROGRAM_WORKSPACE = [
  "Architecture Design Studio",
  "Product Design Studio",
  "Prototyping + Digital Fabrication Lab",
  "Biological Research + Cultivation Lab",
] as const;

const PROGRAM_GATHERING = [
  "Interdisciplinary Collaboration Space",
  "Public Exhibition Space",
  "Indoor Gathering Space",
  "Waterfront Gathering",
  "Restaurant",
  "Staff Dining + Break Area",
] as const;

const PROGRAM_LOBBY = ["Public Lobby", "Private Lobby"] as const;

function ringSegment(cx: number, cy: number, inner: number, outer: number, start: number, end: number) {
  const large = end - start > 180 ? 1 : 0;
  const outerStart = polar(cx, cy, outer, start);
  const outerEnd = polar(cx, cy, outer, end);
  const innerEnd = polar(cx, cy, inner, end);
  const innerStart = polar(cx, cy, inner, start);
  return `M ${outerStart.x} ${outerStart.y} A ${outer} ${outer} 0 ${large} 0 ${outerEnd.x} ${outerEnd.y} L ${innerEnd.x} ${innerEnd.y} A ${inner} ${inner} 0 ${large} 1 ${innerStart.x} ${innerStart.y} Z`;
}

function arcPath(cx: number, cy: number, radius: number, start: number, end: number, sweep: 0 | 1) {
  const from = polar(cx, cy, radius, start);
  const to = polar(cx, cy, radius, end);
  const large = Math.abs(end - start) > 180 ? 1 : 0;
  return `M ${from.x} ${from.y} A ${radius} ${radius} 0 ${large} ${sweep} ${to.x} ${to.y}`;
}

function spaced(top: number, bottom: number, count: number) {
  if (count <= 1) return [(top + bottom) / 2];
  return Array.from({ length: count }, (_, index) => top + ((bottom - top) * index) / (count - 1));
}

/** Angle on the left or right rim for a horizontal leader at this y. */
function rimAngle(cy: number, radius: number, y: number, side: "left" | "right") {
  const angle = (Math.asin((cy - y) / radius) * 180) / Math.PI;
  return side === "left" ? 180 - angle : angle;
}

/** Glass ring, scaled in so the leaders can reach the labels. */
function ProgramDiagram() {
  const cx = 800;
  const cy = 222;
  const outer = 186;
  const inner = 112;
  const titleSize = 17;
  const titleRadius = (inner + outer) / 2 - titleSize * 0.55;
  const glass = "rgba(14, 16, 18, 0.36)";
  const line = "rgba(255,255,255,0.86)";
  const workspace = { start: 93, end: 219, fill: glass, stroke: line };
  const gathering = { start: -39, end: 87, fill: glass, stroke: line };
  const lobby = { start: 225, end: 315, fill: glass, stroke: line };
  const rings = [workspace, gathering, lobby];
  const labelTop = cy - outer + 28;
  const labelBottom = cy + outer * 0.48;
  const workspaceAngles = spaced(labelTop, labelBottom, PROGRAM_WORKSPACE.length).map((y) => rimAngle(cy, outer, y, "left"));
  const gatheringAngles = spaced(labelTop, labelBottom, PROGRAM_GATHERING.length).map((y) => rimAngle(cy, outer, y, "right"));
  const lobbyAngles = [250, 290];
  const labelGap = 80;
  const leftText = cx - outer - labelGap;
  const rightText = cx + outer + labelGap;
  const lobbyDrop = 20;
  const lobbyElbow = 24;
  const lobbyRun = 54;
  return (
    <div className={styles.programDiagram}>
      <svg viewBox="40 0 1520 512" role="img" aria-label="Proposed program, 12 spaces in three categories: workspace, gathering, and lobby">
        <defs>
          <filter id="program-rim-glow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="3.1" />
          </filter>
          <filter id="program-node-glow" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="1.5" />
          </filter>
          <path id="program-workspace-arc" d={arcPath(cx, cy, titleRadius, workspace.end, workspace.start, 1)} />
          <path id="program-gathering-arc" d={arcPath(cx, cy, titleRadius, gathering.end, gathering.start, 1)} />
          <path id="program-lobby-arc" d={arcPath(cx, cy, titleRadius, lobby.start, lobby.end, 0)} />
        </defs>
        <circle cx={cx} cy={cy} r={inner - 12} fill="none" stroke="rgba(255,255,255,0.32)" strokeWidth="2.6" filter="url(#program-rim-glow)" />
        <circle cx={cx} cy={cy} r={inner - 12} fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.78)" strokeWidth="1.05" />
        {rings.map((ring) => (
          <path key={`fill-${ring.start}`} d={ringSegment(cx, cy, inner, outer, ring.start, ring.end)} fill={ring.fill} stroke="none" />
        ))}
        {rings.map((ring) => (
          <path key={`glow-${ring.start}`} d={ringSegment(cx, cy, inner, outer, ring.start, ring.end)} fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2.8" filter="url(#program-rim-glow)" />
        ))}
        {rings.map((ring) => (
          <path key={`line-${ring.start}`} d={ringSegment(cx, cy, inner, outer, ring.start, ring.end)} fill="none" stroke={ring.stroke} strokeWidth="1.05" />
        ))}
        <text className={styles.programArc} fontSize={titleSize} textAnchor="middle" style={{ letterSpacing: "0.12em", fill: "#ffffff" }}>
          <textPath href="#program-workspace-arc" startOffset="50%">WORKSPACE</textPath>
        </text>
        <text className={styles.programArc} fontSize={titleSize} textAnchor="middle" style={{ letterSpacing: "0.12em", fill: "#ffffff" }}>
          <textPath href="#program-gathering-arc" startOffset="50%">GATHERING</textPath>
        </text>
        <text className={styles.programArc} fontSize={titleSize} textAnchor="middle" style={{ letterSpacing: "0.14em", fill: "#ffffff" }}>
          <textPath href="#program-lobby-arc" startOffset="50%" side="right">LOBBY</textPath>
        </text>
        <text className={styles.programWord} x={cx} y={cy - 6} textAnchor="middle" dominantBaseline="middle" fontSize="24" style={{ letterSpacing: "0.03em" }}>
          PROGRAM
        </text>
        <text className={styles.programCount} x={cx} y={cy + 18} textAnchor="middle" dominantBaseline="middle" fontSize="13">
          12 SPACES
        </text>
        <g fill="none" stroke={line} strokeWidth="1.05" strokeLinecap="round" strokeLinejoin="round">
          {workspaceAngles.map((angle) => {
            const rim = polar(cx, cy, outer, angle);
            return <line key={`w-${angle}`} x1={rim.x} y1={rim.y} x2={leftText + 14} y2={rim.y} />;
          })}
          {gatheringAngles.map((angle) => {
            const rim = polar(cx, cy, outer, angle);
            return <line key={`g-${angle}`} x1={rim.x} y1={rim.y} x2={rightText - 14} y2={rim.y} />;
          })}
          {lobbyAngles.map((angle, index) => {
            const rim = polar(cx, cy, outer, angle);
            const dir = index === 0 ? -1 : 1;
            const y1 = rim.y + lobbyDrop;
            const x2 = rim.x + dir * lobbyElbow;
            const y2 = y1 + lobbyElbow;
            const x3 = x2 + dir * lobbyRun;
            const bend = lobbyElbow * 0.55;
            return (
              <path
                key={`l-${angle}`}
                d={`M ${rim.x} ${rim.y} L ${rim.x} ${y1} C ${rim.x} ${y1 + bend} ${x2 - dir * bend} ${y2} ${x2} ${y2} L ${x3} ${y2}`}
              />
            );
          })}
        </g>
        {[...workspaceAngles, ...gatheringAngles, ...lobbyAngles].map((angle) => {
          const rim = polar(cx, cy, outer, angle);
          return (
            <g key={`n-${angle}`}>
              <circle cx={rim.x} cy={rim.y} r="4.2" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="1.3" filter="url(#program-node-glow)" />
              <circle cx={rim.x} cy={rim.y} r="2.15" fill="rgba(255,255,255,0.94)" />
            </g>
          );
        })}
        {PROGRAM_WORKSPACE.map((label, index) => {
          const rim = polar(cx, cy, outer, workspaceAngles[index]);
          return (
            <text key={label} className={styles.programLabel} x={leftText} y={rim.y} textAnchor="end" dominantBaseline="middle" fontSize="23" style={{ fill: "rgba(255,255,255,0.96)" }}>
              {label}
            </text>
          );
        })}
        {PROGRAM_GATHERING.map((label, index) => {
          const rim = polar(cx, cy, outer, gatheringAngles[index]);
          return (
            <text key={label} className={styles.programLabel} x={rightText} y={rim.y} textAnchor="start" dominantBaseline="middle" fontSize="23" style={{ fill: "rgba(255,255,255,0.96)" }}>
              {label}
            </text>
          );
        })}
        {PROGRAM_LOBBY.map((label, index) => {
          const rim = polar(cx, cy, outer, lobbyAngles[index]);
          const dir = index === 0 ? -1 : 1;
          const x = rim.x + dir * (lobbyElbow + lobbyRun + 12);
          const y = rim.y + lobbyDrop + lobbyElbow;
          return (
            <text key={label} className={styles.programLabel} x={x} y={y} textAnchor={index === 0 ? "end" : "start"} dominantBaseline="middle" fontSize="23" style={{ fill: "rgba(255,255,255,0.96)" }}>
              {label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

function ClientSection({ id }: { id: View }) {
  if (id === "about") {
    return (
      <>
        <p className={styles.claim}>Documented company</p>
        <h3>About {CLIENT_PROFILE.name}</h3>
        <p>
          Founded in {CLIENT_PROFILE.founded.city} in {CLIENT_PROFILE.founded.year} by {CLIENT_PROFILE.cofounders.join(" and ")}.{" "}
          {CLIENT_PROFILE.summary}
        </p>
        <div className={styles.split}>
          <div>
            <h4>Expertise</h4>
            <ul>
              {CLIENT_PROFILE.expertise.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <h4>Work</h4>
            <ul>
              {CLIENT_PROFILE.work.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <h4>Collaboration network</h4>
            <ul>
              {ORGANIZATION.collaborationNetwork.partners.map((partner) => (
                <li key={partner.name}>{partner.name}</li>
              ))}
            </ul>
            <h4>Documented projects</h4>
            <ul>
              {PRECEDENTS.map((project) => (
                <li key={project.id}>
                  {project.officialTitle}, {project.year}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <p className={styles.source}>{CLIENT_PROFILE.sources[0]?.label}</p>
      </>
    );
  }
  if (id === "profile") {
    return (
      <>
        <p className={styles.claim}>Documented company</p>
        <h3>{CLIENT_PROFILE.name}</h3>
        <p>
          Founded in {CLIENT_PROFILE.founded.city} in {CLIENT_PROFILE.founded.year} by {CLIENT_PROFILE.cofounders.join(" and ")}.
        </p>
        <p>{CLIENT_PROFILE.summary}</p>
        <div className={styles.split}>
          <div>
            <h4>Expertise</h4>
            <ul>
              {CLIENT_PROFILE.expertise.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <h4>Work</h4>
            <ul>
              {CLIENT_PROFILE.work.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
        <p className={styles.source}>{CLIENT_PROFILE.sources[0]?.label}</p>
      </>
    );
  }
  if (id === "operations") {
    return (
      <>
        <h3 className={styles.sectionTitle}>Operations + Working Modes</h3>
        <div className={styles.kickers}>
          <div className={styles.kickerColumn}>
            <p className={styles.kicker}>Working Modes</p>
            <WorkingModesDiagram />
          </div>
          <div className={styles.kickerColumn}>
            <p className={styles.kicker}>Work-Leisure Operations</p>
            <WorkLeisureDiagram />
          </div>
        </div>
      </>
    );
  }
  return (
    <>
      <h3 className={styles.sectionTitle}>Proposed Program</h3>
      <ProgramDiagram />
    </>
  );
}

const WORK_CATEGORIES = [
  "Biophilic sculptures",
  "Living architecture",
  "Blue-green urban masterplans",
  "Innovative design products",
] as const;

function WorkFlip() {
  const [current, setCurrent] = useState(0);
  const [previous, setPrevious] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  const advance = () => {
    setPrevious(current);
    setCurrent((index) => (index + 1) % WORK_CATEGORIES.length);
  };

  useEffect(() => {
    if (paused || reduced) return;
    const timer = window.setTimeout(() => {
      setPrevious(current);
      setCurrent((index) => (index + 1) % WORK_CATEGORIES.length);
    }, 3500);
    return () => window.clearTimeout(timer);
  }, [current, paused, reduced]);

  return (
    <div className={styles.work}>
      <p className={styles.srOnly} id="work-kinds">
        ecoLogicStudio&apos;s work includes biophilic sculptures, living architecture, blue-green urban masterplans, and
        innovative design products.
      </p>
      <p className={styles.workLabel} aria-hidden="true">
        Their work includes
      </p>
      <button
        type="button"
        className={styles.workFlip}
        aria-describedby="work-kinds"
        aria-label="Next category"
        onClick={advance}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocus={() => setPaused(true)}
        onBlur={() => setPaused(false)}
      >
        {previous !== null ? (
          <span className={reduced ? styles.workGone : styles.workOut} key={`out-${previous}`} aria-hidden="true">
            {WORK_CATEGORIES[previous]}
          </span>
        ) : null}
        <span className={reduced ? styles.workStill : styles.workIn} key={current} aria-hidden="true">
          {WORK_CATEGORIES[current]}
        </span>
      </button>
    </div>
  );
}

function StageMark({ id }: { id: MethodologyId }) {
  if (id === "bio") {
    return (
      <svg className={styles.stageMark} viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="5" r="1.35" />
        <circle cx="6" cy="12" r="1.35" />
        <circle cx="18" cy="11" r="1.35" />
        <circle cx="9.5" cy="18.5" r="1.35" />
        <circle cx="16" cy="17" r="1.2" />
        <path d="M12 6.4 6.9 10.7M12 6.4 16.8 9.8M7.1 13.1 8.8 17.2M16.7 12.1 15.5 15.7M10.6 17.8 14.8 16.6" />
      </svg>
    );
  }
  if (id === "computational") {
    return (
      <svg className={styles.stageMark} viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3.5 20 8v8L12 20.5 4 16V8Z M12 3.5V12 M12 12 20 8 M12 12 4 8" />
      </svg>
    );
  }
  return (
    <svg className={styles.stageMark} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 8.5 12 4.5 20 8.5 12 12.5Z M4 12.2 12 16.2 20 12.2 M4 15.8 12 19.8 20 15.8" />
    </svg>
  );
}

/** Two strands, as in the reference: one wraps loop 1 and crests loop 2; the other dips under loop 2 and wraps loop 3. */
const METHOD_ARCS = {
  bio: "M 156.6 50.4 A 80 80 0 1 0 164 155",
  computational: "M 236 59 A 80 80 0 0 1 369.3 67 M 227.5 140.8 A 80 80 0 0 0 364 155",
  integrated: "M 436 59 A 80 80 0 1 1 443.4 163.6",
};
const METHOD_STRANDS = [
  "M 156.6 50.4 A 80 80 0 1 0 164 155 L 236 59 A 80 80 0 0 1 369.3 67",
  "M 227.5 140.8 A 80 80 0 0 0 364 155 L 436 59 A 80 80 0 1 1 443.4 163.6",
];
const METHOD_ENDS = [
  [156.6, 50.4],
  [369.3, 67],
  [227.5, 140.8],
  [443.4, 163.6],
];

const METHODOLOGY: { id: MethodologyId; title: string }[] = [
  { id: "bio", title: "Bio Intelligence" },
  { id: "computational", title: "Computational + Systematic Design" },
  { id: "integrated", title: "Bio-Integrated Design" },
];

/** ecoLogicStudio. The previous client page is stored in `components/stored/home-client.tsx`. */
export function HomeClient() {
  const [view, setView] = useState<View | null>(null);
  const [shown, setShown] = useState<View | null>(null);
  const [stage, setStage] = useState<MethodologyId>("bio");
  const panelRef = useRef<HTMLDivElement>(null);

  const show = (next: View) => {
    setView(next);
    setShown(next);
  };
  const close = () => setView(null);
  const sectionAt = (direction: -1 | 1) => {
    const index = SECTIONS.findIndex((section) => section.id === view);
    const next = index < 0 ? (direction === 1 ? 0 : SECTIONS.length - 1) : (index + direction + SECTIONS.length) % SECTIONS.length;
    return SECTIONS[next];
  };

  useEffect(() => {
    if (!view) return;
    panelRef.current?.focus({ preventScroll: true });
    const leave = (event: KeyboardEvent) => {
      if (event.key === "Escape") setView(null);
    };
    const away = (event: MouseEvent) => {
      if ((event.target as Element).closest(`button, a, .${styles.panel}`)) return;
      setView(null);
    };
    document.addEventListener("keydown", leave);
    document.addEventListener("click", away);
    return () => {
      document.removeEventListener("keydown", leave);
      document.removeEventListener("click", away);
    };
  }, [view]);

  return (
    <div className={styles.page} data-open={view ? "true" : "false"} data-section={view ?? undefined}>
      <img className={styles.shapes} src={BACKGROUND_SRC} alt="" aria-hidden="true" draggable={false} />

      <header className={styles.bar}>
        <button type="button" className={styles.brand} onClick={close} aria-label="Living Morphologies, client overview">
          <img className={styles.logo} src={CLIENT_PROFILE.logo.src} alt="" draggable={false} />
        </button>
      </header>
      <nav className={styles.pager} aria-label={`${CLIENT_PROFILE.name} sections`}>
        <button
          type="button"
          className={styles.arrow}
          aria-controls="client-section"
          aria-label={sectionAt(-1).label}
          onClick={() => show(sectionAt(-1).id)}
        >
          <svg viewBox="0 0 12 12" aria-hidden="true">
            <path d="M7.5 2.5 4 6l3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </button>
        <button
          type="button"
          className={styles.arrow}
          aria-controls="client-section"
          aria-label={sectionAt(1).label}
          onClick={() => show(sectionAt(1).id)}
        >
          <svg viewBox="0 0 12 12" aria-hidden="true">
            <path d="M4.5 2.5 8 6l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </button>
      </nav>

      <div className={styles.landing} data-open={view ? "true" : "false"}>
        <p className={styles.eyebrow}>Living Morphologies / Client</p>
        <h2 className={styles.heading}>ecoLogicStudio</h2>
        <WorkFlip />
        <div className={styles.methodCard} role="region" aria-label="Design Methodology">
            <div className={styles.diagram} data-method-stage={stage}>
              <svg className={styles.links} viewBox="0 0 600 214" aria-hidden="true">
                <defs>
                  <linearGradient id="method-stroke" x1="0" y1="0" x2="600" y2="0" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#7af7fb" />
                    <stop offset="16%" stopColor="#5eecf2" />
                    <stop offset="33%" stopColor="#b7f6f4" />
                    <stop offset="50%" stopColor="#ffffff" />
                    <stop offset="67%" stopColor="#ffd8c4" />
                    <stop offset="84%" stopColor="#f2a98a" />
                    <stop offset="100%" stopColor="#f08b58" />
                  </linearGradient>
                  <filter id="method-glow" x="-40" y="-40" width="680" height="294" filterUnits="userSpaceOnUse">
                    <feGaussianBlur stdDeviation="2.4" />
                  </filter>
                </defs>
                {METHOD_STRANDS.map((d, index) => (
                  <g key={d}>
                    <path className={styles.circuitGlow} d={d} />
                    <path id={`method-strand-${index}`} className={styles.circuit} d={d} />
                  </g>
                ))}
                {(Object.keys(METHOD_ARCS) as MethodologyId[]).map((id) => (
                  <path key={id} data-link={id} d={METHOD_ARCS[id]} />
                ))}
                {METHOD_ENDS.map(([cx, cy]) => (
                  <circle key={`${cx}-${cy}`} className={styles.circuitEnd} cx={cx} cy={cy} r="4" />
                ))}
              </svg>
              {METHODOLOGY.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={styles.stage}
                  data-stage={item.id}
                  aria-pressed={stage === item.id}
                  onClick={() => setStage(item.id)}
                >
                  <StageMark id={item.id} />
                  <span className={styles.stageTitle}>{item.title}</span>                </button>
              ))}
            </div>
          </div>
      </div>

      <div
        ref={panelRef}
        className={styles.panel}
        id="client-section"
        role="region"
        tabIndex={-1}
        aria-label={shown ? VIEW_LABELS[shown] : undefined}
        data-open={view ? "true" : "false"}
        data-wide={shown && SECTIONS.some((section) => section.id === shown) ? "true" : undefined}
        data-organization={shown === "design" ? "true" : undefined}
        data-section={shown ?? undefined}
      >
        {shown ? (
          <div className={styles.sheet} key={shown}>
            {shown === "design" ? (
              <DesignOrganization />
            ) : (
              <ClientSection id={shown} />
            )}
          </div>
        ) : null}
      </div>

      <ProjectCollage
        cycle={view === "design"}
        projects={
          view === "design"
            ? DESIGN_PROJECTS
            : view === "operations"
              ? OPERATIONS_PROJECTS
              : view === "space-program"
                ? SPACE_PROJECTS
                : HERO_PROJECTS
        }
      />
    </div>
  );
}
