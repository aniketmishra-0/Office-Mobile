"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useState } from "react";
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

const MAX_OPEN_SECTIONS = 2;

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

  // Which sections are open (by index)
  const [openSections, setOpenSections] = useState<number[]>([]);
  // Search query — only searches open sections
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
    setOpenSections([]); setSearchQuery("");
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
      setLoaded({
        worksheet_name: data.worksheet_name,
        fields: data.fields,
        sections: data.sections,
      });
      // Auto-open first section
      if (data.sections.length > 0) setOpenSections([0]);
    } catch (e: any) { setError(e.message ?? "Failed to load data"); }
    finally { setLoading(false); }
  }

  // Toggle section open/close with max 2 open rule
  const toggleSection = (idx: number) => {
    setOpenSections((prev) => {
      if (prev.includes(idx)) {
        // Close it
        return prev.filter((i) => i !== idx);
      } else {
        // Open it — if already 2 open, close the oldest one
        const next = [...prev, idx];
        if (next.length > MAX_OPEN_SECTIONS) {
          return next.slice(next.length - MAX_OPEN_SECTIONS);
        }
        return next;
      }
    });
  };

  // Filter rows in open sections based on search
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
              Sheets with multiple header sections? Each section shows as a collapsible block. Click to open, search within.
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

  // Step 3: Sections view
  const sortedFields = [...loaded.fields].sort((a, b) => a.order - b.order);

  return (
    <div className="flex flex-col min-h-screen" style={{ background: "var(--cream)" }}>
      <AppHeader title="Multi-Header Filtering" showBack onBack={() => { setLoaded(null); setOpenSections([]); setSearchQuery(""); if (sheetUrl) loadSheetFromUrl(sheetUrl); }} />

      {/* Top bar: info + search */}
      <div style={{ borderBottom: "1px solid var(--rule)", padding: "10px 16px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: "0 0 auto" }}>
            <h2 style={{ fontFamily: "var(--font-newsreader)", fontWeight: 400, fontSize: 15, color: "var(--ink)", margin: 0 }}>{loaded.worksheet_name}</h2>
            <p style={{ fontFamily: "var(--font-plex-mono)", fontSize: 10, color: "var(--stone)", margin: 0 }}>
              {loaded.sections.length} sections · {totalRows.toLocaleString()} total rows
            </p>
          </div>

          {/* Search — only searches open sections */}
          <div style={{ position: "relative", flex: 1, minWidth: 160, maxWidth: 300 }}>
            <svg style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", width: 13, height: 13, color: "var(--stone)", pointerEvents: "none" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search open sections..."
              style={{ width: "100%", fontFamily: "var(--font-plex-mono)", fontSize: 11, color: "var(--ink)", background: "var(--paper)", border: "1px solid var(--rule)", borderRadius: 4, padding: "7px 8px 7px 28px", outline: "none" }}
            />
          </div>

          {searchQuery && (
            <button onClick={() => setSearchQuery("")}
              style={{ fontFamily: "var(--font-plex-mono)", fontSize: 10, color: "var(--ember)", background: "none", border: "1px solid var(--ember)", borderRadius: 4, padding: "4px 8px", cursor: "pointer" }}>
              Clear search
            </button>
          )}

          <span style={{ fontFamily: "var(--font-plex-mono)", fontSize: 9, color: "var(--stone)" }}>
            Max {MAX_OPEN_SECTIONS} sections open at a time
          </span>
        </div>
      </div>

      {/* Sections accordion */}
      <div style={{ flex: 1, overflow: "auto", padding: "12px 16px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", flexDirection: "column", gap: 8 }}>
          {loaded.sections.map((section, idx) => {
            const isOpen = openSections.includes(idx);
            const filteredRows = isOpen ? getFilteredRows(section) : [];

            return (
              <div key={idx} style={{ border: "1px solid var(--rule)", borderRadius: 6, overflow: "hidden", background: "var(--paper)" }}>
                {/* Section header — clickable */}
                <button
                  onClick={() => toggleSection(idx)}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 10,
                    padding: "12px 16px", border: "none", cursor: "pointer", textAlign: "left",
                    background: isOpen ? "var(--ink)" : "var(--cream)",
                    color: isOpen ? "var(--paper)" : "var(--ink)",
                    transition: "all 0.2s",
                  }}
                >
                  <span style={{ fontSize: 14, transition: "transform 0.2s", transform: isOpen ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
                  <span style={{ fontFamily: "var(--font-plex-mono)", fontSize: 12, fontWeight: 500, flex: 1 }}>
                    {section.title}
                  </span>
                  <span style={{ fontFamily: "var(--font-plex-mono)", fontSize: 10, opacity: 0.7 }}>
                    {section.rows.length} rows
                  </span>
                </button>

                {/* Section content — table */}
                {isOpen && (
                  <div style={{ overflowX: "auto", maxHeight: 400, overflow: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--font-plex-mono)", fontSize: 10 }}>
                      <thead>
                        <tr>
                          <th style={{ padding: "6px 8px", textAlign: "left", fontSize: 9, color: "var(--stone)", borderBottom: "1px solid var(--rule)", whiteSpace: "nowrap", position: "sticky", top: 0, background: "var(--paper)" }}>#</th>
                          {sortedFields.map((field) => (
                            <th key={field.key} style={{ padding: "6px 8px", textAlign: "left", fontSize: 9, letterSpacing: "0.03em", textTransform: "uppercase", color: "var(--stone)", borderBottom: "1px solid var(--rule)", whiteSpace: "nowrap", position: "sticky", top: 0, background: "var(--paper)" }}>
                              {field.source_header || field.label || field.key}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRows.slice(0, 100).map((row, rIdx) => (
                          <tr key={rIdx} style={{ borderBottom: "1px solid var(--rule)", background: rIdx % 2 === 0 ? "transparent" : "rgba(0,0,0,0.02)" }}>
                            <td style={{ padding: "4px 8px", color: "var(--stone)", fontSize: 9 }}>{row._row_index ?? rIdx + 1}</td>
                            {sortedFields.map((field) => (
                              <td key={field.key} style={{ padding: "4px 8px", color: "var(--ink)", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={row[field.key] ?? ""}>
                                {row[field.key] ?? ""}
                              </td>
                            ))}
                          </tr>
                        ))}
                        {filteredRows.length === 0 && (
                          <tr><td colSpan={sortedFields.length + 1} style={{ padding: "20px", textAlign: "center", color: "var(--stone)", fontSize: 11 }}>
                            {searchQuery ? "No matches in this section" : "No data"}
                          </td></tr>
                        )}
                        {filteredRows.length > 100 && (
                          <tr><td colSpan={sortedFields.length + 1} style={{ padding: "8px", textAlign: "center", color: "var(--stone)", fontSize: 10 }}>
                            Showing 100 of {filteredRows.length} rows
                          </td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {error && <ErrorToast message={error} onDismiss={() => setError(null)} />}
    </div>
  );
}
