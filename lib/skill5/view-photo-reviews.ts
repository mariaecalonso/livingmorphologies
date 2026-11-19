import reviews from "@/data/skill5/view-photo-reviews.json";

export type PhotoReviewSource = {
  name: string;
  url: string;
  license: string;
  depicts: string;
};

export type PhotoReview = {
  identity: string;
  display: boolean;
  role: "viewpoint" | "reference" | "historical" | null;
  summary: string;
  imageUrl?: string;
  pageUrl?: string;
  title?: string;
  author?: string;
  license?: string;
  source?: "Wikimedia Commons" | "Panoramax" | "Openverse" | "Florida Memory";
  captured?: { lat: number; lon: number } | null;
  sources: PhotoReviewSource[];
};

const catalog = reviews as Record<string, PhotoReview>;

export function reviewKey(targetId: string | null, kind: string) {
  if (kind === "waterfront") return "waterfront";
  return targetId;
}

export function photoReview(targetId: string | null, kind: string) {
  const key = reviewKey(targetId, kind);
  return key ? catalog[key] ?? null : null;
}

