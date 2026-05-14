"use client";

import React, { Suspense, useEffect, useState, useRef } from "react";
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

/* ─── Mini Calendar Popup ─────────────────────────────────────── */
function CalendarPopup({ onClose }: { onClose: () => void }) {
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

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  return (
    <div ref={popupRef} className="mhf-calendar-popup">
      <div className="mhf-calendar-header">
        <span className="mhf-calendar-month">{monthNames[month]} {year}</span>
        <span className="mhf-calendar-today-label">{dayNames[now.getDay()]}, {monthNames[month].slice(0, 3)} {today}</span>
      </div>
      <div className="mhf-calendar-grid">
        {dayNames.map((d) => (
          <span key={d} className="mhf-calendar-dayname">{d.slice(0, 2)}</span>
        ))}
        {cells.map((day, i) => (
          <span key={i} className={`mhf-calendar-cell ${day === today ? "is-today" : ""} ${day === null ? "is-empty" : ""}`}>
            {day ?? ""}
          </span>
        ))}
      </div>
      <style jsx>{`
        .mhf-calendar-popup {
          position: absolute;
          top: calc(100% + 8px);
          right: 0;
          z-index: 9999;
          width: 260px;
          background: var(--cream);
          border: 1px solid var(--rule);
          border-radius: 8px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.12);
          padding: 14px;
          animation: calReveal 200ms cubic-bezier(0.22, 1, 0.36, 1);
        }
        @keyframes calReveal {
          from { opacity: 0; transform: translateY(-6px) scale(0.96); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .mhf-calendar-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 12px;
        }
        .mhf-calendar-month {
          font-family: var(--font-newsreader), Georgia, serif;
          font-weight: 400;
          font-size: 15px;
          color: var(--ink);
        }
        .mhf-calendar-today-label {
          font-family: var(--font-plex-mono), ui-monospace, monospace;
          font-size: 9px;
          color: var(--clay);
          letter-spacing: 0.04em;
          text-transform: uppercase;
          font-weight: 500;
        }
        .mhf-calendar-grid {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          gap: 2px;
          text-align: center;
        }
        .mhf-calendar-dayname {
          font-family: var(--font-plex-mono), ui-monospace, monospace;
          font-size: 9px;
          font-weight: 500;
          color: var(--stone);
          text-transform: uppercase;
          letter-spacing: 0.06em;
          padding: 4px 0 6px;
        }
        .mhf-calendar-cell {
          font-family: var(--font-plex-mono), ui-monospace, monospace;
          font-size: 11px;
          color: var(--ink);
          width: 30px;
          height: 30px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          margin: 0 auto;
        }
        .mhf-calendar-cell.is-empty {
          visibility: hidden;
        }
        .mhf-calendar-cell.is-today {
          background: var(--ink);
          color: var(--cream);
          font-weight: 500;
        }
      `}</style>
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

  // Selected sections (max 2) — by index
  const [selectedSections, setSelectedSections] = useState<number[]>([]);
  // Search query — searches only selected/open sections
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

  const handleDropdownSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const idx = parseInt(e.target.value, 10);
    if (isNaN(idx)) return;
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

  // --- RENDER ---

  // Step 1: URL input
  if (!sheetParam && !loaded && !availableTabs) {
    return (
      <div className="mhf-page">
        <AppHeader title="Multi-Header Filtering" showBack onBack={() => router.push("/")} />
        <div className="mhf-center-wrap">
          <div className="mhf-url-card">
            <h2 className="mhf-url-title">Multi-Header Filtering</h2>
            <p className="mhf-url-desc">Select up to 2 date sections to view and search within them.</p>
            <input type="url" value={formInput}
              onChange={(e) => { setFormInput(e.target.value); validateUrl(e.target.value); }}
              onKeyDown={(e) => e.key === "Enter" && handleLoadSheet()}
              placeholder="Paste Google Sheet URL..."
              className={`mhf-url-input ${urlError ? "has-error" : ""}`}
            />
            {urlError && <p className="mhf-url-error">{urlError}</p>}
            <button onClick={handleLoadSheet} disabled={!urlValid || loading}
              className={`mhf-url-btn ${urlValid ? "is-valid" : ""}`}>
              {loading ? "Loading..." : "Load Sheet"}
            </button>
          </div>
        </div>
        {error && <ErrorToast message={error} onDismiss={() => setError(null)} />}
        <style jsx>{pageStyles}</style>
      </div>
    );
  }

  // Step 2: Tab selection
  if (availableTabs && !loaded) {
    return (
      <div className="mhf-page">
        <AppHeader title="Multi-Header Filtering" showBack onBack={() => router.back()} />
        {loading && <LoadingOverlay message="Loading..." />}
        <div style={{ flex: 1, padding: 24 }}>
          <h3 className="mhf-tab-title">Select a tab</h3>
          <div className="mhf-tab-list">
            {availableTabs.map((tab, i) => (
              <button key={i} onClick={() => selectTab(tab)} className="mhf-tab-btn">
                {tab.worksheet_name || tab.form_title}
              </button>
            ))}
          </div>
        </div>
        {error && <ErrorToast message={error} onDismiss={() => setError(null)} />}
        <style jsx>{pageStyles}</style>
      </div>
    );
  }

  // Loading
  if (!loaded) {
    return (
      <div className="mhf-page">
        <AppHeader title="Multi-Header Filtering" showBack onBack={() => router.back()} />
        {loading && <LoadingOverlay message="Loading data..." />}
        {error && <ErrorToast message={error} onDismiss={() => setError(null)} />}
        <style jsx>{pageStyles}</style>
      </div>
    );
  }

  // Step 3: Main data view
  const sortedFields = [...loaded.fields].sort((a, b) => a.order - b.order);

  return (
    <div className="mhf-page">
      <AppHeader title="Multi-Header Filtering" showBack onBack={() => { setLoaded(null); setSelectedSections([]); setSearchQuery(""); if (sheetUrl) loadSheetFromUrl(sheetUrl); }} />

      {/* Page toolbar — info, controls, calendar icon */}
      <div className="mhf-toolbar" style={{ zIndex: 30, position: "sticky" }}>
        <div className="mhf-toolbar-inner">
          {/* Left: Sheet info */}
          <div className="mhf-info">
            <h2 className="mhf-info-title">{loaded.worksheet_name}</h2>
            <p className="mhf-info-meta">{loaded.sections.length} sections · {totalRows.toLocaleString()} rows</p>
          </div>

          {/* Calendar icon */}
          <div style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setShowCalendar((s) => !s)}
              className={`mhf-calendar-btn ${showCalendar ? "is-active" : ""}`}
              aria-label="Show calendar"
              title="View today's date"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
                <text x="12" y="17" textAnchor="middle" fontSize="7" fill="currentColor" stroke="none" fontFamily="var(--font-plex-mono)">{new Date().getDate()}</text>
              </svg>
            </button>
            {showCalendar && <CalendarPopup onClose={() => setShowCalendar(false)} />}
          </div>
        </div>

        {/* Controls row: dropdown + search */}
        <div className="mhf-controls">
          <select onChange={handleDropdownSelect} value="" className="mhf-select">
            <option value="">+ Select date section (max {MAX_OPEN})...</option>
            {loaded.sections.map((section, idx) => (
              <option key={idx} value={idx} disabled={selectedSections.includes(idx)}>
                {section.title} ({section.rows.length} rows)
              </option>
            ))}
          </select>

          <div className="mhf-search-wrap">
            <svg className="mhf-search-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search..."
              className="mhf-search-input"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="mhf-search-clear" aria-label="Clear search">Clear</button>
            )}
          </div>
        </div>

        {/* Selected section chips */}
        {selectedSections.length > 0 && (
          <div className="mhf-chips">
            {selectedSections.map((idx) => (
              <span key={idx} className="mhf-chip">
                {loaded.sections[idx]?.title ?? `Section ${idx}`}
                <button onClick={() => removeSection(idx)} className="mhf-chip-x" aria-label="Remove">×</button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Data area */}
      <div className="mhf-data">
        {selectedSections.length === 0 ? (
          <div className="mhf-empty">
            <p className="mhf-empty-title">No section selected</p>
            <p className="mhf-empty-desc">Use the dropdown above to select a date section</p>
          </div>
        ) : (
          <div className="mhf-sections">
            {selectedSections.map((idx) => {
              const section = loaded.sections[idx];
              if (!section) return null;
              const rows = getFilteredRows(section);

              return (
                <div key={idx} className="mhf-section-card">
                  <div className="mhf-section-bar">
                    <span className="mhf-section-title">{section.title}</span>
                    <span className="mhf-section-count">
                      {searchQuery ? `${rows.length} matches` : `${section.rows.length} rows`}
                    </span>
                    <button onClick={() => removeSection(idx)} className="mhf-section-close" aria-label="Close section">×</button>
                  </div>

                  <div className="mhf-table-wrap">
                    <table className="mhf-table">
                      <thead>
                        <tr>
                          <th className="mhf-th">#</th>
                          {sortedFields.map((field) => (
                            <th key={field.key} className="mhf-th">
                              {field.source_header || field.label || field.key}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.slice(0, 150).map((row, rIdx) => (
                          <tr key={rIdx} className={`mhf-tr ${rIdx % 2 !== 0 ? "is-alt" : ""}`}>
                            <td className="mhf-td mhf-td-num">{row._row_index ?? rIdx + 1}</td>
                            {sortedFields.map((field) => (
                              <td key={field.key} className="mhf-td" title={row[field.key] ?? ""}>
                                {row[field.key] ?? ""}
                              </td>
                            ))}
                          </tr>
                        ))}
                        {rows.length === 0 && (
                          <tr><td colSpan={sortedFields.length + 1} className="mhf-td-empty">
                            {searchQuery ? "No matches" : "No data in this section"}
                          </td></tr>
                        )}
                        {rows.length > 150 && (
                          <tr><td colSpan={sortedFields.length + 1} className="mhf-td-more">
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

      {error && <ErrorToast message={error} onDismiss={() => setError(null)} />}
      <style jsx>{pageStyles}</style>
    </div>
  );
}

/* ─── Page Styles ─────────────────────────────────────────────── */
const pageStyles = `
  .mhf-page {
    display: flex;
    flex-direction: column;
    min-height: 100dvh;
    background: var(--cream);
  }

  /* URL input screen */
  .mhf-center-wrap {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px 16px;
  }
  .mhf-url-card {
    width: 100%;
    max-width: 400px;
  }
  .mhf-url-title {
    font-family: var(--font-newsreader), Georgia, serif;
    font-weight: 400;
    font-size: 22px;
    color: var(--ink);
    margin: 0 0 6px;
    text-align: center;
  }
  .mhf-url-desc {
    font-family: var(--font-plex-mono), ui-monospace, monospace;
    font-size: 11px;
    color: var(--stone);
    text-align: center;
    margin: 0 0 20px;
    line-height: 1.5;
  }
  .mhf-url-input {
    width: 100%;
    font-family: var(--font-plex-mono), ui-monospace, monospace;
    font-size: 13px;
    color: var(--ink);
    background: var(--paper);
    border: 1px solid var(--rule);
    border-radius: 6px;
    padding: 11px 14px;
    outline: none;
    margin-bottom: 8px;
    transition: border-color 150ms;
  }
  .mhf-url-input:focus {
    border-color: var(--ink);
  }
  .mhf-url-input.has-error {
    border-color: var(--error);
  }
  .mhf-url-error {
    color: var(--error);
    font-family: var(--font-plex-mono), ui-monospace, monospace;
    font-size: 11px;
    margin: 0 0 8px;
  }
  .mhf-url-btn {
    width: 100%;
    font-family: var(--font-plex-mono), ui-monospace, monospace;
    font-size: 12px;
    font-weight: 500;
    color: var(--cream);
    background: var(--stone);
    border: none;
    border-radius: 6px;
    padding: 11px 0;
    cursor: not-allowed;
    opacity: 0.5;
    transition: background 150ms, opacity 150ms;
  }
  .mhf-url-btn.is-valid {
    background: var(--ink);
    cursor: pointer;
    opacity: 1;
  }

  /* Tab selection */
  .mhf-tab-title {
    font-family: var(--font-newsreader), Georgia, serif;
    font-weight: 400;
    font-size: 18px;
    color: var(--ink);
    margin: 0 0 16px;
    text-align: center;
  }
  .mhf-tab-list {
    max-width: 400px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .mhf-tab-btn {
    font-family: var(--font-plex-mono), ui-monospace, monospace;
    font-size: 13px;
    color: var(--ink);
    background: var(--paper);
    border: 1px solid var(--rule);
    border-radius: 6px;
    padding: 12px 16px;
    cursor: pointer;
    text-align: left;
    transition: border-color 150ms;
  }
  .mhf-tab-btn:hover {
    border-color: var(--ink);
  }

  /* Toolbar */
  .mhf-toolbar {
    border-bottom: 1px solid var(--rule);
    padding: 12px 16px;
    background: var(--cream);
    position: sticky;
    top: 52px;
    z-index: 30 !important;
    overflow: visible;
  }
  .mhf-toolbar-inner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 10px;
  }
  .mhf-info-title {
    font-family: var(--font-newsreader), Georgia, serif;
    font-weight: 400;
    font-size: 16px;
    color: var(--ink);
    margin: 0;
    line-height: 1.2;
  }
  .mhf-info-meta {
    font-family: var(--font-plex-mono), ui-monospace, monospace;
    font-size: 10px;
    color: var(--stone);
    margin: 2px 0 0;
  }

  /* Calendar button */
  .mhf-calendar-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    border: 1px solid var(--rule);
    background: transparent;
    color: var(--ink);
    cursor: pointer;
    transition: border-color 150ms, background 150ms;
  }
  .mhf-calendar-btn:hover,
  .mhf-calendar-btn.is-active {
    border-color: var(--ink);
    background: var(--paper);
  }

  /* Controls row */
  .mhf-controls {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .mhf-select {
    font-family: var(--font-plex-mono), ui-monospace, monospace;
    font-size: 11px;
    color: var(--ink);
    background: var(--paper);
    border: 1px solid var(--rule);
    border-radius: 6px;
    padding: 8px 10px;
    outline: none;
    flex: 1;
    min-width: 0;
    max-width: 280px;
    -webkit-appearance: menulist;
    appearance: menulist;
    cursor: pointer;
  }
  .mhf-search-wrap {
    position: relative;
    flex: 1;
    min-width: 120px;
    max-width: 240px;
    display: flex;
    align-items: center;
  }
  .mhf-search-icon {
    position: absolute;
    left: 9px;
    width: 13px;
    height: 13px;
    color: var(--stone);
    pointer-events: none;
  }
  .mhf-search-input {
    width: 100%;
    font-family: var(--font-plex-mono), ui-monospace, monospace;
    font-size: 11px;
    color: var(--ink);
    background: var(--paper);
    border: 1px solid var(--rule);
    border-radius: 6px;
    padding: 8px 10px 8px 28px;
    outline: none;
    transition: border-color 150ms;
  }
  .mhf-search-input:focus {
    border-color: var(--ink);
  }
  .mhf-search-clear {
    position: absolute;
    right: 6px;
    font-family: var(--font-plex-mono), ui-monospace, monospace;
    font-size: 9px;
    color: var(--clay);
    background: none;
    border: none;
    cursor: pointer;
    padding: 2px 4px;
  }

  /* Chips */
  .mhf-chips {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    margin-top: 8px;
  }
  .mhf-chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-family: var(--font-plex-mono), ui-monospace, monospace;
    font-size: 10px;
    background: var(--ink);
    color: var(--cream);
    border-radius: 14px;
    padding: 4px 10px 4px 12px;
  }
  .mhf-chip-x {
    background: none;
    border: none;
    color: var(--cream);
    cursor: pointer;
    font-size: 13px;
    padding: 0;
    line-height: 1;
    opacity: 0.7;
  }
  .mhf-chip-x:hover { opacity: 1; }

  /* Data area */
  .mhf-data {
    flex: 1;
    overflow-x: hidden;
    overflow-y: auto;
    padding: 14px 16px 24px;
    position: relative;
    z-index: 1;
  }
  .mhf-empty {
    text-align: center;
    padding: 60px 20px;
    color: var(--stone);
  }
  .mhf-empty-title {
    font-family: var(--font-plex-mono), ui-monospace, monospace;
    font-size: 12px;
    margin: 0 0 6px;
  }
  .mhf-empty-desc {
    font-family: var(--font-plex-mono), ui-monospace, monospace;
    font-size: 10px;
    margin: 0;
  }

  /* Section cards */
  .mhf-sections {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .mhf-section-card {
    border: 1px solid var(--rule);
    border-radius: 8px;
    overflow: hidden;
    background: var(--paper);
  }
  .mhf-section-bar {
    display: flex;
    align-items: center;
    padding: 10px 14px;
    background: var(--ink);
    color: var(--cream);
    gap: 8px;
  }
  .mhf-section-title {
    font-family: var(--font-plex-mono), ui-monospace, monospace;
    font-size: 11px;
    font-weight: 500;
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .mhf-section-count {
    font-family: var(--font-plex-mono), ui-monospace, monospace;
    font-size: 9px;
    opacity: 0.7;
    flex-shrink: 0;
  }
  .mhf-section-close {
    background: none;
    border: none;
    color: var(--cream);
    cursor: pointer;
    font-size: 15px;
    padding: 0 4px;
    opacity: 0.7;
    line-height: 1;
  }
  .mhf-section-close:hover { opacity: 1; }

  /* Table */
  .mhf-table-wrap {
    overflow-x: auto;
    max-height: 420px;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }
  .mhf-table {
    width: 100%;
    border-collapse: collapse;
    font-family: var(--font-plex-mono), ui-monospace, monospace;
    font-size: 11px;
  }
  .mhf-th {
    padding: 6px 10px;
    text-align: left;
    font-size: 9px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--stone);
    border-bottom: 1px solid var(--rule);
    white-space: nowrap;
    position: sticky;
    top: 0;
    background: var(--paper);
    font-weight: 500;
  }
  .mhf-tr {
    border-bottom: 1px solid var(--rule);
  }
  .mhf-tr.is-alt {
    background: rgba(0,0,0,0.015);
  }
  .mhf-td {
    padding: 5px 10px;
    color: var(--ink);
    max-width: 180px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .mhf-td-num {
    color: var(--stone);
    font-size: 9px;
  }
  .mhf-td-empty {
    padding: 24px;
    text-align: center;
    color: var(--stone);
    font-size: 11px;
  }
  .mhf-td-more {
    padding: 8px;
    text-align: center;
    color: var(--stone);
    font-size: 9px;
  }
`;
