"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import ErrorToast from "@/components/ErrorToast";
import LoadingOverlay from "@/components/LoadingOverlay";
import ClearButton from "@/components/ClearButton";
import SubmitButton from "@/components/SubmitButton";
import type { FieldSchema } from "@/types/field";
import { useStepHistory } from "@/lib/useStepHistory";
import {
  getSheetHistory,
  lookupFormsBySheet,
  checkSheetAccess,
  getPublicConfig,
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

export default function LoadPage() {
  return (
    <Suspense fallback={<LoadingOverlay message="Loading..." />}>
      <LoadPageInner />
    </Suspense>
  );
}

type FlowStep = "input" | "tabs" | "results";
const FLOW_STEPS: readonly FlowStep[] = ["input", "tabs", "results"];

function LoadPageInner() {
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
  const [accessStatus, setAccessStatus] = useState<"checking" | "edit" | "read" | "none" | null>(null);
  const [serviceAccountEmail, setServiceAccountEmail] = useState<string | null>(null);

  // Column picker + results state
  const [selectedField, setSelectedField] = useState<FieldSchema | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortMode, setSortMode] = useState<"count" | "alpha">("count");

  // Multi-column filters: key = field.key, value = selected filter value
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [showFilters, setShowFilters] = useState(false);

  // Month filter
  const [monthFilter, setMonthFilter] = useState("");

  // Date range filter
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Back-gesture wiring
  const flowStep: FlowStep = loaded ? "results" : availableTabs ? "tabs" : "input";

  const setFlowStep = useCallback(
    (next: FlowStep) => {
      switch (next) {
        case "input":
          setLoaded(null);
          setAvailableTabs(null);
          setSelectedField(null);
          setSearchQuery("");
          setColumnFilters({});
          setMonthFilter("");
          setDateFrom("");
          setDateTo("");
          break;
        case "tabs":
          setLoaded(null);
          setSelectedField(null);
          setSearchQuery("");
          setColumnFilters({});
          setMonthFilter("");
          setDateFrom("");
          setDateTo("");
          if (sheetUrl && !availableTabs) {
            lookupFormsBySheet(sheetUrl)
              .then((result) => {
                setAvailableTabs(
                  result.items.map((item) => ({
                    id: item.id,
                    worksheet_name: item.worksheet_name,
                    form_title: item.form_title,
                    fields: item.fields,
                    has_form: item.has_form,
                  })),
                );
              })
              .catch(() => {});
          }
          break;
        case "results":
          break;
      }
    },
    [sheetUrl, availableTabs],
  );

  useStepHistory(flowStep, setFlowStep, FLOW_STEPS);

  // Auto-load sheet from URL param on mount
  useEffect(() => {
    if (sheetParam) {
      loadSheetFromUrl(sheetParam);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetParam]);

  // Fetch service account email on mount
  useEffect(() => {
    getPublicConfig()
      .then((cfg) => setServiceAccountEmail(cfg.service_account_email))
      .catch(() => {});
  }, []);

  // Check sheet access when URL becomes valid
  useEffect(() => {
    if (!urlValid || !formInput.trim()) {
      setAccessStatus(null);
      return;
    }
    const cacheKey = `om_access_${formInput.trim()}`;
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        const { result, ts } = JSON.parse(cached);
        if (Date.now() - ts < 120_000) {
          if (!result.read) setAccessStatus("none");
          else if (!result.edit) setAccessStatus("read");
          else setAccessStatus("edit");
          return;
        }
      }
    } catch {}

    setAccessStatus("checking");
    const timer = setTimeout(async () => {
      try {
        const status = await checkSheetAccess(formInput);
        try { sessionStorage.setItem(cacheKey, JSON.stringify({ result: status, ts: Date.now() })); } catch {}
        if (!status.read) setAccessStatus("none");
        else if (!status.edit) setAccessStatus("read");
        else setAccessStatus("edit");
      } catch {
        setAccessStatus("none");
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [formInput, urlValid]);

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
      setAccessStatus(null);
    }
  }, []);

  async function handleSubmit() {
    if (!validateUrl(formInput)) return;
    const trimmed = formInput.trim();
    router.push(`/load?sheet=${encodeURIComponent(trimmed)}`);
  }

  async function loadSheetFromUrl(url: string) {
    setLoading(true);
    setError(null);
    setAvailableTabs(null);
    setLoaded(null);
    setSelectedField(null);
    setSearchQuery("");
    setColumnFilters({});
    setMonthFilter("");
    setDateFrom("");
    setDateTo("");
    setShowFilters(false);

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
      const url = sheet_url ?? sheetUrl;
      const data = await getSheetHistory(url, tab.worksheet_name);
      setLoaded({
        worksheet_name: data.worksheet_name,
        fields: data.fields,
        rows: data.rows,
      });
      // Auto-select a reasonable column
      autoSelectColumn(data.fields, data.rows);
    } catch (e: any) {
      setError(e.message ?? "Failed to load entries");
    } finally {
      setLoading(false);
    }
  }

  function autoSelectColumn(fields: FieldSchema[], rows: Record<string, string>[]) {
    // Pick first column with > 1 unique value and < 500 unique values
    for (const field of [...fields].sort((a, b) => a.order - b.order)) {
      const uniq = new Set<string>();
      for (const row of rows) {
        const v = (row[field.key] ?? "").trim();
        if (v) uniq.add(v);
      }
      if (uniq.size > 1 && uniq.size < 500) {
        setSelectedField(field);
        return;
      }
    }
    // Fallback: first field
    if (fields.length > 0) {
      setSelectedField(fields[0]);
    }
  }

  // Get unique values per column for filter dropdowns
  const columnUniqueValues = useMemo(() => {
    if (!loaded || !loaded.rows.length) return {};
    const result: Record<string, string[]> = {};
    for (const field of loaded.fields) {
      const valSet = new Set<string>();
      for (const row of loaded.rows) {
        const v = (row[field.key] ?? "").trim();
        if (v) valSet.add(v);
      }
      if (valSet.size > 0 && valSet.size < 500) {
        result[field.key] = [...valSet].sort((a, b) => a.localeCompare(b));
      }
    }
    return result;
  }, [loaded]);

  // Detect date-like columns for month/date range filtering
  const dateFieldKey = useMemo(() => {
    if (!loaded) return null;
    for (const field of loaded.fields) {
      const label = (field.label || field.key).toLowerCase();
      if (label.includes("date") || label.includes("timestamp") || label.includes("time") || label.includes("created")) {
        return field.key;
      }
    }
    return null;
  }, [loaded]);

  // Extract unique months from date column
  const availableMonths = useMemo(() => {
    if (!loaded || !dateFieldKey) return [];
    const months = new Set<string>();
    for (const row of loaded.rows) {
      const val = (row[dateFieldKey] ?? "").trim();
      if (!val) continue;
      // Try to parse date and extract month
      const d = new Date(val);
      if (!isNaN(d.getTime())) {
        const monthStr = d.toLocaleString("default", { month: "long", year: "numeric" });
        months.add(monthStr);
      }
    }
    return [...months].sort((a, b) => {
      const da = new Date(a);
      const db = new Date(b);
      return db.getTime() - da.getTime();
    });
  }, [loaded, dateFieldKey]);

  // Apply column filters + month + date range to get filtered rows
  const filteredRows = useMemo(() => {
    if (!loaded) return [];
    let rows = loaded.rows;

    // Apply column-specific filters
    const activeFilters = Object.entries(columnFilters).filter(([, v]) => v);
    if (activeFilters.length > 0) {
      rows = rows.filter((row) =>
        activeFilters.every(([key, val]) => {
          const cellValue = (row[key] ?? "").toLowerCase().trim();
          const filterVal = val.toLowerCase().trim();
          return cellValue === filterVal || cellValue.includes(filterVal);
        })
      );
    }

    // Apply month filter
    if (monthFilter && dateFieldKey) {
      rows = rows.filter((row) => {
        const val = (row[dateFieldKey] ?? "").trim();
        if (!val) return false;
        const d = new Date(val);
        if (isNaN(d.getTime())) return false;
        const monthStr = d.toLocaleString("default", { month: "long", year: "numeric" });
        return monthStr === monthFilter;
      });
    }

    // Apply date range filter
    if ((dateFrom || dateTo) && dateFieldKey) {
      rows = rows.filter((row) => {
        const val = (row[dateFieldKey] ?? "").trim();
        if (!val) return false;
        const d = new Date(val);
        if (isNaN(d.getTime())) return false;
        if (dateFrom) {
          const from = new Date(dateFrom);
          if (d < from) return false;
        }
        if (dateTo) {
          const to = new Date(dateTo);
          to.setHours(23, 59, 59, 999);
          if (d > to) return false;
        }
        return true;
      });
    }

    return rows;
  }, [loaded, columnFilters, monthFilter, dateFrom, dateTo, dateFieldKey]);

  // Compute frequency counts (now uses filteredRows)
  const analysis = useMemo(() => {
    if (!loaded || !selectedField) return null;
    const counts = new Map<string, number>();
    for (const row of filteredRows) {
      const val = (row[selectedField.key] ?? "").trim();
      if (val) counts.set(val, (counts.get(val) ?? 0) + 1);
    }
    let sorted = [...counts.entries()];
    if (sortMode === "count") {
      sorted.sort((a, b) => b[1] - a[1]);
    } else {
      sorted.sort((a, b) => a[0].localeCompare(b[0]));
    }
    const maxCount = sorted[0]?.[1] ?? 1;
    const totalRows = filteredRows.length;
    const uniqueCount = counts.size;
    return { sorted, maxCount, totalRows, uniqueCount };
  }, [loaded, selectedField, sortMode, filteredRows]);

  // Filter results by search
  const filteredResults = useMemo(() => {
    if (!analysis) return [];
    if (!searchQuery.trim()) return analysis.sorted;
    const q = searchQuery.trim().toLowerCase();
    return analysis.sorted.filter(([name]) => name.toLowerCase().includes(q));
  }, [analysis, searchQuery]);

  const step: 1 | 2 | 3 = availableTabs ? 2 : loaded ? 3 : 1;

  // ═══════════════════════ STEP 3: Results ═══════════════════════
  if (loaded && selectedField && analysis) {
    const sortedFields = [...loaded.fields].sort((a, b) => a.order - b.order);
    // Get filterable columns (those with < 500 unique values, excluding the selected count-by column)
    const filterableFields = sortedFields.filter(
      (f) => f.key !== selectedField.key && columnUniqueValues[f.key]
    );

    const activeFilterCount =
      Object.values(columnFilters).filter((v) => v).length +
      (monthFilter ? 1 : 0) +
      (dateFrom || dateTo ? 1 : 0);

    return (
      <div className="flex flex-col min-h-screen" style={{ background: "var(--cream)" }}>
        <AppHeader title="Load Analysis" showBack onBack={() => window.history.back()} />
        {loading && <LoadingOverlay message="Loading..." />}

        <div className="flex-1 w-full max-w-[560px] mx-auto px-4 pt-6 pb-10" style={{ paddingLeft: 16, paddingRight: 16 }}>
          {/* Header */}
          <div style={{ marginBottom: 16 }}>
            <h2 style={{
              fontFamily: "var(--font-newsreader), Georgia, serif",
              fontWeight: 400,
              fontSize: 18,
              color: "var(--ink)",
              margin: 0,
              lineHeight: 1.2,
            }}>
              {loaded.worksheet_name}
            </h2>
            <p style={{
              fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
              fontWeight: 300,
              fontSize: 11,
              letterSpacing: "0.04em",
              color: "var(--stone)",
              margin: "4px 0 0 0",
            }}>
              {selectedField.label} · {loaded.rows.length} rows · {analysis.uniqueCount} unique
            </p>
          </div>

          {/* Filter toggle button */}
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: activeFilterCount > 0 ? "var(--ink)" : "var(--charcoal)",
              background: activeFilterCount > 0 ? "rgba(200, 98, 58, 0.08)" : "transparent",
              border: activeFilterCount > 0 ? "1px solid rgba(200, 98, 58, 0.3)" : "1px solid var(--rule)",
              borderRadius: 4,
              padding: "8px 12px",
              cursor: "pointer",
              marginBottom: 14,
            }}
          >
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" />
            </svg>
            Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
          </button>

          {/* Collapsible Filter Panel */}
          {showFilters && (
            <div style={{
              marginBottom: 16,
              padding: "14px",
              background: "var(--paper)",
              border: "1px solid var(--rule)",
              borderRadius: 6,
            }}>
              {/* 2-column grid for filters — mobile friendly */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "12px",
              }}>
                {/* Count By dropdown */}
                <div>
                  <label style={{
                    display: "block",
                    fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                    fontWeight: 500,
                    fontSize: 9,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: "var(--charcoal)",
                    marginBottom: 4,
                  }}>
                    Count by
                  </label>
                  <select
                    value={selectedField.key}
                    onChange={(e) => {
                      const f = loaded.fields.find((field) => field.key === e.target.value);
                      if (f) { setSelectedField(f); setSearchQuery(""); }
                    }}
                    style={{
                      width: "100%",
                      fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                      fontSize: 13,
                      color: "var(--ink)",
                      background: "var(--cream)",
                      border: "1px solid var(--rule)",
                      borderRadius: 4,
                      padding: "8px 6px",
                      outline: "none",
                      cursor: "pointer",
                      appearance: "none",
                      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239C9488' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
                      backgroundRepeat: "no-repeat",
                      backgroundPosition: "right 8px center",
                      paddingRight: 28,
                    }}
                  >
                    {sortedFields.map((f) => (
                      <option key={f.key} value={f.key}>{f.label}</option>
                    ))}
                  </select>
                </div>

                {/* First filterable column dropdown */}
                {filterableFields.length > 0 && (
                  <div>
                    <label style={{
                      display: "block",
                      fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                      fontWeight: 500,
                      fontSize: 9,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      color: "var(--charcoal)",
                      marginBottom: 4,
                    }}>
                      {filterableFields[0].label}
                    </label>
                    <select
                      value={columnFilters[filterableFields[0].key] ?? ""}
                      onChange={(e) => {
                        setColumnFilters((prev) => ({
                          ...prev,
                          [filterableFields[0].key]: e.target.value,
                        }));
                      }}
                      style={{
                        width: "100%",
                        fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                        fontSize: 13,
                        color: columnFilters[filterableFields[0].key] ? "var(--ink)" : "var(--stone)",
                        background: "var(--cream)",
                        border: "1px solid var(--rule)",
                        borderRadius: 4,
                        padding: "8px 6px",
                        outline: "none",
                        cursor: "pointer",
                        appearance: "none",
                        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239C9488' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
                        backgroundRepeat: "no-repeat",
                        backgroundPosition: "right 8px center",
                        paddingRight: 28,
                      }}
                    >
                      <option value="">All ({loaded.rows.length} rows)</option>
                      {(columnUniqueValues[filterableFields[0].key] ?? []).map((val) => (
                        <option key={val} value={val}>{val}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Month filter */}
                {availableMonths.length > 0 && (
                  <div>
                    <label style={{
                      display: "block",
                      fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                      fontWeight: 500,
                      fontSize: 9,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      color: "var(--charcoal)",
                      marginBottom: 4,
                    }}>
                      Month
                    </label>
                    <select
                      value={monthFilter}
                      onChange={(e) => setMonthFilter(e.target.value)}
                      style={{
                        width: "100%",
                        fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                        fontSize: 13,
                        color: monthFilter ? "var(--ink)" : "var(--stone)",
                        background: "var(--cream)",
                        border: "1px solid var(--rule)",
                        borderRadius: 4,
                        padding: "8px 6px",
                        outline: "none",
                        cursor: "pointer",
                        appearance: "none",
                        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239C9488' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
                        backgroundRepeat: "no-repeat",
                        backgroundPosition: "right 8px center",
                        paddingRight: 28,
                      }}
                    >
                      <option value="">All months ({loaded.rows.length} rows)</option>
                      {availableMonths.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Date Range */}
                {dateFieldKey && (
                  <div>
                    <label style={{
                      display: "block",
                      fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                      fontWeight: 500,
                      fontSize: 9,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      color: "var(--charcoal)",
                      marginBottom: 4,
                    }}>
                      Date Range
                    </label>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                        placeholder="From"
                        style={{
                          width: "100%",
                          fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                          fontSize: 12,
                          color: dateFrom ? "var(--ink)" : "var(--stone)",
                          background: "var(--cream)",
                          border: "1px solid var(--rule)",
                          borderRadius: 4,
                          padding: "6px",
                          outline: "none",
                        }}
                      />
                      <div style={{ textAlign: "center", color: "var(--stone)", fontSize: 11 }}>→</div>
                      <input
                        type="date"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        placeholder="To"
                        style={{
                          width: "100%",
                          fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                          fontSize: 12,
                          color: dateTo ? "var(--ink)" : "var(--stone)",
                          background: "var(--cream)",
                          border: "1px solid var(--rule)",
                          borderRadius: 4,
                          padding: "6px",
                          outline: "none",
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* Second filterable column dropdown */}
                {filterableFields.length > 1 && (
                  <div>
                    <label style={{
                      display: "block",
                      fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                      fontWeight: 500,
                      fontSize: 9,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      color: "var(--charcoal)",
                      marginBottom: 4,
                    }}>
                      {filterableFields[1].label}
                    </label>
                    <select
                      value={columnFilters[filterableFields[1].key] ?? ""}
                      onChange={(e) => {
                        setColumnFilters((prev) => ({
                          ...prev,
                          [filterableFields[1].key]: e.target.value,
                        }));
                      }}
                      style={{
                        width: "100%",
                        fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                        fontSize: 13,
                        color: columnFilters[filterableFields[1].key] ? "var(--ink)" : "var(--stone)",
                        background: "var(--cream)",
                        border: "1px solid var(--rule)",
                        borderRadius: 4,
                        padding: "8px 6px",
                        outline: "none",
                        cursor: "pointer",
                        appearance: "none",
                        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239C9488' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
                        backgroundRepeat: "no-repeat",
                        backgroundPosition: "right 8px center",
                        paddingRight: 28,
                      }}
                    >
                      <option value="">All ({loaded.rows.length} rows)</option>
                      {(columnUniqueValues[filterableFields[1].key] ?? []).map((val) => (
                        <option key={val} value={val}>{val}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Additional filterable columns (3rd, 4th, etc.) */}
                {filterableFields.slice(2).map((field) => (
                  <div key={field.key}>
                    <label style={{
                      display: "block",
                      fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                      fontWeight: 500,
                      fontSize: 9,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      color: "var(--charcoal)",
                      marginBottom: 4,
                    }}>
                      {field.label}
                    </label>
                    <select
                      value={columnFilters[field.key] ?? ""}
                      onChange={(e) => {
                        setColumnFilters((prev) => ({
                          ...prev,
                          [field.key]: e.target.value,
                        }));
                      }}
                      style={{
                        width: "100%",
                        fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                        fontSize: 13,
                        color: columnFilters[field.key] ? "var(--ink)" : "var(--stone)",
                        background: "var(--cream)",
                        border: "1px solid var(--rule)",
                        borderRadius: 4,
                        padding: "8px 6px",
                        outline: "none",
                        cursor: "pointer",
                        appearance: "none",
                        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239C9488' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
                        backgroundRepeat: "no-repeat",
                        backgroundPosition: "right 8px center",
                        paddingRight: 28,
                      }}
                    >
                      <option value="">All ({loaded.rows.length} rows)</option>
                      {(columnUniqueValues[field.key] ?? []).map((val) => (
                        <option key={val} value={val}>{val}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              {/* Clear all filters */}
              {activeFilterCount > 0 && (
                <div style={{ marginTop: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <p style={{
                    fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                    fontSize: 10,
                    color: "var(--stone)",
                    margin: 0,
                  }}>
                    Showing {filteredRows.length.toLocaleString()} of {loaded.rows.length.toLocaleString()} rows
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setColumnFilters({});
                      setMonthFilter("");
                      setDateFrom("");
                      setDateTo("");
                    }}
                    style={{
                      fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                      fontSize: 10,
                      color: "var(--clay)",
                      background: "none",
                      border: 0,
                      cursor: "pointer",
                      textDecoration: "underline",
                      padding: 0,
                    }}
                  >
                    Clear all
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Search + Sort controls */}
          <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "center" }}>
            <div style={{ position: "relative", flex: 1 }}>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search values..."
                style={{
                  width: "100%",
                  fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                  fontSize: 12,
                  color: "var(--ink)",
                  background: "var(--paper)",
                  border: "1px solid var(--rule)",
                  borderRadius: 4,
                  padding: "7px 28px 7px 10px",
                  outline: "none",
                }}
              />
              {searchQuery && (
                <ClearButton
                  onClick={() => setSearchQuery("")}
                  ariaLabel="Clear search"
                  top="50%"
                />
              )}
            </div>
            <button
              type="button"
              onClick={() => setSortMode((m) => m === "count" ? "alpha" : "count")}
              style={{
                fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                fontSize: 10,
                fontWeight: 500,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "var(--charcoal)",
                background: "var(--paper)",
                border: "1px solid var(--rule)",
                borderRadius: 4,
                padding: "7px 10px",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {sortMode === "count" ? "By count" : "A → Z"}
            </button>
          </div>

          <hr style={{ border: 0, borderTop: "1px solid var(--rule)", margin: "0 0 12px 0" }} />

          {/* Results list */}
          <div>
            {filteredResults.length === 0 && (
              <p style={{
                fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                fontSize: 12,
                color: "var(--stone)",
                textAlign: "center",
                padding: "40px 0",
              }}>
                No matches
              </p>
            )}
            {filteredResults.map(([name, count], idx) => {
              const pct = ((count / analysis.totalRows) * 100).toFixed(1);
              const barWidth = (count / analysis.maxCount) * 100;
              return (
                <div key={name} style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 0",
                  borderBottom: "1px solid var(--rule)",
                }}>
                  {/* Rank */}
                  <span style={{
                    fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                    fontSize: 11,
                    fontWeight: 400,
                    color: "var(--stone)",
                    width: 24,
                    textAlign: "right",
                    flexShrink: 0,
                  }}>
                    {idx + 1}
                  </span>
                  {/* Name + bar */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{
                      fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                      fontSize: 13,
                      fontWeight: 400,
                      color: "var(--ink)",
                      margin: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}>
                      {name}
                    </p>
                    <div style={{
                      marginTop: 4,
                      height: 4,
                      background: "var(--rule)",
                      borderRadius: 2,
                      overflow: "hidden",
                    }}>
                      <div style={{
                        width: `${barWidth}%`,
                        height: "100%",
                        background: "var(--clay)",
                        borderRadius: 2,
                        transition: "width 300ms ease-out",
                      }} />
                    </div>
                  </div>

                  {/* Count */}
                  <span style={{
                    fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--ink)",
                    flexShrink: 0,
                    minWidth: 32,
                    textAlign: "right",
                  }}>
                    {count}
                  </span>
                  {/* Percentage */}
                  <span style={{
                    fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                    fontSize: 11,
                    fontWeight: 400,
                    color: "var(--stone)",
                    flexShrink: 0,
                    minWidth: 48,
                    textAlign: "right",
                  }}>
                    {pct}%
                  </span>
                </div>
              );
            })}
          </div>

          {/* Summary footer */}
          <div style={{
            marginTop: 16,
            padding: "12px 0",
            borderTop: "1px solid var(--rule)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 8,
          }}>
            <p style={{
              fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
              fontSize: 11,
              fontWeight: 400,
              color: "var(--stone)",
              margin: 0,
            }}>
              {activeFilterCount > 0
                ? `${filteredRows.length} of ${loaded.rows.length} rows · ${analysis.uniqueCount} unique values`
                : `${analysis.totalRows} rows · ${analysis.uniqueCount} unique values`
              }
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={() => { setLoaded(null); setSelectedField(null); setSearchQuery(""); setColumnFilters({}); setMonthFilter(""); setDateFrom(""); setDateTo(""); }}
                style={{
                  fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                  fontSize: 10,
                  fontWeight: 500,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: "var(--stone)",
                  background: "none",
                  border: "1px solid var(--rule)",
                  borderRadius: 4,
                  padding: "6px 10px",
                  cursor: "pointer",
                }}
              >
                Change sheet
              </button>
            </div>
          </div>
        </div>

        <ErrorToast message={error} onDismiss={() => setError(null)} />
      </div>
    );
  }

  // ═══════════════════════ STEP 2: Tab Picker ═══════════════════════
  if (availableTabs) {
    return (
      <div className="flex flex-col min-h-screen" style={{ background: "var(--cream)" }}>
        <AppHeader title="Load Analysis" showBack onBack={() => window.history.back()} />
        {loading && <LoadingOverlay message="Loading tab..." />}

        <div className="flex-1 w-full max-w-[560px] mx-auto px-6 pt-14 pb-8">
          <p style={{
            fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
            fontWeight: 500,
            fontSize: 10,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "var(--stone)",
            margin: "0 0 18px 0",
          }}>
            Step · 02 of 03
          </p>
          <h1 style={{
            fontFamily: "var(--font-newsreader), Georgia, serif",
            fontWeight: 300,
            fontSize: 28,
            lineHeight: 1.15,
            color: "var(--ink)",
            margin: "0 0 8px 0",
          }}>
            Select a tab
          </h1>
          <p style={{
            fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
            fontWeight: 300,
            fontSize: 12,
            color: "var(--stone)",
            margin: "0 0 24px 0",
          }}>
            {"// which worksheet do you want to analyze?"}
          </p>

          <div style={{ display: "grid", gap: 8 }}>
            {availableTabs.map((tab) => (
              <button
                key={tab.worksheet_name ?? tab.form_title}
                type="button"
                onClick={() => selectTab(tab)}
                style={{
                  width: "100%",
                  padding: "14px 16px",
                  background: "transparent",
                  border: "1px solid var(--rule)",
                  textAlign: "left",
                  cursor: "pointer",
                  transition: "background-color 180ms ease-out, border-color 180ms ease-out",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--paper)"; e.currentTarget.style.borderColor = "var(--ink)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "var(--rule)"; }}
              >
                <p style={{
                  fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                  fontWeight: 500,
                  fontSize: 13,
                  color: "var(--ink)",
                  margin: 0,
                }}>
                  {tab.worksheet_name ?? tab.form_title}
                </p>
              </button>
            ))}
          </div>
        </div>

        <ErrorToast message={error} onDismiss={() => setError(null)} />
      </div>
    );
  }

  // ═══════════════════════ STEP 1: URL Input ═══════════════════════
  return (
    <div className="flex flex-col min-h-screen" style={{ background: "var(--cream)" }}>
      <AppHeader showLogo />
      {loading && <LoadingOverlay message="Reading your sheet..." />}

      <div className="flex-1 w-full max-w-[560px] mx-auto px-6 pt-14 pb-8">
        <p style={{
          fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
          fontWeight: 500,
          fontSize: 10,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "var(--stone)",
          margin: "0 0 18px 0",
        }}>
          Step · 01 of 03
        </p>
        <h1 style={{
          fontFamily: "var(--font-newsreader), Georgia, serif",
          fontWeight: 300,
          fontSize: 36,
          lineHeight: 1.1,
          letterSpacing: "-0.01em",
          color: "var(--ink)",
          margin: 0,
        }}>
          Load Analysis
        </h1>
        <p style={{
          fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
          fontWeight: 300,
          fontSize: 12,
          letterSpacing: "0.04em",
          color: "var(--stone)",
          margin: "18px 0 0 0",
        }}>
          {"// count frequency of any column value across your sheet."}
        </p>

        <hr style={{ border: 0, borderTop: "1px solid var(--rule)", margin: "32px 0" }} />

        <div className="space-y-4">
          <div>
            <label
              htmlFor="sheet-url"
              style={{
                display: "block",
                fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                fontWeight: 500,
                fontSize: 10,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "var(--charcoal)",
                marginBottom: 8,
              }}
            >
              Sheet URL
            </label>
            <div style={{ position: "relative" }}>
              <input
                id="sheet-url"
                type="url"
                inputMode="url"
                value={formInput}
                onChange={(e) => handleUrlChange(e.target.value)}
                onBlur={() => formInput && validateUrl(formInput)}
                placeholder="https://docs.google.com/spreadsheets/..."
                aria-invalid={!!urlError}
                style={{
                  width: "100%",
                  fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                  fontWeight: 400,
                  fontSize: 14,
                  color: "var(--ink)",
                  background: "transparent",
                  border: 0,
                  borderBottom: `2px solid ${urlError ? "var(--error)" : "var(--ink)"}`,
                  borderRadius: 0,
                  padding: "8px 28px 8px 0",
                  outline: "none",
                  transition: "border-color 200ms ease-out",
                }}
                onFocus={(e) => {
                  if (!urlError) e.currentTarget.style.borderBottomColor = "var(--clay)";
                }}
              />
              {formInput && (
                <ClearButton
                  onClick={() => {
                    setFormInput("");
                    setUrlValid(false);
                    setUrlError("");
                    setAccessStatus(null);
                  }}
                  ariaLabel="Clear sheet URL"
                  top="calc(50% - 2px)"
                />
              )}
            </div>

            {urlError && (
              <p style={{
                margin: "8px 0 0 0",
                fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                fontSize: 10,
                letterSpacing: "0.04em",
                color: "var(--error)",
              }} role="alert">
                ✕ {urlError}
              </p>
            )}
            {!urlValid && !urlError && (
              <p style={{
                margin: "8px 0 0 0",
                fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                fontWeight: 300,
                fontSize: 10,
                letterSpacing: "0.04em",
                color: "var(--stone)",
              }}>
                paste any google sheets link or spreadsheet id
              </p>
            )}
            {accessStatus === "checking" && (
              <p style={{
                margin: "10px 0 0 0",
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                fontWeight: 400,
                fontSize: 10,
                letterSpacing: "0.04em",
                color: "var(--stone)",
              }}>
                <span style={{
                  width: 10, height: 10,
                  border: "1.5px solid var(--rule)",
                  borderTopColor: "var(--ink)",
                  borderRadius: "50%",
                  display: "inline-block",
                  animation: "spin 0.8s linear infinite",
                }} />
                checking permissions…
              </p>
            )}
            {accessStatus === "edit" && (
              <p style={{
                margin: "10px 0 0 0",
                fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                fontWeight: 500,
                fontSize: 10,
                letterSpacing: "0.04em",
                color: "#047857",
              }}>
                ✓ access confirmed
              </p>
            )}

            {accessStatus === "read" && (
              <p style={{
                margin: "10px 0 0 0",
                fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                fontWeight: 400,
                fontSize: 10,
                letterSpacing: "0.04em",
                color: "#b45309",
              }}>
                <strong style={{ fontWeight: 500 }}>view only</strong> — read access confirmed
              </p>
            )}
            {accessStatus === "none" && (
              <p style={{
                margin: "10px 0 0 0",
                fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                fontWeight: 400,
                fontSize: 10,
                letterSpacing: "0.04em",
                color: "var(--clay)",
              }}>
                <strong style={{ fontWeight: 500 }}>no access.</strong>{" "}
                {serviceAccountEmail ? (
                  <>
                    share the sheet with{" "}
                    <strong style={{ fontWeight: 500 }}>{serviceAccountEmail}</strong>{" "}
                    or sign in with google.
                  </>
                ) : (
                  <>sign in with google or share the sheet with the app.</>
                )}
              </p>
            )}
          </div>

          <div style={{ paddingTop: 4 }}>
            <SubmitButton
              label="Analyze"
              submitting={loading}
              onClick={handleSubmit}
              disabled={!formInput.trim() || accessStatus === "checking"}
            />
          </div>
        </div>
      </div>

      <ErrorToast message={error} onDismiss={() => setError(null)} />
    </div>
  );
}
