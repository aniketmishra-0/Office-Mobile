"use client";

import React, { useEffect, useState } from "react";
import { listFormLibrary, deleteForm, unauthorizeForm } from "@/lib/api";
import type { FormLibraryItem } from "@/types/field";
import ClearButton from "@/components/ClearButton";
import {
  DEFAULT_COPY,
  DEFAULT_DISPLAY,
  getStoredCopy,
  getStoredDisplay,
  getStoredTheme,
  resetCopy,
  resetDisplay,
  setCopy as persistCopy,
  setDisplay as persistDisplay,
  setTheme as persistTheme,
  syncPrefsToBackend,
  type DisplayPrefs,
  type EditorialCopy,
  type FontFamily,
  type FontSize,
  type LineHeight,
  type BorderRadius,
  type Theme,
} from "@/lib/prefs";

type Section = "profile" | "theme" | "display" | "text" | "forms";

interface Props {
  onClose: () => void;
}

/**
 * SettingsPanel — editorial settings overlay.
 *
 * Four sections:
 *  1. Profile  — shows the signed-in Google account and lets the user
 *                sign out.
 *  2. Theme    — light / dark switch. Applies immediately and persists
 *                to localStorage.
 *  3. Text     — customise app copy (hero title, hero sub, submit
 *                label, success title). Stored locally; reset button
 *                restores the built-in defaults.
 *  4. Forms    — lists saved forms with edit / unauthorize / delete.
 */
