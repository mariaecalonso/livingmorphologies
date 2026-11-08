"use client";

import brief from "@/data/skill5/workplace-brief.json";
import { FLOOR_SHARES, SHARE_LEGEND, SITE, STUDIO } from "@/lib/demo-workflow/chapter-facts";
import { Caption, Chips, Img, Kicker } from "@/components/demo-workflow/chapter-kit";
import { PresentationReel } from "@/components/demo-workflow/presentation-reel";
import type { ChapterContent } from "@/components/demo-workflow/demo-chapter";
import styles from "@/components/demo-workflow/context-chapter.module.css";

const FLOORS = [5, 4, 3, 2, 1] as const;
const plan = `${brief.plan.widthFeet} × ${brief.plan.depthFeet} ft`;
const parcel = `${SITE.parcel.widthFeet} × ${SITE.parcel.depthFeet} ft`;

/** On site at the same time, from the brief: day work as its range, evening gathering at its figure. */
function Occupancy() {
  const peak = 800;
  const top = 14;
  const base = 70;
  const rise = (count: number) => base - ((base - top) * count) / peak;
  const { daytimeWork, eveningGathering, badgeHoldersAndVisitors } = brief.occupancy;
  return (
    <svg
      className={styles.chart}
      viewBox="0 0 200 82"
      role="img"
      aria-label={`On site at the same time: ${daytimeWork} during the day, ${eveningGathering} in the evening. ${badgeHoldersAndVisitors} badge holders and visitors, not at once.`}
    >
      <rect className={styles.day} x="14" y={rise(500)} width="76" height={base - rise(500)} />
      <rect className={styles.range} x="14" y={rise(500)} width="76" height={rise(400) - rise(500)} />
      <rect className={styles.evening} x="110" y={rise(800)} width="76" height={base - rise(800)} />
      <text className={styles.value} x="52" y={rise(500) - 4} textAnchor="middle">{daytimeWork}</text>
      <text className={styles.value} x="148" y={rise(800) - 4} textAnchor="middle">{eveningGathering}</text>
      <path className={styles.axis} d={`M 6 ${base} H 194`} />
      <text className={styles.label} x="52" y={base + 10} textAnchor="middle">Day work</text>
      <text className={styles.label} x="148" y={base + 10} textAnchor="middle">Evening gathering</text>
    </svg>
  );
}

/** The Client workflow's preliminary reading: five floors, one core, gathering toward the water. */
function FloorStack() {
  const left = 22;
  const width = 170;
  const floorY = (floor: number) => 6 + (5 - floor) * 15;
  return (
    <svg className={styles.chart} viewBox="0 0 200 94" role="img" aria-label="Preliminary reading. Five floors at most. Workspace on the upper floors, gathering toward the waterfront, lobby at the ground floor, one vertical core.">
      {FLOORS.map((floor) => (
        <text key={floor} className={styles.label} x={left - 6} y={floorY(floor) + 8} textAnchor="end">{floor}</text>
      ))}
      {FLOOR_SHARES.map((share) => (
        <rect
          key={`${share.floor}-${share.start}`}
          className={styles.floor}
          data-program={share.program}
          x={left + share.start * width + 1}
          y={floorY(share.floor)}
          width={share.span * width - 2}
          height="11"
        />
      ))}
      <path className={styles.core} d={`M ${left + 14} 3 V 82`} />
      <text className={styles.label} x={left + 14} y="91" textAnchor="middle">Core</text>
      <text className={styles.water} x={left + width} y="91" textAnchor="end">Waterfront →</text>
    </svg>
  );
}

function Shares() {
  return (
    <ul className={styles.shares}>
      {SHARE_LEGEND.map((item) => (
        <li key={item.program} data-program={item.program}>
          <i />
          {item.label} <b>{item.share}%</b>
        </li>
      ))}
    </ul>
  );
}

const REQUIREMENTS = [
  { value: plan, label: "Studio site" },
  { value: brief.plan.areaSqFt.toLocaleString("en-US"), label: "Square feet" },
  { value: brief.operations.hours.replace(" to ", " – "), label: "Open" },
  { value: `${brief.occupancy.daytimeWork} · ${brief.occupancy.eveningGathering}`, label: "Day · evening on site" },
  { value: "About 1,500", label: "Badge holders + visitors, not at once" },
] as const;

function Requirements({ detail }: { detail?: boolean }) {
  return (
    <ul className={styles.requirements} data-detail={detail || undefined}>
      {REQUIREMENTS.map((item) => (
        <li key={item.label}>
          <b>{item.value}</b>
          <span>{item.label}</span>
        </li>
      ))}
    </ul>
  );
}

