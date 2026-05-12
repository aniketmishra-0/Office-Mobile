# Bugfix Requirements Document

## Introduction

Back navigation in the multi-step product flows is broken. On any of the step-based screens (the Dashboard "paste sheet → customize → done" flow under `/`, the Edit form flow under `/edit/[id]`, and the Fill form flow under `/f/[id]` including its success screen), pressing back does not land the user on the immediate previous step. Instead it jumps straight to home or the dashboard, exits the flow entirely, or reloads a fresh route and loses in-progress state.

The defect is visible across every "back" affordance the user has: the top-left back button in the app header, the browser back button, the Android system back button, the iOS swipe-back / edge gesture, and any in-app gesture-based back. These paths currently behave inconsistently because the multi-step state is held only in React state (and, in one case, `sessionStorage`), and is never pushed to the browser history stack. The OS- and browser-level back affordances therefore cannot see intermediate steps and always pop the entire route.

The fix must unify back behavior under a single history model so that, from any step in any of these flows, one back action always moves exactly one step backward — regardless of which back mechanism the user invokes. Direct route loads, refresh, and deep links must continue to work, and every non-buggy navigation (forward movement, explicit exit at the entry step, success-screen exit) must continue to behave as it does today.

## Bug Analysis

### Current Behavior (Defect)

The following describe what currently happens when a user triggers a back action inside a multi-step flow.

1.1 WHEN the user is on the Dashboard `preview` step and presses the top-left back button THEN the system resets React state back to `input` without pushing or popping a browser history entry, so the browser's forward/back stack remains unaware of the step transition.

1.2 WHEN the user is on the Dashboard `done` (success) step and presses the top-left back button THEN the system jumps directly to the `input` step, skipping the `preview` step that preceded `done`.

1.3 WHEN the user is on any Dashboard step (`preview` or `done`) and presses the browser back button, Android system back, or iOS edge-swipe back THEN the system exits the Dashboard route entirely (navigates away from `/`) instead of moving one step backward within the flow, because no intermediate step was ever pushed to history.

1.4 WHEN the user is on the Edit form page at `/edit/[id]` and presses the top-left back button THEN the system performs `window.location.href = "/"`, forcing a full page reload to home and destroying the browser history entry for the edit page, so a subsequent forward navigation cannot return to the edit view.

1.5 WHEN the user is on the Fill form page at `/f/[id]` and presses the top-left back button THEN the system calls `router.push("/")`, navigating directly to home regardless of how the user arrived, instead of returning to the immediate previous location in history.

1.6 WHEN the user is on the Fill form success screen (after submission) and triggers any back action (button, browser, OS, or gesture) THEN the system has no consistent handler for returning to a safe prior location, and the user can land back on the now-stale form step or be bounced out of the flow.

1.7 WHEN the user triggers back via the iOS swipe-back edge gesture or an in-app gesture-based back on any multi-step screen THEN the system behaves differently from the top-left back button on the same screen, because only the button is wired to the step-change handler while the gesture operates on the browser history stack.

1.8 WHEN the user refreshes the page while on the Dashboard `preview` or `done` step THEN the URL does not reflect the current step, so after reload the app either restores the wrong step or loses it entirely, and the browser back stack no longer contains the steps the user visited before refresh.

1.9 WHEN the user opens a deep link directly to a later step of a flow (for example, arriving at `/edit/[id]` or `/f/[id]` from an external link) and then presses back THEN the system may navigate to an unrelated previous page in history or exit the app, rather than applying a safe, defined fallback for deep-link entries.

### Expected Behavior (Correct)

The following describe the correct behavior the fixed system SHALL exhibit for the same conditions.

2.1 WHEN the user is on the Dashboard `preview` step and presses the top-left back button THEN the system SHALL navigate to the immediate previous step (`input`) and SHALL keep the browser history stack in sync so that a forward navigation returns to `preview`.

2.2 WHEN the user is on the Dashboard `done` step and presses the top-left back button THEN the system SHALL navigate to the immediate previous step (`preview`), not to `input` and not to home.

2.3 WHEN the user is on any Dashboard step beyond `input` and presses browser back, Android system back, or iOS edge-swipe back THEN the system SHALL move exactly one step backward within the flow and SHALL NOT exit the route, because each step transition has a corresponding history entry.

