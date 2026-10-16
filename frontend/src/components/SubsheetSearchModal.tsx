"use client";

import React, { useEffect, useRef, useState, useMemo } from "react";
import { listWorksheets } from "@/lib/api";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  sheetUrl: string;
  currentWorksheet?: string | null;
  onSelectWorksheet: (worksheetName: string) => void;
  preloadedWorksheets?: string[];
}

export default function SubsheetSearchModal({
  isOpen,
  onClose,
  sheetUrl,
  currentWorksheet,
  onSelectWorksheet,
  preloadedWorksheets,
}: Props) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [worksheets, setWorksheets] = useState<string[]>(preloadedWorksheets ?? []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Fetch worksheets when modal opens if not already provided
  useEffect(() => {
    if (!isOpen) {
      setSearch("");
      return;
    }

    if (preloadedWorksheets && preloadedWorksheets.length > 0) {
      setWorksheets(preloadedWorksheets);
      return;
    }

    if (!sheetUrl) return;

    let active = true;
    setLoading(true);
    setError(null);

    listWorksheets(sheetUrl)
      .then((res) => {
        if (!active) return;
        setWorksheets(res.items || []);
      })
      .catch((err) => {
        if (!active) return;
        setError(err.message || "Failed to load subsheets");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [isOpen, sheetUrl, preloadedWorksheets]);

  // Focus search input on open
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Escape key listener
  useEffect(() => {
    if (!isOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  // Filtered worksheets
  const filteredWorksheets = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return worksheets;
    return worksheets.filter((name) => name.toLowerCase().includes(q));
  }, [worksheets, search]);

  if (!isOpen) return null;

  return (
    <div
      ref={backdropRef}
      onClick={(e) => {
        if (e.target === backdropRef.current) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0, 0, 0, 0.45)",
        backdropFilter: "blur(2px)",
        padding: 16,
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Select Subsheet"
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          background: "var(--cream)",
          border: "1px solid var(--rule)",
          boxShadow: "0 12px 48px rgba(0, 0, 0, 0.2)",
          display: "flex",
          flexDirection: "column",
          maxHeight: "85vh",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 20px 14px",
            borderBottom: "1px solid var(--rule)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <p
              style={{
                fontFamily: "var(--font-plex-mono), monospace",
                fontWeight: 600,
                fontSize: 10,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "var(--stone)",
                margin: 0,
              }}
            >
              Google Sheet Subsheets
            </p>
            <h3
              style={{
                fontFamily: "var(--font-newsreader), Georgia, serif",
                fontWeight: 400,
                fontSize: 18,
                color: "var(--ink)",
                margin: "2px 0 0",
              }}
            >
              Switch Subsheet {worksheets.length > 0 && `(${worksheets.length})`}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: "transparent",
              border: 0,
              color: "var(--stone)",
              fontSize: 18,
              cursor: "pointer",
              padding: "4px 8px",
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        {/* Search Bar */}
        <div
          style={{
            padding: "12px 16px",
            borderBottom: "1px solid var(--rule)",
            background: "var(--paper)",
          }}
        >
          <div style={{ position: "relative" }}>
            <span
              style={{
                position: "absolute",
                left: 10,
                top: "50%",
                transform: "translateY(-50%)",
                fontSize: 12,
                color: "var(--stone)",
                pointerEvents: "none",
              }}
            >
              🔍
            </span>
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search subsheets (e.g. Month, Branch, Tab)..."
              style={{
                width: "100%",
                padding: "8px 30px 8px 30px",
                fontSize: 12,
                fontFamily: "var(--font-plex-mono), monospace",
                border: "1px solid var(--rule)",
                borderRadius: 4,
                background: "var(--cream)",
                color: "var(--ink)",
                outline: "none",
              }}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Clear search"
                style={{
                  position: "absolute",
                  right: 8,
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "transparent",
                  border: 0,
                  color: "var(--stone)",
                  fontSize: 12,
                  cursor: "pointer",
                  padding: 4,
                }}
              >
                ✕
              </button>
            )}
          </div>
          {worksheets.length > 0 && (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: 6,
                padding: "0 2px",
                fontSize: 10,
                fontFamily: "var(--font-plex-mono), monospace",
                color: "var(--stone)",
              }}
            >
              <span>
                {filteredWorksheets.length} of {worksheets.length} subsheets
              </span>
              {currentWorksheet && (
                <span style={{ color: "var(--clay)" }}>
                  Current: {currentWorksheet}
                </span>
              )}
            </div>
          )}
        </div>

        {/* List of Subsheets */}
        <div style={{ flex: 1, overflowY: "auto", minHeight: 180, maxHeight: 360 }}>
          {loading && (
            <div
              style={{
                padding: "36px 20px",
                textAlign: "center",
                fontFamily: "var(--font-plex-mono), monospace",
                fontSize: 12,
                color: "var(--stone)",
              }}
            >
              <span>⏳ Loading subsheets...</span>
            </div>
          )}

          {error && !loading && (
            <div
              style={{
                padding: "24px 20px",
                textAlign: "center",
                fontFamily: "var(--font-plex-mono), monospace",
                fontSize: 12,
                color: "var(--clay)",
              }}
            >
              <p style={{ margin: "0 0 10px" }}>{error}</p>
              <button
                type="button"
                onClick={() => {
                  setLoading(true);
                  setError(null);
                  listWorksheets(sheetUrl)
                    .then((res) => setWorksheets(res.items || []))
                    .catch((err) => setError(err.message || "Failed to load"))
                    .finally(() => setLoading(false));
                }}
                style={{
                  fontSize: 11,
                  fontFamily: "var(--font-plex-mono), monospace",
                  background: "transparent",
                  border: "1px solid var(--rule)",
                  padding: "4px 10px",
                  cursor: "pointer",
                  color: "var(--ink)",
                }}
              >
                Retry
              </button>
            </div>
          )}

          {!loading && !error && filteredWorksheets.length === 0 && (
            <div
              style={{
                padding: "36px 20px",
                textAlign: "center",
                fontFamily: "var(--font-plex-mono), monospace",
                fontSize: 12,
                color: "var(--stone)",
              }}
            >
              <p style={{ margin: "0 0 8px" }}>
                No subsheets match &quot;{search}&quot;
              </p>
              <button
                type="button"
                onClick={() => setSearch("")}
                style={{
                  fontSize: 11,
                  fontFamily: "var(--font-plex-mono), monospace",
                  color: "var(--clay)",
                  textDecoration: "underline",
                  background: "none",
                  border: 0,
                  cursor: "pointer",
                }}
              >
                Clear filter
              </button>
            </div>
          )}

          {!loading && !error && filteredWorksheets.length > 0 && (
            <div>
              {filteredWorksheets.map((ws, idx) => {
                const isCurrent = ws === currentWorksheet;
                return (
                  <button
                    key={`${ws}-${idx}`}
                    type="button"
                    onClick={() => {
                      onSelectWorksheet(ws);
                      onClose();
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                      width: "100%",
                      padding: "12px 18px",
                      background: isCurrent ? "rgba(200, 98, 58, 0.06)" : "transparent",
                      border: 0,
                      borderBottom:
                        idx < filteredWorksheets.length - 1
                          ? "1px solid var(--rule)"
                          : "none",
                      textAlign: "left",
                      cursor: "pointer",
                      transition: "background-color 150ms ease-out",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = isCurrent
                        ? "rgba(200, 98, 58, 0.12)"
                        : "var(--paper)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = isCurrent
                        ? "rgba(200, 98, 58, 0.06)"
                        : "transparent";
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                      <span
                        style={{
                          fontSize: 13,
                          color: isCurrent ? "var(--clay)" : "var(--stone)",
                          flexShrink: 0,
                        }}
                        aria-hidden
                      >
                        ◫
                      </span>
                      <span
                        style={{
                          fontFamily: "var(--font-plex-mono), monospace",
                          fontSize: 12,
                          fontWeight: isCurrent ? 600 : 400,
                          color: "var(--ink)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {ws}
                      </span>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                      {isCurrent ? (
                        <span
                          style={{
                            fontFamily: "var(--font-plex-mono), monospace",
                            fontSize: 9,
                            fontWeight: 600,
                            letterSpacing: "0.06em",
                            textTransform: "uppercase",
                            color: "var(--clay)",
                            background: "rgba(200, 98, 58, 0.12)",
                            padding: "2px 6px",
                            borderRadius: 3,
                          }}
                        >
                          ● Current
                        </span>
                      ) : (
                        <span
                          style={{
                            color: "var(--stone)",
                            fontSize: 13,
                          }}
                          aria-hidden
                        >
                          →
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            borderTop: "1px solid var(--rule)",
            padding: "10px 16px",
            background: "var(--cream)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-plex-mono), monospace",
              fontSize: 10,
              color: "var(--stone)",
            }}
          >
            ESC to close
          </span>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "transparent",
              border: 0,
              fontFamily: "var(--font-plex-mono), monospace",
              fontSize: 10,
              fontWeight: 500,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--stone)",
              cursor: "pointer",
              padding: "4px 8px",
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
