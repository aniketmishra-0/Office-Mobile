"use client";

import React, { useEffect, useState } from "react";
import { usePrefs } from "@/lib/usePrefs";

interface Props {
  label?: string;
  submitting: boolean;
  onClick?: () => void;
  form?: string;
  disabled?: boolean;
}

/**
 * SubmitButton — full-width editorial band.
 *
 * Flows inline at the end of the page (not fixed) so scrolling reveals
 * the entire app. A terracotta fill sweeps left-to-right across the band
 * while submitting (800ms linear). No spinner. Bottom padding respects
 * the device safe-area so the iPhone home-indicator stays clear while
 * Android devices collapse the inset to zero.
 */
export default function SubmitButton({
  label,
  submitting,
  onClick,
  form,
  disabled,
}: Props) {
  const { copy } = usePrefs();
  const [showDone, setShowDone] = useState(false);

  // Resolve display label: caller wins, then user-customized copy, then default.
  const resolved = label ?? copy.submit_label ?? "Submit";

  // When submitting flips true → false, briefly hold a "done" state so
  // users see the completion. The parent screen owns the page-level
  // transition; this is cosmetic polish.
  useEffect(() => {
    if (submitting) {
      setShowDone(false);
      return;
    }
    if (showDone) {
      const t = setTimeout(() => setShowDone(false), 250);
      return () => clearTimeout(t);
    }
  }, [submitting, showDone]);

  return (
    <div className="om-submit-wrap">
      <button
        type={onClick ? "button" : "submit"}
        form={form}
        disabled={submitting || disabled}
        onClick={onClick}
        className={`om-submit ${submitting ? "is-submitting" : ""}`}
        aria-label={resolved}
      >
        <span className="om-submit__fill" aria-hidden />
        <span className="om-submit__label">
          {submitting ? (
            <>working</>
          ) : (
            <>
              {resolved.toUpperCase()}
              <span className="om-submit__arrow" aria-hidden>→</span>
            </>
          )}
        </span>
      </button>

      <style jsx>{`
        .om-submit-wrap {
          /* Flows inline with the page so scrolling reveals every part of
             the app. The outer layout already applies 'pb-safe' at the
             root (see app/layout.tsx), which keeps the iPhone home-
             indicator clear and collapses to zero on Android. */
          width: 100%;
        }
        .om-submit {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          height: 48px;
          overflow: hidden;
          background: var(--ink);
          color: var(--on-ink);
          font-family: var(--font-plex-mono), ui-monospace, monospace;
          font-weight: 500;
          font-size: 11px;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          border: 0;
          border-radius: 0;
          cursor: pointer;
          transition: background-color 200ms ease-out;
        }
        .om-submit:disabled {
          cursor: not-allowed;
          opacity: 0.45;
        }
        .om-submit__fill {
          position: absolute;
          inset: 0;
          background: var(--clay);
          transform: translateX(-100%);
          transition: transform 800ms linear;
          pointer-events: none;
        }
        .om-submit.is-submitting .om-submit__fill {
          transform: translateX(0);
        }
        .om-submit__label {
          position: relative;
          z-index: 1;
          display: inline-flex;
          align-items: center;
          gap: 12px;
        }
        .om-submit__arrow {
          display: inline-block;
          transition: transform 200ms ease-out;
        }
        .om-submit:hover:not(:disabled) .om-submit__arrow {
          transform: translateX(3px);
        }
      `}</style>
    </div>
  );
}