export default function SettingsPanel({ onClose }: Props) {
  const [section, setSection] = useState<Section>("profile");
  const [user, setUser] = useState<{ email?: string | null; name?: string | null; picture?: string | null } | null>(null);
  const [theme, setThemeLocal] = useState<Theme>("light");
  const [copy, setCopyLocal] = useState<EditorialCopy>(() => ({ ...DEFAULT_COPY }));
  const [display, setDisplayLocal] = useState<DisplayPrefs>(() => ({ ...DEFAULT_DISPLAY }));
  const [copyDirty, setCopyDirty] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setThemeLocal(getStoredTheme());
    setCopyLocal(getStoredCopy());
    setDisplayLocal(getStoredDisplay());
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const headers: Record<string, string> = {};
        try {
          const sk = window.localStorage.getItem("om_session");
          if (sk) headers["X-Session-Key"] = sk;
        } catch {}
        const res = await fetch(
          (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/$/, "") + "/api/auth/status",
          { credentials: "include", headers },
        );
        const data = await res.json();
        if (alive) setUser(data.user ?? null);
      } catch {}
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function changeTheme(next: Theme) {
    setThemeLocal(next);
    persistTheme(next);
    await syncPrefsToBackend();
  }

  async function changeDisplay(patch: Partial<DisplayPrefs>) {
    setDisplayLocal((prev) => ({ ...prev, ...patch }));
    persistDisplay(patch);
    await syncPrefsToBackend();
  }

  async function resetDisplayToDefaults() {
    resetDisplay();
    setDisplayLocal({ ...DEFAULT_DISPLAY });
    await syncPrefsToBackend();
  }

  function updateCopy(key: keyof EditorialCopy, value: string) {
    setCopyLocal((prev) => ({ ...prev, [key]: value }));
    setCopyDirty(true);
  }

  async function saveCopy() {
    persistCopy(copy);
    setCopyDirty(false);
    setSaved(true);
    await syncPrefsToBackend();
    window.setTimeout(() => setSaved(false), 1600);
  }

  async function resetCopyToDefaults() {
    resetCopy();
    setCopyLocal({ ...DEFAULT_COPY });
    setCopyDirty(false);
    await syncPrefsToBackend();
  }

  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      const headers: Record<string, string> = {};
      try {
        const sk = window.localStorage.getItem("om_session");
        if (sk) headers["X-Session-Key"] = sk;
      } catch {}
      await fetch(
        (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/$/, "") + "/api/auth/logout",
        { method: "POST", credentials: "include", headers },
      );
    } catch {}
    try {
      window.localStorage.removeItem("om_session");
    } catch {}
    window.location.href = "/";
  }

  const sections: { id: Section; label: string }[] = [
    { id: "profile", label: "Profile" },
    { id: "theme", label: "Theme" },
    { id: "display", label: "Display" },
    { id: "text", label: "Text" },
    { id: "forms", label: "Forms" },
  ];

  return (
    <div className="om-settings" role="dialog" aria-modal="true" aria-label="Settings">
      <div className="om-settings__scrim" onClick={onClose} />
      <div className="om-settings__panel" role="document">
        <header className="om-settings__head">
          <p className="om-settings__kicker">Settings</p>
          <button type="button" className="om-settings__close" onClick={onClose} aria-label="Close settings">
            close
          </button>
        </header>

        <nav className="om-settings__tabs" aria-label="Settings sections">
          {sections.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSection(s.id)}
              className={`om-settings__tab ${section === s.id ? "is-active" : ""}`}
            >
              {s.label}
            </button>
          ))}
        </nav>

        <div className="om-settings__body">
          {section === "profile" && (
            <ProfileSection user={user} onSignOut={handleSignOut} />
          )}
          {section === "theme" && (
            <ThemeSection theme={theme} onChange={changeTheme} />
          )}
          {section === "display" && (
            <DisplaySection
              display={display}
              onChange={changeDisplay}
              onReset={resetDisplayToDefaults}
            />
          )}
          {section === "text" && (
            <TextSection
              copy={copy}
              onUpdate={updateCopy}
              onSave={saveCopy}
              onReset={resetCopyToDefaults}
              dirty={copyDirty}
              saved={saved}
            />
          )}
          {section === "forms" && <FormsSection />}
        </div>
      </div>

      <style jsx>{`
        .om-settings {
          position: fixed;
          inset: 0;
          z-index: 80;
          display: flex;
          align-items: center;
          justify-content: center;
          animation: fadeIn 200ms ease-out;
        }
        .om-settings__scrim {
          position: absolute;
          inset: 0;
          background: rgba(26, 23, 20, 0.55);
        }
        .om-settings__panel {
          position: relative;
          z-index: 1;
          display: flex;
          flex-direction: column;
          width: min(560px, calc(100% - 32px));
          max-height: calc(100% - 64px);
          background: var(--cream);
          border: 1px solid var(--rule);
          overflow: hidden;
        }
        .om-settings__head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 18px 20px 14px 20px;
          border-bottom: 1px solid var(--rule);
        }
        .om-settings__kicker {
          margin: 0;
          font-family: var(--font-plex-mono), ui-monospace, monospace;
          font-weight: 500;
          font-size: 10px;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: var(--stone);
        }
        .om-settings__close {
          background: transparent;
          border: 0;
          padding: 0;
          font-family: var(--font-plex-mono), ui-monospace, monospace;
          font-weight: 500;
          font-size: 10px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--ink);
          cursor: pointer;
          transition: color 200ms ease-out;
        }
        .om-settings__close:hover {
          color: var(--clay);
        }
        .om-settings__tabs {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          border-bottom: 1px solid var(--rule);
        }
        .om-settings__tab {
          background: transparent;
          border: 0;
          border-right: 1px solid var(--rule);
          padding: 12px 8px;
          font-family: var(--font-plex-mono), ui-monospace, monospace;
          font-weight: 500;
          font-size: 11px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--stone);
          cursor: pointer;
          transition: color 200ms ease-out, background-color 200ms ease-out;
        }
        .om-settings__tab:last-child {
          border-right: 0;
        }
        .om-settings__tab:hover {
          color: var(--ink);
          background: var(--paper);
        }
        .om-settings__tab.is-active {
          color: var(--clay);
        }
        .om-settings__body {
          padding: 22px 20px 26px 20px;
          overflow-y: auto;
        }
      `}</style>
    </div>
  );
}

/* ============================================================
   Profile
   ============================================================ */

