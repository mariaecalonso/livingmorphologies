"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { ORGANIZATION } from "@/lib/client/ecologic-studio";
import styles from "@/components/client-design-organization.module.css";

const DISCIPLINES = [
  { index: "01", title: "Biotechnology + Living Systems" },
  { index: "02", title: "Computational Design + AI" },
  { index: "03", title: "Architecture + Urban Ecology" },
  { index: "04", title: "Bio-Design + Product Development" },
] as const;

const DIRECTORS = ORGANIZATION.directors.map((name) => name.replace(/^Dr\s+/, "Dr. "));

type Point = { x: number; y: number };

function edge(node: HTMLElement, chart: DOMRect, side: "left" | "right", scaleX: number, scaleY: number): Point {
  const box = node.getBoundingClientRect();
  const y = (box.top + box.height / 2 - chart.top) * scaleY;
  const x = (side === "right" ? box.right - chart.left : box.left - chart.left) * scaleX;
  return { x, y };
}

function connector(from: Point, to: Point) {
  const pull = (to.x - from.x) * 0.5;
  const c1x = from.x + pull;
  const c2x = to.x - pull;
  return `M ${from.x.toFixed(1)} ${from.y.toFixed(1)} C ${c1x.toFixed(1)} ${from.y.toFixed(1)}, ${c2x.toFixed(1)} ${to.y.toFixed(1)}, ${to.x.toFixed(1)} ${to.y.toFixed(1)}`;
}

function OrganizationChart() {
  const chartRef = useRef<HTMLDivElement>(null);
  const [flows, setFlows] = useState<string[]>([]);
  const [box, setBox] = useState({ w: 0, h: 0 });

  useLayoutEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const draw = () => {
      const frame = chart.getBoundingClientRect();
      const width = chart.clientWidth;
      const height = chart.clientHeight;
      if (frame.width < 1 || frame.height < 1) return;
      const scaleX = width / frame.width;
      const scaleY = height / frame.height;
      const at = (id: string, side: "left" | "right") => {
        const node = chart.querySelector<HTMLElement>(`[data-node="${id}"]`);
        return node ? edge(node, frame, side, scaleX, scaleY) : null;
      };
      const lead = at("lead", "right");
      const bioL = at("bio", "left");
      const officeL = at("office", "left");
      const bioR = at("bio", "right");
      const officeR = at("office", "right");
      const researchL = at("research", "left");
      const networkL = at("network", "left");
      const researchR = at("research", "right");
      const networkR = at("network", "right");
      const fab = at("fab", "left");
      if (!lead || !bioL || !officeL || !bioR || !officeR || !researchL || !networkL || !researchR || !networkR || !fab) return;
      setBox({ w: width, h: height });
      setFlows([
        connector(lead, bioL),
        connector(lead, officeL),
        connector(bioR, researchL),
        connector(officeR, networkL),
        connector(researchR, fab),
        connector(networkR, fab),
      ]);
    };

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(chart);
    return () => observer.disconnect();
  }, []);

  const label = [
    `Studio Leadership, ${DIRECTORS.join(", ")}`,
    "Bio-Computational Team",
    `Office Management, ${ORGANIZATION.officeManager}`,
    "Research + Design Activities and Collaboration Network",
    "Fabricating + Prototyping, centralized",
  ].join(". ");

  return (
    <div className={styles.chart} ref={chartRef} role="img" aria-label={label}>
      <svg className={styles.flow} viewBox={`0 0 ${box.w} ${box.h}`} aria-hidden="true">
        {flows.map((d) => (
          <path key={d} className={styles.stream} d={d} />
        ))}
      </svg>
      <div className={styles.node} data-place="end" data-node="lead">
        <p className={styles.cardTitle}>Studio Leadership</p>
        {DIRECTORS.map((name) => (
          <p className={styles.person} key={name}>
            {name}
          </p>
        ))}
      </div>
      <div className={styles.link} aria-hidden="true" />
      <div className={styles.pair}>
        <div className={styles.node} data-node="bio">
          <p className={styles.cardTitle}>Bio-Computational Team</p>
        </div>
        <div className={styles.node} data-node="office">
          <p className={styles.cardTitle}>Office Management</p>
          <p className={styles.person}>{ORGANIZATION.officeManager}</p>
        </div>
      </div>
      <div className={styles.link} aria-hidden="true" />
      <div className={styles.pair}>
        <div className={styles.node} data-node="research">
          <p className={styles.cardTitle}>Research + Design Activities</p>
        </div>
        <div className={styles.node} data-node="network">
          <p className={styles.cardTitle}>Collaboration Network</p>
        </div>
      </div>
      <div className={styles.link} aria-hidden="true" />
      <div className={styles.node} data-place="end" data-node="fab">
        <p className={styles.cardTitle}>Fabricating + Prototyping</p>
        <p className={styles.note}>Centralized</p>
      </div>
    </div>
  );
}

