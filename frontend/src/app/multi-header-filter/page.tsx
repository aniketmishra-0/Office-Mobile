"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import ErrorToast from "@/components/ErrorToast";
import LoadingOverlay from "@/components/LoadingOverlay";
import type { FieldSchema } from "@/types/field";
import {
  getFormSuggestions,
  getSheetHistory,
  lookupFormsBySheet,
} from "@/lib/api";

interface TabOption {
  id: string | null;
  worksheet_name: string | null;
  form_title: string;
  fields: FieldSchema[];
  has_form: boolean;
}

interface LoadedTab {
  worksheet_name: string;
  fields: FieldSchema[];
  rows: Record<string, string>[];
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
  const [loaded, setLoaded] = useState<LoadedTab | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Simple global search
  const [searchQuery, setSearchQuery] = useState("");
  // Per-column filters
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});

  // Pagination
  const ROWS_PER_PAGE = 100;
  const [visibleCount, setVisibleCount] = useState(ROWS_PER_PAGE);

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
    setColumnFilters({}); setSearchQuery("");
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
      if (tab.has_form && tab.id) {
        const data = await getFormSuggestions(tab.id);
        setLoaded({ worksheet_name: tab.worksheet_name || tab.form_title, fields: tab.fields, rows: data.rows ?? [] });
      } else {
        const data = await getSheetHistory(sheet_url ?? sheetUrl, tab.worksheet_name);
        setLoaded({ worksheet_name: data.worksheet_name, fields: data.fields, rows: data.rows });
      }
    } catch (e: any) { setError(e.message ?? "Failed to load entries"); }
    finally { setLoading(false); }
  }

  // Filter rows: global search + per-column filters (AND logic)
  const filteredRows = useMemo(() => {
    if (!loaded || !loaded.rows.length) return [];
    let rows = loaded.rows;

    // Per-column filters
    const active = Object.entries(columnFilters).filter(([, v]) => v.trim());
    if (active.length > 0) {
      rows = rows.filter((row) =>
        active.every(([key, val]) => (row[key] ?? "").toLowerCase().includes(val.trim().toLowerCase()))
      );
    }

    // Global search
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      rows = rows.filter((row) =>
        loaded.fields.some((f) => (row[f.key] ?? "").toLowerCase().includes(q))
      );
    }

    return rows;
  }, [loaded, columnFilters, searchQuery]);

  const visibleRows = useMemo(() => filteredRows.slice(0, visibleCount), [filteredRows, visibleCount]);

  useEffect(() => { setVisibleCount(ROWS_PER_PAGE); }, [columnFilters, searchQuery, loaded]);

  const clearAll = () => { setColumnFilters({}); setSearchQuery(""); };

  const activeFilterCount = Object.values(columnFilters).filter((v) => v.trim()).length + (searchQuery.trim() ? 1 : 0);

  // --- RENDER ---

  // Step 1: URL input
  if (!sheetParam && !loaded && !availableTabs) {
    return (
      <div className="flex flex-col min-h-screen" style={{ background: "var(--cream)" }}>
        <AppHeader title="Multi-Header Filtering" showBack onBack={() => router.push("/")} />
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ width: "100%", maxWidth: 440 }}>
            <h2 style={{ fontFamily: "var(--font-newsreader), Georgia, serif", fontWeight: 400, fontSize: 22, color: "var(--ink)", marginBottom: 6, textAlign: "center" }}>
              Multi-Header Filtering
            </h2>
            <p style={{ fontFamily: "var(--font-plex-mono), ui-monospace, monospace", fontSize: 11, color: "var(--stone)", textAlign: "center", marginBottom: 20, lineHeight: 1.5 }}>
              Load a sheet, filter any column, search by date or name.
            </p>
            <input
              type="url"
              value={formInput}
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

  // Step 3: Loading state
  if (!loaded) {
    return (
      <div className="flex flex-col min-h-screen" style={{ background: "var(--cream)" }}>
        <AppHeader title="Multi-Header Filtering" showBack onBack={() => router.back()} />
        {loading && <LoadingOverlay message="Loading data..." />}
        {error && <ErrorToast message={error} onDismiss={() => setError(null)} />}
      </div>
    );
  }

  // Step 4: Data view
  const sortedFields = [...loaded.fields].sort((a, b) => a.order - b.order);

  return (
    <div className="flex flex-col min-h-screen" style={{ background: "var(--cream)" }}>
      <AppHeader title="Multi-Header Filtering" showBack onBack={() => { setLoaded(null); setColumnFilters({}); setSearchQuery(""); if (sheetUrl) loadSheetFromUrl(sheetUrl); }} />
      {loading && <LoadingOverlay message="Loading..." />}

      {/* Top bar */}
      <div style={{ borderBottom: "1px solid var(--rule)", padding: "10px 16px" }}>
        <div style={{ maxWidth: 1400, margin: "0 auto", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          {/* Info */}
          <div style={{ flex: "0 0 auto" }}>
            <h2 style={{ fontFamily: "var(--font-newsreader)", fontWeight: 400, fontSize: 15, color: "var(--ink)", margin: 0 }}>{loaded.worksheet_name}</h2>
            <p style={{ fontFamily: "var(--font-plex-mono)", fontSize: 10, color: "var(--stone)", margin: 0 }}>
              {filteredRows.length === loaded.rows.length
                ? `${loaded.rows.length.toLocaleString()} rows`
                : `${filteredRows.length.toLocaleString()} of ${loaded.rows.length.toLocaleString()} rows`}
            </p>
          </div>

          {/* Search */}
          <div style={{ position: "relative", flex: 1, minWidth: 160, maxWidth: 320 }}>
            <svg style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", width: 13, height: 13, color: "var(--stone)", pointerEvents: "none" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search all columns..."
              style={{ width: "100%", fontFamily: "var(--font-plex-mono)", fontSize: 11, color: "var(--ink)", background: "var(--paper)", border: "1px solid var(--rule)", borderRadius: 4, padding: "7px 8px 7px 28px", outline: "none" }}
            />
          </div>

          {/* Clear */}
          {activeFilterCount > 0 && (
            <button onClick={clearAll}
              style={{ fontFamily: "var(--font-plex-mono)", fontSize: 10, color: "var(--ember)", background: "none", border: "1px solid var(--ember)", borderRadius: 4, padding: "4px 8px", cursor: "pointer" }}>
              Clear filters ({activeFilterCount})
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: "auto", padding: "0 8px 16px" }}>
        <div style={{ maxWidth: 1400, margin: "0 auto", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--font-plex-mono)", fontSize: 11, marginTop: 8 }}>
            <thead>
              {/* Column headers */}
              <tr>
                <th style={{ padding: "6px 8px", textAlign: "left", fontSize: 9, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--stone)", borderBottom: "1px solid var(--rule)", whiteSpace: "nowrap", position: "sticky", top: 0, background: "var(--cream)", zIndex: 2 }}>#</th>
                {sortedFields.map((field) => (
                  <th key={field.key} style={{ padding: "6px 8px", textAlign: "left", fontSize: 9, letterSpacing: "0.04em", textTransform: "uppercase", color: columnFilters[field.key] ? "var(--ink)" : "var(--stone)", borderBottom: "1px solid var(--rule)", whiteSpace: "nowrap", position: "sticky", top: 0, background: "var(--cream)", zIndex: 2 }}>
                    {field.source_header || field.label || field.key}
                    {columnFilters[field.key] && <span style={{ color: "var(--ember)", marginLeft: 3 }}>●</span>}
                  </th>
                ))}
              </tr>
              {/* Filter row */}
              <tr>
                <td style={{ padding: "3px 8px", borderBottom: "2px solid var(--rule)", position: "sticky", top: 28, background: "var(--cream)", zIndex: 1 }} />
                {sortedFields.map((field) => (
                  <td key={`f-${field.key}`} style={{ padding: "3px 4px", borderBottom: "2px solid var(--rule)", position: "sticky", top: 28, background: "var(--cream)", zIndex: 1 }}>
                    <input
                      type="text"
                      value={columnFilters[field.key] ?? ""}
                      onChange={(e) => setColumnFilters((prev) => ({ ...prev, [field.key]: e.target.value }))}
                      placeholder="Filter"
                      style={{ width: "100%", minWidth: 50, fontFamily: "var(--font-plex-mono)", fontSize: 9, color: "var(--ink)", background: "var(--paper)", border: `1px solid ${columnFilters[field.key] ? "var(--ember)" : "var(--rule)"}`, borderRadius: 3, padding: "3px 5px", outline: "none" }}
                    />
                  </td>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row, idx) => (
                <tr key={idx} style={{ borderBottom: "1px solid var(--rule)", background: idx % 2 === 0 ? "transparent" : "rgba(0,0,0,0.015)" }}>
                  <td style={{ padding: "5px 8px", color: "var(--stone)", fontSize: 9, whiteSpace: "nowrap" }}>{row._row_index ?? idx + 1}</td>
                  {sortedFields.map((field) => (
                    <td key={field.key} style={{ padding: "5px 8px", color: "var(--ink)", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={row[field.key] ?? ""}>
                      {row[field.key] ?? ""}
                    </td>
                  ))}
                </tr>
              ))}
              {visibleRows.length === 0 && (
                <tr>
                  <td colSpan={sortedFields.length + 1} style={{ padding: "40px 16px", textAlign: "center", color: "var(--stone)", fontSize: 12 }}>
                    {activeFilterCount > 0 ? "No rows match filters" : "No data found"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Load more */}
          {visibleCount < filteredRows.length && (
            <div style={{ textAlign: "center", padding: "12px 0" }}>
              <button onClick={() => setVisibleCount((c) => c + ROWS_PER_PAGE)}
                style={{ fontFamily: "var(--font-plex-mono)", fontSize: 11, color: "var(--ink)", background: "var(--paper)", border: "1px solid var(--rule)", borderRadius: 4, padding: "6px 16px", cursor: "pointer" }}>
                Show more ({(filteredRows.length - visibleCount).toLocaleString()} remaining)
              </button>
            </div>
          )}
        </div>
      </div>

      {error && <ErrorToast message={error} onDismiss={() => setError(null)} />}
    </div>
  );
}
