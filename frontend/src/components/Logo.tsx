"use client";

import React from "react";

interface LogoProps {
  size?: "sm" | "md" | "lg";
  showText?: boolean;
  stacked?: boolean;
}

/**
 * Logo — editorial wordmark.
 *
 * A small 1px-ink square anchors the wordmark set in Newsreader. No
 * gradients, no rounded corners, no shadow. Consistent with the "Ink on
 * Rice Paper" palette.
 */
export default function Logo({ size = "md", showText = true, stacked = false }: LogoProps) {
  const mark = {
    sm: 14,
    md: 18,
    lg: 28,
  }[size];

  const wordSize = {
    sm: 14,
    md: 18,
    lg: 26,
  }[size];

  return (
    <div
      className="inline-flex items-center"
      style={{
        gap: stacked ? 8 : 10,
        flexDirection: stacked ? "column" : "row",
      }}
    >
      <span
        aria-hidden
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: mark,
          height: mark,
          background: "var(--ink)",
          color: "var(--cream)",
          fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
          fontSize: mark * 0.58,
          fontWeight: 500,
          letterSpacing: 0,
          lineHeight: 1,
        }}
      >
        OM
      </span>
      {showText && (
        <span
          style={{
            fontFamily: "var(--font-newsreader), Georgia, serif",
            fontWeight: 400,
            fontSize: wordSize,
            lineHeight: 1,
            color: "var(--ink)",
            letterSpacing: "-0.005em",
          }}
        >
          Office <em style={{ fontWeight: 400 }}>Mobile</em>
        </span>
      )}
    </div>
  );
}
