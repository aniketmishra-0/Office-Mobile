"use client";

import { useEffect, useRef } from "react";

/**
 * useStepHistory — make in-page step transitions traversable with the
 * browser back gesture / button.
 *
 * Many pages model multi-step flows (input → preview → done, or
 * input → tabs → loaded → row detail) as React state at the same URL.
 * Out of the box the browser knows nothing about those steps, so an
 * iOS edge-swipe or Android back gesture jumps straight to the previous
 * URL — skipping every intermediate step.
 *
 * This hook records each forward step transition as a synthetic history
 * entry (`pushState`) and reverses the state when the user pops one of
 * those entries (`popstate`). The visible URL never changes; only the
 * history stack grows and shrinks alongside the step variable.
 *
 *   const [step, setStep] = useState<Step>("input");
 *   useStepHistory(step, setStep, ["input", "preview", "done"]);
 *
 * Auto-load transitions vs user transitions
 * -----------------------------------------
 * Pages frequently auto-advance their step in response to a URL param
 * (e.g. `/form-fill?sheet=X` jumps straight to the "preview" step on
 * mount). Those transitions weren't initiated by the user pressing a
 * button on this page, so they shouldn't grow the back stack — the user
 * never saw the earlier step and shouldn't have to back through it.
 *
 * To distinguish the two, we mark the page as "interactive" the first
 * time the user produces a `pointerdown` or `keydown` event. Forward
 * transitions before that flag flips are absorbed into the ground
 * state; transitions after the flag flips push history entries as
 * usual. The flag is reset after each pushed entry so that subsequent
 * background updates (silent refreshes, etc.) don't accidentally push.
 *
 * Programmatic backwards jumps (e.g. a Reset button) collapse the
 * matching number of synthetic entries via `history.go(-N)` so the
 * stack stays in sync with the visible step.
 */
export function useStepHistory<TStep extends string>(
  current: TStep,
  setCurrent: (next: TStep) => void,
  steps: readonly TStep[],
) {
  // Did the user produce any input on this page yet?
  const interactedRef = useRef(false);
  // Number of synthetic entries we currently own on top of the page's
  // ground state.
  const depthRef = useRef(0);
  // Counts pending programmatic pops (history.go calls we initiated)
  // so the popstate listener can ignore the corresponding events.
  const pendingPopsRef = useRef(0);
  // Latest step value — kept in a ref so the popstate listener has it
  // without re-binding on every change.
  const currentRef = useRef(current);

  // Mark the page as "interactive" on first user input.
  useEffect(() => {
    if (typeof window === "undefined") return;
    function flip() {
      interactedRef.current = true;
    }
    // Capture phase so we observe before React's synthetic handlers.
    window.addEventListener("pointerdown", flip, true);
    window.addEventListener("keydown", flip, true);
    return () => {
      window.removeEventListener("pointerdown", flip, true);
      window.removeEventListener("keydown", flip, true);
    };
  }, []);

  // Push or collapse history entries when the step changes.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const prev = currentRef.current;
    if (prev === current) return;

    const prevIdx = steps.indexOf(prev);
    const nextIdx = steps.indexOf(current);
    currentRef.current = current;

    if (nextIdx === -1 || prevIdx === -1) return;

    if (!interactedRef.current) {
      // Auto-load transition — silently advance the ground state.
      return;
    }

    if (nextIdx > prevIdx) {
      try {
        window.history.pushState(
          { __omStep: current },
          "",
          window.location.href,
        );
        depthRef.current += 1;
      } catch {
        /* noop */
      }
      // Each push consumes the interaction flag; further background
      // updates won't push until the user acts again.
      interactedRef.current = false;
    } else if (nextIdx < prevIdx) {
      // Programmatic backward jump (e.g. Reset). Collapse synthetic
      // entries so the stack matches the new step.
      const collapse = Math.min(depthRef.current, prevIdx - nextIdx);
      if (collapse > 0) {
        pendingPopsRef.current += collapse;
        depthRef.current -= collapse;
        try {
          window.history.go(-collapse);
        } catch {
          pendingPopsRef.current = Math.max(
            0,
            pendingPopsRef.current - collapse,
          );
        }
      }
      interactedRef.current = false;
    }
  }, [current, steps]);

  // Listen for back gesture / button.
  useEffect(() => {
    if (typeof window === "undefined") return;

    function handlePop() {
      // Was this our own programmatic go(-N)? Swallow it — state is
      // already where we want it.
      if (pendingPopsRef.current > 0) {
        pendingPopsRef.current -= 1;
        return;
      }

      // No synthetic entries left → user is leaving the flow. Let the
      // browser perform its normal back navigation.
      if (depthRef.current <= 0) return;

      const cur = currentRef.current;
      const idx = steps.indexOf(cur);
      if (idx <= 0) return;

      const prevStep = steps[idx - 1];
      depthRef.current -= 1;
      currentRef.current = prevStep;
      setCurrent(prevStep);
    }

    window.addEventListener("popstate", handlePop);
    return () => window.removeEventListener("popstate", handlePop);
  }, [steps, setCurrent]);
}
