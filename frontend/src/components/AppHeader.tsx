"use client";

import React from "react";
import { useRouter } from "next/navigation";
import Logo from "@/components/Logo";

interface Props {
  title?: string;
  showBack?: boolean;
  showLogo?: boolean;
  onBack?: () => void;
  rightAction?: React.ReactNode;
}

export default function AppHeader({
  title,
  showBack,
  showLogo,
  onBack,
  rightAction,
}: Props) {
  const router = useRouter();

  function handleBack() {
    if (onBack) {
      onBack();
    } else {
      router.back();
    }
  }

  return (
    <header
      className="sticky top-0 z-50 bg-white border-b border-zinc-200"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="flex items-center h-14 px-4 max-w-[560px] mx-auto">
        {/* Left: back button and/or logo */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {showBack && (
            <button
              type="button"
              onClick={handleBack}
              aria-label="Go back"
              className="flex items-center justify-center w-9 h-9 -ml-1 rounded-lg
                         hover:bg-zinc-100 active:bg-zinc-200 transition-colors"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="w-5 h-5 text-zinc-800"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15.75 19.5L8.25 12l7.5-7.5"
                />
              </svg>
            </button>
          )}
          {showLogo && <Logo size="sm" showText={!title} />}
        </div>

        {/* Center: title (if provided) */}
        {title && (
          <div className="flex-1 flex items-center justify-center min-w-0 mx-2">
            <span className="font-semibold text-sm text-zinc-950 truncate">
              {title}
            </span>
          </div>
        )}

        {/* Spacer when no title */}
        {!title && <div className="flex-1" />}

        {/* Right: action slot */}
        {rightAction && (
          <div className="flex-shrink-0 flex items-center justify-end">
            {rightAction}
          </div>
        )}
      </div>
    </header>
  );
}