function pointOn(node: HTMLElement, root: DOMRect, side: "left" | "right" | "top" | "bottom", scaleX: number, scaleY: number): Point {
  const box = node.getBoundingClientRect();
  const x = (side === "right" ? box.right : side === "left" ? box.left : box.left + box.width / 2) - root.left;
  const y = (side === "bottom" ? box.bottom : side === "top" ? box.top : box.top + box.height / 2) - root.top;
  return { x: x * scaleX, y: y * scaleY };
}

function segment(from: Point, to: Point) {
  return `M ${from.x.toFixed(1)} ${from.y.toFixed(1)} L ${to.x.toFixed(1)} ${to.y.toFixed(1)}`;
}

function DisciplineLoop() {
  const listRef = useRef<HTMLOListElement>(null);
  const [loop, setLoop] = useState("");
  const [box, setBox] = useState({ w: 0, h: 0 });

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;

    const draw = () => {
      const frame = list.getBoundingClientRect();
      const width = list.clientWidth;
      const height = list.clientHeight;
      if (frame.width < 1 || frame.height < 1) return;
      const scaleX = width / frame.width;
      const scaleY = height / frame.height;
      const at = (index: string) => list.querySelector<HTMLElement>(`[data-discipline="${index}"]`);
      const one = at("01");
      const two = at("02");
      const three = at("03");
      const four = at("04");
      if (!one || !two || !three || !four) return;
      const side = (node: HTMLElement, edge: "left" | "right" | "top" | "bottom") => pointOn(node, frame, edge, scaleX, scaleY);
      setBox({ w: width, h: height });
      setLoop(
        [
          segment(side(one, "right"), side(three, "left")),
          segment(side(three, "bottom"), side(four, "top")),
          segment(side(four, "left"), side(two, "right")),
          segment(side(two, "top"), side(one, "bottom")),
        ].join(" "),
      );
    };

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(list);
    return () => observer.disconnect();
  }, []);

  return (
    <ol className={styles.capsules} ref={listRef}>
      <svg className={styles.flow} viewBox={`0 0 ${box.w} ${box.h}`} aria-hidden="true">
        <path className={styles.stream} d={loop} />
      </svg>
      {DISCIPLINES.map((item) => (
        <li key={item.index} data-discipline={item.index}>
          <span className={styles.index}>{item.index}</span>
          <span className={styles.rowTitle}>{item.title}</span>
        </li>
      ))}
    </ol>
  );
}
export function DesignOrganization() {
  return (
    <div className={styles.root}>
      <div className={styles.group}>
        <header className={styles.head}>
          <h3 className={styles.title}>Design + Organization</h3>
          <div className={styles.subheads}>
            <p className={styles.kicker} id="org-structure-title">
              Organizational Structure
            </p>
          </div>
        </header>
        <div className={styles.body}>
          <section className={styles.structure} aria-labelledby="org-structure-title">
            <OrganizationChart />
          </section>
          <section className={styles.disciplines} aria-labelledby="design-disciplines-title">
            <h4 className={styles.sectionTitle} id="design-disciplines-title">
              Design Disciplines
            </h4>
            <DisciplineLoop />
          </section>
        </div>
      </div>
    </div>
  );
}
