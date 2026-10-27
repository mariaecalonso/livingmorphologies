import styles from "@/components/home-client.module.css";

const DEPARTMENTS = [
  {
    title: "Furniture Design",
    copy: "Bio-inspired seating, modular furniture, and sculptural objects developed through computational processes and digital fabrication.",
    src: "/home/client/studio/furniture-main.png",
    alt: "Conceptual study of a biomorphic copper chair.",
    details: [
      {
        src: "/home/client/studio/furniture-detail-1.png",
        alt: "Conceptual study of a smooth copper curve.",
      },
      {
        src: "/home/client/studio/furniture-detail-2.png",
        alt: "Conceptual study of a striated copper surface.",
      },
    ],
  },
  {
    title: "Fashion Design",
    copy: "Experimental garments, wearable structures, and innovative textiles informed by growth, adaptation, and material behavior.",
    src: "/home/client/studio/fashion-main.png",
    alt: "Conceptual study of a ruffled garment.",
    details: [
      {
        src: "/home/client/studio/fashion-detail-1.png",
        alt: "Conceptual study of a finely pleated textile.",
      },
      {
        src: "/home/client/studio/fashion-detail-2.png",
        alt: "Conceptual study of layered translucent cloth.",
      },
    ],
  },
] as const;

const STEPS = [
  {
    index: "01",
    title: "Observe",
    copy: "Study biological systems and emergent behavior.",
  },
  {
    index: "02",
    title: "Simulate",
    copy: "Explore computational growth and adaptation.",
  },
  {
    index: "03",
    title: "Design",
    copy: "Develop adaptive products across disciplines.",
  },
  {
    index: "04",
    title: "Fabricate",
    copy: "Prototype, test, and refine through making.",
  },
] as const;

