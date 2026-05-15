"use client";

import React from "react";

/**
 * SplashScreen — full-screen branded loading state for initial app boot.
 *
 * Larger version of the document icon with the scan beam animation.
 * Used only on the homepage while checking auth status.
 */
export default function SplashScreen() {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 24,
        background: "#EDEAE5",
      }}
    >
      <svg
        width="160"
        height="160"
        viewBox="0 0 120 120"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Loading Office Mobile"
        role="img"
        style={{ display: "block" }}
      >
        <defs>
          <linearGradient id="sp-beam" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="transparent" />
            <stop offset="30%" stopColor="#FF7A30" />
            <stop offset="50%" stopColor="#FFB060" />
            <stop offset="70%" stopColor="#FF7A30" />
            <stop offset="100%" stopColor="transparent" />
          </linearGradient>

          <clipPath id="sp-clip1">
            <rect x="30" y="64" width="40" height="5" rx="2.5" />
          </clipPath>
          <clipPath id="sp-clip2">
            <rect x="30" y="76" width="32" height="5" rx="2.5" />
          </clipPath>

          <clipPath id="sp-doc">
            <polygon points="22,18 72,18 82,28 82,102 22,102" />
          </clipPath>

          <filter id="sp-halo" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="4" />
          </filter>
          <filter id="sp-core" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="1.5" />
          </filter>
        </defs>

        {/* Document icon */}
        <g stroke="#A8A29E" strokeWidth="3.5" strokeLinejoin="round" strokeLinecap="round" fill="none">
          <rect x="22" y="18" width="60" height="84" rx="6" ry="6" clipPath="url(#sp-doc)" />
          <line x1="72" y1="18" x2="82" y2="28" />
          <polyline points="72,18 72,28 82,28" />
        </g>

        {/* Base lines */}
        <rect x="30" y="64" width="40" height="5" rx="2.5" fill="#C8C3BC" />
        <rect x="30" y="76" width="32" height="5" rx="2.5" fill="#C8C3BC" />

        {/* Beam Line 1 */}
        <g clipPath="url(#sp-clip1)">
          <rect className="sp-b1" x="30" y="64" width="40" height="5" rx="2.5" fill="url(#sp-beam)" filter="url(#sp-halo)" opacity="0.35" />
          <rect className="sp-b1" x="30" y="64" width="40" height="5" rx="2.5" fill="url(#sp-beam)" filter="url(#sp-core)" />
        </g>

        {/* Beam Line 2 */}
        <g clipPath="url(#sp-clip2)">
          <rect className="sp-b2" x="30" y="76" width="32" height="5" rx="2.5" fill="url(#sp-beam)" filter="url(#sp-halo)" opacity="0.35" />
          <rect className="sp-b2" x="30" y="76" width="32" height="5" rx="2.5" fill="url(#sp-beam)" filter="url(#sp-core)" />
        </g>

        <style>{`
          @keyframes sp1 {
            0%   { transform: translateX(-50px); opacity: 0; }
            8%   { opacity: 1; }
            42%  { transform: translateX(50px); opacity: 1; }
            50%  { opacity: 0; }
            100% { opacity: 0; transform: translateX(50px); }
          }
          @keyframes sp2 {
            0%   { opacity: 0; transform: translateX(-45px); }
            20%  { opacity: 0; transform: translateX(-45px); }
            28%  { opacity: 1; }
            62%  { transform: translateX(45px); opacity: 1; }
            70%  { opacity: 0; }
            100% { opacity: 0; transform: translateX(45px); }
          }
          .sp-b1 { animation: sp1 1.6s cubic-bezier(0.45, 0, 0.2, 1) infinite; }
          .sp-b2 { animation: sp2 1.6s cubic-bezier(0.45, 0, 0.2, 1) infinite; }
        `}</style>
      </svg>
    </div>
  );
}
