"use client";

import React, { useEffect, useState } from "react";
import { usePrefs } from "@/lib/usePrefs";

interface Props {
  formTitle: string;
  onSubmitAnother: () => void;
}

function formatStamp(): string {
  const d = new Date();
  const months = [
    "jan", "feb", "mar", "apr", "may", "jun",
    "jul", "aug", "sep", "oct", "nov", "dec",
  ];
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())} ${months[d.getMonth()]} ${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * SuccessScreen — editorial completion state.
 *
 *   ✓
 *   entry recorded.
 *   sheet updated · 13 may 2026, 14:32
 *   → submit another
 *
 * Large serif checkmark in clay, Newsreader title, mono meta line,
 * single text link to start again. No other UI.
 */
export default function SuccessScreen({ formTitle, onSubmitAnother }: Props) {
  const { copy } = usePrefs();
  const [stamp, setStamp] = useState("");

  useEffect(() => {
    setStamp(formatStamp());
  }, []);

  return (
    <div className="om-success" role="status" aria-live="polite">
      <span className="om-success__check" aria-hidden>✓</span>
      <h1 className="om-success__title">{copy.success_title ?? "entry recorded."}</h1>
      <p className="om-success__meta">
        sheet updated · {stamp}
        {formTitle ? <><br />form · {formTitle.toLowerCase()}</> : null}
      </p>
      <button type="button" className="om-success__link" onClick={onSubmitAnother}>
        → submit another
      </button>

      <style jsx>{`
        .om-success {
          position: fixed;
          inset: 0;
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
          padding: 48px 32px;
          text-align: center;
          animation: fadeIn 250ms ease-out;
        }
        .om-success__check {
          font-family: var(--font-newsreader), Georgia, serif;
          font-weight: 300;
          font-size: 64px;
          line-height: 1;
          color: var(--clay);
          margin-bottom: 8px;
        }
        .om-success__title {
          font-family: var(--font-newsreader), Georgia, serif;
          font-weight: 400;
          font-size: 24px;
          line-height: 1.2;
          color: var(--ink);
          margin: 0;
          letter-spacing: -0.005em;
        }
        .om-success__meta {
          font-family: var(--font-plex-mono), ui-monospace, monospace;
          font-weight: 300;
          font-size: 11px;
          line-height: 1.6;
          color: var(--stone);
          letter-spacing: 0.04em;
          margin: 0;
        }
        .om-success__link {
          margin-top: 28px;
          background: transparent;
          border: 0;
          padding: 4px 0;
          font-family: var(--font-plex-mono), ui-monospace, monospace;
          font-weight: 500;
          font-size: 13px;
          color: var(--clay);
          letter-spacing: 0.02em;
          cursor: pointer;
          transition: color 200ms ease-out;
        }
        .om-success__link:hover {
          color: var(--clay-dark);
        }
      `}</style>
    </div>
  );
}
