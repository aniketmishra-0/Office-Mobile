"use client";

import React, { Suspense, useEffect, useLayoutEffect, useState, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import ErrorToast from "@/components/ErrorToast";
import LoadingOverlay from "@/components/LoadingOverlay";
import type { FieldSchema } from "@/types/field";
import { lookupFormsBySheet, getSheetSections } from "@/lib/api";

interface TabOption {
  id: string | null;
  worksheet_name: string | null;
  form_title: string;
  fields: FieldSchema[];
  has_form: boolean;
}

interface Section {
  title: string;
  rows: Record<string, string>[];
  start_row: number;
}

interface LoadedData {
  worksheet_name: string;
  fields: FieldSchema[];
  sections: Section[];
}

const MAX_OPEN = 2;

/* ─── Calendar Popup (fixed position) ─────────────────────────── */
function CalendarPopup({ anchorRef, onClose }: { anchorRef: React.RefObject<HTMLButtonElement | null>; onClose: () => void }) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const today = now.getDate();
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const popupRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, right: 16 });
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    if (anchorRef.current) {
      const rect = anchorRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 8, right: Math.max(16, window.innerWidth - rect.right) });
      setReady(true);
    }
  }, [anchorRef]);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (popupRef.current && !popupRef.current.contains(e.target as Node) &&
          anchorRef.current && !anchorRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [onClose, anchorRef]);

  if (!ready) return null;

  return (
    <>
      <div ref={popupRef} className="om-calendar-popup" style={{
        position: "fixed", top: pos.top, right: pos.right, zIndex: 99999,
        width: 270, background: "var(--cream)", border: "1px solid var(--rule)",
        borderRadius: 10, boxShadow: "0 8px 32px rgba(0,0,0,0.15)", padding: 16,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <span style={{ fontFamily: "var(--font-newsreader), Georgia, serif", fontWeight: 400, fontSize: 16, color: "var(--ink)" }}>{monthNames[month]} {year}</span>
          <span style={{ fontFamily: "var(--font-plex-mono), monospace", fontSize: 9, color: "var(--clay)", letterSpacing: "0.04em", textTransform: "uppercase", fontWeight: 500 }}>{dayNames[now.getDay()]}, {monthNames[month].slice(0, 3)} {today}</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, textAlign: "center" }}>
          {dayNames.map((d) => (
            <span key={d} style={{ fontFamily: "var(--font-plex-mono), monospace", fontSize: 9, fontWeight: 500, color: "var(--stone)", textTransform: "uppercase", padding: "4px 0 6px" }}>{d.slice(0, 2)}</span>
          ))}
          {cells.map((day, i) => (
            <span key={i} style={{
              fontFamily: "var(--font-plex-mono), monospace", fontSize: 11,
              color: day === today ? "var(--cream)" : "var(--ink)",
              background: day === today ? "var(--ink)" : "transparent",
              fontWeight: day === today ? 500 : 400,
              width: 30, height: 30, display: "inline-flex", alignItems: "center", justifyContent: "center",
              borderRadius: "50%", margin: "0 auto",
              visibility: day === null ? "hidden" : "visible",
            }}>{day ?? ""}</span>
          ))}
        </div>
      </div>
      <style jsx>{`
        .om-calendar-popup {
          transform-origin: top right;
          will-change: transform, opacity;
          animation: omCalendarReveal 280ms cubic-bezier(0.22, 1, 0.36, 1);
        }
        @keyframes omCalendarReveal {
          0% {
            opacity: 0;
            transform: translate3d(4px, -6px, 0) scale(0.9);
          }
          60% {
            opacity: 1;
          }
          100% {
            opacity: 1;
            transform: translate3d(0, 0, 0) scale(1);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .om-calendar-popup {
            animation: none;
          }
        }
      `}</style>
    </>
  );
}

