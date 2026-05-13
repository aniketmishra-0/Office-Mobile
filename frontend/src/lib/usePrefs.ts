"use client";

import { useEffect, useState } from "react";
import {
  type EditorialCopy,
  type Theme,
  getStoredCopy,
  getStoredTheme,
  subscribePrefs,
} from "./prefs";

/** React hook that re-renders whenever user preferences change. */
export function usePrefs(): { theme: Theme; copy: EditorialCopy } {
  const [theme, setThemeState] = useState<Theme>("light");
  const [copy, setCopyState] = useState<EditorialCopy>(() => getStoredCopy());

  useEffect(() => {
    // Hydrate from storage once we're on the client.
    setThemeState(getStoredTheme());
    setCopyState(getStoredCopy());

    const unsubscribe = subscribePrefs(() => {
      setThemeState(getStoredTheme());
      setCopyState(getStoredCopy());
    });
    return unsubscribe;
  }, []);

  return { theme, copy };
}