function ProfileSection({
  user,
  onSignOut,
}: {
  user: { email?: string | null; name?: string | null; picture?: string | null } | null;
  onSignOut: () => void;
}) {
  if (!user) {
    return <p className="om-s-empty">not signed in.</p>;
  }
  const name = user.name || user.email || "Signed in";
  const initials = (() => {
    const src = user.name || user.email || "O";
    const parts = src.trim().split(/\s+/);
    return ((parts[0]?.[0] || "") + (parts.length > 1 ? parts[parts.length - 1][0] : ""))
      .toUpperCase()
      .slice(0, 2);
  })();

  return (
    <div className="om-s-profile">
      <div className="om-s-profile__card">
        <div className="om-s-profile__avatar">
          {user.picture ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.picture} alt={name} />
          ) : (
            <span>{initials}</span>
          )}
        </div>
        <div className="om-s-profile__text">
          <p className="om-s-label">Signed in as</p>
          <p className="om-s-profile__name">{name}</p>
          {user.email && user.email !== name && (
            <p className="om-s-profile__email">{user.email}</p>
          )}
        </div>
      </div>

      <button type="button" className="om-s-danger" onClick={onSignOut}>
        Log out →
      </button>

      <style jsx>{`
        .om-s-profile {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .om-s-profile__card {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 16px;
          border: 1px solid var(--rule);
        }
        .om-s-profile__avatar {
          width: 56px;
          height: 56px;
          border-radius: 50%;
          border: 1px solid var(--rule);
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--charcoal);
          font-family: var(--font-plex-mono), ui-monospace, monospace;
          font-weight: 500;
          font-size: 14px;
          flex-shrink: 0;
        }
        .om-s-profile__avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .om-s-profile__text {
          min-width: 0;
          flex: 1;
        }
        .om-s-profile__name {
          margin: 4px 0 0 0;
          font-family: var(--font-newsreader), Georgia, serif;
          font-weight: 400;
          font-size: 18px;
          color: var(--ink);
          line-height: 1.2;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .om-s-profile__email {
          margin: 4px 0 0 0;
          font-family: var(--font-plex-mono), ui-monospace, monospace;
          font-weight: 300;
          font-size: 11px;
          letter-spacing: 0.04em;
          color: var(--stone);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .om-s-label {
          margin: 0;
          font-family: var(--font-plex-mono), ui-monospace, monospace;
          font-weight: 500;
          font-size: 10px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--stone);
        }
        .om-s-danger {
          align-self: flex-start;
          background: transparent;
          border: 1px solid var(--error);
          padding: 10px 18px;
          font-family: var(--font-plex-mono), ui-monospace, monospace;
          font-weight: 500;
          font-size: 11px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--error);
          cursor: pointer;
          transition: background-color 200ms ease-out, color 200ms ease-out;
        }
        .om-s-danger:hover {
          background: var(--error);
          color: var(--cream);
        }
      `}</style>
    </div>
  );
}

/* ============================================================
   Theme
   ============================================================ */

function ThemeSection({ theme, onChange }: { theme: Theme; onChange: (t: Theme) => void }) {
  return (
    <div className="om-s-theme">
      <p className="om-s-hint">
        light mode keeps the rice-paper base. dark mode flips to a warm
        near-black with the same terracotta accent.
      </p>

      <div className="om-s-choices">
        <button
          type="button"
          onClick={() => onChange("light")}
          className={`om-s-choice ${theme === "light" ? "is-active" : ""}`}
          aria-pressed={theme === "light"}
        >
          <div className="om-s-choice__swatch om-s-choice__swatch--light" aria-hidden>
            <span className="om-s-choice__sample" />
          </div>
          <p className="om-s-choice__label">Light</p>
          <p className="om-s-choice__meta">default · rice paper</p>
        </button>

        <button
          type="button"
          onClick={() => onChange("dark")}
          className={`om-s-choice ${theme === "dark" ? "is-active" : ""}`}
          aria-pressed={theme === "dark"}
        >
          <div className="om-s-choice__swatch om-s-choice__swatch--dark" aria-hidden>
            <span className="om-s-choice__sample" />
          </div>
          <p className="om-s-choice__label">Dark</p>
          <p className="om-s-choice__meta">warm near-black</p>
        </button>
      </div>

      <style jsx>{`
        .om-s-theme {
          display: flex;
          flex-direction: column;
          gap: 18px;
        }
        .om-s-hint {
          margin: 0;
          font-family: var(--font-newsreader), Georgia, serif;
          font-weight: 300;
          font-size: 14px;
          line-height: 1.55;
          color: var(--charcoal);
        }
        .om-s-choices {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0;
          border: 1px solid var(--rule);
        }
        .om-s-choice {
          position: relative;
          background: transparent;
          border: 0;
          border-right: 1px solid var(--rule);
          padding: 16px;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 10px;
          cursor: pointer;
          transition: background-color 200ms ease-out;
          text-align: left;
        }
        .om-s-choice:last-child {
          border-right: 0;
        }
        .om-s-choice:hover {
          background: var(--paper);
        }
        .om-s-choice.is-active::before {
          content: "";
          position: absolute;
          inset: 0;
          border: 2px solid var(--clay);
          pointer-events: none;
        }
        .om-s-choice__swatch {
          width: 100%;
          height: 64px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px solid var(--rule);
        }
        .om-s-choice__swatch--light {
          background: #F7F3EE;
        }
        .om-s-choice__swatch--dark {
          background: #1A1714;
        }
        .om-s-choice__sample {
          width: 40%;
          height: 2px;
          background: #C8623A;
        }
        .om-s-choice__label {
          margin: 0;
          font-family: var(--font-newsreader), Georgia, serif;
          font-weight: 400;
          font-size: 17px;
          color: var(--ink);
        }
        .om-s-choice__meta {
          margin: 0;
          font-family: var(--font-plex-mono), ui-monospace, monospace;
          font-weight: 300;
          font-size: 10px;
          letter-spacing: 0.04em;
          color: var(--stone);
        }
      `}</style>
    </div>
  );
}

