/* ------------------------------------------------------------------ *
 * prefs.ts — Local user preferences (theme + editorial copy).
 *
 * Everything lives in localStorage under stable keys. A tiny event
 * bus notifies subscribers whenever a preference changes so the UI
 * can react without prop-drilling or a full context provider.
 * ------------------------------------------------------------------ */

export type Theme = "light" | "dark";

/* Editorial copy that the user can override from Settings. Null means
   "fall back to the built-in default". */
export interface EditorialCopy {
  hero_title: string | null;
  hero_sub: string | null;
  submit_label: string | null;
  success_title: string | null;
}

export const DEFAULT_COPY: EditorialCopy = {
  hero_title: null,
  hero_sub: null,
  submit_label: null,
  success_title: null,
};

const THEME_KEY = "om_theme";
const COPY_KEY = "om_copy";
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
  applyTheme(theme);
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
