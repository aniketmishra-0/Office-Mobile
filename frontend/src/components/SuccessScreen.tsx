"use client";

import React, { useEffect, useState } from "react";
import { usePrefs } from "@/lib/usePrefs";

interface Props {
  formTitle: string;
  onSubmitAnother: () => void;
  syncStatus?: {
    queued?: boolean;
    message?: string | null;
    estimated_sync_seconds?: number | null;
  } | null;
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
export default function SuccessScreen({ formTitle, onSubmitAnother, syncStatus }: Props) {
  const { copy } = usePrefs();
  const [stamp, setStamp] = useState("");
  const isQueued = syncStatus?.queued ?? false;
  const estimatedSec = syncStatus?.estimated_sync_seconds ?? 5;

  useEffect(() => {
    setStamp(formatStamp());
  }, []);

  return (
    <div className="om-success" role="status" aria-live="polite">
      {isQueued && (
        <div className="om-success__queue-badge">
          <span className="om-success__pulse-dot" />
          syncing to sheet in ~{estimatedSec}s
        </div>
      )}
      <span className="om-success__check" aria-hidden>✓</span>
      <h1 className="om-success__title">{copy.success_title ?? "entry recorded."}</h1>
      <p className="om-success__meta">
        {isQueued
          ? "safely saved to database · syncing in background"
          : `sheet updated · ${stamp}`}
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
        .om-success__queue-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 6px 14px;
          border-radius: 9999px;
          background: rgba(234, 179, 8, 0.12);
          border: 1px solid rgba(202, 138, 4, 0.28);
          color: #92400e;
          font-family: var(--font-plex-mono), ui-monospace, monospace;
          font-size: 11px;
          font-weight: 500;
          letter-spacing: 0.02em;
          margin-bottom: 2px;
          animation: fadeIn 200ms ease-out;
        }
        .om-success__pulse-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #d97706;
          box-shadow: 0 0 0 0 rgba(217, 119, 6, 0.5);
          animation: pulse 1.6s infinite ease-in-out;
        }
        @keyframes pulse {
          0% {
            transform: scale(0.9);
            box-shadow: 0 0 0 0 rgba(217, 119, 6, 0.6);
          }
          70% {
            transform: scale(1.15);
            box-shadow: 0 0 0 6px rgba(217, 119, 6, 0);
          }
          100% {
            transform: scale(0.9);
            box-shadow: 0 0 0 0 rgba(217, 119, 6, 0);
          }
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
