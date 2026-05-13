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
 * Not a traditional button. A 56px tall horizontal strip fixed to the
 * bottom of the viewport. While submitting, a terracotta fill sweeps
 * left-to-right across the band (800ms linear). No spinner.
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
    <div
      className="om-submit-wrap"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
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
          position: fixed;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 30;
          background: var(--cream);
          border-top: 1px solid var(--rule);
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