/* ============================================================
   Display (font, size, line-height, border-radius)
   ============================================================ */

function DisplaySection({
  display,
  onChange,
  onReset,
}: {
  display: DisplayPrefs;
  onChange: (patch: Partial<DisplayPrefs>) => void;
  onReset: () => void;
}) {
  const fonts: { value: FontFamily; label: string; sample: string }[] = [
    { value: "system", label: "System", sample: "Aa" },
    { value: "newsreader", label: "Newsreader", sample: "Aa" },
    { value: "plex-mono", label: "Plex Mono", sample: "Aa" },
    { value: "inter", label: "Inter", sample: "Aa" },
    { value: "georgia", label: "Georgia", sample: "Aa" },
    { value: "merriweather", label: "Merriweather", sample: "Aa" },
  ];

  const sizes: { value: FontSize; label: string }[] = [
    { value: "xs", label: "XS" },
    { value: "sm", label: "S" },
    { value: "md", label: "M" },
    { value: "lg", label: "L" },
    { value: "xl", label: "XL" },
  ];

  const lineHeights: { value: LineHeight; label: string }[] = [
    { value: "compact", label: "Compact" },
    { value: "normal", label: "Normal" },
    { value: "relaxed", label: "Relaxed" },
  ];

  const radii: { value: BorderRadius; label: string }[] = [
    { value: "none", label: "Sharp" },
    { value: "sm", label: "Subtle" },
    { value: "md", label: "Rounded" },
    { value: "lg", label: "Pill" },
  ];

  const fontFamilyCSS: Record<FontFamily, string> = {
    system: "system-ui, -apple-system, sans-serif",
    newsreader: "var(--font-newsreader), Georgia, serif",
    "plex-mono": "var(--font-plex-mono), ui-monospace, monospace",
    inter: "'Inter', system-ui, sans-serif",
    georgia: "Georgia, 'Times New Roman', serif",
    merriweather: "'Merriweather', Georgia, serif",
  };

  return (
    <div className="om-s-display">
      <p className="om-s-hint">
        customise how the app looks for you. font, size, spacing — all saved
        to your account.
      </p>

      {/* Font Family */}
      <div className="om-s-display__group">
        <p className="om-s-label">Font Family</p>
        <div className="om-s-display__font-grid">
          {fonts.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => onChange({ font_family: f.value })}
              className={`om-s-display__font-btn ${display.font_family === f.value ? "is-active" : ""}`}
              style={{ fontFamily: fontFamilyCSS[f.value] }}
            >
              <span className="om-s-display__font-sample">{f.sample}</span>
              <span className="om-s-display__font-name">{f.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Font Size */}
      <div className="om-s-display__group">
        <p className="om-s-label">Font Size</p>
        <div className="om-s-display__size-row">
          {sizes.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => onChange({ font_size: s.value })}
              className={`om-s-display__size-btn ${display.font_size === s.value ? "is-active" : ""}`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Line Height */}
      <div className="om-s-display__group">
        <p className="om-s-label">Line Spacing</p>
        <div className="om-s-display__size-row">
          {lineHeights.map((lh) => (
            <button
              key={lh.value}
              type="button"
              onClick={() => onChange({ line_height: lh.value })}
              className={`om-s-display__size-btn ${display.line_height === lh.value ? "is-active" : ""}`}
            >
              {lh.label}
            </button>
          ))}
        </div>
      </div>

      {/* Border Radius */}
      <div className="om-s-display__group">
        <p className="om-s-label">Corner Style</p>
        <div className="om-s-display__size-row">
          {radii.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => onChange({ border_radius: r.value })}
              className={`om-s-display__size-btn ${display.border_radius === r.value ? "is-active" : ""}`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Preview */}
      <div className="om-s-display__preview" style={{
        fontFamily: fontFamilyCSS[display.font_family],
        fontSize: { xs: "12px", sm: "13px", md: "15px", lg: "17px", xl: "19px" }[display.font_size],
        lineHeight: { compact: "1.35", normal: "1.55", relaxed: "1.75" }[display.line_height],
        borderRadius: { none: "0px", sm: "4px", md: "8px", lg: "14px" }[display.border_radius],
      }}>
        <p className="om-s-display__preview-text">
          the quick brown fox jumps over the lazy dog. 0123456789
        </p>
      </div>

      <button type="button" onClick={onReset} className="om-s-ghost">
        Reset defaults
      </button>

      <style jsx>{`
        .om-s-display {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .om-s-hint {
          margin: 0;
          font-family: var(--font-newsreader), Georgia, serif;
          font-weight: 300;
          font-size: 14px;
          line-height: 1.55;
          color: var(--charcoal);
        }
        .om-s-label {
          margin: 0 0 8px 0;
          font-family: var(--font-plex-mono), ui-monospace, monospace;
          font-weight: 500;
          font-size: 10px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--stone);
        }
        .om-s-display__group {
          display: flex;
          flex-direction: column;
        }
        .om-s-display__font-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
        }
        .om-s-display__font-btn {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          padding: 12px 8px;
          background: transparent;
          border: 1px solid var(--rule);
          cursor: pointer;
          transition: border-color 200ms ease-out, background-color 200ms ease-out;
        }
        .om-s-display__font-btn:hover {
          background: var(--paper);
        }
        .om-s-display__font-btn.is-active {
          border-color: var(--clay);
          background: var(--paper);
        }
        .om-s-display__font-sample {
          font-size: 20px;
          color: var(--ink);
          line-height: 1;
        }
        .om-s-display__font-name {
          font-family: var(--font-plex-mono), ui-monospace, monospace;
          font-size: 9px;
          letter-spacing: 0.06em;
          color: var(--stone);
          text-transform: uppercase;
        }
        .om-s-display__size-row {
          display: flex;
          gap: 0;
          border: 1px solid var(--rule);
        }
        .om-s-display__size-btn {
          flex: 1;
          padding: 10px 8px;
          background: transparent;
          border: 0;
          border-right: 1px solid var(--rule);
          font-family: var(--font-plex-mono), ui-monospace, monospace;
          font-weight: 500;
          font-size: 11px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--stone);
          cursor: pointer;
          transition: color 200ms ease-out, background-color 200ms ease-out;
        }
        .om-s-display__size-btn:last-child {
          border-right: 0;
        }
        .om-s-display__size-btn:hover {
          color: var(--ink);
          background: var(--paper);
        }
        .om-s-display__size-btn.is-active {
          color: var(--clay);
          background: var(--paper);
        }
        .om-s-display__preview {
          padding: 16px;
          border: 1px solid var(--rule);
          background: var(--paper);
          transition: all 200ms ease-out;
        }
        .om-s-display__preview-text {
          margin: 0;
          color: var(--ink);
        }
        .om-s-ghost {
          align-self: flex-start;
          background: transparent;
          border: 0;
          padding: 8px 0;
          font-family: var(--font-plex-mono), ui-monospace, monospace;
          font-weight: 500;
          font-size: 11px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--stone);
          cursor: pointer;
          transition: color 200ms ease-out;
        }
        .om-s-ghost:hover {
          color: var(--ink);
        }
      `}</style>
    </div>
  );
}

