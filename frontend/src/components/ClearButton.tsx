"use client";

import React from "react";

/**
 * ClearButton — a small × button for clearing the value of a sibling input.
 *
 * Positioned absolutely by the parent (the parent must be `position: relative`).
 * Intentionally styled in the editorial language: no rounded pill, no blue,
 * just a hairline rule border and a monospace cross glyph that adopts the
 * current theme's --stone color and flips to --ink on hover.
 *
 * Usage:
 *   <div style={{ position: "relative" }}>
 *     <input value={x} onChange={...} style={{ paddingRight: 28 }} />
 *     {x && <ClearButton onClick={() => setX("")} />}
 *   </div>
 */
export default function ClearButton({
  onClick,
  ariaLabel = "Clear",
  top = "50%",
  right = 0,
}: {
  onClick: () => void;
  ariaLabel?: string;
  top?: string | number;
  right?: string | number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className="om-clear"
      style={{ top, right }}
    >
      <span aria-hidden>×</span>
      <style jsx>{`
        .om-clear {
          position: absolute;
          transform: translateY(-50%);
          width: 22px;
          height: 22px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          border: 0;
          color: var(--stone);
          font-family: var(--font-plex-mono), ui-monospace, monospace;
          font-size: 16px;
          line-height: 1;
          cursor: pointer;
          padding: 0;
          transition: color 200ms ease-out;
        }
        .om-clear:hover,
        .om-clear:focus-visible {
          color: var(--ink);
          outline: none;
        }
      `}</style>
    </button>
  );
}
