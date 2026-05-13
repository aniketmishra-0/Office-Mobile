"use client";

import React from "react";

interface Props {
  message?: string;
}

/**
 * LoadingOverlay — full-viewport editorial loader.
 *
 * A single hairline spinner and a mono caption. No shadow, no colour
 * besides ink and stone. Sits on the cream paper base.
 */
export default function LoadingOverlay({ message }: Props) {
  return (
    <div className="om-loading" role="status" aria-live="polite">
      <span className="om-loading__ring" aria-hidden />
      {message && <p className="om-loading__msg">{message.toLowerCase()}</p>}

      <style jsx>{`
        .om-loading {
          position: fixed;
          inset: 0;
          z-index: 50;
          background: var(--cream);
          background-image: repeating-linear-gradient(
            45deg,
            transparent,
            transparent 2px,
            rgba(26, 23, 20, 0.012) 2px,
            rgba(26, 23, 20, 0.012) 4px
          );
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 16px;
        }
        .om-loading__ring {
          display: inline-block;
          width: 18px;
          height: 18px;
          border: 1.5px solid var(--ink);
          border-top-color: transparent;
          border-radius: 50%;
          animation: spin 0.9s linear infinite;
        }
        .om-loading__msg {
          margin: 0;
          font-family: var(--font-plex-mono), ui-monospace, monospace;
          font-weight: 400;
          font-size: 11px;
          letter-spacing: 0.12em;
          color: var(--stone);
        }
      `}</style>
    </div>
  );
}
