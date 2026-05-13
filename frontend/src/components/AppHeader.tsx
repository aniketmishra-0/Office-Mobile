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

/**
 * AppHeader — editorial top strip.
 *
 * Single-row, flat, no shadow. Uses a 1px rule for separation and
 * monospace for title text. The thin terracotta progress line sits below
 * the strip on screens that supply a progress value (rendered by each
 * page when needed).
 */
export default function AppHeader({
  title,
  showBack,
  showLogo,
  onBack,
  rightAction,
}: Props) {
  const router = useRouter();
  const [user, setUser] = useState<{ email?: string | null; name?: string | null; picture?: string | null } | null>(null);
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

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const res = await fetch(
          (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/$/, "") + "/api/auth/status",
          { credentials: "include" },
        );
        const data = await res.json();
        if (!mounted) return;
        setUser(data.user ?? null);
      } catch {}
    }
    load();
    return () => {
      mounted = false;
    };
  }, []);

  function handleBack() {
    if (onBack) onBack();
    else router.back();
  }

  return (
    <header
      className="om-header"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="om-header__row">
        {/* Left: back + logo */}
        <div className="om-header__left">
          {showBack && (
            <button
              type="button"
              onClick={handleBack}
              aria-label="Go back"
              className="om-header__back"
            >
              <span aria-hidden>←</span>
              <span className="om-header__back-label">back</span>
            </button>
          )}
          {showLogo && !showBack && <Logo size="sm" showText={!title} />}
        </div>

        {/* Center: title */}
        {title && (
          <div className="om-header__title">
            <span>{title}</span>
          </div>
        )}
        {!title && <div style={{ flex: 1 }} />}

        {/* Right: action slot or account menu */}
        {rightAction ? (
          <div className="om-header__right">{rightAction}</div>
        ) : (
          <div className="om-header__right" ref={menuRef}>
            <button
              type="button"
              aria-label="Open menu"
              onClick={() => setOpenMenu((s) => !s)}
              className="om-header__avatar"
            >
              {user && user.picture ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.picture} alt={(user.name ?? user.email) || "Profile"} />
              ) : (
                <span aria-hidden>●</span>
              )}
            </button>

            {openMenu && (
              <div className="om-header__menu">
                <button
                  type="button"
                  onClick={() => {
                    setShowSettings(true);
                    setOpenMenu(false);
                  }}
                >
                  settings
                </button>
                <button
                  type="button"
                  onClick={() => {
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
                >
                  toggle theme
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await apiLogout();
                    try {
                      window.localStorage.removeItem("om_session");
                    } catch {}
                    window.location.reload();
                  }}
                  className="om-header__menu-danger"
                >
                  log out
                </button>
              </div>
            )}
            {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
          </div>
        )}
      </div>

      <style jsx>{`
        .om-header {
          position: sticky;
          top: 0;
          z-index: 40;
          background: var(--cream);
          border-bottom: 1px solid var(--rule);
        }
        .om-header__row {
          display: flex;
          align-items: center;
          height: 52px;
          padding: 0 18px;
          max-width: 560px;
          margin: 0 auto;
          gap: 12px;
        }
        .om-header__left {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-shrink: 0;
        }
        .om-header__back {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 4px;
          background: transparent;
          border: 0;
          color: var(--ink);
          font-family: var(--font-plex-mono), ui-monospace, monospace;
          font-weight: 500;
          font-size: 11px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          cursor: pointer;
          transition: color 200ms ease-out;
        }
        .om-header__back:hover {
          color: var(--clay);
        }
        .om-header__back-label {
          display: inline-block;
        }
        .om-header__title {
          flex: 1;
          min-width: 0;
          text-align: center;
          font-family: var(--font-plex-mono), ui-monospace, monospace;
          font-weight: 500;
          font-size: 11px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--charcoal);
        }
        .om-header__title span {
          display: inline-block;
          max-width: 100%;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .om-header__right {
          position: relative;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: flex-end;
        }
        .om-header__avatar {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          background: transparent;
          border: 1px solid var(--rule);
          border-radius: 0;
          color: var(--stone);
          font-size: 10px;
          line-height: 1;
          cursor: pointer;
          overflow: hidden;
          transition: border-color 200ms ease-out, color 200ms ease-out;
        }
        .om-header__avatar:hover {
          border-color: var(--ink);
          color: var(--ink);
        }
        .om-header__avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .om-header__menu {
          position: absolute;
          right: 0;
          top: calc(100% + 6px);
          min-width: 160px;
          background: var(--cream);
          border: 1px solid var(--rule);
          display: flex;
          flex-direction: column;
          padding: 4px 0;
          z-index: 50;
        }
        .om-header__menu button {
          background: transparent;
          border: 0;
          padding: 10px 14px;
          text-align: left;
          font-family: var(--font-plex-mono), ui-monospace, monospace;
          font-weight: 400;
          font-size: 11px;
          letter-spacing: 0.1em;
          color: var(--ink);
          cursor: pointer;
          transition: background-color 200ms ease-out;
        }
        .om-header__menu button:hover {
          background: var(--paper);
        }
        .om-header__menu-danger {
          color: var(--error) !important;
        }
      `}</style>
    </header>
  );
}
