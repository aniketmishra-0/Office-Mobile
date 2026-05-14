"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

/**
 * InstallPrompt — PWA install affordance modelled after daily.dev's
 * "quiet banner" pattern.
 *
 *   - Shows 6s after first paint if the browser has fired
 *     `beforeinstallprompt` OR we're on iOS Safari outside standalone.
 *   - Hidden entirely once the app is already installed / running in
 *     standalone mode.
 *   - Respects an explicit dismissal for 14 days (localStorage). Users
 *     who say "not now" aren't nagged on every visit.
 *   - Listens for `appinstalled` to auto-hide without a reload.
 */

const DISMISS_KEY = "om_install_dismissed_at";
const DISMISS_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000; // 14 days
const SHOW_DELAY_MS = 6000;

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

function isRunningStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
  // iOS Safari exposes navigator.standalone rather than matching the CSS mq.
  const navAny = window.navigator as unknown as { standalone?: boolean };
  if (navAny.standalone === true) return true;
  return false;
}

function isRecentlyDismissed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const ts = Number(raw);
    if (!Number.isFinite(ts)) return false;
    return Date.now() - ts < DISMISS_COOLDOWN_MS;
  } catch {
    return false;
  }
}

export default function InstallPrompt() {
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isRunningStandalone()) return; // already installed
    if (isRecentlyDismissed()) return;

    const ios = /iPad|iPhone|iPod/i.test(navigator.userAgent);
    setIsIOS(ios);

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      deferredPrompt.current = e as BeforeInstallPromptEvent;
      // If the UA fires BIP after our timer already ran, surface the banner.
      setShow(true);
    };
    const onInstalled = () => {
      deferredPrompt.current = null;
      setShow(false);
      // Treat install as a permanent dismissal so we don't re-prompt.
      try {
        localStorage.setItem(DISMISS_KEY, String(Date.now()));
      } catch {
        /* ignore */
      }
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);

    const timer = window.setTimeout(() => {
      // iOS never fires beforeinstallprompt, so we show the "Add to Home
      // Screen" hint there unconditionally (subject to cooldown).
      if (deferredPrompt.current || ios) setShow(true);
    }, SHOW_DELAY_MS);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
      window.clearTimeout(timer);
    };
  }, []);

  const dismiss = useCallback(() => {
    setShow(false);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
  }, []);

  const install = useCallback(async () => {
    const ev = deferredPrompt.current;
    if (!ev) return;
    setInstalling(true);
    try {
      await ev.prompt();
      const choice = await ev.userChoice;
      if (choice.outcome === "accepted") {
        setShow(false);
      } else {
        // User clicked "Cancel" in Chrome's native dialog — respect it.
        dismiss();
      }
    } catch {
      dismiss();
    } finally {
      deferredPrompt.current = null;
      setInstalling(false);
    }
  }, [dismiss]);

  if (!show) return null;

  return (
    <div className="om-install" role="dialog" aria-label="Install Office Mobile">
      <div className="om-install__body">
        <p className="om-install__kicker">install</p>
        <p className="om-install__title">add office mobile to your home screen</p>
        <p className="om-install__note">
          {isIOS
            ? "tap share · then add to home screen."
            : "one tap. works offline. feels native."}
        </p>
      </div>
      <div className="om-install__actions">
        <button
          type="button"
          onClick={dismiss}
          className="om-install__btn om-install__btn--ghost"
          aria-label="Dismiss install prompt for two weeks"
        >
          not now
        </button>
        {!isIOS && (
          <button
            type="button"
            onClick={install}
            disabled={installing || !deferredPrompt.current}
            className="om-install__btn om-install__btn--solid"
          >
            {installing ? "installing…" : "install →"}
          </button>
        )}
      </div>

      <style jsx>{`
        .om-install {
          position: fixed;
          left: 16px;
          right: 16px;
          bottom: calc(16px + env(safe-area-inset-bottom));
          max-width: 540px;
          margin: 0 auto;
          z-index: 70;
          display: flex;
          flex-direction: column;
          gap: 14px;
          padding: 18px 18px 16px 18px;
          background: var(--cream);
          border: 1px solid var(--ink);
          animation: fadeIn 250ms ease-out;
        }
        .om-install__body {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .om-install__kicker {
          font-family: var(--font-plex-mono), ui-monospace, monospace;
          font-weight: 500;
          font-size: 10px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--stone);
          margin: 0;
        }
        .om-install__title {
          font-family: var(--font-newsreader), Georgia, serif;
          font-weight: 400;
          font-size: 16px;
          line-height: 1.3;
          color: var(--ink);
          margin: 0;
        }
        .om-install__note {
          font-family: var(--font-plex-mono), ui-monospace, monospace;
          font-weight: 300;
          font-size: 11px;
          letter-spacing: 0.04em;
          color: var(--stone);
          margin: 0;
        }
        .om-install__actions {
          display: flex;
          gap: 10px;
        }
        .om-install__btn {
          flex: 1;
          height: 40px;
          background: transparent;
          border: 1px solid var(--rule);
          border-radius: 0;
          padding: 0 14px;
          font-family: var(--font-plex-mono), ui-monospace, monospace;
          font-weight: 500;
          font-size: 11px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--ink);
          cursor: pointer;
          transition: background-color 200ms ease-out, color 200ms ease-out,
            border-color 200ms ease-out, opacity 200ms ease-out;
        }
        .om-install__btn--ghost:hover {
          background: var(--paper);
        }
        .om-install__btn--solid {
          background: var(--ink);
          border-color: var(--ink);
          color: var(--on-ink);
        }
        .om-install__btn--solid:hover {
          background: var(--clay);
          border-color: var(--clay);
        }
        .om-install__btn:disabled {
          opacity: 0.5;
          cursor: default;
        }
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
