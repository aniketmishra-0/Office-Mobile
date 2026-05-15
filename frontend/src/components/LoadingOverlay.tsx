"use client";

import React from "react";

interface Props {
  message?: string;
}

/**
 * LoadingOverlay — full-viewport branded loader.
 *
 * Shows the Office Mobile document icon with an animated orange scan
 * beam sweeping across the text-rule lines. An optional message
 * appears below in mono text.
 */
export default function LoadingOverlay({ message }: Props) {
  return (
    <div
      className="om-loading"
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 20,
        background: "#EDEAE5",
      }}
    >
      <svg
        width="160"
        height="160"
        viewBox="0 0 280 280"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="lo-beam" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="transparent" />
            <stop offset="30%" stopColor="#FF7A30" />
            <stop offset="50%" stopColor="#FFB060" />
            <stop offset="70%" stopColor="#FF7A30" />
            <stop offset="100%" stopColor="transparent" />
          </linearGradient>

          <clipPath id="lo-clip-line1">
            <rect x="108" y="152" width="54" height="7" rx="3.5" />
          </clipPath>
          <clipPath id="lo-clip-line2">
            <rect x="108" y="168" width="44" height="7" rx="3.5" />
          </clipPath>

          <clipPath id="lo-doc-clip">
            <polygon points="100,100 155,100 170,115 170,195 100,195" />
          </clipPath>

          <filter id="lo-halo" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="7" />
          </filter>
          <filter id="lo-core" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" />
          </filter>
        </defs>

        {/* Document icon */}
        <g
          stroke="#A8A29E"
          strokeWidth="4.5"
          strokeLinejoin="round"
          strokeLinecap="round"
          fill="none"
        >
          <rect
            x="100" y="100" width="70" height="95"
            rx="7" ry="7"
            clipPath="url(#lo-doc-clip)"
          />
          <line x1="155" y1="100" x2="170" y2="115" />
          <polyline points="155,100 155,115 170,115" />
        </g>

        {/* Static text rules */}
        <rect x="108" y="152" width="54" height="7" rx="3.5" fill="#C8C3BC" />
        <rect x="108" y="168" width="44" height="7" rx="3.5" fill="#C8C3BC" />

        {/* Scan beam: Line 1 */}
        <g clipPath="url(#lo-clip-line1)">
          <rect className="lo-beam lo-beam--line1" x="108" y="152" width="54" height="7" rx="3.5" fill="url(#lo-beam)" filter="url(#lo-halo)" opacity="0.3" />
          <rect className="lo-beam lo-beam--line1" x="108" y="152" width="54" height="7" rx="3.5" fill="url(#lo-beam)" filter="url(#lo-core)" />
        </g>

        {/* Scan beam: Line 2 */}
        <g clipPath="url(#lo-clip-line2)">
          <rect className="lo-beam lo-beam--line2" x="108" y="168" width="44" height="7" rx="3.5" fill="url(#lo-beam)" filter="url(#lo-halo)" opacity="0.3" />
          <rect className="lo-beam lo-beam--line2" x="108" y="168" width="44" height="7" rx="3.5" fill="url(#lo-beam)" filter="url(#lo-core)" />
        </g>

        <style>{`
          @keyframes lo-sweep-line1 {
            0%   { transform: translateX(-60px); opacity: 0; }
            5%   { opacity: 1; }
            35%  { transform: translateX(60px); opacity: 1; }
            40%  { opacity: 0; }
            100% { opacity: 0; transform: translateX(60px); }
          }
          @keyframes lo-sweep-line2 {
            0%   { opacity: 0; transform: translateX(-50px); }
            23%  { opacity: 0; transform: translateX(-50px); }
            28%  { opacity: 1; }
            58%  { transform: translateX(50px); opacity: 1; }
            63%  { opacity: 0; }
            100% { opacity: 0; transform: translateX(50px); }
          }
          .lo-beam--line1 {
            animation: lo-sweep-line1 2.6s cubic-bezier(0.45, 0, 0.2, 1) infinite;
          }
          .lo-beam--line2 {
            animation: lo-sweep-line2 2.6s cubic-bezier(0.45, 0, 0.2, 1) infinite;
          }
        `}</style>
      </svg>

      {message && (
        <p
          style={{
            margin: 0,
            fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
            fontWeight: 400,
            fontSize: 11,
            letterSpacing: "0.12em",
            color: "#A8A29E",
          }}
        >
          {message.toLowerCase()}
        </p>
      )}
    </div>
  );
}
