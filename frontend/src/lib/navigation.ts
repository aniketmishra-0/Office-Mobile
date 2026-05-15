/**
 * Navigation helpers.
 *
 * `safeBack` mirrors the native swipe-back gesture: it pops the browser
 * history one step (just like the iOS edge-swipe / Android back gesture),
 * but falls back to a sensible home route when the user landed on this
 * page directly (deep link, refresh on first page, etc.) and there's no
 * previous entry to go back to.
 *
 * This keeps the in-app back button visually identical in behavior to the
 * gesture, so users never see pages "skip" because the button hard-pushed
 * a new history entry instead of popping the existing stack.
 */

import type { useRouter } from "next/navigation";

type AppRouter = ReturnType<typeof useRouter>;

/**
 * Pop one entry from history if there's somewhere to go back to in this
 * tab; otherwise navigate to `fallback` (defaults to "/").
 *
 * We treat "we have history" as `window.history.length > 1`. Browsers
 * don't always increment this past 1 across a hard navigation, so the
 * fallback ensures deep-linked visitors still have an exit path.
 */
export function safeBack(router: AppRouter, fallback: string = "/") {
  if (typeof window === "undefined") {
    router.push(fallback);
    return;
  }
  try {
    if (window.history.length > 1) {
      router.back();
      return;
    }
  } catch {
    // fall through to fallback
  }
  router.push(fallback);
}
