"use client";

import dynamic from "next/dynamic";

const ScreenView = dynamic(() => import("./screen-view"), { ssr: false });

export default function ScreenPage() {
  return <ScreenView />;
}
