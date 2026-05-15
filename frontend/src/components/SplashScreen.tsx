"use client";

import React from "react";

/**
 * SplashScreen — full-screen branded loading state.
 *
 * Shows the Office Mobile document icon on the rice-paper background.
 * An orange scan beam sweeps across the two text-rule lines inside
 * the document, creating a "reading / scanning" effect while the
 * app boots.
 *
 * Pure CSS keyframes — no external animation libraries.
 */
export default function SplashScreen() {
  // Document bounds: x=100 y=100 w=70 h=95 → right=170 bottom=195
  // Inner content padding: 8px each side → x=108..162
  // Line 1: x=108 y=152 w=54 (stays within 162)
  // Line 2: x=108 y=168 w=44 (stays within 152)

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#EDEAE5",
      }}
    >
      <svg
        width="280"
        height="280"
        viewBox="0 0 280 280"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Loading Office Mobile"
        role="img"
      >
        {/* ── Definitions ─────────────────────────────────── */}
        <defs>
          {/* Scan beam gradient */}
          <linearGradient id="sp-beam" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="transparent" />
            <stop offset="30%" stopColor="#FF7A30" />
            <stop offset="50%" stopColor="#FFB060" />
            <stop offset="70%" stopColor="#FF7A30" />
            <stop offset="100%" stopColor="transparent" />
          </linearGradient>

          {/* Clip paths to mask beam within each line */}
          <clipPath id="sp-clip-line1">
            <rect x="108" y="152" width="54" height="7" rx="3.5" />
          </clipPath>
          <clipPath id="sp-clip-line2">
            <rect x="108" y="168" width="44" height="7" rx="3.5" />
          </clipPath>

          {/* Page body clip — top-right fold */}
          <clipPath id="sp-doc-clip">
            <polygon points="100,100 155,100 170,115 170,195 100,195" />
          </clipPath>

          {/* Halo blur — soft outer glow */}
          <filter id="sp-halo" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="7" />
          </filter>

          {/* Core blur — tighter inner beam */}
          <filter id="sp-core" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" />
          </filter>
        </defs>

        {/* ── Document icon (no dark circle) ───────────────── */}
        <g
          stroke="#A8A29E"
          strokeWidth="4.5"
          strokeLinejoin="round"
          strokeLinecap="round"
          fill="none"
        >
          <rect
            x="100"
            y="100"
            width="70"
            height="95"
            rx="7"
            ry="7"
            clipPath="url(#sp-doc-clip)"
          />
          {/* Fold diagonal */}
          <line x1="155" y1="100" x2="170" y2="115" />
          {/* Fold flap */}
          <polyline points="155,100 155,115 170,115" />
        </g>

        {/* ── Static text rules (base layer) ──────────────── */}
        <rect x="108" y="152" width="54" height="7" rx="3.5" fill="#C8C3BC" />
        <rect x="108" y="168" width="44" height="7" rx="3.5" fill="#C8C3BC" />

        {/* ── Scan beam: Line 1 ───────────────────────────── */}
        <g clipPath="url(#sp-clip-line1)">
          {/* Halo layer */}
          <rect
            className="sp-beam sp-beam--line1"
            x="108"
            y="152"
            width="54"
            height="7"
            rx="3.5"
            fill="url(#sp-beam)"
            filter="url(#sp-halo)"
            opacity="0.3"
          />
          {/* Core layer */}
          <rect
            className="sp-beam sp-beam--line1"
            x="108"
            y="152"
            width="54"
            height="7"
            rx="3.5"
            fill="url(#sp-beam)"
            filter="url(#sp-core)"
          />
        </g>

        {/* ── Scan beam: Line 2 ───────────────────────────── */}
        <g clipPath="url(#sp-clip-line2)">
          {/* Halo layer */}
          <rect
            className="sp-beam sp-beam--line2"
            x="108"
            y="168"
            width="44"
            height="7"
            rx="3.5"
            fill="url(#sp-beam)"
            filter="url(#sp-halo)"
            opacity="0.3"
          />
          {/* Core layer */}
          <rect
            className="sp-beam sp-beam--line2"
            x="108"
            y="168"
            width="44"
            height="7"
            rx="3.5"
            fill="url(#sp-beam)"
            filter="url(#sp-core)"
          />
        </g>

        {/* ── Keyframe animations ─────────────────────────── */}
        <style>{`
          @keyframes sp-sweep-line1 {
            0%   { transform: translateX(-60px); opacity: 0; }
            5%   { opacity: 1; }
            35%  { transform: translateX(60px); opacity: 1; }
            40%  { opacity: 0; }
            100% { opacity: 0; transform: translateX(60px); }
          }

          @keyframes sp-sweep-line2 {
            0%   { opacity: 0; transform: translateX(-50px); }
            23%  { opacity: 0; transform: translateX(-50px); }
            28%  { opacity: 1; }
            58%  { transform: translateX(50px); opacity: 1; }
            63%  { opacity: 0; }
            100% { opacity: 0; transform: translateX(50px); }
          }

          .sp-beam--line1 {
            animation: sp-sweep-line1 2.6s cubic-bezier(0.45, 0, 0.2, 1) infinite;
          }

          .sp-beam--line2 {
            animation: sp-sweep-line2 2.6s cubic-bezier(0.45, 0, 0.2, 1) infinite;
          }
        `}</style>
      </svg>
    </div>
  );
}
