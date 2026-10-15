import type { DisplayMode } from "@/components/display-mode-toggle";

export type SiteDisplay = "laptop" | "classroom";

export const SITE_DISPLAY_KEY = "lm-site-display";
export const LAB_DISPLAY_KEY = "lm-view-mode";
export const LAB_DISPLAY_EVENT = "lm-view-mode-change";

/**
 * Desktop and its website pair, Laptop, are archived.
 * Presentation and Classroom are the only live scale. Set this to false to restore the switch.
 */
export const DESKTOP_MODE_ARCHIVED = true;

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

function liveSite(site: SiteDisplay): SiteDisplay {
  return DESKTOP_MODE_ARCHIVED ? "classroom" : site;
}

function liveLab(lab: DisplayMode): DisplayMode {
  return DESKTOP_MODE_ARCHIVED ? "presentation" : lab;
}

/** Main site is authoritative, so entering the Lab opens the paired mode. */
export function syncLabFromSite(site: SiteDisplay) {
  const next = liveSite(site);
  writePair(next, labModeForSite(next));
}

/** Lab is authoritative, so leaving the Lab restores the paired main-site mode. */
export function syncSiteFromLab(lab: DisplayMode) {
  const next = liveLab(lab);
  writePair(siteModeForLab(next), next);
}

/**
 * On the main site, Classroom / Laptop wins and is written through to the Lab.
 * A missing site mode adopts the Lab pair.
 */
export function reconcileSiteDisplay(): SiteDisplay {
  if (DESKTOP_MODE_ARCHIVED) {
    syncLabFromSite("classroom");
    return "classroom";
  }
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
  if (DESKTOP_MODE_ARCHIVED) {
    syncSiteFromLab("presentation");
    return "presentation";
  }
  const lab = readStoredLab();
  if (lab) {
    syncSiteFromLab(lab);
    return lab;
  }
  const next = labModeForSite(readStoredSite() ?? "laptop");
  syncSiteFromLab(next);
  return next;
}
