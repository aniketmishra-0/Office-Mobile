"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Logo from "@/components/Logo";
import SettingsPanel from "@/components/SettingsPanel";
import { logout as apiLogout } from "@/lib/api";

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
  const [openMenu, setOpenMenu] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!menuRef.current) return;
      if (e.target instanceof Node && !menuRef.current.contains(e.target)) {
        setOpenMenu(false);
      }
    }
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

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
        {rightAction ? (
          <div className="flex-shrink-0 flex items-center justify-end">{rightAction}</div>
        ) : (
          <div className="flex-shrink-0 flex items-center justify-end" ref={menuRef}>
            <div className="relative">
              <button
                type="button"
                aria-label="Open menu"
                onClick={() => setOpenMenu((s) => !s)}
                className="flex items-center justify-center w-9 h-9 rounded-lg border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 transition-colors"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zM6 20v-1c0-2.21 3.58-4 6-4s6 1.79 6 4v1" />
                </svg>
              </button>

              {openMenu && (
                <div className="absolute right-0 mt-2 w-48 bg-white border border-zinc-200 rounded-lg shadow-lg z-50">
                  <button
                    type="button"
                    onClick={() => { setShowSettings(true); setOpenMenu(false); }}
                    className="w-full text-left px-4 py-2 hover:bg-zinc-50"
                  >
                    Settings
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      // toggle theme
                      try {
                        if (document.documentElement.classList.contains("dark")) {
                          document.documentElement.classList.remove("dark");
                          localStorage.setItem("om_theme", "light");
                        } else {
                          document.documentElement.classList.add("dark");
                          localStorage.setItem("om_theme", "dark");
                        }
                      } catch {}
                      setOpenMenu(false);
                    }}
                    className="w-full text-left px-4 py-2 hover:bg-zinc-50"
                  >
                    Toggle theme
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await apiLogout();
                      try { window.localStorage.removeItem("om_session"); } catch {}
                      window.location.reload();
                    }}
                    className="w-full text-left px-4 py-2 text-red-600 hover:bg-zinc-50"
                  >
                    Log out
                  </button>
                </div>
              )}
            </div>
            {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
          </div>
        )}
      </div>
    </header>
  );
}