/* ============================================================
   Text customization
   ============================================================ */

function TextSection({
  copy,
  onUpdate,
  onSave,
  onReset,
  dirty,
  saved,
}: {
  copy: EditorialCopy;
  onUpdate: (key: keyof EditorialCopy, value: string) => void;
  onSave: () => void;
  onReset: () => void;
  dirty: boolean;
  saved: boolean;
}) {
  const fields: {
    key: keyof EditorialCopy;
    label: string;
    placeholder: string;
    multiline?: boolean;
  }[] = [
    {
      key: "hero_title",
      label: "Hero title",
      placeholder: "Your Spreadsheet.\nYour Form.",
      multiline: true,
    },
    {
      key: "hero_sub",
      label: "Hero subtitle",
      placeholder: "// connect a google sheet. collect data. done.",
    },
    {
      key: "submit_label",
      label: "Submit button text",
      placeholder: "Submit",
    },
    {
      key: "success_title",
      label: "Success heading",
      placeholder: "entry recorded.",
    },
  ];

  return (
    <div className="om-s-text">
      <p className="om-s-hint">
        override the app&apos;s default copy. saved locally in your browser
        and shown across every screen you see.
      </p>

      <div className="om-s-fields">
        {fields.map((f) => (
          <label key={f.key} className="om-s-field">
            <span className="om-s-label">{f.label}</span>
            {f.multiline ? (
              <div className="om-s-input-wrap">
                <textarea
                  value={copy[f.key] ?? ""}
                  onChange={(e) => onUpdate(f.key, e.target.value)}
                  placeholder={f.placeholder}
                  rows={2}
                  className="om-s-input om-s-input--multi"
                />
                {copy[f.key] && (
                  <ClearButton
                    onClick={() => onUpdate(f.key, "")}
                    top={18}
                    right={6}
                    ariaLabel={`Clear ${f.label}`}
                  />
                )}
              </div>
            ) : (
              <div className="om-s-input-wrap">
                <input
                  type="text"
                  value={copy[f.key] ?? ""}
                  onChange={(e) => onUpdate(f.key, e.target.value)}
                  placeholder={f.placeholder}
                  className="om-s-input"
                />
                {copy[f.key] && (
                  <ClearButton
                    onClick={() => onUpdate(f.key, "")}
                    right={6}
                    ariaLabel={`Clear ${f.label}`}
                  />
                )}
              </div>
            )}
          </label>
        ))}
      </div>

      <div className="om-s-actions">
        <button type="button" onClick={onReset} className="om-s-ghost">
          Reset defaults
        </button>
        <button type="button" onClick={onSave} disabled={!dirty} className="om-s-primary">
          {saved ? "Saved ✓" : "Save changes"}
        </button>
      </div>

      <style jsx>{`
        .om-s-text {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .om-s-hint {
          margin: 0;
          font-family: var(--font-newsreader), Georgia, serif;
          font-weight: 300;
          font-size: 14px;
          line-height: 1.55;
          color: var(--charcoal);
        }
        .om-s-fields {
          display: flex;
          flex-direction: column;
          gap: 18px;
        }
        .om-s-field {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .om-s-label {
          font-family: var(--font-plex-mono), ui-monospace, monospace;
          font-weight: 500;
          font-size: 10px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--stone);
        }
        .om-s-input-wrap {
          position: relative;
          width: 100%;
        }
        .om-s-input {
          width: 100%;
          font-family: var(--font-plex-mono), ui-monospace, monospace;
          font-weight: 400;
          font-size: 13px;
          color: var(--ink);
          background: transparent;
          border: 0;
          border-bottom: 1px solid var(--rule);
          border-radius: 0;
          padding: 6px 28px 6px 0;
          outline: none;
          transition: border-color 200ms ease-out;
        }
        .om-s-input::placeholder {
          color: var(--stone);
        }
        .om-s-input:focus {
          border-bottom: 2px solid var(--clay);
          padding-bottom: 5px;
        }
        .om-s-input--multi {
          resize: vertical;
          min-height: 60px;
          line-height: 1.5;
        }
        .om-s-actions {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding-top: 6px;
          border-top: 1px solid var(--rule);
        }
        .om-s-ghost {
          background: transparent;
          border: 0;
          padding: 8px 0;
          font-family: var(--font-plex-mono), ui-monospace, monospace;
          font-weight: 500;
          font-size: 11px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--stone);
          cursor: pointer;
          transition: color 200ms ease-out;
        }
        .om-s-ghost:hover {
          color: var(--ink);
        }
        .om-s-primary {
          background: var(--ink);
          color: var(--on-ink);
          border: 0;
          padding: 10px 18px;
          font-family: var(--font-plex-mono), ui-monospace, monospace;
          font-weight: 500;
          font-size: 11px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          cursor: pointer;
          transition: background-color 200ms ease-out;
        }
        .om-s-primary:hover:not(:disabled) {
          background: var(--clay);
        }
        .om-s-primary:disabled {
          background: var(--stone);
          color: var(--cream);
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}

/* ============================================================
   Forms list
   ============================================================ */

function FormsSection() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<FormLibraryItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [unauthorizeTarget, setUnauthorizeTarget] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await listFormLibrary(200);
        if (alive) setItems(data.items || []);
      } catch (e: any) {
        if (alive) setError(e.message ?? "Failed to load forms");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function handleDelete(id: string) {
    setDeleteTarget(id);
  }

  async function confirmDeleteForm() {
    if (!deleteTarget) return;
    const id = deleteTarget;
    setDeleteTarget(null);
    try {
      await deleteForm(id);
      setItems((s) => s.filter((i) => i.id !== id));
    } catch (e: any) {
      setError(e.message ?? "Failed to delete form");
    }
  }

  async function handleUnauthorize(id: string) {
    setUnauthorizeTarget(id);
  }

  async function confirmUnauthorize() {
    if (!unauthorizeTarget) return;
    const id = unauthorizeTarget;
    setUnauthorizeTarget(null);
    try {
      await unauthorizeForm(id);
    } catch (e: any) {
      setError(e.message ?? "Failed to unauthorize form");
    }
  }

  return (
    <div className="om-s-forms">
      {loading && <p className="om-s-muted">loading…</p>}
      {error && <p className="om-s-err">✕ {error}</p>}
      {!loading && items.length === 0 && (
        <p className="om-s-muted">no saved forms yet.</p>
      )}

      <ul className="om-s-forms__list">
        {items.map((it) => (
          <li key={it.id} className="om-s-forms__row">
            <div className="om-s-forms__text">
              <p className="om-s-forms__name">{it.form_title}</p>
              <p className="om-s-forms__meta">
                {it.field_count} fields · {it.submission_count} entries
              </p>
            </div>
            <div className="om-s-forms__actions">
              <a
                href={it.edit_url}
                target="_blank"
                rel="noreferrer"
                className="om-s-forms__link"
              >
                edit
              </a>
              <button
                type="button"
                onClick={() => handleUnauthorize(it.id)}
                className="om-s-forms__link"
              >
                revoke
              </button>
              <button
                type="button"
                onClick={() => handleDelete(it.id)}
                className="om-s-forms__link om-s-forms__link--danger"
              >
                delete
              </button>
            </div>
          </li>
        ))}
      </ul>

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div onClick={() => setDeleteTarget(null)} style={{ position: "absolute", inset: 0, background: "rgba(26,23,20,0.25)" }} />
          <div style={{ position: "relative", width: "100%", maxWidth: 300, background: "var(--cream)", borderRadius: 4, border: "1px solid var(--rule)", padding: "24px 20px 18px" }}>
            <p style={{ margin: "0 0 16px 0", fontFamily: "var(--font-plex-mono), ui-monospace, monospace", fontSize: 12, letterSpacing: "0.02em", color: "var(--ink)", textAlign: "center" }}>
              Delete this form? This cannot be undone.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button type="button" onClick={() => setDeleteTarget(null)} style={{ flex: 1, padding: "10px 14px", borderRadius: 4, border: "1px solid var(--rule)", background: "var(--cream)", fontFamily: "var(--font-plex-mono), ui-monospace, monospace", fontWeight: 500, fontSize: 12, letterSpacing: "0.04em", color: "var(--ink)", cursor: "pointer" }}>Cancel</button>
              <button type="button" onClick={confirmDeleteForm} style={{ flex: 1, padding: "10px 14px", borderRadius: 4, border: 0, background: "var(--error)", fontFamily: "var(--font-plex-mono), ui-monospace, monospace", fontWeight: 500, fontSize: 12, letterSpacing: "0.04em", color: "#fff", cursor: "pointer" }}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Unauthorize confirmation modal */}
      {unauthorizeTarget && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div onClick={() => setUnauthorizeTarget(null)} style={{ position: "absolute", inset: 0, background: "rgba(26,23,20,0.25)" }} />
          <div style={{ position: "relative", width: "100%", maxWidth: 300, background: "var(--cream)", borderRadius: 4, border: "1px solid var(--rule)", padding: "24px 20px 18px" }}>
            <p style={{ margin: "0 0 16px 0", fontFamily: "var(--font-plex-mono), ui-monospace, monospace", fontSize: 12, letterSpacing: "0.02em", color: "var(--ink)", textAlign: "center" }}>
              Unauthorize this form for this session?
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button type="button" onClick={() => setUnauthorizeTarget(null)} style={{ flex: 1, padding: "10px 14px", borderRadius: 4, border: "1px solid var(--rule)", background: "var(--cream)", fontFamily: "var(--font-plex-mono), ui-monospace, monospace", fontWeight: 500, fontSize: 12, letterSpacing: "0.04em", color: "var(--ink)", cursor: "pointer" }}>Cancel</button>
              <button type="button" onClick={confirmUnauthorize} style={{ flex: 1, padding: "10px 14px", borderRadius: 4, border: 0, background: "var(--ink)", fontFamily: "var(--font-plex-mono), ui-monospace, monospace", fontWeight: 500, fontSize: 12, letterSpacing: "0.04em", color: "var(--on-ink)", cursor: "pointer" }}>Revoke</button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .om-s-forms {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .om-s-muted {
          margin: 0;
          font-family: var(--font-plex-mono), ui-monospace, monospace;
          font-weight: 300;
          font-size: 11px;
          letter-spacing: 0.04em;
          color: var(--stone);
        }
        .om-s-err {
          margin: 0;
          font-family: var(--font-plex-mono), ui-monospace, monospace;
          font-weight: 400;
          font-size: 11px;
          letter-spacing: 0.04em;
          color: var(--error);
        }
        .om-s-forms__list {
          list-style: none;
          padding: 0;
          margin: 0;
          display: flex;
          flex-direction: column;
          border-top: 1px solid var(--rule);
        }
        .om-s-forms__row {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 12px;
          align-items: center;
          padding: 12px 0;
          border-bottom: 1px solid var(--rule);
        }
        .om-s-forms__text {
          min-width: 0;
        }
        .om-s-forms__name {
          margin: 0;
          font-family: var(--font-newsreader), Georgia, serif;
          font-weight: 400;
          font-size: 14px;
          color: var(--ink);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .om-s-forms__meta {
          margin: 2px 0 0 0;
          font-family: var(--font-plex-mono), ui-monospace, monospace;
          font-weight: 300;
          font-size: 10px;
          letter-spacing: 0.04em;
          color: var(--stone);
        }
        .om-s-forms__actions {
          display: flex;
          gap: 12px;
          align-items: center;
        }
        .om-s-forms__link {
          background: transparent;
          border: 0;
          padding: 0;
          font-family: var(--font-plex-mono), ui-monospace, monospace;
          font-weight: 500;
          font-size: 10px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--ink);
          text-decoration: none;
          cursor: pointer;
          transition: color 200ms ease-out;
        }
        .om-s-forms__link:hover {
          color: var(--clay);
        }
        .om-s-forms__link--danger {
          color: var(--error);
        }
        .om-s-forms__link--danger:hover {
          color: var(--error);
          opacity: 0.7;
        }
      `}</style>
    </div>
  );
}
