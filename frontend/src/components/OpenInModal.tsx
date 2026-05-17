"use client";

import React, { useEffect, useRef } from "react";

export interface OpenInOption {
  id: string;
  label: string;
  icon: string;
  description: string;
}

/**
 * Default options for "Open In" modal.
 * New features can be added here in the future.
 */
export const OPEN_IN_OPTIONS: OpenInOption[] = [
  {
    id: "quick-view",
    label: "Quick View",
    icon: "⊞",
    description: "View all data like a spreadsheet",
  },
  {
    id: "data-correction",
    label: "Data Correction",
    icon: "✎",
    description: "Edit and correct existing rows",
  },
  {
    id: "form-fill",
    label: "Form Fill",
    icon: "◫",
    description: "Fill data like a mobile form",
  },
  {
    id: "multi-header",
    label: "Multi-Header Filtering",
    icon: "⊟",
    description: "Filter across multiple columns",
  },
  {
    id: "data-cleaner",
    label: "Data Cleaner",
    icon: "✨",
    description: "Find & Replace and remove duplicates",
  },
];

interface Props {
  /** The sheet title to display in the modal header */
  sheetTitle: string;
  /** Called when user picks an option */
  onSelect: (optionId: string) => void;
  /** Called when user dismisses the modal */
  onClose: () => void;
}

/**
 * OpenInModal — editorial "Open in…" action sheet.
 *
 * Appears as a centered card overlay when a user taps a saved sheet.
 * Lists all available modes the sheet can be opened in.
 */
export default function OpenInModal({ sheetTitle, onSelect, onClose }: Props) {
  const backdropRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Close on backdrop click
  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === backdropRef.current) onClose();
  }

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0, 0, 0, 0.4)",
        backdropFilter: "blur(2px)",
        animation: "omModalFadeIn 200ms ease-out",
        padding: 20,
      }}
      role="dialog"
      aria-modal="true"
      aria-label={`Open ${sheetTitle} in`}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 340,
          background: "var(--cream)",
          border: "1px solid var(--rule)",
          boxShadow: "0 8px 40px rgba(0,0,0,0.18)",
          animation: "omModalSlideUp 280ms cubic-bezier(0.22, 1, 0.36, 1)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{ padding: "18px 20px 14px 20px", borderBottom: "1px solid var(--rule)" }}>
          <p
            style={{
              fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
              fontWeight: 500,
              fontSize: 10,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--stone)",
              margin: "0 0 6px 0",
            }}
          >
            Open in
          </p>
          <p
            style={{
              fontFamily: "var(--font-newsreader), Georgia, serif",
              fontWeight: 400,
              fontSize: 16,
              color: "var(--ink)",
              margin: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {sheetTitle}
          </p>
        </div>

        {/* Options */}
        <div>
          {OPEN_IN_OPTIONS.map((option, idx) => (
            <button
              key={option.id}
              type="button"
              onClick={() => onSelect(option.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                width: "100%",
                padding: "14px 20px",
                background: "transparent",
                border: 0,
                borderBottom: idx < OPEN_IN_OPTIONS.length - 1 ? "1px solid var(--rule)" : "none",
                textAlign: "left",
                cursor: "pointer",
                transition: "background-color 180ms ease-out",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--paper)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              <span
                style={{
                  width: 24,
                  height: 24,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 15,
                  color: "var(--charcoal)",
                  flexShrink: 0,
                }}
                aria-hidden
              >
                {option.icon}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p
                  style={{
                    fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                    fontWeight: 500,
                    fontSize: 12,
                    letterSpacing: "0.04em",
                    color: "var(--ink)",
                    margin: 0,
                  }}
                >
                  {option.label}
                </p>
                <p
                  style={{
                    fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                    fontWeight: 300,
                    fontSize: 10,
                    letterSpacing: "0.02em",
                    color: "var(--stone)",
                    margin: "2px 0 0 0",
                  }}
                >
                  {option.description}
                </p>
              </div>
              <span style={{ color: "var(--stone)", fontSize: 14, flexShrink: 0 }} aria-hidden>
                →
              </span>
            </button>
          ))}
        </div>

        {/* Cancel */}
        <div style={{ borderTop: "1px solid var(--rule)", padding: "12px 20px" }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: "100%",
              padding: "10px",
              background: "transparent",
              border: 0,
              fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
              fontWeight: 500,
              fontSize: 10,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--stone)",
              cursor: "pointer",
              transition: "color 200ms ease-out",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--ink)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--stone)"; }}
          >
            Cancel
          </button>
        </div>
      </div>

      <style jsx>{`
        @keyframes omModalFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes omModalSlideUp {
          from {
            opacity: 0;
            transform: translateY(12px) scale(0.96);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes omModalFadeIn {
            from { opacity: 1; }
            to { opacity: 1; }
          }
          @keyframes omModalSlideUp {
            from { opacity: 1; transform: none; }
            to { opacity: 1; transform: none; }
          }
        }
      `}</style>
    </div>
  );
}
