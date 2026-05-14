"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Logo from "@/components/Logo";
import SettingsPanel from "@/components/SettingsPanel";
import { logout as apiLogout } from "@/lib/api";
import { getStoredTheme, setTheme } from "@/lib/prefs";
import { usePrefs } from "@/lib/usePrefs";

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
 * The right-hand slot is, by default, a profile avatar that opens an
 * editorial account card (profile, Account Settings, theme toggle,
 * log out). Individual pages can still provide a `rightAction` to
 * override, but dashboards no longer need to, so users always have
 * access to Settings from any screen.
 */
export default function AppHeader({
  title,
  showBack,
  showLogo,
  onBack,
  rightAction,
}: Props) {
  const router = useRouter();
  const { theme } = usePrefs();
  const [user, setUser] = useState<{
    email?: string | null;
    name?: string | null;
    picture?: string | null;
  } | null>(null);
  const [openMenu, setOpenMenu] = useState(false);
  // `menuVisible` keeps the menu in the DOM while the close animation
  // plays — mirroring the open animation so the card appears to retract
  // back into the avatar instead of vanishing instantly.
  const [menuVisible, setMenuVisible] = useState(false);
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

  // Mount the menu when opening; after it closes, wait for the reverse
  // animation (keep in sync with the CSS duration) before unmounting.
  useEffect(() => {
    if (openMenu) {
      setMenuVisible(true);
      return;
    }
    if (!menuVisible) return;
    const t = setTimeout(() => setMenuVisible(false), 240);
    return () => clearTimeout(t);
  }, [openMenu, menuVisible]);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const headers: Record<string, string> = {};
        try {
          const sk = window.localStorage.getItem("om_session");
          if (sk) headers["X-Session-Key"] = sk;
        } catch {}
        const res = await fetch(
          (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/$/, "") +
            "/api/auth/status",
          { credentials: "include", headers },
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

  async function handleLogout() {
    try {
      await apiLogout();
    } catch {}
    try {
      window.localStorage.removeItem("om_session");
    } catch {}
    window.location.reload();
  }


  function toggleTheme() {
    const next = getStoredTheme() === "dark" ? "light" : "dark";
    setTheme(next);
  }

  const displayName = user?.name || user?.email || "Account";
  const displayEmail = user?.email || "";
  const initials = (() => {
    const src = (user?.name || user?.email || "").trim();
    if (!src) return "OM"; // Office Mobile default — never looks like "0"
    const parts = src.split(/\s+/);
    const first = parts[0]?.[0] || "";
    const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
    const out = (first + last).toUpperCase().slice(0, 2);
    return out || "OM";
  })();

  return (
    <header
      className="om-header"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="om-header__row">
        <div className="om-header__left">
          {showBack && (
            <button type="button" onClick={handleBack} aria-label="Go back" className="om-header__back">
              <span aria-hidden>←</span>
              <span className="om-header__back-label">back</span>
            </button>
          )}
          {showLogo && !showBack && <Logo size="sm" showText={!title} />}
        </div>

        {title && (
          <div className="om-header__title">
            <span>{title}</span>
          </div>
        )}
        {!title && <div style={{ flex: 1 }} />}

        {rightAction ? (
          <div className="om-header__right">{rightAction}</div>
        ) : (
          <div className="om-header__right" ref={menuRef}>
            <button
              type="button"
              aria-label="Open account menu"
              aria-expanded={openMenu}
              onClick={() => setOpenMenu((s) => !s)}
              className={`om-header__avatar ${openMenu ? "is-open" : ""}`}
            >
              {user && user.picture ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.picture} alt={displayName} />
              ) : (
                <span className="om-header__avatar-initials" aria-hidden>
                  {initials}
                </span>
              )}
            </button>

            {menuVisible && (
              <div className={`om-header__menu ${openMenu ? "is-open" : "is-closing"}`} role="menu">
                {/* Profile card */}
                <div className="om-header__profile">
                  <div className="om-header__profile-avatar">
                    {user && user.picture ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={user.picture} alt={displayName} />
                    ) : (
                      <span>{initials}</span>
                    )}
                  </div>
                  <div className="om-header__profile-text">
                    <p className="om-header__profile-name">{displayName}</p>
                    {displayEmail && displayEmail !== displayName && (
                      <p className="om-header__profile-email">{displayEmail}</p>
                    )}
                  </div>
                </div>

                <hr className="om-header__menu-rule" />

                {/* Primary actions */}
                <button
                  type="button"
                  role="menuitem"
                  className="om-header__menu-item"
                  onClick={() => {
                    setShowSettings(true);
                    setOpenMenu(false);
                  }}
                >
                  <span className="om-header__menu-icon" aria-hidden>◌</span>
                  <span>Account settings</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="om-header__menu-item"
                  onClick={() => {
                    router.push("/dashboard");
                    setOpenMenu(false);
                  }}
                >
                  <span className="om-header__menu-icon" aria-hidden>◧</span>
                  <span>Dashboard</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="om-header__menu-item"
                  onClick={() => {
                    router.push("/data-fill");
                    setOpenMenu(false);
                  }}
                >
                  <span className="om-header__menu-icon" aria-hidden>✎</span>
                  <span>Data Correction</span>
                </button>
                <hr className="om-header__menu-rule" />

                {/* Secondary */}
                <a
                  href="/privacy"
                  role="menuitem"
                  className="om-header__menu-item"
                  onClick={() => setOpenMenu(false)}
                >
                  <span className="om-header__menu-icon" aria-hidden>§</span>
                  <span>Privacy</span>
                </a>
                <a
                  href="mailto:aniketmishra492@gmail.com"
                  role="menuitem"
                  className="om-header__menu-item"
                  onClick={() => setOpenMenu(false)}
                >
                  <span className="om-header__menu-icon" aria-hidden>?</span>
                  <span>Support</span>
                </a>

                <hr className="om-header__menu-rule" />

                {/* Footer row — theme toggle + log out */}
                <div className="om-header__menu-footer">
                  <button
                    type="button"
                    role="menuitem"
                    className="om-header__menu-footer-btn"
                    onClick={toggleTheme}
                    aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
                  >
                    <span aria-hidden>{theme === "dark" ? "☼" : "☾"}</span>
                    <span>{theme === "dark" ? "Light theme" : "Dark theme"}</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="om-header__menu-footer-btn om-header__menu-danger"
                    onClick={handleLogout}
                  >
                    <span aria-hidden>⏻</span>
                    <span>Log out</span>
                  </button>
                </div>
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
          /* Ensure header always renders above scrolling content on iOS */
          transform: translateZ(0);
          -webkit-transform: translateZ(0);
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
        .om-header__back:hover { color: var(--clay); }
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

        /* Avatar */
        .om-header__avatar {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 34px;
          height: 34px;
          background: transparent;
          border: 1px solid var(--rule);
          border-radius: 50%;
          color: var(--charcoal);
          font-family: var(--font-plex-mono), ui-monospace, monospace;
          font-weight: 500;
          font-size: 10px;
          line-height: 1;
          letter-spacing: 0.02em;
          cursor: pointer;
          overflow: hidden;
          transition: border-color 200ms ease-out, color 200ms ease-out;
        }
        .om-header__avatar:hover,
        .om-header__avatar.is-open {
          border-color: var(--ink);
          color: var(--ink);
        }
        .om-header__avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .om-header__avatar-initials {
          display: inline-block;
        }

        /* Menu — opens to a compact editorial account card */
        .om-header__menu {
          position: absolute;
          right: 0;
          top: calc(100% + 10px);
          width: 280px;
          background: var(--cream);
          border: 1px solid var(--rule);
          display: flex;
          flex-direction: column;
          z-index: 60;
          transform-origin: top right;
          will-change: transform, opacity;
        }
        .om-header__menu.is-open {
          animation: omMenuReveal 280ms cubic-bezier(0.22, 1, 0.36, 1);
        }
        .om-header__menu.is-closing {
          animation: omMenuRetract 240ms cubic-bezier(0.64, 0, 0.78, 0) forwards;
          pointer-events: none;
        }
        @keyframes omMenuReveal {
          0% {
            opacity: 0;
            transform: translate3d(4px, -6px, 0) scale(0.9);
          }
          60% {
            opacity: 1;
          }
          100% {
            opacity: 1;
            transform: translate3d(0, 0, 0) scale(1);
          }
        }
        @keyframes omMenuRetract {
          0% {
            opacity: 1;
            transform: translate3d(0, 0, 0) scale(1);
          }
          40% {
            opacity: 1;
          }
          100% {
            opacity: 0;
            transform: translate3d(4px, -6px, 0) scale(0.9);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .om-header__menu.is-open,
          .om-header__menu.is-closing {
            animation: fadeIn 160ms ease-out;
          }
          .om-header__menu.is-closing {
            opacity: 0;
          }
        }

        .om-header__profile {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 16px 16px 14px 16px;
        }
        .om-header__profile-avatar {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          border: 1px solid var(--rule);
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          color: var(--charcoal);
          font-family: var(--font-plex-mono), ui-monospace, monospace;
          font-weight: 500;
          font-size: 11px;
          letter-spacing: 0.02em;
        }
        .om-header__profile-avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .om-header__profile-text {
          min-width: 0;
          flex: 1;
        }
        .om-header__profile-name {
          margin: 0;
          font-family: var(--font-newsreader), Georgia, serif;
          font-weight: 400;
          font-size: 15px;
          color: var(--ink);
          line-height: 1.25;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .om-header__profile-email {
          margin: 2px 0 0 0;
          font-family: var(--font-plex-mono), ui-monospace, monospace;
          font-weight: 300;
          font-size: 10px;
          letter-spacing: 0.04em;
          color: var(--stone);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .om-header__menu-rule {
          margin: 0;
          border: 0;
          border-top: 1px solid var(--rule);
        }

        .om-header__menu-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 11px 16px;
          background: transparent;
          border: 0;
          font-family: var(--font-plex-mono), ui-monospace, monospace;
          font-weight: 400;
          font-size: 12px;
          letter-spacing: 0.04em;
          color: var(--ink);
          text-align: left;
          text-decoration: none;
          cursor: pointer;
          transition: background-color 200ms ease-out, color 200ms ease-out;
        }
        .om-header__menu-item:hover {
          background: var(--paper);
          color: var(--clay);
        }
        .om-header__menu-icon {
          width: 16px;
          text-align: center;
          font-size: 13px;
          color: var(--stone);
        }
        .om-header__menu-item:hover .om-header__menu-icon {
          color: var(--clay);
        }

        .om-header__menu-footer {
          display: grid;
          grid-template-columns: 1fr 1fr;
        }
        .om-header__menu-footer-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 12px 10px;
          background: transparent;
          border: 0;
          font-family: var(--font-plex-mono), ui-monospace, monospace;
          font-weight: 500;
          font-size: 10px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--ink);
          cursor: pointer;
          transition: background-color 200ms ease-out, color 200ms ease-out;
        }
        .om-header__menu-footer-btn:first-child {
          border-right: 1px solid var(--rule);
        }
        .om-header__menu-footer-btn:hover {
          background: var(--paper);
          color: var(--clay);
        }
        .om-header__menu-danger {
          color: var(--error) !important;
        }
        .om-header__menu-danger:hover {
          background: var(--paper);
          color: var(--error) !important;
        }
      `}</style>
    </header>
  );
}
