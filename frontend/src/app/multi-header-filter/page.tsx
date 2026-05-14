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

  // Per-column filters: { fieldKey: filterValue }
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [activeFilterField, setActiveFilterField] = useState<string | null>(null);

  // Search mode: "column" = filter specific column, "row" = search across all columns
  // Default is "row" (toggle OFF = row-wise)
  const [searchMode, setSearchMode] = useState<"column" | "row">("row");
  // Date search value
  const [dateSearch, setDateSearch] = useState("");
  // Global row-wise search
  const [globalSearch, setGlobalSearch] = useState("");
  // Selected column for column-wise date/text search
  const [searchColumn, setSearchColumn] = useState<string | "">("");
  // Selected date column (from date header chips)
  const [selectedDateColumn, setSelectedDateColumn] = useState<string | null>(null);

  // Pagination
  const ROWS_PER_PAGE = 200;
  const [visibleCount, setVisibleCount] = useState(ROWS_PER_PAGE);

  useEffect(() => {
    if (sheetParam) {
      loadSheetFromUrl(sheetParam);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetParam]);

  function validateUrl(value: string): boolean {
    if (!value.trim()) {
      setUrlError("");
      setUrlValid(false);
      return false;
    }
    const isValid =
      value.includes("docs.google.com/spreadsheets") ||
      /^[a-zA-Z0-9-_]{20,}$/.test(value.trim());
    setUrlValid(isValid);
    setUrlError(isValid ? "" : "This doesn't look like a Google Sheet URL");
    return isValid;
  }

  const handleUrlChange = useCallback((value: string) => {
    setFormInput(value);
    setError(null);
    setUrlError("");
    if (value.trim()) {
      const isValid =
        value.includes("docs.google.com/spreadsheets") ||
        /^[a-zA-Z0-9-_]{20,}$/.test(value.trim());
      setUrlValid(isValid);
    } else {
      setUrlValid(false);
    }
  }, []);

  async function handleLoadSheet() {
    if (!validateUrl(formInput)) return;
    const trimmed = formInput.trim();
    router.push(`/multi-header-filter?sheet=${encodeURIComponent(trimmed)}`);
  }

  async function loadSheetFromUrl(url: string) {
    setLoading(true);
    setError(null);
    setAvailableTabs(null);
    setLoaded(null);
    setColumnFilters({});
    setActiveFilterField(null);

    try {
      const result = await lookupFormsBySheet(url);
      setSheetUrl(url);

      const tabs: TabOption[] = result.items.map((item) => ({
        id: item.id,
        worksheet_name: item.worksheet_name,
        form_title: item.form_title,
        fields: item.fields,
        has_form: item.has_form,
      }));

      if (!tabs.length) {
        setError("No tabs found in this sheet");
        return;
      }

      if (tabs.length === 1) {
        await selectTab(tabs[0], url);
      } else {
        setAvailableTabs(tabs);
      }
    } catch (e: any) {
      setError(e.message ?? "Failed to load sheet");
    } finally {
      setLoading(false);
    }
  }

  async function selectTab(tab: TabOption, sheet_url?: string) {
    setAvailableTabs(null);
    setLoading(true);
    setError(null);

    try {
      if (tab.has_form && tab.id) {
        const data = await getFormSuggestions(tab.id);
        const rows = data.rows ?? [];
        console.log("[MultiHeaderFilter] Loaded via form suggestions:", rows.length, "rows");
        setLoaded({
          worksheet_name: tab.worksheet_name || tab.form_title,
          fields: tab.fields,
          rows,
        });
      } else {
        const url = sheet_url ?? sheetUrl;
        const data = await getSheetHistory(url, tab.worksheet_name);
        console.log("[MultiHeaderFilter] Loaded via sheet history:", data.rows?.length ?? 0, "rows,", data.fields?.length ?? 0, "fields");
        setLoaded({
          worksheet_name: data.worksheet_name,
          fields: data.fields,
          rows: data.rows,
        });
      }
    } catch (e: any) {
      console.error("[MultiHeaderFilter] Error loading tab:", e);
      setError(e.message ?? "Failed to load entries");
    } finally {
      setLoading(false);
    }
  }

  // Detect date-like columns from headers
  // Matches patterns like "Mon, May 12, 2026", "Tue, May 13, 2026", "12 May 2026", "2026-05-12", "May 12"
  const dateColumns = useMemo(() => {
    if (!loaded) return [];
    const datePatterns = [
      /\b(?:mon|tue|wed|thu|fri|sat|sun)\w*[,.]?\s+\w+\s+\d{1,2}/i, // "Mon, May 12" or "Monday May 12"
      /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{1,2}/i, // "May 12" or "May 12, 2026"
      /\b\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*/i, // "12 May" or "12 May 2026"
      /\b\d{4}[-/]\d{1,2}[-/]\d{1,2}\b/, // "2026-05-12"
      /\b\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\b/, // "05/12/2026"
    ];

    return loaded.fields.filter((field) => {
      const header = (field.source_header || field.label || "").trim();
      return datePatterns.some((pattern) => pattern.test(header));
    });
  }, [loaded]);

  // Apply all column filters + search mode + date column filter
  // In column-wise mode, rows where the searched column is blank go to a separate list
  const { filledRows, blankRows } = useMemo(() => {
    if (!loaded || !loaded.rows.length) return { filledRows: [], blankRows: [] };

    let rows = loaded.rows;

    // Apply per-column filters first
    const activeFilters = Object.entries(columnFilters).filter(
      ([, val]) => val.trim() !== ""
    );
    if (activeFilters.length > 0) {
      rows = rows.filter((row) =>
        activeFilters.every(([key, filterVal]) => {
          const cellValue = (row[key] ?? "").toLowerCase();
          return cellValue.includes(filterVal.trim().toLowerCase());
        })
      );
    }

    // Apply date column filter (if a date column chip is selected)
    if (selectedDateColumn) {
      const withData: Record<string, string>[] = [];
      const withoutData: Record<string, string>[] = [];

      for (const row of rows) {
        const cellValue = (row[selectedDateColumn] ?? "").trim();
        if (cellValue) {
          withData.push(row);
        } else {
          withoutData.push(row);
        }
      }

      // If there's also a text search active, apply it on top
      const searchVal = (searchMode === "column" ? dateSearch : globalSearch).trim().toLowerCase();
      if (searchVal) {
        if (searchMode === "row") {
          const matched = withData.filter((row) =>
            loaded.fields.some((f) =>
              (row[f.key] ?? "").toLowerCase().includes(searchVal)
            )
          );
          return { filledRows: matched, blankRows: withoutData };
        }
      }

      return { filledRows: withData, blankRows: withoutData };
    }

    // Apply search based on mode (when no date column is selected)
    const searchVal = (searchMode === "column" ? dateSearch : globalSearch).trim().toLowerCase();
    if (!searchVal) return { filledRows: rows, blankRows: [] };

    if (searchMode === "column") {
      // Column-wise: separate rows into filled (matching) and blank (empty in that column)
      if (!searchColumn) return { filledRows: rows, blankRows: [] };

      const matched: Record<string, string>[] = [];
      const blank: Record<string, string>[] = [];

      for (const row of rows) {
        const cellValue = (row[searchColumn] ?? "").trim();
        if (!cellValue) {
          blank.push(row);
        } else if (cellValue.toLowerCase().includes(searchVal)) {
          matched.push(row);
        }
      }

      return { filledRows: matched, blankRows: blank };
    } else {
      // Row-wise: search across ALL columns, no blank separation
      const matched = rows.filter((row) =>
        loaded.fields.some((f) =>
          (row[f.key] ?? "").toLowerCase().includes(searchVal)
        )
      );
      return { filledRows: matched, blankRows: [] };
    }
  }, [loaded, columnFilters, searchMode, dateSearch, globalSearch, searchColumn, selectedDateColumn]);

  // Combined for total count
  const filteredRows = filledRows;

  const visibleRows = useMemo(
    () => filledRows.slice(0, visibleCount),
    [filledRows, visibleCount]
  );

  const visibleBlankRows = useMemo(
    () => blankRows.slice(0, Math.max(0, visibleCount - filledRows.length)),
    [blankRows, filledRows.length, visibleCount]
  );

  const totalDisplayRows = filledRows.length + blankRows.length;

  useEffect(() => {
    setVisibleCount(ROWS_PER_PAGE);
  }, [columnFilters, loaded, dateSearch, globalSearch, searchColumn, searchMode, selectedDateColumn]);

  const handleReset = useCallback(() => {
    router.back();
  }, [router]);

  const handleBackToTabs = useCallback(() => {
    setLoaded(null);
    setColumnFilters({});
    setActiveFilterField(null);
    setDateSearch("");
    setGlobalSearch("");
    setSearchColumn("");
    setSelectedDateColumn(null);
    if (sheetUrl && !availableTabs) {
      loadSheetFromUrl(sheetUrl);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetUrl, availableTabs]);

  const clearAllFilters = () => {
    setColumnFilters({});
    setActiveFilterField(null);
    setDateSearch("");
    setGlobalSearch("");
    setSearchColumn("");
    setSelectedDateColumn(null);
  };

  const activeFilterCount = Object.values(columnFilters).filter(
    (v) => v.trim() !== ""
  ).length;

  // --- RENDER ---

  // Step 1: URL input
  if (!sheetParam && !loaded && !availableTabs) {
    return (
      <div className="flex flex-col min-h-screen" style={{ background: "var(--cream)" }}>
        <AppHeader title="Multi-Header Filtering" showBack onBack={() => router.push("/")} />
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ width: "100%", maxWidth: 480 }}>
            <h2 style={{
              fontFamily: "var(--font-newsreader), Georgia, serif",
              fontWeight: 400,
              fontSize: 22,
              color: "var(--ink)",
              marginBottom: 8,
              textAlign: "center",
            }}>
              Multi-Header Filtering
            </h2>
            <p style={{
              fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
              fontSize: 11,
              color: "var(--stone)",
              textAlign: "center",
              marginBottom: 24,
              lineHeight: 1.5,
            }}>
              Filter data from sheets with multiple header sections.
              Mid-sheet headers are automatically detected and skipped.
            </p>

            <label style={{
              fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
              fontSize: 10,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "var(--stone)",
              marginBottom: 6,
              display: "block",
            }}>
              Google Sheet URL
            </label>
            <input
              type="url"
              value={formInput}
              onChange={(e) => handleUrlChange(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLoadSheet()}
              placeholder="https://docs.google.com/spreadsheets/d/..."
              style={{
                width: "100%",
                fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                fontSize: 13,
                color: "var(--ink)",
                background: "var(--paper)",
                border: `1px solid ${urlError ? "var(--ember)" : "var(--rule)"}`,
                borderRadius: 4,
                padding: "10px 12px",
                outline: "none",
                marginBottom: 8,
              }}
            />
            {urlError && (
              <p style={{ color: "var(--ember)", fontSize: 11, margin: "0 0 8px" }}>{urlError}</p>
            )}
            <button
              onClick={handleLoadSheet}
              disabled={!urlValid || loading}
              style={{
                width: "100%",
                fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                fontSize: 12,
                fontWeight: 500,
                color: "var(--paper)",
                background: urlValid ? "var(--ink)" : "var(--stone)",
                border: "none",
                borderRadius: 4,
                padding: "10px 0",
                cursor: urlValid ? "pointer" : "not-allowed",
                opacity: urlValid ? 1 : 0.5,
              }}
            >
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
        <AppHeader title="Multi-Header Filtering" showBack onBack={handleReset} />
        {loading && <LoadingOverlay message="Loading..." />}
        <div style={{ flex: 1, padding: 24 }}>
          <h3 style={{
            fontFamily: "var(--font-newsreader), Georgia, serif",
            fontWeight: 400,
            fontSize: 18,
            color: "var(--ink)",
            marginBottom: 16,
            textAlign: "center",
          }}>
            Select a tab
          </h3>
          <div style={{ maxWidth: 400, margin: "0 auto", display: "flex", flexDirection: "column", gap: 8 }}>
            {availableTabs.map((tab, i) => (
              <button
                key={i}
                onClick={() => selectTab(tab)}
                style={{
                  fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                  fontSize: 13,
                  color: "var(--ink)",
                  background: "var(--paper)",
                  border: "1px solid var(--rule)",
                  borderRadius: 4,
                  padding: "12px 16px",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                {tab.worksheet_name || tab.form_title}
              </button>
            ))}
          </div>
        </div>
        {error && <ErrorToast message={error} onDismiss={() => setError(null)} />}
      </div>
    );
  }

  // Step 3: Data view with per-column filters
  if (!loaded) {
    return (
      <div className="flex flex-col min-h-screen" style={{ background: "var(--cream)" }}>
        <AppHeader title="Multi-Header Filtering" showBack onBack={handleReset} />
        {loading && <LoadingOverlay message="Loading sheet data..." />}
        {error && <ErrorToast message={error} onDismiss={() => setError(null)} />}
      </div>
    );
  }

  const sortedFields = [...loaded.fields].sort((a, b) => a.order - b.order);

  return (
    <div className="flex flex-col min-h-screen" style={{ background: "var(--cream)" }}>
      <AppHeader title="Multi-Header Filtering" showBack onBack={handleBackToTabs} />
      {loading && <LoadingOverlay message="Loading entries..." />}

      {/* Top bar: sheet info + filter summary */}
      <div style={{ borderBottom: "1px solid var(--rule)", padding: "12px 16px" }}>
        <div style={{ maxWidth: 1400, margin: "0 auto", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: "0 0 auto" }}>
            <div>
              <h2 style={{
                fontFamily: "var(--font-newsreader), Georgia, serif",
                fontWeight: 400,
                fontSize: 16,
                color: "var(--ink)",
                margin: 0,
              }}>
                {loaded.worksheet_name}
              </h2>
              <p style={{
                fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                fontWeight: 300,
                fontSize: 10,
                letterSpacing: "0.04em",
                color: "var(--stone)",
                margin: 0,
              }}>
                {filteredRows.length.toLocaleString()} of {loaded.rows.length.toLocaleString()} rows
                {activeFilterCount > 0 && ` · ${activeFilterCount} filter${activeFilterCount > 1 ? "s" : ""} active`}
                {blankRows.length > 0 && ` · ${blankRows.length} blank`}
              </p>
            </div>
          </div>

          {/* Clear all filters button */}
          {(activeFilterCount > 0 || selectedDateColumn) && (
            <button
              onClick={clearAllFilters}
              style={{
                fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                fontSize: 11,
                color: "var(--ember)",
                background: "none",
                border: "1px solid var(--ember)",
                borderRadius: 4,
                padding: "4px 10px",
                cursor: "pointer",
              }}
            >
              Clear all filters
            </button>
          )}
        </div>
      </div>

      {/* Date column chips — quick filter by date */}
      {dateColumns.length > 0 && (
        <div style={{ borderBottom: "1px solid var(--rule)", padding: "8px 16px", background: "rgba(0,0,0,0.02)" }}>
          <div style={{ maxWidth: 1400, margin: "0 auto" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span style={{
                fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                fontSize: 9,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "var(--stone)",
                flexShrink: 0,
              }}>
                📅 Filter by Date:
              </span>
              {selectedDateColumn && (
                <button
                  onClick={() => setSelectedDateColumn(null)}
                  style={{
                    fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                    fontSize: 9,
                    color: "var(--ember)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: 0,
                    textDecoration: "underline",
                  }}
                >
                  Clear date filter
                </button>
              )}
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {dateColumns.map((field) => {
                const isSelected = selectedDateColumn === field.key;
                const header = field.source_header || field.label || field.key;
                // Count rows with data in this date column
                const dataCount = loaded.rows.filter(
                  (row) => (row[field.key] ?? "").trim() !== ""
                ).length;
                return (
                  <button
                    key={field.key}
                    onClick={() =>
                      setSelectedDateColumn(isSelected ? null : field.key)
                    }
                    style={{
                      fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                      fontSize: 10,
                      color: isSelected ? "var(--paper)" : "var(--ink)",
                      background: isSelected ? "var(--ink)" : "var(--paper)",
                      border: `1px solid ${isSelected ? "var(--ink)" : "var(--rule)"}`,
                      borderRadius: 12,
                      padding: "5px 10px",
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                      transition: "all 0.15s",
                    }}
                  >
                    {header}
                    {dataCount > 0 && (
                      <span style={{
                        marginLeft: 4,
                        fontSize: 9,
                        opacity: 0.7,
                      }}>
                        ({dataCount})
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Search bar with Column/Row toggle */}
      <div style={{ borderBottom: "1px solid var(--rule)", padding: "10px 16px", background: "var(--paper)" }}>
        <div style={{ maxWidth: 1400, margin: "0 auto" }}>
          {/* Quick Filter: text columns with unique values as chips */}
          {(() => {
            // Detect text columns (non-date, non-numeric) that have limited unique values
            const textFilterColumns = sortedFields.filter((field) => {
              // Skip date columns
              if (dateColumns.some((dc) => dc.key === field.key)) return false;
              // Get unique non-empty values
              const values = new Set(
                loaded.rows
                  .map((row) => (row[field.key] ?? "").trim())
                  .filter((v) => v)
              );
              // Only show columns with 2-30 unique values (good for filtering)
              return values.size >= 2 && values.size <= 30;
            });

            if (textFilterColumns.length === 0) return null;

            return (
              <div style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{
                    fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                    fontSize: 9,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: "var(--stone)",
                    flexShrink: 0,
                  }}>
                    🔍 Quick Filter:
                  </span>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-start" }}>
                  {textFilterColumns.slice(0, 5).map((field) => {
                    const header = field.source_header || field.label || field.key;
                    const currentFilter = columnFilters[field.key] ?? "";
                    const uniqueValues = Array.from(
                      new Set(
                        loaded.rows
                          .map((row) => (row[field.key] ?? "").trim())
                          .filter((v) => v)
                      )
                    ).sort().slice(0, 15); // Max 15 values per column

                    return (
                      <div key={field.key} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                        <span style={{
                          fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                          fontSize: 8,
                          letterSpacing: "0.04em",
                          textTransform: "uppercase",
                          color: "var(--stone)",
                        }}>
                          {header}
                        </span>
                        <div style={{ display: "flex", gap: 3, flexWrap: "wrap", maxWidth: 280 }}>
                          {uniqueValues.map((val) => {
                            const isActive = currentFilter.toLowerCase() === val.toLowerCase();
                            return (
                              <button
                                key={val}
                                onClick={() =>
                                  setColumnFilters((prev) => ({
                                    ...prev,
                                    [field.key]: isActive ? "" : val,
                                  }))
                                }
                                style={{
                                  fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                                  fontSize: 9,
                                  color: isActive ? "var(--paper)" : "var(--ink)",
                                  background: isActive ? "var(--ink)" : "var(--cream)",
                                  border: `1px solid ${isActive ? "var(--ink)" : "var(--rule)"}`,
                                  borderRadius: 10,
                                  padding: "3px 7px",
                                  cursor: "pointer",
                                  whiteSpace: "nowrap",
                                  transition: "all 0.15s",
                                  maxWidth: 130,
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                }}
                                title={val}
                              >
                                {val.length > 16 ? val.slice(0, 14) + "…" : val}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Toggle + Search row */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {/* Toggle: Column-wise / Row-wise */}
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexShrink: 0,
          }}>
            <span style={{
              fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
              fontSize: 10,
              color: searchMode === "row" ? "var(--ink)" : "var(--stone)",
              fontWeight: searchMode === "row" ? 600 : 400,
            }}>
              Row-wise
            </span>
            {/* Toggle switch */}
            <button
              onClick={() => setSearchMode(searchMode === "row" ? "column" : "row")}
              style={{
                position: "relative",
                width: 36,
                height: 20,
                borderRadius: 10,
                border: "1px solid var(--rule)",
                background: searchMode === "column" ? "var(--ink)" : "var(--stone)",
                cursor: "pointer",
                padding: 0,
                transition: "background 0.2s",
              }}
              aria-label={`Switch to ${searchMode === "row" ? "column-wise" : "row-wise"} search`}
            >
              <span style={{
                position: "absolute",
                top: 2,
                left: searchMode === "column" ? 18 : 2,
                width: 14,
                height: 14,
                borderRadius: "50%",
                background: "var(--paper)",
                transition: "left 0.2s",
                boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
              }} />
            </button>
            <span style={{
              fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
              fontSize: 10,
              color: searchMode === "column" ? "var(--ink)" : "var(--stone)",
              fontWeight: searchMode === "column" ? 600 : 400,
            }}>
              Column-wise
            </span>
          </div>

          {/* Column selector (only in column-wise mode) */}
          {searchMode === "column" && (
            <select
              value={searchColumn}
              onChange={(e) => setSearchColumn(e.target.value)}
              style={{
                fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                fontSize: 11,
                color: "var(--ink)",
                background: "var(--paper)",
                border: "1px solid var(--rule)",
                borderRadius: 4,
                padding: "6px 8px",
                outline: "none",
                maxWidth: 180,
              }}
            >
              <option value="">Select column...</option>
              {sortedFields.map((field) => (
                <option key={field.key} value={field.key}>
                  {field.source_header || field.label || field.key}
                </option>
              ))}
            </select>
          )}

          {/* Search input */}
          <div style={{ position: "relative", flex: 1, minWidth: 160, maxWidth: 360 }}>
            <svg style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", width: 13, height: 13, color: "var(--stone)", pointerEvents: "none" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              type="text"
              value={searchMode === "column" ? dateSearch : globalSearch}
              onChange={(e) =>
                searchMode === "column"
                  ? setDateSearch(e.target.value)
                  : setGlobalSearch(e.target.value)
              }
              placeholder={
                searchMode === "column"
                  ? "Search date or value in selected column..."
                  : "Search across all columns..."
              }
              style={{
                width: "100%",
                fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                fontSize: 11,
                color: "var(--ink)",
                background: "var(--cream)",
                border: "1px solid var(--rule)",
                borderRadius: 4,
                padding: "7px 8px 7px 28px",
                outline: "none",
              }}
            />
          </div>

          {/* Mode description */}
          <span style={{
            fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
            fontSize: 9,
            color: "var(--stone)",
            flexShrink: 0,
          }}>
            {searchMode === "column"
              ? "↳ Shows all rows where selected column matches"
              : "↳ Shows rows where any column matches"}
          </span>
        </div>
        </div>
      </div>

      {/* Table with filter row */}
      <div style={{ flex: 1, overflow: "auto", padding: "0 16px 16px" }}>
        <div style={{ maxWidth: 1400, margin: "0 auto", overflowX: "auto" }}>
          <table style={{
            width: "100%",
            borderCollapse: "collapse",
            fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
            fontSize: 11,
            marginTop: 12,
          }}>
            <thead>
              {/* Header row */}
              <tr>
                <th style={{
                  padding: "8px 10px",
                  textAlign: "left",
                  fontWeight: 500,
                  fontSize: 10,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  color: "var(--stone)",
                  borderBottom: "1px solid var(--rule)",
                  whiteSpace: "nowrap",
                  position: "sticky",
                  top: 0,
                  background: "var(--cream)",
                }}>
                  #
                </th>
                {sortedFields.map((field) => (
                  <th
                    key={field.key}
                    style={{
                      padding: "8px 10px",
                      textAlign: "left",
                      fontWeight: 500,
                      fontSize: 10,
                      letterSpacing: "0.04em",
                      textTransform: "uppercase",
                      color: columnFilters[field.key] ? "var(--ink)" : "var(--stone)",
                      borderBottom: "1px solid var(--rule)",
                      whiteSpace: "nowrap",
                      position: "sticky",
                      top: 0,
                      background: "var(--cream)",
                      cursor: "pointer",
                    }}
                    onClick={() =>
                      setActiveFilterField(
                        activeFilterField === field.key ? null : field.key
                      )
                    }
                  >
                    {field.source_header || field.label || field.key}
                    {columnFilters[field.key] && (
                      <span style={{ marginLeft: 4, color: "var(--ember)" }}>●</span>
                    )}
                    <span style={{ marginLeft: 4, opacity: 0.4 }}>▼</span>
                  </th>
                ))}
              </tr>

              {/* Filter input row */}
              <tr>
                <td style={{ padding: "4px 10px", borderBottom: "2px solid var(--rule)" }} />
                {sortedFields.map((field) => (
                  <td
                    key={`filter-${field.key}`}
                    style={{ padding: "4px 6px", borderBottom: "2px solid var(--rule)" }}
                  >
                    <input
                      type="text"
                      value={columnFilters[field.key] ?? ""}
                      onChange={(e) =>
                        setColumnFilters((prev) => ({
                          ...prev,
                          [field.key]: e.target.value,
                        }))
                      }
                      placeholder="Filter..."
                      style={{
                        width: "100%",
                        minWidth: 60,
                        fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                        fontSize: 10,
                        color: "var(--ink)",
                        background: "var(--paper)",
                        border: `1px solid ${columnFilters[field.key] ? "var(--ember)" : "var(--rule)"}`,
                        borderRadius: 3,
                        padding: "4px 6px",
                        outline: "none",
                      }}
                    />
                  </td>
                ))}
              </tr>
            </thead>

            <tbody>
              {visibleRows.map((row, idx) => (
                <tr
                  key={idx}
                  style={{
                    borderBottom: "1px solid var(--rule)",
                    background: idx % 2 === 0 ? "transparent" : "rgba(0,0,0,0.015)",
                  }}
                >
                  <td style={{
                    padding: "6px 10px",
                    color: "var(--stone)",
                    fontSize: 10,
                    whiteSpace: "nowrap",
                  }}>
                    {row._row_index ?? idx + 1}
                  </td>
                  {sortedFields.map((field) => (
                    <td
                      key={field.key}
                      style={{
                        padding: "6px 10px",
                        color: "var(--ink)",
                        maxWidth: 200,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={row[field.key] ?? ""}
                    >
                      {row[field.key] ?? ""}
                    </td>
                  ))}
                </tr>
              ))}

              {/* Blank rows separator */}
              {visibleBlankRows.length > 0 && (
                <tr>
                  <td
                    colSpan={sortedFields.length + 1}
                    style={{
                      padding: "10px 16px",
                      textAlign: "center",
                      background: "rgba(200, 98, 58, 0.06)",
                      borderTop: "2px solid var(--ember)",
                      borderBottom: "2px solid var(--ember)",
                    }}
                  >
                    <span style={{
                      fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                      fontSize: 10,
                      fontWeight: 500,
                      color: "var(--ember)",
                      letterSpacing: "0.04em",
                      textTransform: "uppercase",
                    }}>
                      ⚠ Blank in selected column ({blankRows.length} rows)
                    </span>
                  </td>
                </tr>
              )}

              {/* Blank rows rendered below */}
              {visibleBlankRows.map((row, idx) => (
                <tr
                  key={`blank-${idx}`}
                  style={{
                    borderBottom: "1px solid var(--rule)",
                    background: "rgba(200, 98, 58, 0.03)",
                    opacity: 0.7,
                  }}
                >
                  <td style={{
                    padding: "6px 10px",
                    color: "var(--stone)",
                    fontSize: 10,
                    whiteSpace: "nowrap",
                  }}>
                    {row._row_index ?? "—"}
                  </td>
                  {sortedFields.map((field) => (
                    <td
                      key={field.key}
                      style={{
                        padding: "6px 10px",
                        color: field.key === searchColumn && !(row[field.key]?.trim())
                          ? "var(--ember)"
                          : "var(--ink)",
                        maxWidth: 200,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        fontStyle: field.key === searchColumn && !(row[field.key]?.trim())
                          ? "italic"
                          : "normal",
                      }}
                      title={row[field.key] ?? ""}
                    >
                      {field.key === searchColumn && !(row[field.key]?.trim())
                        ? "— Blank —"
                        : (row[field.key] ?? "")}
                    </td>
                  ))}
                </tr>
              ))}

              {visibleRows.length === 0 && visibleBlankRows.length === 0 && (
                <tr>
                  <td
                    colSpan={sortedFields.length + 1}
                    style={{
                      padding: "40px 16px",
                      textAlign: "center",
                      color: "var(--stone)",
                      fontSize: 12,
                    }}
                  >
                    {activeFilterCount > 0
                      ? "No rows match the current filters"
                      : "No data rows found"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Load more */}
          {visibleCount < totalDisplayRows && (
            <div style={{ textAlign: "center", padding: "16px 0" }}>
              <button
                onClick={() => setVisibleCount((c) => c + ROWS_PER_PAGE)}
                style={{
                  fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                  fontSize: 11,
                  color: "var(--ink)",
                  background: "var(--paper)",
                  border: "1px solid var(--rule)",
                  borderRadius: 4,
                  padding: "8px 20px",
                  cursor: "pointer",
                }}
              >
                Load more ({totalDisplayRows - visibleCount} remaining)
              </button>
            </div>
          )}
        </div>
      </div>

      {error && <ErrorToast message={error} onDismiss={() => setError(null)} />}
    </div>
  );
}
