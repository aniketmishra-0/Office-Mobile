"use client";

import React, { useEffect, useRef, useState } from "react";
import { getSheetSections } from "@/lib/api";

export interface OpenInOption {
  id: string;
  label: string;
  icon: string;
  description: string;
  badge?: "coming-soon" | "new" | "recommended";
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
    description: "Spreadsheet view — click any row to open as form",
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
    description: "Filter across multiple columns & section headers",
  },
  {
    id: "data-cleaner",
    label: "Data Cleaner",
    icon: "✨",
    description: "Find & Replace and remove duplicates",
    badge: "new",
  },
  {
    id: "load-analysis",
    label: "Load Analysis",
    icon: "⊜",
    description: "See frequency & workload per column value",
    badge: "new",
  },
];

interface Props {
  /** The sheet title to display in the modal header */
  sheetTitle: string;
  /** Sheet URL for auto-header analysis */
  sheetUrl?: string;
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
export default function OpenInModal({ sheetTitle, sheetUrl, onSelect, onClose }: Props) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [detectedMulti, setDetectedMulti] = useState<{ isMulti: boolean; count: number } | null>(null);

  // Check header structure in background
  useEffect(() => {
    if (!sheetUrl) return;
    setAnalyzing(true);
    getSheetSections(sheetUrl, null)
      .then((data) => {
        if (data && data.sections && data.sections.length > 1) {
          setDetectedMulti({ isMulti: true, count: data.sections.length });
        } else {
          setDetectedMulti({ isMulti: false, count: 1 });
        }
      })
      .catch(() => setDetectedMulti(null))
      .finally(() => setAnalyzing(false));
  }, [sheetUrl]);

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

        {/* Analyzing or Auto-detected header alert */}
        {analyzing && (
          <div style={{
            padding: "8px 16px",
            background: "rgba(0,0,0,0.03)",
            borderBottom: "1px solid var(--rule)",
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 10,
            fontFamily: "var(--font-plex-mono), monospace",
            color: "var(--stone)",
          }}>
            <span>⏳</span> Analyzing sheet header structure...
          </div>
        )}

        {detectedMulti?.isMulti && (
          <div style={{
            padding: "10px 16px",
            background: "rgba(200, 98, 58, 0.08)",
            borderBottom: "1px solid rgba(200, 98, 58, 0.25)",
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 13 }}>✨</span>
              <span style={{
                fontFamily: "var(--font-plex-mono), monospace",
                fontSize: 10,
                fontWeight: 600,
                color: "var(--clay)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}>
                Multi-Header Detected ({detectedMulti.count} Sections)
              </span>
            </div>
            <button
              type="button"
              onClick={() => onSelect("multi-header")}
              style={{
                padding: "6px 12px",
                background: "var(--clay)",
                color: "var(--on-clay)",
                border: 0,
                borderRadius: 4,
                fontSize: 11,
                fontFamily: "var(--font-plex-mono), monospace",
                fontWeight: 600,
                cursor: "pointer",
                textAlign: "center",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
              }}
            >
              Open in Multi-Header Filter →
            </button>
          </div>
        )}

        {/* Options */}
        <div>
          {OPEN_IN_OPTIONS.map((option, idx) => {
            const isRecommended =
              (option.id === "multi-header" && detectedMulti?.isMulti) ||
              (option.id === "quick-view" && detectedMulti && !detectedMulti.isMulti);

            return (
              <button
                key={option.id}
                type="button"
                onClick={() => { if (option.badge !== "coming-soon") onSelect(option.id); }}
                disabled={option.badge === "coming-soon"}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  width: "100%",
                  padding: "14px 20px",
                  background: isRecommended ? "rgba(200, 98, 58, 0.04)" : "transparent",
                  border: 0,
                  borderBottom: idx < OPEN_IN_OPTIONS.length - 1 ? "1px solid var(--rule)" : "none",
                  textAlign: "left",
                  cursor: option.badge === "coming-soon" ? "default" : "pointer",
                  opacity: option.badge === "coming-soon" ? 0.55 : 1,
                  transition: "background-color 180ms ease-out",
                }}
                onMouseEnter={(e) => { if (option.badge !== "coming-soon") e.currentTarget.style.background = "var(--paper)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = isRecommended ? "rgba(200, 98, 58, 0.04)" : "transparent"; }}
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
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    {option.label}
                    {isRecommended && (
                      <span
                        style={{
                          fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                          fontWeight: 600,
                          fontSize: 8,
                          letterSpacing: "0.08em",
                          textTransform: "uppercase",
                          color: "var(--clay)",
                          background: "rgba(200, 98, 58, 0.12)",
                          border: "1px solid rgba(200, 98, 58, 0.3)",
                          padding: "2px 6px",
                          borderRadius: 3,
                          whiteSpace: "nowrap",
                        }}
                      >
                        ✨ Recommended
                      </span>
                    )}
                    {!isRecommended && option.badge === "coming-soon" && (
                      <span
                        style={{
                          fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                          fontWeight: 600,
                          fontSize: 8,
                          letterSpacing: "0.08em",
                          textTransform: "uppercase",
                          color: "var(--stone)",
                          background: "var(--rule)",
                          padding: "2px 6px",
                          borderRadius: 3,
                          whiteSpace: "nowrap",
                        }}
                      >
                        Coming Soon
                      </span>
                    )}
                    {!isRecommended && option.badge === "new" && (
                      <span
                        style={{
                          fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                          fontWeight: 600,
                          fontSize: 8,
                          letterSpacing: "0.08em",
                          textTransform: "uppercase",
                          color: "#fff",
                          background: "#22c55e",
                          padding: "2px 6px",
                          borderRadius: 3,
                          whiteSpace: "nowrap",
                        }}
                      >
                        New
                      </span>
                    )}
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
          );
        })}
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