/* ─── Custom Dropdown (replaces native select) ────────────────── */
function SectionDropdown({ sections, selectedSections, onSelect }: {
  sections: Section[];
  selectedSections: number[];
  onSelect: (idx: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  const available = sections.filter((_, idx) => !selectedSections.includes(idx));

  return (
    <div ref={ref} style={{ position: "relative", flex: 1, minWidth: 0, maxWidth: 300 }}>
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        style={{
          width: "100%", textAlign: "left",
          fontFamily: "var(--font-plex-mono), monospace", fontSize: 12,
          color: "var(--ink)", background: "var(--paper)",
          border: "1px solid var(--rule)", borderRadius: 6,
          padding: "9px 32px 9px 12px", cursor: "pointer", outline: "none",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}
      >
        + Select date section (max {MAX_OPEN})...
      </button>
      {/* Arrow */}
      <svg style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", width: 12, height: 12, color: "var(--stone)", pointerEvents: "none" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
      </svg>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
          background: "var(--cream)", border: "1px solid var(--rule)", borderRadius: 6,
          boxShadow: "0 4px 16px rgba(0,0,0,0.1)", zIndex: 9999,
          maxHeight: 240, overflowY: "auto",
        }}>
          {available.length === 0 ? (
            <div style={{ padding: "12px 14px", fontFamily: "var(--font-plex-mono), monospace", fontSize: 11, color: "var(--stone)" }}>
              {selectedSections.length >= MAX_OPEN ? "Max sections selected" : "No sections available"}
            </div>
          ) : (
            available.map((section) => {
              const idx = sections.indexOf(section);
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => { onSelect(idx); setOpen(false); }}
                  style={{
                    display: "block", width: "100%", textAlign: "left",
                    fontFamily: "var(--font-plex-mono), monospace", fontSize: 11,
                    color: "var(--ink)", background: "transparent",
                    border: "none", borderBottom: "1px solid var(--rule)",
                    padding: "10px 14px", cursor: "pointer",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--paper)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  {section.title} <span style={{ color: "var(--stone)", fontSize: 9 }}>({section.rows.length} rows)</span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

export default function MultiHeaderFilterPage() {
  return (
    <Suspense fallback={<LoadingOverlay message="Loading..." />}>
      <MultiHeaderFilterInner />
    </Suspense>
  );
}

function MultiHeaderFilterInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sheetParam = searchParams.get("sheet");

  const [formInput, setFormInput] = useState("");
  const [urlValid, setUrlValid] = useState(false);
  const [urlError, setUrlError] = useState("");
  const [loading, setLoading] = useState(false);
  const [availableTabs, setAvailableTabs] = useState<TabOption[] | null>(null);
  const [sheetUrl, setSheetUrl] = useState("");
  const [loaded, setLoaded] = useState<LoadedData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCalendar, setShowCalendar] = useState(false);
  const calBtnRef = useRef<HTMLButtonElement | null>(null);

  const [selectedSections, setSelectedSections] = useState<number[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (sheetParam) loadSheetFromUrl(sheetParam);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetParam]);

  function validateUrl(value: string): boolean {
    if (!value.trim()) { setUrlError(""); setUrlValid(false); return false; }
    const isValid = value.includes("docs.google.com/spreadsheets") || /^[a-zA-Z0-9-_]{20,}$/.test(value.trim());
    setUrlValid(isValid);
    setUrlError(isValid ? "" : "Not a valid Google Sheet URL");
    return isValid;
  }

  async function handleLoadSheet() {
    if (!validateUrl(formInput)) return;
    router.push(`/multi-header-filter?sheet=${encodeURIComponent(formInput.trim())}`);
  }

  async function loadSheetFromUrl(url: string) {
    setLoading(true); setError(null); setAvailableTabs(null); setLoaded(null);
    setSelectedSections([]); setSearchQuery("");
    try {
      const result = await lookupFormsBySheet(url);
      setSheetUrl(url);
      const tabs: TabOption[] = result.items.map((item) => ({
        id: item.id, worksheet_name: item.worksheet_name,
        form_title: item.form_title, fields: item.fields, has_form: item.has_form,
      }));
      if (!tabs.length) { setError("No tabs found"); return; }
      if (tabs.length === 1) { await selectTab(tabs[0], url); }
      else { setAvailableTabs(tabs); }
    } catch (e: any) { setError(e.message ?? "Failed to load sheet"); }
    finally { setLoading(false); }
  }

  async function selectTab(tab: TabOption, sheet_url?: string) {
    setAvailableTabs(null); setLoading(true); setError(null);
    try {
      const data = await getSheetSections(sheet_url ?? sheetUrl, tab.worksheet_name);
      setLoaded({ worksheet_name: data.worksheet_name, fields: data.fields, sections: data.sections });
      if (data.sections.length > 0) setSelectedSections([0]);
    } catch (e: any) { setError(e.message ?? "Failed to load data"); }
    finally { setLoading(false); }
  }

  const addSection = (idx: number) => {
    setSelectedSections((prev) => {
      if (prev.includes(idx)) return prev;
      const next = [...prev, idx];
      if (next.length > MAX_OPEN) return next.slice(next.length - MAX_OPEN);
      return next;
    });
  };

  const removeSection = (idx: number) => {
    setSelectedSections((prev) => prev.filter((i) => i !== idx));
  };

  const getFilteredRows = (section: Section): Record<string, string>[] => {
    const q = searchQuery.trim().toLowerCase();
    if (!q || !loaded) return section.rows;
    return section.rows.filter((row) =>
      loaded.fields.some((f) => (row[f.key] ?? "").toLowerCase().includes(q))
    );
  };

  const totalRows = loaded?.sections.reduce((sum, s) => sum + s.rows.length, 0) ?? 0;
  const closeCalendar = useCallback(() => setShowCalendar(false), []);

  // --- RENDER ---

  // Step 1: URL input
  if (!sheetParam && !loaded && !availableTabs) {
    return (
      <div style={{ display: "flex", flexDirection: "column", minHeight: "100dvh", backgroundColor: "var(--cream)" }}>
        <AppHeader title="Multi-Header Filtering" showBack onBack={() => router.push("/")} />
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ width: "100%", maxWidth: 400 }}>
            <h2 style={{ fontFamily: "var(--font-newsreader), Georgia, serif", fontWeight: 400, fontSize: 22, color: "var(--ink)", marginBottom: 6, textAlign: "center" }}>Multi-Header Filtering</h2>
            <p style={{ fontFamily: "var(--font-plex-mono), monospace", fontSize: 11, color: "var(--stone)", textAlign: "center", marginBottom: 20, lineHeight: 1.5 }}>
              Select up to 2 date sections to view and search within them.
            </p>
            <input type="url" value={formInput}
              onChange={(e) => { setFormInput(e.target.value); validateUrl(e.target.value); }}
              onKeyDown={(e) => e.key === "Enter" && handleLoadSheet()}
              placeholder="Paste Google Sheet URL..."
              style={{ width: "100%", fontFamily: "var(--font-plex-mono), monospace", fontSize: 13, color: "var(--ink)", background: "var(--paper)", border: `1px solid ${urlError ? "var(--error)" : "var(--rule)"}`, borderRadius: 6, padding: "11px 14px", outline: "none", marginBottom: 8 }}
            />
            {urlError && <p style={{ color: "var(--error)", fontSize: 11, margin: "0 0 8px" }}>{urlError}</p>}
            <button onClick={handleLoadSheet} disabled={!urlValid || loading}
              style={{ width: "100%", fontFamily: "var(--font-plex-mono), monospace", fontSize: 12, fontWeight: 500, color: "var(--cream)", background: urlValid ? "var(--ink)" : "var(--stone)", border: "none", borderRadius: 6, padding: "11px 0", cursor: urlValid ? "pointer" : "not-allowed", opacity: urlValid ? 1 : 0.5 }}>
              {loading ? "Loading..." : "Load Sheet"}
            </button>
          </div>
        </div>
        {error && <ErrorToast message={error} onDismiss={() => setError(null)} />}
      </div>
    );
  }

  // Step 2: Tab selection
  if (availableTabs && !loaded) {
    return (
      <div style={{ display: "flex", flexDirection: "column", minHeight: "100dvh", backgroundColor: "var(--cream)" }}>
        <AppHeader title="Multi-Header Filtering" showBack onBack={() => router.back()} />
        {loading && <LoadingOverlay message="Loading..." />}
        <div style={{ flex: 1, padding: 24 }}>
          <h3 style={{ fontFamily: "var(--font-newsreader), Georgia, serif", fontWeight: 400, fontSize: 18, color: "var(--ink)", marginBottom: 16, textAlign: "center" }}>Select a tab</h3>
          <div style={{ maxWidth: 400, margin: "0 auto", display: "flex", flexDirection: "column", gap: 8 }}>
            {availableTabs.map((tab, i) => (
              <button key={i} onClick={() => selectTab(tab)}
                style={{ fontFamily: "var(--font-plex-mono), monospace", fontSize: 13, color: "var(--ink)", background: "var(--paper)", border: "1px solid var(--rule)", borderRadius: 6, padding: "12px 16px", cursor: "pointer", textAlign: "left" }}>
                {tab.worksheet_name || tab.form_title}
              </button>
            ))}
          </div>
        </div>
        {error && <ErrorToast message={error} onDismiss={() => setError(null)} />}
      </div>
    );
  }

  // Loading
  if (!loaded) {
    return (
      <div style={{ display: "flex", flexDirection: "column", minHeight: "100dvh", backgroundColor: "var(--cream)" }}>
        <AppHeader title="Multi-Header Filtering" showBack onBack={() => router.back()} />
        {loading && <LoadingOverlay message="Loading data..." />}
        {error && <ErrorToast message={error} onDismiss={() => setError(null)} />}
      </div>
    );
  }

  // Step 3: Main data view — matching original mobile layout exactly
  const sortedFields = [...loaded.fields].sort((a, b) => a.order - b.order);

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100dvh", backgroundColor: "var(--cream)" }}>
      <AppHeader title="Multi-Header Filtering" showBack onBack={() => { setLoaded(null); setSelectedSections([]); setSearchQuery(""); if (sheetUrl) loadSheetFromUrl(sheetUrl); }} />

      {/* Content */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>

        {/* Top controls area */}
        <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid var(--rule)" }}>
          {/* Title row with calendar */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 10 }}>
            <div>
              <h2 style={{ fontFamily: "var(--font-newsreader), Georgia, serif", fontWeight: 400, fontSize: 18, color: "var(--ink)", margin: 0 }}>{loaded.worksheet_name}</h2>
              <p style={{ fontFamily: "var(--font-plex-mono), monospace", fontSize: 10, color: "var(--stone)", margin: "2px 0 0" }}>
                {loaded.sections.length} sections · {totalRows.toLocaleString()} rows
              </p>
            </div>
            <button
              ref={calBtnRef}
              type="button"
              onClick={() => setShowCalendar((s) => !s)}
              aria-label="Show calendar"
              style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                width: 36, height: 36, borderRadius: "50%",
                border: showCalendar ? "1.5px solid var(--ink)" : "1px solid var(--rule)",
                background: showCalendar ? "var(--paper)" : "transparent",
                color: "var(--ink)", cursor: "pointer", flexShrink: 0,
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </button>
          </div>

          {/* Dropdown + Search row */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <SectionDropdown
              sections={loaded.sections}
              selectedSections={selectedSections}
              onSelect={addSection}
            />
            <div style={{ position: "relative", flex: 1, minWidth: 120, maxWidth: 220 }}>
              <svg style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", width: 13, height: 13, color: "var(--stone)", pointerEvents: "none" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search..."
                style={{ width: "100%", fontFamily: "var(--font-plex-mono), monospace", fontSize: 12, color: "var(--ink)", background: "var(--paper)", border: "1px solid var(--rule)", borderRadius: 6, padding: "9px 12px 9px 28px", outline: "none" }}
              />
            </div>
            {searchQuery && (
              <button onClick={() => setSearchQuery("")}
                style={{ fontFamily: "var(--font-plex-mono), monospace", fontSize: 10, color: "var(--clay)", background: "none", border: "1px solid var(--clay)", borderRadius: 4, padding: "4px 8px", cursor: "pointer" }}>
                Clear
              </button>
            )}
          </div>

          {/* Chips */}
          {selectedSections.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
              {selectedSections.map((idx) => (
                <span key={idx} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: "var(--font-plex-mono), monospace", fontSize: 10, background: "var(--ink)", color: "var(--cream)", borderRadius: 14, padding: "4px 10px 4px 12px" }}>
                  {loaded.sections[idx]?.title ?? `Section ${idx}`}
                  <button onClick={() => removeSection(idx)}
                    style={{ background: "none", border: "none", color: "var(--cream)", cursor: "pointer", fontSize: 13, padding: 0, lineHeight: 1, opacity: 0.7 }}
                    aria-label="Remove">×</button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Data area */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px 24px" }}>
          {selectedSections.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--stone)" }}>
              <p style={{ fontFamily: "var(--font-plex-mono), monospace", fontSize: 12, marginBottom: 8 }}>No section selected</p>
              <p style={{ fontFamily: "var(--font-plex-mono), monospace", fontSize: 10, margin: 0 }}>Use the dropdown above to select a date section</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {selectedSections.map((idx) => {
                const section = loaded.sections[idx];
                if (!section) return null;
                const rows = getFilteredRows(section);
                return (
                  <div key={idx} style={{ border: "1px solid var(--rule)", borderRadius: 8, overflow: "hidden", background: "var(--paper)" }}>
                    <div style={{ display: "flex", alignItems: "center", padding: "10px 14px", background: "var(--ink)", color: "var(--cream)", gap: 8 }}>
                      <span style={{ fontFamily: "var(--font-plex-mono), monospace", fontSize: 12, fontWeight: 500, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{section.title}</span>
                      <span style={{ fontFamily: "var(--font-plex-mono), monospace", fontSize: 9, opacity: 0.7, flexShrink: 0 }}>
                        {searchQuery ? `${rows.length} matches` : `${section.rows.length} rows`}
                      </span>
                      <button onClick={() => removeSection(idx)}
                        style={{ background: "none", border: "none", color: "var(--cream)", cursor: "pointer", fontSize: 16, padding: "0 4px", opacity: 0.7, lineHeight: 1 }}
                        aria-label="Close section">×</button>
                    </div>
                    <div style={{ overflowX: "auto", maxHeight: 450, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--font-plex-mono), monospace", fontSize: 11 }}>
                        <thead>
                          <tr>
                            <th style={{ padding: "6px 10px", textAlign: "left", fontSize: 9, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--stone)", borderBottom: "1px solid var(--rule)", whiteSpace: "nowrap", position: "sticky", top: 0, background: "var(--paper)", fontWeight: 500 }}>#</th>
                            {sortedFields.map((field) => (
                              <th key={field.key} style={{ padding: "6px 10px", textAlign: "left", fontSize: 9, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--stone)", borderBottom: "1px solid var(--rule)", whiteSpace: "nowrap", position: "sticky", top: 0, background: "var(--paper)", fontWeight: 500 }}>
                                {field.source_header || field.label || field.key}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {rows.slice(0, 150).map((row, rIdx) => (
                            <tr key={rIdx} style={{ borderBottom: "1px solid var(--rule)", background: rIdx % 2 !== 0 ? "rgba(0,0,0,0.015)" : "transparent" }}>
                              <td style={{ padding: "5px 10px", color: "var(--stone)", fontSize: 9 }}>{row._row_index ?? rIdx + 1}</td>
                              {sortedFields.map((field) => (
                                <td key={field.key} style={{ padding: "5px 10px", color: "var(--ink)", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={row[field.key] ?? ""}>
                                  {row[field.key] ?? ""}
                                </td>
                              ))}
                            </tr>
                          ))}
                          {rows.length === 0 && (
                            <tr><td colSpan={sortedFields.length + 1} style={{ padding: 24, textAlign: "center", color: "var(--stone)", fontSize: 11 }}>
                              {searchQuery ? "No matches" : "No data in this section"}
                            </td></tr>
                          )}
                          {rows.length > 150 && (
                            <tr><td colSpan={sortedFields.length + 1} style={{ padding: 8, textAlign: "center", color: "var(--stone)", fontSize: 9 }}>
                              Showing 150 of {rows.length}
                            </td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Calendar popup — fixed overlay */}
      {showCalendar && <CalendarPopup anchorRef={calBtnRef} onClose={closeCalendar} />}
      {error && <ErrorToast message={error} onDismiss={() => setError(null)} />}
    </div>
  );
}

