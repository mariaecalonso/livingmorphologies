"use client";

import { useEffect } from "react";

/** Persisted still. The file name matches the cluster mesh file, with the colon written as __. */
export function placementThumbSrc(clusterId: string) {
  return `/placement/clusters/${clusterId.replaceAll(":", "__")}.png`;
}

let preloaded = false;

/** Ask the browser to cache every still once, before a category is opened. */
export function preloadPlacementThumbs() {
  if (preloaded || typeof window === "undefined") return;
  preloaded = true;
  void fetch("/placement/clusters/manifest.json")
    .then((response) => response.ok ? response.json() as Promise<string[]> : [])
    .then((files) => {
      for (const file of files) {
        if (!file.endsWith(".png")) continue;
        const image = new Image();
        image.src = `/placement/clusters/${file}`;
      }
    })
    .catch(() => undefined);
}

export function PlacementClusterThumb({ clusterId }: { clusterId: string }) {
  useEffect(() => {
    preloadPlacementThumbs();
  }, []);
  return <img src={placementThumbSrc(clusterId)} alt="" className="placement-cluster-still" draggable={false} />;
}
