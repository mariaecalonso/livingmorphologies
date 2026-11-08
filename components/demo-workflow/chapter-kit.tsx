"use client";

import { useEffect, useState, type ReactNode } from "react";
import styles from "@/components/demo-workflow/chapter-kit.module.css";

/** A small exported still; `/demo/` stills are already sized for their frames. */
export function Img({ src, className, alt = "" }: { src: string; className?: string; alt?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img className={className ? `${styles.img} ${className}` : styles.img} src={src} alt={alt} loading="lazy" decoding="async" draggable={false} />;
}

export function Kicker({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={className ? `${styles.kicker} ${className}` : styles.kicker}>{children}</p>;
}

export function Caption({ children, align }: { children: ReactNode; align?: "start" }) {
  return (
    <p className={styles.caption} data-align={align}>
      {children}
    </p>
  );
}

export function Chips({ items, tone }: { items: readonly string[]; tone?: "teal" | "copper" }) {
  return (
    <ul className={styles.chips} data-tone={tone}>
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

/** Stated in place of material that is not stored in the project, so nothing is drawn as if it were. */
export function Missing({ children }: { children: ReactNode }) {
  return <p className={styles.missing}>{children}</p>;
}

export type Load<T> = { status: "loading" } | { status: "error" } | { status: "ready"; data: T };

export function Unavailable({ status, what }: { status: "loading" | "error"; what: string }) {
  return <p className={styles.unavailable}>{status === "loading" ? `Loading ${what}` : `${what} could not be loaded`}</p>;
}

/** Fetches one public JSON file and checks its shape. `accept` must be stable. */
export function useJson<T>(url: string, accept: (value: unknown) => value is T): Load<T> {
  const [load, setLoad] = useState<Load<T>>({ status: "loading" });
  useEffect(() => {
    const controller = new AbortController();
    const read = async () => {
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error(String(response.status));
        const value: unknown = await response.json();
        if (!accept(value)) throw new Error("unexpected shape");
        setLoad({ status: "ready", data: value });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setLoad({ status: "error" });
      }
    };
    void read();
    return () => controller.abort();
  }, [url, accept]);
  return load;
}