export function HomeClient() {
  return (
    <div className={styles.board}>
      <img className={styles.field} src="/home/client/studio/teal-copper-background.png" alt="" draggable={false} />

      <header className={styles.identity}>
        <div>
          <h2 className={styles.title}>
            <span>Living</span>
            <span>Morphologies</span>
            <span>Studio</span>
          </h2>
          <p className={styles.subtitle}>An Interdisciplinary Bio-Inspired Design Studio</p>
        </div>
        <ul className={styles.traits}>
          <li>
            <p className={styles.kicker}>Design Focus</p>
            <p className={styles.value}>Physarum</p>
            <FocusMark />
          </li>
          <li>
            <p className={styles.kicker}>Disciplines</p>
            <p className={styles.value}>Fashion + Furniture</p>
            <WaveMark />
          </li>
          <li>
            <p className={styles.kicker}>Character</p>
            <p className={styles.value}>Work + Leisure</p>
            <PairMark />
          </li>
        </ul>
      </header>

      <div className={styles.stage}>
        <div className={styles.plates}>
          {DEPARTMENTS.map((item) => (
            <figure key={item.title} className={styles.plate}>
              <div className={styles.gallery}>
                <div className={styles.frame}>
                  <img className={styles.main} src={item.src} alt={item.alt} draggable={false} />
                </div>
                {item.details.map((detail) => (
                  <div key={detail.src} className={styles.frame}>
                    <img className={styles.detail} src={detail.src} alt={detail.alt} draggable={false} />
                  </div>
                ))}
              </div>
              <figcaption>
                <h3>{item.title}</h3>
                <p>{item.copy}</p>
              </figcaption>
            </figure>
          ))}
        </div>

        <div className={styles.network}>
          <div className={styles.networkCopy}>
            <h3>Research + Computation</h3>
            <p className={styles.shared}>A Shared Foundation</p>
            <p>
              Studying Physarum and emergent systems to develop generative methods, material explorations, and cross-disciplinary applications.
            </p>
          </div>
        </div>

        <div className={styles.process}>
          <p className={styles.processLabel}>Our Process</p>
          <ol className={styles.steps}>
            {STEPS.map((step, index) => (
              <li key={step.index} className={styles.step}>
                <StepMark index={index} />
                <div>
                  <p className={styles.stepName}>
                    <span>{step.index}</span> {step.title}
                  </p>
                  <p className={styles.stepCopy}>{step.copy}</p>
                </div>
                {index < STEPS.length - 1 ? <Arrow /> : null}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}

function FocusMark() {
  return (
    <svg className={styles.mark} viewBox="0 0 72 40" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="1.15" strokeLinecap="round">
        <path d="M8 28 C 16 28, 18 16, 28 16 C 36 16, 38 24, 46 20 C 54 16, 56 10, 64 10" />
        <path d="M28 16 C 30 8, 38 6, 42 12" />
        <path d="M46 20 C 48 28, 56 30, 62 24" />
        <path d="M16 28 C 14 34, 22 36, 26 30" />
      </g>
      <g fill="currentColor">
        <circle cx="8" cy="28" r="1.7" />
        <circle cx="28" cy="16" r="1.9" />
        <circle cx="42" cy="12" r="1.4" />
        <circle cx="46" cy="20" r="1.7" />
        <circle cx="64" cy="10" r="1.5" />
        <circle cx="62" cy="24" r="1.4" />
        <circle cx="26" cy="30" r="1.3" />
      </g>
    </svg>
  );
}

function WaveMark() {
  return (
    <svg className={styles.mark} viewBox="0 0 72 40" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="0.9">
        <path d="M6 22 C 16 22, 22 12, 36 10 C 50 8, 56 16, 66 15" />
        <path d="M6 27 C 16 27, 22 17, 36 15 C 50 13, 56 21, 66 20" />
        <path d="M6 32 C 16 32, 22 22, 36 20 C 50 18, 56 26, 66 25" />
        <path d="M18 31 L 20 13" />
        <path d="M30 32 L 32 11" />
        <path d="M42 30 L 44 10" />
        <path d="M54 28 L 55 14" />
      </g>
    </svg>
  );
}

function PairMark() {
  return (
    <svg className={styles.mark} viewBox="0 0 72 36" aria-hidden="true">
      <circle className={styles.orbTeal} cx="28" cy="18" r="9" />
      <circle className={styles.orbCopper} cx="44" cy="18" r="9" />
    </svg>
  );
}

function Arrow() {
  return (
    <svg className={styles.arrow} viewBox="0 0 28 10" aria-hidden="true">
      <path d="M0 5 H 22" />
      <path d="M17 1 L 25 5 L 17 9" />
    </svg>
  );
}

function StepMark({ index }: { index: number }) {
  if (index === 0) {
    return (
      <svg className={styles.stepMark} viewBox="0 0 40 40" aria-hidden="true">
        <g fill="none" stroke="currentColor" strokeWidth="0.9">
          <path d="M20 3 V 37 M 4 11 L 36 29 M 36 11 L 4 29" />
          <path d="M20 9 L 16 5 M 20 9 L 24 5 M 20 31 L 16 35 M 20 31 L 24 35" />
          <path d="M11 14 L 7 11 M 11 17 L 6 17 M 29 14 L 33 11 M 29 17 L 34 17" />
          <path d="M11 26 L 7 29 M 29 26 L 33 29" />
        </g>
      </svg>
    );
  }
  if (index === 1) {
    return (
      <svg className={styles.stepMark} viewBox="0 0 40 40" aria-hidden="true">
        <g fill="none" stroke="currentColor" strokeWidth="0.9">
          <path d="M12 10 L 24 6 L 34 14 L 32 26 L 22 34 L 8 26 L 8 16 Z" />
          <path d="M12 10 L 16 18 L 8 26 M 24 6 L 20 16 L 34 14 M 16 18 L 20 16 L 26 22 L 16 18" />
          <path d="M26 22 L 32 26 L 22 34 L 16 24" />
        </g>
      </svg>
    );
  }
  if (index === 2) {
    return (
      <svg className={`${styles.stepMark} ${styles.stepMarkSolid}`} viewBox="0 0 40 40" aria-hidden="true">
        <path
          d="M18 7 C 28 5, 35 12, 33 20 C 37 25, 34 34, 24 35 C 14 36, 6 29, 8 19 C 6 12, 11 8, 18 7 Z"
          fill="currentColor"
        />
      </svg>
    );
  }
  return (
    <svg className={styles.stepMark} viewBox="0 0 40 40" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="0.9">
        <path d="M13 8 H 27 C 29 14, 24 18, 22 23 C 20 29, 25 33, 29 36 H 11 C 15 33, 18 29, 16 23 C 14 18, 11 14, 13 8 Z" />
        <path d="M15 14 H 25 M 14 20 H 24 M 15 26 H 25 M 17 32 H 25" />
        <path d="M20 8 V 36" />
      </g>
    </svg>
  );
}