2.4 WHEN the user is on the Edit form page and presses the top-left back button THEN the system SHALL return to the immediate previous location in history (using a soft navigation that preserves the history stack), and SHALL NOT perform a full page reload to home.

2.5 WHEN the user is on the Fill form page and presses the top-left back button THEN the system SHALL return to the immediate previous location in history if one exists within the app session, and SHALL fall back to a defined safe location (home) only when there is no in-session previous entry (deep-link or fresh tab).

2.6 WHEN the user is on the Fill form success screen and triggers any back action THEN the system SHALL treat the success screen as a terminal step whose back action returns the user to a defined safe location (home or the form start), SHALL NOT return to the just-submitted form step with stale state, and SHALL apply the same rule for button, browser, OS, and gesture back.

2.7 WHEN the user triggers back via the iOS swipe-back edge gesture or an in-app gesture-based back on any multi-step screen THEN the system SHALL produce the same destination as the top-left back button on that screen, because both paths are driven by the same unified history model.

2.8 WHEN the user refreshes the page while on any step of a multi-step flow THEN the system SHALL either encode the current step in the URL (path segment or query parameter) so the step is recoverable after reload, or SHALL fall back to a safe recoverable step without breaking the current flow; in either case the browser back stack after refresh SHALL remain consistent with the user's position in the flow.

