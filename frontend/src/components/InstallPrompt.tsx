"use client";

import React, { useEffect, useRef, useState } from "react";

/**
 * InstallPrompt — PWA install affordance.
 *
 * Rendered as a quiet editorial strip pinned to the bottom of the
 * viewport. Appears after 5s on devices that support install, dismissed
 * via session storage.
 */
export default function InstallPrompt() {
  const deferredPrompt = useRef<any>(null);
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem("install_dismissed")) return;

    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
    setIsIOS(ios);

    const handler = (e: Event) => {
      e.preventDefault();
      deferredPrompt.current = e;
    };
    window.addEventListener("beforeinstallprompt", handler);

    const timer = setTimeout(() => {
      const isStandalone = window.matchMedia("(display-mode: standalone)").matches;
      if (deferredPrompt.current || (ios && !isStandalone)) {
        setShow(true);
      }
    }, 5000);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      clearTimeout(timer);
    };
  }, []);

  function dismiss() {
    setDismissed(true);
    sessionStorage.setItem("install_dismissed", "1");
  }
  function install() {
    deferredPrompt.current?.prompt();
  }

  if (!show || dismissed) return null;

  return (
    <div className="om-install">
      <div className="om-install__body">
        <p className="om-install__kicker">install</p>
        <p className="om-install__title">add office mobile to your home screen</p>
        <p className="om-install__note">
          {isIOS
            ? "tap share · then add to home screen."
            : "quick access, works offline."}
        </p>
      </div>
      <div className="om-install__actions">
        <button type="button" onClick={dismiss} className="om-install__btn om-install__btn--ghost">
          not now
        </button>
        {!isIOS && (
          <button type="button" onClick={install} className="om-install__btn om-install__btn--solid">
            install →
          </button>
        )}
      </div>

      <style jsx>{`
        .om-install {
          position: fixed;
          left: 16px;
          right: 16px;
          bottom: 16px;
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
          transition: background-color 200ms ease-out, color 200ms ease-out, border-color 200ms ease-out;
        }
        .om-install__btn--ghost:hover {
          background: var(--paper);
        }
        .om-install__btn--solid {
          background: var(--ink);
          border-color: var(--ink);
          color: #ffffff;
        }
        .om-install__btn--solid:hover {
          background: var(--clay);
          border-color: var(--clay);
        }
      `}</style>
    </div>
  );
}
