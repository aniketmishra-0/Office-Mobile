/* ------------------------------------------------------------------ *
 * prefs.ts — Local user preferences (theme + editorial copy + display).
 *
 * Everything lives in localStorage under stable keys. A tiny event
 * bus notifies subscribers whenever a preference changes so the UI
 * can react without prop-drilling or a full context provider.
 *
 * Preferences are also synced to the backend (per-user DB storage)
 * when the user is signed in, so they persist across devices.
 * ------------------------------------------------------------------ */

export type Theme = "light" | "dark";
export type FontFamily = "system" | "newsreader" | "plex-mono" | "inter" | "georgia" | "merriweather";
export type FontSize = "xs" | "sm" | "md" | "lg" | "xl";
export type LineHeight = "compact" | "normal" | "relaxed";
export type BorderRadius = "none" | "sm" | "md" | "lg";

/* Editorial copy that the user can override from Settings. Null means
   "fall back to the built-in default". */
export interface EditorialCopy {
  hero_title: string | null;
  hero_sub: string | null;
  submit_label: string | null;
  success_title: string | null;
}

/* Display preferences */
export interface DisplayPrefs {
  font_family: FontFamily;
  font_size: FontSize;
  line_height: LineHeight;
  border_radius: BorderRadius;
}

export const DEFAULT_COPY: EditorialCopy = {
  hero_title: null,
  hero_sub: null,
  submit_label: null,
  success_title: null,
};

export const DEFAULT_DISPLAY: DisplayPrefs = {
  font_family: "system",
  font_size: "md",
  line_height: "normal",
  border_radius: "md",
};

const THEME_KEY = "om_theme";
const COPY_KEY = "om_copy";
const DISPLAY_KEY = "om_display";
const EVENT = "om:prefs-change";

/* ------------------------------- theme ------------------------------ */

export function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "light";
  try {
    return (window.localStorage.getItem(THEME_KEY) as Theme) || "light";
  } catch {
    return "light";
  }
}

export function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (theme === "dark") {
    root.setAttribute("data-theme", "dark");
    root.classList.add("dark");
  } else {
    root.setAttribute("data-theme", "light");
    root.classList.remove("dark");
  }
}

export function setTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(THEME_KEY, theme);
  } catch {}
  // Flag the root for a brief universal color/bg transition so dark ↔ light
  // doesn't snap. Removed after the animation settles.
  if (typeof document !== "undefined") {
    const root = document.documentElement;
    // Snapshot the *current* background so the overlay can crossfade
    // from the previous theme on top of the new one. This gives mobile
    // a GPU-accelerated fade even while CSS variables repaint the DOM.
    try {
      const prevBg = getComputedStyle(root).getPropertyValue("--cream").trim();
      if (prevBg) root.style.setProperty("--theme-from", prevBg);
    } catch {}
    root.classList.add("theme-transitioning");
    window.setTimeout(() => {
      root.classList.remove("theme-transitioning");
      try {
        root.style.removeProperty("--theme-from");
      } catch {}
    }, 420);
  }
  applyTheme(theme);
  emitChange();
}

/* --------------------------- display prefs ------------------------- */

const FONT_SIZE_MAP: Record<FontSize, string> = {
  xs: "12px",
  sm: "13px",
  md: "15px",
  lg: "17px",
  xl: "19px",
};

const FONT_FAMILY_MAP: Record<FontFamily, string> = {
  system: "system-ui, -apple-system, sans-serif",
  newsreader: "var(--font-newsreader), Georgia, serif",
  "plex-mono": "var(--font-plex-mono), ui-monospace, monospace",
  inter: "'Inter', system-ui, sans-serif",
  georgia: "Georgia, 'Times New Roman', serif",
  merriweather: "'Merriweather', Georgia, serif",
};

const LINE_HEIGHT_MAP: Record<LineHeight, string> = {
  compact: "1.35",
  normal: "1.55",
  relaxed: "1.75",
};

const BORDER_RADIUS_MAP: Record<BorderRadius, string> = {
  none: "0px",
  sm: "4px",
  md: "8px",
  lg: "14px",
};

export function getStoredDisplay(): DisplayPrefs {
  if (typeof window === "undefined") return { ...DEFAULT_DISPLAY };
  try {
    const raw = window.localStorage.getItem(DISPLAY_KEY);
    if (!raw) return { ...DEFAULT_DISPLAY };
    const parsed = JSON.parse(raw) as Partial<DisplayPrefs>;
    return { ...DEFAULT_DISPLAY, ...parsed };
  } catch {
    return { ...DEFAULT_DISPLAY };
  }
}

export function applyDisplay(display: DisplayPrefs): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.style.setProperty("--user-font-family", FONT_FAMILY_MAP[display.font_family] || FONT_FAMILY_MAP.system);
  root.style.setProperty("--user-font-size", FONT_SIZE_MAP[display.font_size] || FONT_SIZE_MAP.md);
  root.style.setProperty("--user-line-height", LINE_HEIGHT_MAP[display.line_height] || LINE_HEIGHT_MAP.normal);
  root.style.setProperty("--user-border-radius", BORDER_RADIUS_MAP[display.border_radius] || BORDER_RADIUS_MAP.md);
}

