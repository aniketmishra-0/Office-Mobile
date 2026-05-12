"use client";

import React from "react";

interface LogoProps {
  size?: "sm" | "md" | "lg";
  showText?: boolean;
}

export default function Logo({ size = "md", showText = true }: LogoProps) {
  const dimensions = {
    sm: { box: "w-7 h-7", icon: 16, text: "text-sm" },
    md: { box: "w-8 h-8", icon: 18, text: "text-base" },
    lg: { box: "w-11 h-11", icon: 24, text: "text-xl" },
  };

  const d = dimensions[size];

  return (
    <div className="flex items-center gap-2">
      <div
        className={`${d.box} rounded-xl bg-gray-900 flex items-center justify-center flex-shrink-0`}
      >
        <svg
          width={d.icon}
          height={d.icon}
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect x="3" y="4" width="11" height="16" rx="2" fill="white" opacity="0.9" />
          <rect x="10" y="6" width="11" height="14" rx="2" fill="white" opacity="0.55" />
          <path
            d="M6 9h4M6 12h4M6 15h2"
            stroke="#111827"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </div>
      {showText && (
        <span className={`${d.text} font-bold text-gray-900 tracking-tight`}>
          Office Mobile
        </span>
      )}
    </div>
  );
}
