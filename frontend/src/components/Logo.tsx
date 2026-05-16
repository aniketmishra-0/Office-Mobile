"use client";

import React from "react";

interface LogoProps {
  size?: "sm" | "md" | "lg" | "xl";
  showText?: boolean;
  stacked?: boolean;
}

/**
 * Logo — editorial wordmark.
 *
 * A small rounded ink tile carrying the document-with-folded-corner
 * glyph (same artwork as the PWA icon) anchors the wordmark set in
 * Newsreader. No gradients, no shadow — consistent with the "Ink on
 * Rice Paper" palette.
 */
export default function Logo({
  size = "md",
  showText = true,
  stacked = false,
}: LogoProps) {
  const mark = {
    sm: 16,
    md: 22,
    lg: 32,
    xl: 34,
  }[size];

  const wordSize = {
    sm: 14,
    md: 18,
    lg: 26,
    xl: 26,
  }[size];

  return (
    <div
      className="inline-flex items-center"
      style={{
        gap: stacked ? 8 : 10,
        flexDirection: stacked ? "column" : "row",
      }}
    >
      <DocMark size={mark} />
      {showText && (
        <span
          className="hidden sm:inline-block"
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

/**
 * DocMark — inline SVG of the rounded ink tile plus the document
 * glyph with a folded top-right corner. Strokes scale with the
 * provided size so the mark stays crisp from 14px headers to 64px
 * onboarding hero placements.
 */
function DocMark({ size }: { size: number }) {
  // Viewbox at 64 units lets us express strokes in clean integers.
  const stroke = Math.max(2.5, size * 0.07);
  const lineStroke = Math.max(2.5, size * 0.09);

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden
      focusable="false"
      style={{ display: "block", flexShrink: 0 }}
    >
      {/* Rounded ink tile — full bleed, no wasted margin */}
      <rect
        x="0"
        y="0"
        width="64"
        height="64"
        rx="14"
        ry="14"
        fill="var(--ink)"
      />

      {/* Document body — clipped so the top-right corner forms the fold */}
      <defs>
        <clipPath id="om-doc-clip">
          {/* Full page minus the top-right triangle (the fold) */}
          <polygon points="18,16 42,16 48,22 48,48 18,48" />
        </clipPath>
      </defs>

      <g stroke="var(--cream)" strokeWidth={stroke} strokeLinejoin="round" strokeLinecap="round" fill="none">
        {/* Page outline (clipped to reveal the fold) */}
        <rect
          x="18"
          y="16"
          width="30"
          height="32"
          rx="3.5"
          ry="3.5"
          clipPath="url(#om-doc-clip)"
        />
        {/* Diagonal of the fold */}
        <line x1="42" y1="16" x2="48" y2="22" />
        {/* The little flap */}
        <polyline points="42,16 42,22 48,22" />
      </g>

      {/* Two text rules inside the page — the muted secondary tone */}
      <g stroke="var(--stone)" strokeWidth={lineStroke} strokeLinecap="round">
        <line x1="24" y1="34" x2="42" y2="34" />
        <line x1="24" y1="40" x2="38" y2="40" />
      </g>
    </svg>
  );
}