/** Chapter 04: the studio, its brief, and the waterfront site, read into a spatial strategy and requirements. */
export const CONTEXT_CONTENT: ChapterContent = {
  visuals: [
    {
      full: (
        <div className={styles.stack}>
          <div className={styles.studio}>
            {STUDIO.disciplines.map((item) => (
              <figure key={item.label}>
                <Img className={styles.studioPlate} src={item.main} />
                <figcaption>{item.label}</figcaption>
              </figure>
            ))}
          </div>
          <Caption>
            <b>{STUDIO.name}</b> · {STUDIO.focus}
          </Caption>
        </div>
      ),
    },
    {
      full: (
        <div className={styles.stack}>
          <Occupancy />
          <Chips items={brief.programs} />
          <Caption>Open {brief.operations.hours}</Caption>
        </div>
      ),
    },
    {
      full: (
        <div className={styles.stack}>
          <Img className={styles.aerial} src={SITE.aerial} />
          <Img className={styles.plan} src={SITE.plan} />
          <Caption>
            <b>{SITE.address}</b>
            <br />
            <b>{plan}</b>
            <br />
            {brief.plan.areaSqFt.toLocaleString("en-US")} sq ft · bay to the {SITE.waterfront.toLowerCase()}
          </Caption>
        </div>
      ),
    },
    {
      full: (
        <div className={styles.stack}>
          <FloorStack />
          <Caption>Preliminary · five floors, one core</Caption>
        </div>
      ),
    },
    {
      full: (
        <div className={styles.stack}>
          <Requirements />
        </div>
      ),
    },
  ],
  details: [
    <div key="client" className={styles.column}>
      <p className={styles.title}>{STUDIO.name}</p>
      <div className={styles.disciplines}>
        {STUDIO.disciplines.map((item) => (
          <figure key={item.label}>
            <Img className={styles.studioPlate} src={item.main} />
            <div className={styles.details}>
              {item.details.map((src) => (
                <Img key={src} className={styles.studioPlate} src={src} />
              ))}
            </div>
            <figcaption>{item.label}</figcaption>
          </figure>
        ))}
      </div>
      <dl className={styles.traits}>
        <dt>Design focus</dt>
        <dd>{STUDIO.focus}</dd>
        <dt>Character</dt>
        <dd>{STUDIO.character}</dd>
      </dl>
      <Chips items={STUDIO.process} tone="teal" />
    </div>,
    <div key="program" className={styles.column}>
      <Kicker>On site at once · {brief.operations.hours}</Kicker>
      <Occupancy />
      <Caption align="start">{brief.occupancy.badgeHoldersAndVisitors} badge holders + visitors · not on site at once</Caption>
    </div>,
    <div key="site" className={styles.column}>
      <div className={styles.siteViews}>
        <Img className={styles.aerial} src={SITE.aerial} />
        <Img className={styles.plan} src={SITE.plan} />
      </div>
      <Caption align="start">
        {SITE.address}
        <br />
        <b>{plan}</b> · {brief.plan.areaSqFt.toLocaleString("en-US")} sq ft
        <br />
        Parcel {parcel} · bay to the {SITE.waterfront.toLowerCase()}
      </Caption>
    </div>,
    <div key="strategy" className={styles.column}>
      <Kicker>Preliminary reading · five floors at most</Kicker>
      <FloorStack />
      <Shares />
      <Caption align="start">
        Not in the brief. 50 / 40 / 10 is the client-workflow reading.
        <br />
        Lobby at the ground, gathering toward the bay, workspace above.
      </Caption>
    </div>,
    <div key="requirements" className={styles.column}>
      <Kicker>Studio requirements · not a performance assessment</Kicker>
      <Requirements detail />
      <Caption align="start">{brief.intention}</Caption>
    </div>,
  ],
  layout: styles.composed,
  feature: {
    operation: 2,
    action: "Watch the site",
    view: (
      <PresentationReel
        note="Camera study of the recorded aerial and the site plan. The live site model is not orbited here, and no buildings are added."
        beats={[
          { src: SITE.aerial, caption: "Elevated view · One Herald Plaza" },
          { src: SITE.aerial, caption: "Closer to the parcel", zoom: true },
          { src: SITE.plan, caption: `Plan · bay to the ${SITE.waterfront.toLowerCase()} · ${plan}` },
        ]}
      />
    ),
  },
};