export function setDisplay(patch: Partial<DisplayPrefs>): void {
  const current = getStoredDisplay();
  const next = { ...current, ...patch };
  try {
    window.localStorage.setItem(DISPLAY_KEY, JSON.stringify(next));
  } catch {}
  applyDisplay(next);
  emitChange();
}

export function resetDisplay(): void {
  try {
    window.localStorage.removeItem(DISPLAY_KEY);
  } catch {}
  applyDisplay(DEFAULT_DISPLAY);
  emitChange();
}

/* --------------------------- editorial copy ------------------------ */

export function getStoredCopy(): EditorialCopy {
  if (typeof window === "undefined") return { ...DEFAULT_COPY };
  try {
    const raw = window.localStorage.getItem(COPY_KEY);
    if (!raw) return { ...DEFAULT_COPY };
    const parsed = JSON.parse(raw) as Partial<EditorialCopy>;
    return { ...DEFAULT_COPY, ...parsed };
  } catch {
    return { ...DEFAULT_COPY };
  }
}

export function setCopy(patch: Partial<EditorialCopy>): void {
  const current = getStoredCopy();
  const next = { ...current, ...patch };
  try {
    window.localStorage.setItem(COPY_KEY, JSON.stringify(next));
  } catch {}
  emitChange();
}

export function resetCopy(): void {
  try {
    window.localStorage.removeItem(COPY_KEY);
  } catch {}
  emitChange();
}

/* --------------------------- event bus ----------------------------- */

function emitChange(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function subscribePrefs(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => listener();
  window.addEventListener(EVENT, handler);
  // Also react to changes made in other tabs.
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}

/* ----------------------- backend sync helpers ---------------------- */

const API_BASE = (
  typeof process !== "undefined" && process.env?.NEXT_PUBLIC_API_URL
    ? process.env.NEXT_PUBLIC_API_URL
    : "http://localhost:8000"
).replace(/\/$/, "");

function _sessionHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const sk = window.localStorage.getItem("om_session");
  return sk ? { "X-Session-Key": sk } : {};
}

/**
 * Load preferences from the backend and apply them locally.
 * Call this after sign-in to hydrate from the user's saved prefs.
 */
export async function syncPrefsFromBackend(): Promise<void> {
  try {
    const res = await fetch(`${API_BASE}/api/preferences`, {
      headers: { ...(_sessionHeaders()) },
      credentials: "include",
    });
    if (!res.ok) return;
    const data = await res.json();
    const prefs = data.preferences || {};

    // Apply theme
    if (prefs.theme) {
      try { window.localStorage.setItem(THEME_KEY, prefs.theme); } catch {}
      applyTheme(prefs.theme as Theme);
    }

    // Apply display prefs
    const display: Partial<DisplayPrefs> = {};
    if (prefs.font_family) display.font_family = prefs.font_family;
    if (prefs.font_size) display.font_size = prefs.font_size;
    if (prefs.line_height) display.line_height = prefs.line_height;
    if (prefs.border_radius) display.border_radius = prefs.border_radius;
    if (Object.keys(display).length > 0) {
      const merged = { ...DEFAULT_DISPLAY, ...display };
      try { window.localStorage.setItem(DISPLAY_KEY, JSON.stringify(merged)); } catch {}
      applyDisplay(merged);
    }

    // Apply editorial copy
    const copy: Partial<EditorialCopy> = {};
    if (prefs.hero_title !== undefined) copy.hero_title = prefs.hero_title;
    if (prefs.hero_sub !== undefined) copy.hero_sub = prefs.hero_sub;
    if (prefs.submit_label !== undefined) copy.submit_label = prefs.submit_label;
    if (prefs.success_title !== undefined) copy.success_title = prefs.success_title;
    if (Object.keys(copy).length > 0) {
      const merged = { ...DEFAULT_COPY, ...copy };
      try { window.localStorage.setItem(COPY_KEY, JSON.stringify(merged)); } catch {}
    }

    emitChange();
  } catch {
    // Silently fail — local prefs still work
  }
}

/**
 * Push the current local preferences to the backend for persistence.
 */
export async function syncPrefsToBackend(): Promise<void> {
  try {
    const theme = getStoredTheme();
    const display = getStoredDisplay();
    const copy = getStoredCopy();

    const payload: Record<string, string | null> = {
      theme,
      font_family: display.font_family,
      font_size: display.font_size,
      line_height: display.line_height,
      border_radius: display.border_radius,
      hero_title: copy.hero_title,
      hero_sub: copy.hero_sub,
      submit_label: copy.submit_label,
      success_title: copy.success_title,
    };

    await fetch(`${API_BASE}/api/preferences`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...(_sessionHeaders()),
      },
      credentials: "include",
      body: JSON.stringify(payload),
    });
  } catch {
    // Silently fail — local prefs still work
  }
}
