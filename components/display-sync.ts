import type { DisplayMode } from "@/components/display-mode-toggle";

export type SiteDisplay = "laptop" | "classroom";

export const SITE_DISPLAY_KEY = "lm-site-display";
export const LAB_DISPLAY_KEY = "lm-view-mode";
export const LAB_DISPLAY_EVENT = "lm-view-mode-change";

/** Main Classroom is Lab Presentation. Main Laptop is Lab Desktop. */
export function labModeForSite(mode: SiteDisplay): DisplayMode {
  return mode === "classroom" ? "presentation" : "desktop";
}

export function siteModeForLab(mode: DisplayMode): SiteDisplay {
  return mode === "presentation" ? "classroom" : "laptop";
}

export function readStoredSite(): SiteDisplay | null {
  const value = window.localStorage.getItem(SITE_DISPLAY_KEY);
  return value === "classroom" || value === "laptop" ? value : null;
}

export function readStoredLab(): DisplayMode | null {
  const value = window.localStorage.getItem(LAB_DISPLAY_KEY);
  return value === "presentation" || value === "desktop" ? value : null;
}

function writePair(site: SiteDisplay, lab: DisplayMode) {
  window.localStorage.setItem(SITE_DISPLAY_KEY, site);
  window.localStorage.setItem(LAB_DISPLAY_KEY, lab);
  window.dispatchEvent(new Event(LAB_DISPLAY_EVENT));
}

/** Main site is authoritative, so entering the Lab opens the paired mode. */
export function syncLabFromSite(site: SiteDisplay) {
  writePair(site, labModeForSite(site));
}

/** Lab is authoritative, so leaving the Lab restores the paired main-site mode. */
export function syncSiteFromLab(lab: DisplayMode) {
  writePair(siteModeForLab(lab), lab);
}

/**
 * On the main site, Classroom / Laptop wins and is written through to the Lab.
 * A missing site mode adopts the Lab pair.
 */
export function reconcileSiteDisplay(): SiteDisplay {
  const site = readStoredSite();
  if (site) {
    syncLabFromSite(site);
    return site;
  }
  const next = siteModeForLab(readStoredLab() ?? "desktop");
  syncLabFromSite(next);
  return next;
}

/**
 * In the Lab, Desktop / Presentation wins and is written through to the main site.
 * A missing Lab mode adopts the main-site pair. Intra-Lab navigation does not call this again.
 */
export function reconcileLabDisplay(): DisplayMode {
  const lab = readStoredLab();
  if (lab) {
    syncSiteFromLab(lab);
    return lab;
  }
  const next = labModeForSite(readStoredSite() ?? "laptop");
  syncSiteFromLab(next);
  return next;
}
