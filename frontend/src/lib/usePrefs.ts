"use client";

import { useEffect, useState } from "react";
import {
  type DisplayPrefs,
  type EditorialCopy,
  type Theme,
  DEFAULT_DISPLAY,
  applyDisplay,
  getStoredCopy,
  getStoredDisplay,
  getStoredTheme,
  subscribePrefs,
} from "./prefs";

/** React hook that re-renders whenever user preferences change. */
export function usePrefs(): { theme: Theme; copy: EditorialCopy; display: DisplayPrefs } {
  const [theme, setThemeState] = useState<Theme>("light");
  const [copy, setCopyState] = useState<EditorialCopy>(() => getStoredCopy());
  const [display, setDisplayState] = useState<DisplayPrefs>(() => ({ ...DEFAULT_DISPLAY }));

  useEffect(() => {
    // Hydrate from storage once we're on the client.
    setThemeState(getStoredTheme());
    setCopyState(getStoredCopy());
    const d = getStoredDisplay();
    setDisplayState(d);
    applyDisplay(d);

    const unsubscribe = subscribePrefs(() => {
      setThemeState(getStoredTheme());
      setCopyState(getStoredCopy());
      setDisplayState(getStoredDisplay());
    });
    return unsubscribe;
  }, []);

  return { theme, copy, display };
}
