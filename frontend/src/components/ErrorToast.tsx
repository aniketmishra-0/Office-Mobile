"use client";

import React, { useEffect, useState } from "react";

interface Props {
  message: string | null;
  onDismiss: () => void;
}

/**
 * ErrorToast — editorial inline error strip.
 *
 * Pinned above the submit band, full-width, 1px clay border. No shadow.
 * Auto-dismisses in 8s with a 200ms fade.
 */
export default function ErrorToast({ message, onDismiss }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!message) {
      setVisible(false);
      return;
    }
    requestAnimationFrame(() => setVisible(true));
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onDismiss, 200);
    }, 8000);
    return () => clearTimeout(timer);
  }, [message, onDismiss]);

  if (message === null) return null;

  return (
    <div
      className={`om-toast ${visible ? "is-visible" : ""}`}
      role="alert"
      aria-live="assertive"
    >
      <span className="om-toast__mark" aria-hidden>✕</span>
      <p className="om-toast__msg">{message}</p>
      <button
        type="button"
        onClick={() => {
          setVisible(false);
          setTimeout(onDismiss, 200);
        }}
        aria-label="Dismiss"
        className="om-toast__close"
      >
        close
      </button>

      <style jsx>{`
        .om-toast {
          position: fixed;
          left: 16px;
          right: 16px;
          bottom: 80px;
          max-width: 540px;
          margin: 0 auto;
          z-index: 60;
          display: flex;
          align-items: flex-start;
          gap: 14px;
          padding: 14px 16px;
          background: var(--cream);
          border: 1px solid var(--error);
          opacity: 0;
          transform: translateY(4px);
          transition: opacity 200ms ease-out, transform 200ms ease-out;
        }
        .om-toast.is-visible {
          opacity: 1;
          transform: translateY(0);
        }
        .om-toast__mark {
          color: var(--error);
          font-family: var(--font-plex-mono), ui-monospace, monospace;
          font-weight: 500;
          font-size: 12px;
          line-height: 1.2;
          margin-top: 2px;
        }
        .om-toast__msg {
          flex: 1;
          margin: 0;
          font-family: var(--font-plex-mono), ui-monospace, monospace;
          font-weight: 400;
          font-size: 12px;
          line-height: 1.5;
          color: var(--ink);
          letter-spacing: 0.02em;
        }
        .om-toast__close {
          flex-shrink: 0;
          background: transparent;
          border: 0;
          padding: 2px 4px;
          font-family: var(--font-plex-mono), ui-monospace, monospace;
          font-weight: 500;
          font-size: 10px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--stone);
          cursor: pointer;
          transition: color 200ms ease-out;
        }
        .om-toast__close:hover {
          color: var(--ink);
        }
      `}</style>
    </div>
  );
}
