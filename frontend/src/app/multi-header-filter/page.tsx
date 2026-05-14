"use client";

import React, { Suspense, useEffect, useMemo, useState } from "react";
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

  // Handle dropdown selection
  const handleDropdownSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const idx = parseInt(e.target.value, 10);
    if (isNaN(idx)) return;
    setSelectedSections((prev) => {
      if (prev.includes(idx)) return prev; // already selected
      const next = [...prev, idx];
      if (next.length > MAX_OPEN) return next.slice(next.length - MAX_OPEN);
      return next;
    });
  };

  // Remove a selected section
  const removeSection = (idx: number) => {
    setSelectedSections((prev) => prev.filter((i) => i !== idx));
  };

  // Filter rows based on search
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
      <div className="flex flex-col min-h-screen" style={{ background: "var(--cream)" }}>
        <AppHeader title="Multi-Header Filtering" showBack onBack={() => router.push("/")} />
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ width: "100%", maxWidth: 440 }}>
            <h2 style={{ fontFamily: "var(--font-newsreader)", fontWeight: 400, fontSize: 22, color: "var(--ink)", marginBottom: 6, textAlign: "center" }}>Multi-Header Filtering</h2>
            <p style={{ fontFamily: "var(--font-plex-mono)", fontSize: 11, color: "var(--stone)", textAlign: "center", marginBottom: 20, lineHeight: 1.5 }}>
              Select up to 2 date sections to view and search within them.
            </p>
            <input type="url" value={formInput}
              onChange={(e) => { setFormInput(e.target.value); validateUrl(e.target.value); }}
              onKeyDown={(e) => e.key === "Enter" && handleLoadSheet()}
              placeholder="Paste Google Sheet URL..."
              style={{ width: "100%", fontFamily: "var(--font-plex-mono)", fontSize: 12, color: "var(--ink)", background: "var(--paper)", border: `1px solid ${urlError ? "var(--ember)" : "var(--rule)"}`, borderRadius: 4, padding: "10px 12px", outline: "none", marginBottom: 8 }}
            />
            {urlError && <p style={{ color: "var(--ember)", fontSize: 11, margin: "0 0 8px" }}>{urlError}</p>}
            <button onClick={handleLoadSheet} disabled={!urlValid || loading}
              style={{ width: "100%", fontFamily: "var(--font-plex-mono)", fontSize: 12, fontWeight: 500, color: "var(--paper)", background: urlValid ? "var(--ink)" : "var(--stone)", border: "none", borderRadius: 4, padding: "10px 0", cursor: urlValid ? "pointer" : "not-allowed", opacity: urlValid ? 1 : 0.5 }}>
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
      <div className="flex flex-col min-h-screen" style={{ background: "var(--cream)" }}>
        <AppHeader title="Multi-Header Filtering" showBack onBack={() => router.back()} />
        {loading && <LoadingOverlay message="Loading..." />}
        <div style={{ flex: 1, padding: 24 }}>
          <h3 style={{ fontFamily: "var(--font-newsreader)", fontWeight: 400, fontSize: 18, color: "var(--ink)", marginBottom: 16, textAlign: "center" }}>Select a tab</h3>
          <div style={{ maxWidth: 400, margin: "0 auto", display: "flex", flexDirection: "column", gap: 8 }}>
            {availableTabs.map((tab, i) => (
              <button key={i} onClick={() => selectTab(tab)}
                style={{ fontFamily: "var(--font-plex-mono)", fontSize: 13, color: "var(--ink)", background: "var(--paper)", border: "1px solid var(--rule)", borderRadius: 4, padding: "12px 16px", cursor: "pointer", textAlign: "left" }}>
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
      <div className="flex flex-col min-h-screen" style={{ background: "var(--cream)" }}>
        <AppHeader title="Multi-Header Filtering" showBack onBack={() => router.back()} />
        {loading && <LoadingOverlay message="Loading data..." />}
        {error && <ErrorToast message={error} onDismiss={() => setError(null)} />}
      </div>
    );
  }

  // Step 3: Main view — dropdown + search at top, selected sections data below
  const sortedFields = [...loaded.fields].sort((a, b) => a.order - b.order);

  return (
    <div className="flex flex-col min-h-screen" style={{ background: "var(--cream)" }}>
      <AppHeader title="Multi-Header Filtering" showBack onBack={() => { setLoaded(null); setSelectedSections([]); setSearchQuery(""); if (sheetUrl) loadSheetFromUrl(sheetUrl); }} />

      {/* Top bar: info + dropdown + search */}
      <div style={{ borderBottom: "1px solid var(--rule)", padding: "10px 16px", position: "sticky", top: 0, background: "var(--cream)", zIndex: 10 }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {/* Info */}
          <div style={{ flex: "0 0 auto" }}>
            <h2 style={{ fontFamily: "var(--font-newsreader)", fontWeight: 400, fontSize: 14, color: "var(--ink)", margin: 0 }}>{loaded.worksheet_name}</h2>
            <p style={{ fontFamily: "var(--font-plex-mono)", fontSize: 9, color: "var(--stone)", margin: 0 }}>
              {loaded.sections.length} sections · {totalRows.toLocaleString()} rows
            </p>
          </div>

          {/* Dropdown to select sections */}
          <select
            onChange={handleDropdownSelect}
            value=""
            style={{ fontFamily: "var(--font-plex-mono)", fontSize: 11, color: "var(--ink)", background: "var(--paper)", border: "1px solid var(--rule)", borderRadius: 4, padding: "6px 8px", outline: "none", maxWidth: 260 }}
          >
            <option value="">+ Select date section (max {MAX_OPEN})...</option>
            {loaded.sections.map((section, idx) => (
              <option key={idx} value={idx} disabled={selectedSections.includes(idx)}>
                {section.title} ({section.rows.length} rows)
              </option>
            ))}
          </select>

          {/* Search */}
          <div style={{ position: "relative", flex: 1, minWidth: 140, maxWidth: 260 }}>
            <svg style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", width: 12, height: 12, color: "var(--stone)", pointerEvents: "none" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search selected sections..."
              style={{ width: "100%", fontFamily: "var(--font-plex-mono)", fontSize: 11, color: "var(--ink)", background: "var(--paper)", border: "1px solid var(--rule)", borderRadius: 4, padding: "6px 8px 6px 26px", outline: "none" }}
            />
          </div>

          {searchQuery && (
            <button onClick={() => setSearchQuery("")}
              style={{ fontFamily: "var(--font-plex-mono)", fontSize: 9, color: "var(--ember)", background: "none", border: "1px solid var(--ember)", borderRadius: 3, padding: "3px 6px", cursor: "pointer" }}>
              Clear
            </button>
          )}
        </div>

        {/* Selected section chips */}
        {selectedSections.length > 0 && (
          <div style={{ maxWidth: 1200, margin: "6px auto 0", display: "flex", gap: 6, flexWrap: "wrap" }}>
            {selectedSections.map((idx) => (
              <span key={idx} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontFamily: "var(--font-plex-mono)", fontSize: 10, background: "var(--ink)", color: "var(--paper)", borderRadius: 12, padding: "3px 8px 3px 10px" }}>
                {loaded.sections[idx]?.title ?? `Section ${idx}`}
                <button onClick={() => removeSection(idx)}
                  style={{ background: "none", border: "none", color: "var(--paper)", cursor: "pointer", fontSize: 12, padding: 0, lineHeight: 1, opacity: 0.7 }}
                  aria-label="Remove">×</button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Selected sections data — shown directly at top, no scrolling to find */}
      <div style={{ flex: 1, overflow: "auto", padding: "12px 16px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          {selectedSections.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--stone)" }}>
              <p style={{ fontFamily: "var(--font-plex-mono)", fontSize: 12, marginBottom: 8 }}>No section selected</p>
              <p style={{ fontFamily: "var(--font-plex-mono)", fontSize: 10 }}>Use the dropdown above to select a date section</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {selectedSections.map((idx) => {
                const section = loaded.sections[idx];
                if (!section) return null;
                const rows = getFilteredRows(section);

                return (
                  <div key={idx} style={{ border: "1px solid var(--rule)", borderRadius: 6, overflow: "hidden", background: "var(--paper)" }}>
                    {/* Section title bar */}
                    <div style={{ display: "flex", alignItems: "center", padding: "10px 14px", background: "var(--ink)", color: "var(--paper)", gap: 8 }}>
                      <span style={{ fontFamily: "var(--font-plex-mono)", fontSize: 11, fontWeight: 500, flex: 1 }}>{section.title}</span>
                      <span style={{ fontFamily: "var(--font-plex-mono)", fontSize: 9, opacity: 0.7 }}>
                        {searchQuery ? `${rows.length} matches` : `${section.rows.length} rows`}
                      </span>
                      <button onClick={() => removeSection(idx)}
                        style={{ background: "none", border: "none", color: "var(--paper)", cursor: "pointer", fontSize: 14, padding: "0 4px", opacity: 0.7 }}
                        aria-label="Close section">×</button>
                    </div>

                    {/* Table */}
                    <div style={{ overflowX: "auto", maxHeight: 450, overflow: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--font-plex-mono)", fontSize: 10 }}>
                        <thead>
                          <tr>
                            <th style={{ padding: "5px 8px", textAlign: "left", fontSize: 9, color: "var(--stone)", borderBottom: "1px solid var(--rule)", whiteSpace: "nowrap", position: "sticky", top: 0, background: "var(--paper)" }}>#</th>
                            {sortedFields.map((field) => (
                              <th key={field.key} style={{ padding: "5px 8px", textAlign: "left", fontSize: 9, letterSpacing: "0.03em", textTransform: "uppercase", color: "var(--stone)", borderBottom: "1px solid var(--rule)", whiteSpace: "nowrap", position: "sticky", top: 0, background: "var(--paper)" }}>
                                {field.source_header || field.label || field.key}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {rows.slice(0, 150).map((row, rIdx) => (
                            <tr key={rIdx} style={{ borderBottom: "1px solid var(--rule)", background: rIdx % 2 === 0 ? "transparent" : "rgba(0,0,0,0.02)" }}>
                              <td style={{ padding: "4px 8px", color: "var(--stone)", fontSize: 9 }}>{row._row_index ?? rIdx + 1}</td>
                              {sortedFields.map((field) => (
                                <td key={field.key} style={{ padding: "4px 8px", color: "var(--ink)", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={row[field.key] ?? ""}>
                                  {row[field.key] ?? ""}
                                </td>
                              ))}
                            </tr>
                          ))}
                          {rows.length === 0 && (
                            <tr><td colSpan={sortedFields.length + 1} style={{ padding: "20px", textAlign: "center", color: "var(--stone)", fontSize: 11 }}>
                              {searchQuery ? "No matches" : "No data in this section"}
                            </td></tr>
                          )}
                          {rows.length > 150 && (
                            <tr><td colSpan={sortedFields.length + 1} style={{ padding: "6px", textAlign: "center", color: "var(--stone)", fontSize: 9 }}>
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

      {error && <ErrorToast message={error} onDismiss={() => setError(null)} />}
    </div>
  );
}
