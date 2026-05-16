"use client";

import React from "react";

interface Props {
  message?: string;
}

/**
 * LoadingOverlay — full-viewport branded loader.
 *
 * Shows the Office Mobile document icon with a fast orange scan beam
 * sweeping across the text-rule lines.
 */
export default function LoadingOverlay({ message }: Props) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 50,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 18,
        background: "var(--cream, #EDEAE5)",
        width: "100vw",
        height: "100dvh",
      }}
    >
      <svg
        width="120"
        height="120"
        viewBox="0 0 120 120"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        style={{ display: "block", margin: "0 auto" }}
      >
        <defs>
          <linearGradient id="lo-beam" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="transparent" />
            <stop offset="30%" stopColor="#FF7A30" />
            <stop offset="50%" stopColor="#FFB060" />
            <stop offset="70%" stopColor="#FF7A30" />
            <stop offset="100%" stopColor="transparent" />
          </linearGradient>

          <clipPath id="lo-clip1">
            <rect x="30" y="64" width="40" height="5" rx="2.5" />
          </clipPath>
          <clipPath id="lo-clip2">
            <rect x="30" y="76" width="32" height="5" rx="2.5" />
          </clipPath>

          <clipPath id="lo-doc">
            <polygon points="22,18 72,18 82,28 82,102 22,102" />
          </clipPath>

          <filter id="lo-halo" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="4" />
          </filter>
          <filter id="lo-core" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="1.5" />
          </filter>
        </defs>

        {/* Document icon */}
        <g stroke="var(--stone, #A8A29E)" strokeWidth="3.5" strokeLinejoin="round" strokeLinecap="round" fill="none">
          <rect x="22" y="18" width="60" height="84" rx="6" ry="6" clipPath="url(#lo-doc)" />
          <line x1="72" y1="18" x2="82" y2="28" />
          <polyline points="72,18 72,28 82,28" />
        </g>

        {/* Base lines */}
        <rect x="30" y="64" width="40" height="5" rx="2.5" fill="var(--rule, #D6D3CD)" />
        <rect x="30" y="76" width="32" height="5" rx="2.5" fill="var(--rule, #D6D3CD)" />

        {/* Beam Line 1 */}
        <g clipPath="url(#lo-clip1)">
          <rect className="lo-b1" x="30" y="64" width="40" height="5" rx="2.5" fill="url(#lo-beam)" filter="url(#lo-halo)" opacity="0.35" />
          <rect className="lo-b1" x="30" y="64" width="40" height="5" rx="2.5" fill="url(#lo-beam)" filter="url(#lo-core)" />
        </g>

        {/* Beam Line 2 */}
        <g clipPath="url(#lo-clip2)">
          <rect className="lo-b2" x="30" y="76" width="32" height="5" rx="2.5" fill="url(#lo-beam)" filter="url(#lo-halo)" opacity="0.35" />
          <rect className="lo-b2" x="30" y="76" width="32" height="5" rx="2.5" fill="url(#lo-beam)" filter="url(#lo-core)" />
        </g>

        <style>{`
          @keyframes lo1 {
            0%   { transform: translateX(-50px); opacity: 0; }
            8%   { opacity: 1; }
            42%  { transform: translateX(50px); opacity: 1; }
            50%  { opacity: 0; }
            100% { opacity: 0; transform: translateX(50px); }
          }
          @keyframes lo2 {
            0%   { opacity: 0; transform: translateX(-45px); }
            20%  { opacity: 0; transform: translateX(-45px); }
            28%  { opacity: 1; }
            62%  { transform: translateX(45px); opacity: 1; }
            70%  { opacity: 0; }
            100% { opacity: 0; transform: translateX(45px); }
          }
          .lo-b1 { animation: lo1 1.6s cubic-bezier(0.45, 0, 0.2, 1) infinite; }
          .lo-b2 { animation: lo2 1.6s cubic-bezier(0.45, 0, 0.2, 1) infinite; }
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
            color: "var(--stone, #A8A29E)",
            textAlign: "center",
          }}
        >
          {message.toLowerCase()}
        </p>
      )}
    </div>
  );
}