2.9 WHEN the user opens a deep link directly to a later step of a flow and then presses back THEN the system SHALL apply a defined fallback (for example, the flow's entry step or home) rather than an arbitrary prior history entry, and SHALL apply the same fallback regardless of which back mechanism is used.

2.10 WHEN the user is at the entry step of any flow (Dashboard `input`, the first step of Fill form, the Edit form root) and presses back THEN the system SHALL either exit to a single defined safe location (home) or prompt for explicit confirmation before exiting when there is unsaved progress, and SHALL NOT silently reset partially-filled data without warning.

2.11 WHEN a back action occurs on any step that contains unsaved user input AND the step is not the entry step THEN the system SHALL still navigate to the immediate previous step, and SHALL either preserve the unsaved input across the back-forward round trip or SHALL prompt for confirmation before discarding it, consistent across all back mechanisms.

2.12 WHEN the flow is actively loading or submitting (for example, mid-submission on the Fill form) and a back action occurs THEN the system SHALL follow a defined policy (either disable back for the duration of the in-flight action, or cancel the action and move one step backward) and SHALL apply that policy identically across button, browser, OS, and gesture back.

2.13 WHEN any back action is taken from any step of any flow THEN the resulting destination SHALL be the immediate previous step in the flow's linear sequence, and the system SHALL NOT jump directly to home or dashboard unless the user is at the entry step or has explicitly confirmed exit.

### Unchanged Behavior (Regression Prevention)

The following describe existing behavior that MUST be preserved by the fix.

3.1 WHEN the user presses a forward-navigation control within a multi-step flow (for example, "Preview your form" on Dashboard `input`, "Publish & get link" on Dashboard `preview`, "Submit" on the Fill form, "Save changes" on the Edit form) THEN the system SHALL CONTINUE TO advance to the next step exactly as it does today, with the same validation, loading states, and error handling.

3.2 WHEN the user is on the Dashboard `input` step (the entry step) and presses back THEN the system SHALL CONTINUE TO behave as a top-level back, because this step has no earlier step within the flow.

3.3 WHEN the user submits the Fill form and the Success screen appears THEN the system SHALL CONTINUE TO show the existing success UI, the "Submit another response" action, and the existing offline/sync banners with no visual regression.

3.4 WHEN the user copies the form share link or edit link from the Dashboard `done` step THEN the system SHALL CONTINUE TO copy the correct URL and show the existing "Copied" confirmation.

3.5 WHEN the user loads any route directly (refresh, bookmark, deep link) into `/`, `/login`, `/edit/[id]`, `/f/[id]`, `/history`, `/submissions`, `/privacy`, or `/terms` THEN the system SHALL CONTINUE TO render that route correctly on first load, without requiring prior in-app navigation.

3.6 WHEN the user is offline and submits the Fill form THEN the system SHALL CONTINUE TO save the submission to the offline queue and show the offline success state, unchanged by any navigation changes.

3.7 WHEN the user signs out from the Dashboard THEN the system SHALL CONTINUE TO call the logout endpoint and reload to the welcome/login screen.

3.8 WHEN the user navigates using in-app links that are not back actions (for example, "Check history", "Create another form", the "Open in this App" button on the success step) THEN the system SHALL CONTINUE TO route exactly as it does today.

3.9 WHEN the user is on a non-multi-step page that has no concept of "previous step" (for example, `/history`, `/submissions`, `/privacy`, `/terms`) and presses back THEN the system SHALL CONTINUE TO return to the previous location in the browser's history stack with no change in behavior.

3.10 WHEN the user is on the login/welcome screen and has not yet authenticated THEN the system SHALL CONTINUE TO show the welcome UI and SHALL NOT be affected by multi-step back logic.

3.11 WHEN a form is successfully submitted, saved, or published (any completion event that exists today) THEN the system SHALL CONTINUE TO trigger the same downstream effects (API calls, toast messages, offline sync) with no change to their timing or payloads.

## Bug Condition and Properties

For formal validation, the bug is expressed with the bug condition methodology.

**Input space**: the set of `(flow, currentStep, backMechanism)` triples a user can exercise, where:
- `flow` ∈ { DashboardCreate, FillForm, EditForm }
- `currentStep` is the user's position within the flow (e.g. DashboardCreate ∈ {input, preview, done}; FillForm ∈ {form, success}; EditForm ∈ {edit})
- `backMechanism` ∈ { topLeftButton, browserBack, androidBack, iosEdgeSwipe, inAppGesture }

**Bug Condition — `isBugCondition(X)`**: identifies inputs that currently trigger the defect.

```pascal
FUNCTION isBugCondition(X)
  INPUT: X of type (flow, currentStep, backMechanism)
  OUTPUT: boolean

  // The bug is triggered whenever the user is at a step that HAS an
  // immediate previous step in the flow, and invoking any back mechanism
  // does not land on that immediate previous step.
  IF X.currentStep is the entry step of X.flow THEN
    RETURN false   // entry step has no "previous step"; handled by 2.10 / 3.2
  END IF

  previousStep ← immediatePreviousStepOf(X.flow, X.currentStep)
  actualDestination ← F(X)    // destination produced by the unfixed system

  RETURN actualDestination ≠ previousStep
END FUNCTION
```

**Fix Checking Property** — desired behavior for all buggy inputs.

```pascal
// Property: Fix Checking — "one back = one step back, consistently"
FOR ALL X WHERE isBugCondition(X) DO
  result ← F'(X)
  ASSERT result = immediatePreviousStepOf(X.flow, X.currentStep)
END FOR
```

**Consistency Property** — across mechanisms.

```pascal
// For any two back mechanisms invoked at the same (flow, step),
// the fixed destination must be identical.
FOR ALL flow, step DO
  FOR ALL m1, m2 IN backMechanism DO
    ASSERT F'(flow, step, m1) = F'(flow, step, m2)
  END FOR
END FOR
```

**Preservation Checking Property** — non-buggy inputs behave identically.

```pascal
// Property: Preservation Checking
// For all inputs that are NOT the bug condition (forward navigation,
// entry-step back, completion events, non-multi-step pages, copy / sign-out
// / offline / deep-link-render behaviors), the fixed system must match
// the original system exactly.
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT F(X) = F'(X)
END FOR
```

**Counterexamples demonstrating the bug today**:
- `(DashboardCreate, done, topLeftButton)` → current `F` returns `input`; expected `preview`.
- `(DashboardCreate, preview, browserBack)` → current `F` returns "exits the route"; expected `input`.
- `(FillForm, form, topLeftButton)` → current `F` returns `/` (home) unconditionally; expected "previous in-session location, or home if none".
- `(EditForm, edit, topLeftButton)` → current `F` performs a hard reload to `/`; expected "soft navigate to previous history entry".
- `(DashboardCreate, preview, iosEdgeSwipe)` ≠ `(DashboardCreate, preview, topLeftButton)` today; they must be equal after the fix.
