"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import LoadingOverlay from "@/components/LoadingOverlay";
import SubmitButton from "@/components/SubmitButton";
import { safeBack } from "@/lib/navigation";
import {
  batchAppendRows,
  listSavedSheets,
  listWorksheets,
  lookupFormsBySheet,
} from "@/lib/api";
import type { FieldSchema } from "@/types/field";
import type { SavedSheetItem } from "@/lib/api";

export default function BulkEditPage() {
  return (
    <Suspense fallback={<LoadingOverlay message="Loading..." />}>
      <BulkEditInner />
    </Suspense>
  );
}

// ---------------------------------------------------------------------------
// Text parser: detect delimiter and split into rows/columns
// ---------------------------------------------------------------------------

function parseText(raw: string): string[][] {
  if (!raw.trim()) return [];

  const lines = raw.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (!lines.length) return [];

  // Detect delimiter: tabs first, then commas, else single-column
  const hasTab = lines.some((l) => l.includes("\t"));
  const hasComma = !hasTab && lines.some((l) => l.includes(","));

  const delimiter = hasTab ? "\t" : hasComma ? "," : null;

  return lines.map((line) => {
    if (!delimiter) return [line.trim()];
    if (delimiter === ",") {
      // Handle quoted CSV fields
      const cells: string[] = [];
      let current = "";
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"' && (i === 0 || line[i - 1] !== "\\")) {
          inQuotes = !inQuotes;
        } else if (ch === "," && !inQuotes) {
          cells.push(current.trim());
          current = "";
        } else {
          current += ch;
        }
      }
      cells.push(current.trim());
      return cells;
    }
    return line.split(delimiter).map((c) => c.trim());
  });
}

// ---------------------------------------------------------------------------
// Custom filter select component (replaces ugly native datalist)
// ---------------------------------------------------------------------------

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (val: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = React.useRef<HTMLDivElement>(null);

  // Close on outside click
  React.useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const filtered = search
    ? options.filter((o) => o.toLowerCase().includes(search.toLowerCase()))
    : options;

  return (
    <div ref={ref} className="relative min-w-0">
      <label className="block text-[9px] font-medium text-zinc-400 uppercase tracking-wider mb-0.5 pl-1">
        {label}
      </label>
      <button
        type="button"
        onClick={() => { setOpen(!open); setSearch(""); }}
        className={`w-full px-2 py-1.5 text-[11px] text-left border rounded flex items-center justify-between gap-1 ${
          value
            ? "border-emerald-400 bg-emerald-50 text-zinc-900"
            : "border-zinc-200 bg-white text-zinc-500"
        } focus:outline-none focus:ring-1 focus:ring-zinc-400`}
      >
        <span className="truncate">{value || "All"}</span>
        {value ? (
          <span
            onClick={(e) => { e.stopPropagation(); onChange(""); setOpen(false); }}
            className="text-zinc-400 hover:text-red-500 shrink-0 text-[13px] leading-none"
          >
            ×
          </span>
        ) : (
          <svg className="w-3 h-3 shrink-0 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </button>
      {open && (
        <div className="absolute z-50 mt-1 left-0 right-0 bg-white border border-zinc-200 rounded-lg shadow-lg overflow-hidden">
          {options.length > 6 && (
            <div className="p-1.5 border-b border-zinc-100">
              <input
                type="text"
                autoFocus
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full px-2 py-1 text-[11px] border border-zinc-200 rounded bg-zinc-50 focus:outline-none focus:ring-1 focus:ring-zinc-300"
              />
            </div>
          )}
          <div className="max-h-[180px] overflow-y-auto">
            <button
              type="button"
              onClick={() => { onChange(""); setOpen(false); setSearch(""); }}
              className={`w-full text-left px-3 py-1.5 text-[11px] hover:bg-zinc-50 transition-colors ${
                !value ? "text-emerald-600 font-medium" : "text-zinc-500"
              }`}
            >
              All
            </button>
            {filtered.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => { onChange(opt); setOpen(false); setSearch(""); }}
                className={`w-full text-left px-3 py-1.5 text-[11px] hover:bg-zinc-50 transition-colors ${
                  opt === value ? "text-emerald-600 font-medium bg-emerald-50" : "text-zinc-700"
                }`}
              >
                {opt}
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="px-3 py-2 text-[11px] text-zinc-400 italic">No matches</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

function BulkEditInner() {
  const router = useRouter();

  // Sheet selection
  const [savedSheets, setSavedSheets] = useState<SavedSheetItem[]>([]);
  const [sheetUrl, setSheetUrl] = useState("");
  const [worksheetName, setWorksheetName] = useState<string | null>(null);
  const [sheetHeaders, setSheetHeaders] = useState<FieldSchema[]>([]);
  const [sheetLoading, setSheetLoading] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [sheetReady, setSheetReady] = useState(false);

  // Available worksheets for multi-tab sheets
  const [availableTabs, setAvailableTabs] = useState<
    { worksheet_name: string | null; form_title: string; fields: FieldSchema[] }[] | null
  >(null);
  // All worksheet tab names (for tab switcher)
  const [allTabNames, setAllTabNames] = useState<string[]>([]);

  // Paste area
  const [pasteText, setPasteText] = useState("");

  // Sheet data loading (for filter mode)
  const [sheetData, setSheetData] = useState<Record<string, string>[] | null>(null);
  const [sheetDataLoading, setSheetDataLoading] = useState(false);
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [dataMode, setDataMode] = useState<"paste" | "filter">("paste");

  // Parsed rows
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);

  // Column mapping (when column count doesn't match)
  const [columnMapping, setColumnMapping] = useState<(string | null)[]>([]);
  const [showMapping, setShowMapping] = useState(false);
  const [parsedRaw, setParsedRaw] = useState<string[][]>([]);

  // Bulk apply
  const [bulkDate, setBulkDate] = useState("");
  const [bulkTime, setBulkTime] = useState("");

  // Submit state
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Editing state
  const [editingCell, setEditingCell] = useState<{ row: number; col: string } | null>(null);

  // Load saved sheets on mount
  useEffect(() => {
    listSavedSheets()
      .then((res) => setSavedSheets(res.items))
      .catch(() => {});
  }, []);

  // Validate sheet URL
  const isValidSheetUrl = useMemo(() => {
    return (
      sheetUrl.includes("docs.google.com/spreadsheets") ||
      /^[a-zA-Z0-9-_]{20,}$/.test(sheetUrl.trim())
    );
  }, [sheetUrl]);

  // Load sheet headers
  const loadSheet = useCallback(async (url: string) => {
    setSheetLoading(true);
    setSheetError(null);
    setSheetReady(false);
    setSheetHeaders([]);
    setAvailableTabs(null);
    setWorksheetName(null);
    setAllTabNames([]);
    try {
      // Fetch all worksheet tab names
      let tabNames: string[] = [];
      try {
        const wsResult = await listWorksheets(url);
        tabNames = wsResult.items;
        setAllTabNames(tabNames);
      } catch {
        // If listing fails, continue with lookupFormsBySheet
      }

      let tabs: { worksheet_name: string | null; form_title: string; fields: FieldSchema[] }[] = [];
      try {
        const result = await lookupFormsBySheet(url);
        tabs = result.items.map((item) => ({
          worksheet_name: item.worksheet_name,
          form_title: item.form_title,
          fields: item.fields,
        }));
      } catch {
        // lookupFormsBySheet may 404 if no forms exist — that's okay
      }

      // If we have multiple actual tabs from listWorksheets, always show tab selection
      if (tabNames.length > 1) {
        // Build tab list from actual worksheet names, merging with form data
        const mergedTabs = tabNames.map((name) => {
          const existing = tabs.find((t) => t.worksheet_name === name);
          return existing ?? { worksheet_name: name, form_title: name, fields: [] as FieldSchema[] };
        });
        setAvailableTabs(mergedTabs);
        return;
      }

      // Single tab from listWorksheets — auto-select it
      if (tabNames.length === 1) {
        const existing = tabs.find((t) => t.worksheet_name === tabNames[0]);
        if (existing && existing.fields.length > 0) {
          setSheetHeaders(existing.fields);
          setWorksheetName(existing.worksheet_name);
          setSheetReady(true);
        } else {
          // Fetch headers via history
          setWorksheetName(tabNames[0]);
          try {
            const { getSheetHistory } = await import("@/lib/api");
            const hist = await getSheetHistory(url, tabNames[0]);
            setSheetHeaders(hist.fields);
            if (hist.worksheet_name) setWorksheetName(hist.worksheet_name);
          } catch (histErr: any) {
            setSheetHeaders([]);
            setSheetError(histErr?.message ?? "Could not read sheet headers");
          }
          setSheetReady(true);
        }
        return;
      }

      // listWorksheets failed or returned empty — use lookupFormsBySheet results or fallback
      if (!tabs.length) {
        // Last resort: try getSheetHistory directly (works for publicly shared sheets)
        try {
          const { getSheetHistory } = await import("@/lib/api");
          const hist = await getSheetHistory(url, null);
          setSheetHeaders(hist.fields);
          setWorksheetName(hist.worksheet_name);
          setAllTabNames([hist.worksheet_name]);
          setSheetReady(true);
        } catch (histErr: any) {
          setSheetError("Could not load this sheet. Make sure it's shared with the service account.");
        }
        return;
      }

      if (tabs.length === 1) {
        if (tabs[0].fields.length > 0) {
          setSheetHeaders(tabs[0].fields);
          setWorksheetName(tabs[0].worksheet_name);
          setSheetReady(true);
        } else {
          // Fields empty — fetch on-demand via history endpoint
          setWorksheetName(tabs[0].worksheet_name);
          try {
            const { getSheetHistory } = await import("@/lib/api");
            let hist;
            try {
              hist = await getSheetHistory(url, tabs[0].worksheet_name);
            } catch {
              // Retry with null (let backend pick first tab)
              hist = await getSheetHistory(url, null);
            }
            setSheetHeaders(hist.fields);
            if (hist.worksheet_name) {
              setWorksheetName(hist.worksheet_name);
            }
          } catch (histErr: any) {
            setSheetHeaders([]);
            setSheetError(histErr?.message ?? "Could not read sheet headers");
          }
          setSheetReady(true);
        }
      } else {
        setAvailableTabs(tabs);
      }
    } catch (e: any) {
      setSheetError(
        typeof e?.message === "string" ? e.message : "Failed to load sheet"
      );
    } finally {
      setSheetLoading(false);
    }
  }, []);

  const selectTab = useCallback(
    async (tab: { worksheet_name: string | null; fields: FieldSchema[] }) => {
      setWorksheetName(tab.worksheet_name);
      setAvailableTabs(null);
      setSheetData(null);
      setColumnFilters({});
      setRows([]);
      setDataMode("paste");

      if (tab.fields.length > 0) {
        setSheetHeaders(tab.fields);
        setSheetReady(true);
      } else {
        // Fetch headers on-demand for tabs without pre-loaded fields
        setSheetLoading(true);
        try {
          const { getSheetHistory } = await import("@/lib/api");
          let result;
          try {
            result = await getSheetHistory(sheetUrl, tab.worksheet_name);
          } catch {
            result = await getSheetHistory(sheetUrl, null);
          }
          setSheetHeaders(result.fields);
          setSheetReady(true);
        } catch {
          // Fallback: set ready with empty headers (user can refresh)
          setSheetHeaders([]);
          setSheetReady(true);
          setSheetError("Could not load columns for this tab. Try Refresh.");
        } finally {
          setSheetLoading(false);
        }
      }
    },
    [sheetUrl]
  );

  // Date/Time columns detection
  const dateColumns = useMemo(
    () => sheetHeaders.filter((f) => f.type === "date"),
    [sheetHeaders]
  );
  const timeColumns = useMemo(
    () => sheetHeaders.filter((f) => f.type === "time"),
    [sheetHeaders]
  );

  // Load sheet data for filter mode
  const loadSheetData = useCallback(async () => {
    if (!sheetUrl || !sheetReady) return;
    setSheetDataLoading(true);
    setSheetError(null);
    try {
      const { getSheetHistory } = await import("@/lib/api");
      let result;
      try {
        result = await getSheetHistory(sheetUrl, worksheetName);
      } catch {
        // Retry with null worksheet (let backend pick first tab)
        result = await getSheetHistory(sheetUrl, null);
      }
      setSheetData(result.rows);
      // Also update headers if we got them and current ones are empty
      if (result.fields.length > 0 && sheetHeaders.length === 0) {
        setSheetHeaders(result.fields);
      }
      setDataMode("filter");
      setColumnFilters({});
    } catch (e: any) {
      setSheetError(e?.message ?? "Failed to load sheet data");
    } finally {
      setSheetDataLoading(false);
    }
  }, [sheetUrl, sheetReady, worksheetName, sheetHeaders.length]);

  // Unique values per column for filter dropdowns
  const columnUniqueValues = useMemo(() => {
    if (!sheetData || !sheetHeaders.length) return {};
    const result: Record<string, string[]> = {};
    for (const field of sheetHeaders) {
      const valSet = new Set<string>();
      for (const row of sheetData) {
        const v = (row[field.key] ?? "").trim();
        if (v) valSet.add(v);
      }
      if (valSet.size > 0 && valSet.size < 500) {
        result[field.key] = [...valSet].sort((a, b) => a.localeCompare(b));
      }
    }
    return result;
  }, [sheetData, sheetHeaders]);

  // Filtered rows from sheet data
  const filteredSheetRows = useMemo(() => {
    if (!sheetData) return [];
    const activeFilters = Object.entries(columnFilters).filter(([, v]) => v);
    if (!activeFilters.length) return sheetData;
    return sheetData.filter((row) =>
      activeFilters.every(([key, val]) => {
        const cellValue = (row[key] ?? "").toLowerCase().trim();
        const filterVal = val.toLowerCase().trim();
        // Support both exact match and contains match
        return cellValue === filterVal || cellValue.includes(filterVal);
      })
    );
  }, [sheetData, columnFilters]);

  // Parse pasted text
  const handleParse = useCallback(() => {
    setParseError(null);
    setRows([]);
    setShowMapping(false);
    setSuccessMsg(null);
    setSubmitError(null);

    if (!pasteText.trim()) {
      setParseError("Please paste some data first");
      return;
    }
    if (!sheetReady || !sheetHeaders.length) {
      setParseError("Please select a sheet first");
      return;
    }

    const parsed = parseText(pasteText);
    if (!parsed.length) {
      setParseError("No rows could be parsed from the input");
      return;
    }

    // Auto-detect and skip header row if first row matches column names
    let dataRows = parsed;
    const headerNames = sheetHeaders.map((h) => h.source_header.toLowerCase().trim());
    const firstRow = parsed[0].map((c) => c.toLowerCase().trim());
    const matchCount = firstRow.filter((c) => headerNames.includes(c)).length;
    if (matchCount >= Math.ceil(headerNames.length * 0.5) && parsed.length > 1) {
      // First row looks like a header — skip it
      dataRows = parsed.slice(1);
    }

    const headerCount = sheetHeaders.length;
    const colCount = dataRows[0]?.length ?? 0;

    if (colCount === headerCount) {
      // Auto-map columns in order
      const mapped = dataRows.map((cells) => {
        const row: Record<string, string> = {};
        sheetHeaders.forEach((h, i) => {
          row[h.source_header] = cells[i] ?? "";
        });
        return row;
      });
      setRows(mapped);
    } else {
      // Show column mapping UI
      setParsedRaw(dataRows);
      const defaultMapping = Array.from({ length: colCount }, (_, i) =>
        i < sheetHeaders.length ? sheetHeaders[i].source_header : null
      );
      setColumnMapping(defaultMapping);
      setShowMapping(true);
    }
  }, [pasteText, sheetReady, sheetHeaders]);

  // Apply column mapping
  const applyMapping = useCallback(() => {
    const mapped = parsedRaw.map((cells) => {
      const row: Record<string, string> = {};
      columnMapping.forEach((header, i) => {
        if (header && cells[i] !== undefined) {
          row[header] = cells[i];
        }
      });
      return row;
    });
    setRows(mapped);
    setShowMapping(false);
  }, [parsedRaw, columnMapping]);

  // Bulk apply date/time
  const applyBulkDate = useCallback(() => {
    if (!bulkDate || !dateColumns.length) return;
    setRows((prev) =>
      prev.map((row) => {
        const updated = { ...row };
        dateColumns.forEach((col) => {
          updated[col.source_header] = bulkDate;
        });
        return updated;
      })
    );
  }, [bulkDate, dateColumns]);

  const applyBulkTime = useCallback(() => {
    if (!bulkTime || !timeColumns.length) return;
    setRows((prev) =>
      prev.map((row) => {
        const updated = { ...row };
        timeColumns.forEach((col) => {
          updated[col.source_header] = bulkTime;
        });
        return updated;
      })
    );
  }, [bulkTime, timeColumns]);

  // Delete row
  const deleteRow = useCallback((idx: number) => {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  // Edit cell
  const updateCell = useCallback(
    (rowIdx: number, header: string, value: string) => {
      setRows((prev) =>
        prev.map((row, i) =>
          i === rowIdx ? { ...row, [header]: value } : row
        )
      );
    },
    []
  );

  // Submit all rows
  const handleSubmit = useCallback(async () => {
    if (!rows.length || !sheetUrl) return;
    setSubmitting(true);
    setSubmitError(null);
    setSuccessMsg(null);
    try {
      const result = await batchAppendRows({
        sheet_url: sheetUrl,
        worksheet_name: worksheetName,
        rows,
      });
      setSuccessMsg(
        `Successfully added ${result.appended_count} rows to the sheet!`
      );
      setRows([]);
      setPasteText("");
    } catch (e: any) {
      setSubmitError(
        typeof e?.message === "string" ? e.message : "Failed to submit rows"
      );
    } finally {
      setSubmitting(false);
    }
  }, [rows, sheetUrl, worksheetName]);

  // ─── Render ─────────────────────────────────────────────────────────

  // Screen 1: URL Input (centered, like multi-header-filter)
  if (!sheetReady && !availableTabs) {
    return (
      <div style={{ display: "flex", flexDirection: "column", minHeight: "100dvh", backgroundColor: "var(--cream)" }}>
        <AppHeader title="Bulk Edit" showBack onBack={() => safeBack(router, "/dashboard")} />
        {sheetLoading && <LoadingOverlay message="Loading sheet..." />}
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ width: "100%", maxWidth: 400 }}>
            <h2 style={{ fontFamily: "var(--font-newsreader), Georgia, serif", fontWeight: 400, fontSize: 22, color: "var(--ink)", marginBottom: 6, textAlign: "center" }}>
              Bulk Edit
            </h2>
            <p style={{ fontFamily: "var(--font-plex-mono), monospace", fontSize: 11, color: "var(--stone)", textAlign: "center", marginBottom: 20, lineHeight: 1.5 }}>
              Paste a Google Sheet URL to load columns and add rows in bulk.
            </p>

            {savedSheets.length > 0 && (
              <select
                style={{ width: "100%", fontFamily: "var(--font-plex-mono), monospace", fontSize: 13, color: "var(--ink)", background: "var(--paper)", border: "1px solid var(--rule)", borderRadius: 6, padding: "11px 14px", outline: "none", marginBottom: 10 }}
                value=""
                onChange={(e) => {
                  const sheet = savedSheets.find((s) => s.id === e.target.value);
                  if (sheet) {
                    setSheetUrl(sheet.sheet_url);
                    loadSheet(sheet.sheet_url);
                  }
                }}
              >
                <option value="">Choose from saved sheets...</option>
                {savedSheets.map((s) => (
                  <option key={s.id} value={s.id}>{s.title}</option>
                ))}
              </select>
            )}

            <input
              type="url"
              value={sheetUrl}
              onChange={(e) => setSheetUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && isValidSheetUrl && loadSheet(sheetUrl)}
              placeholder="Paste Google Sheet URL..."
              style={{ width: "100%", fontFamily: "var(--font-plex-mono), monospace", fontSize: 13, color: "var(--ink)", background: "var(--paper)", border: `1px solid ${sheetError ? "var(--error)" : "var(--rule)"}`, borderRadius: 6, padding: "11px 14px", outline: "none", marginBottom: 8 }}
            />
            {sheetError && <p style={{ color: "var(--error)", fontSize: 11, margin: "0 0 8px", fontFamily: "var(--font-plex-mono), monospace" }}>{sheetError}</p>}
            <SubmitButton
              label="Load Sheet"
              submitting={sheetLoading}
              onClick={() => loadSheet(sheetUrl)}
              disabled={!isValidSheetUrl}
            />
          </div>
        </div>
      </div>
    );
  }

  // Screen 2: Tab Selection (full-width list like multi-header-filter)
  if (availableTabs && !sheetReady) {
    return (
      <div style={{ display: "flex", flexDirection: "column", minHeight: "100dvh", backgroundColor: "var(--cream)" }}>
        <AppHeader title="Bulk Edit" showBack onBack={() => { setAvailableTabs(null); setSheetError(null); }} />
        {sheetLoading && <LoadingOverlay message="Loading..." />}
        <div style={{ flex: 1, padding: 24 }}>
          <h3 style={{ fontFamily: "var(--font-newsreader), Georgia, serif", fontWeight: 400, fontSize: 18, color: "var(--ink)", marginBottom: 16, textAlign: "center" }}>
            Select a tab
          </h3>
          <div style={{ maxWidth: 400, margin: "0 auto", display: "flex", flexDirection: "column", gap: 8 }}>
            {availableTabs.map((tab, i) => (
              <button
                key={i}
                type="button"
                onClick={() => selectTab(tab)}
                style={{ fontFamily: "var(--font-plex-mono), monospace", fontSize: 13, color: "var(--ink)", background: "var(--paper)", border: "1px solid var(--rule)", borderRadius: 6, padding: "12px 16px", cursor: "pointer", textAlign: "left" }}
              >
                {tab.worksheet_name || tab.form_title || `Sheet ${i + 1}`}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Screen 3: Main bulk edit interface (sheet is ready)
  return (
    <div className="flex flex-col min-h-screen bg-zinc-100">
      <AppHeader
        title="Bulk Edit"
        showBack
        onBack={() => {
          if (allTabNames.length > 1) {
            setSheetReady(false);
            setSheetHeaders([]);
            setRows([]);
            setSheetData(null);
            loadSheet(sheetUrl);
          } else {
            safeBack(router, "/dashboard");
          }
        }}
      />
      {(sheetLoading || submitting) && (
        <LoadingOverlay message={submitting ? "Submitting rows..." : "Loading sheet..."} />
      )}

      <div className="flex-1 w-full max-w-[700px] mx-auto px-5 pt-6 pb-10">
        {/* Sheet info + tab switcher */}
        <section className="mb-5">
          <div className="flex items-center gap-3 mb-2">
            <p className="text-[13px] text-emerald-600 font-medium">
              ✓ Sheet loaded — {sheetHeaders.length} columns
            </p>
            <button
              type="button"
              disabled={sheetLoading}
              onClick={() => loadSheet(sheetUrl)}
              className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wider border border-zinc-300 text-zinc-600 rounded-md hover:bg-zinc-200 hover:text-zinc-900 transition-colors disabled:opacity-40"
            >
              ↻ Refresh
            </button>
          </div>
          {allTabNames.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              {allTabNames.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => { if (name !== worksheetName) selectTab({ worksheet_name: name, fields: [] }); }}
                  className={`px-3 py-1.5 text-[11px] font-medium rounded-md border transition-all ${
                    name === worksheetName
                      ? "bg-zinc-900 text-white border-zinc-900"
                      : "bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50 hover:border-zinc-400"
                  }`}
                >
                  {name}
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Data Source */}
        <section className="mb-6">
          <h2 className="text-[13px] font-semibold text-zinc-500 uppercase tracking-wide mb-3">Choose Data Source</h2>
          <div className="flex gap-2 mb-3">
            <button type="button" onClick={() => setDataMode("paste")}
              className={`px-3 py-2 text-[11px] font-semibold uppercase tracking-wider rounded-md border transition-colors ${dataMode === "paste" ? "bg-zinc-900 text-white border-zinc-900" : "bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50"}`}>
              Paste Data
            </button>
            <button type="button" onClick={() => { setDataMode("filter"); if (!sheetData) loadSheetData(); }}
              className={`px-3 py-2 text-[11px] font-semibold uppercase tracking-wider rounded-md border transition-colors ${dataMode === "filter" ? "bg-zinc-900 text-white border-zinc-900" : "bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50"}`}>
              Filter from Sheet
            </button>
          </div>

          {/* Paste mode */}
          {dataMode === "paste" && (
            <>
              <textarea
                className="w-full min-h-[160px] px-4 py-3 text-[13px] font-mono border border-zinc-200 rounded-lg bg-white text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-400 resize-y"
                placeholder={"Paste rows here from Excel, WhatsApp, or any text source.\nTab-separated or comma-separated columns will be auto-detected.\n\nTip: Copy from Google Sheets directly."}
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
              />
              <div className="mt-2 flex items-center gap-3">
                <button type="button" disabled={!pasteText.trim() || !sheetReady} onClick={handleParse}
                  className="px-4 py-2 text-[12px] font-semibold uppercase tracking-wider bg-zinc-900 text-white rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-zinc-800 transition-colors">
                  Parse & Preview
                </button>
              </div>
            </>
          )}

          {/* Filter mode */}
          {dataMode === "filter" && (
            <>
              {sheetDataLoading && (
                <p className="text-[12px] text-zinc-500">Loading sheet data...</p>
              )}

              {sheetData && (
                <div className="space-y-3">
                  <p className="text-[12px] text-zinc-500">
                    {sheetData.length.toLocaleString()} total rows loaded. Use filters to select rows:
                  </p>

                  {/* Filter dropdowns */}
                  <div className="p-3 border border-zinc-200 rounded-lg bg-white">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wide">
                        Column Filters
                      </span>
                      {Object.values(columnFilters).some((v) => v) && (
                        <button
                          type="button"
                          onClick={() => setColumnFilters({})}
                          className="text-[11px] text-zinc-400 underline hover:text-zinc-600"
                        >
                          Clear all
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                      {sheetHeaders.map((field) => {
                        const uniqueVals = columnUniqueValues[field.key];
                        if (!uniqueVals) return null;
                        return (
                          <FilterSelect
                            key={field.key}
                            label={field.label}
                            value={columnFilters[field.key] ?? ""}
                            options={uniqueVals}
                            onChange={(val) =>
                              setColumnFilters((prev) => ({
                                ...prev,
                                [field.key]: val,
                              }))
                            }
                          />
                        );
                      })}
                    </div>

                    {Object.values(columnFilters).some((v) => v) && (
                      <p className="mt-2 text-[12px] text-emerald-600 font-medium">
                        {filteredSheetRows.length.toLocaleString()} rows match filters
                      </p>
                    )}
                  </div>

                  {/* Use filtered rows button */}
                  <button
                    type="button"
                    disabled={!filteredSheetRows.length}
                    onClick={() => {
                      // Convert filtered rows to use source_header keys for submission
                      const mapped = filteredSheetRows.map((row) => {
                        const newRow: Record<string, string> = {};
                        sheetHeaders.forEach((h) => {
                          newRow[h.source_header] = row[h.key] ?? "";
                        });
                        return newRow;
                      });
                      setRows(mapped);
                    }}
                    className="px-4 py-2 text-[12px] font-semibold uppercase tracking-wider bg-zinc-900 text-white rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-zinc-800 transition-colors"
                  >
                    Use {Object.values(columnFilters).some((v) => v) ? `Filtered (${filteredSheetRows.length})` : `All (${sheetData.length})`} Rows
                  </button>
                </div>
              )}
            </>
          )}

          {parseError && (
            <p className="mt-2 text-[13px] text-red-600">{parseError}</p>
          )}
        </section>

        {/* ─── Column Mapping UI ─── */}
        {showMapping && (
          <section className="mb-6 p-4 border border-amber-200 rounded-lg bg-amber-50">
            <h3 className="text-[13px] font-semibold text-amber-800 mb-3">
              Column count mismatch — Map your columns
            </h3>
            <p className="text-[12px] text-amber-700 mb-3">
              Your data has {parsedRaw[0]?.length ?? 0} columns but the sheet
              has {sheetHeaders.length}. Assign each parsed column to a sheet
              header:
            </p>
            <div className="space-y-2">
              {columnMapping.map((mapped, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-[12px] text-zinc-600 w-20 shrink-0">
                    Col {i + 1}
                    {parsedRaw[0]?.[i] && (
                      <span className="text-zinc-400 ml-1">
                        ({parsedRaw[0][i].slice(0, 15)}
                        {(parsedRaw[0][i].length > 15) ? "…" : ""})
                      </span>
                    )}
                  </span>
                  <select
                    className="flex-1 px-2 py-1.5 text-[13px] border border-zinc-200 rounded bg-white"
                    value={mapped ?? ""}
                    onChange={(e) => {
                      const newMapping = [...columnMapping];
                      newMapping[i] = e.target.value || null;
                      setColumnMapping(newMapping);
                    }}
                  >
                    <option value="">— Skip —</option>
                    {sheetHeaders.map((h) => (
                      <option key={h.key} value={h.source_header}>
                        {h.label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={applyMapping}
              className="mt-3 px-4 py-2 text-[12px] font-semibold uppercase tracking-wider bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 transition-colors"
            >
              Apply Mapping
            </button>
          </section>
        )}

        {/* ─── Step 3: Preview Grid + Bulk Apply ─── */}
        {rows.length > 0 && (
          <section className="mb-6">
            <h2 className="text-[13px] font-semibold text-zinc-500 uppercase tracking-wide mb-3">
              3. Preview & Edit ({rows.length} rows)
            </h2>

            {/* Bulk Apply Controls */}
            {(dateColumns.length > 0 || timeColumns.length > 0) && (
              <div className="mb-4 p-3 border border-zinc-200 rounded-lg bg-white flex flex-wrap items-end gap-3">
                <span className="text-[12px] font-medium text-zinc-600 uppercase tracking-wide">
                  Bulk Apply:
                </span>
                {dateColumns.length > 0 && (
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      className="px-2 py-1.5 text-[13px] border border-zinc-200 rounded bg-white"
                      value={bulkDate}
                      onChange={(e) => setBulkDate(e.target.value)}
                    />
                    <button
                      type="button"
                      disabled={!bulkDate}
                      onClick={applyBulkDate}
                      className="px-3 py-1.5 text-[11px] font-semibold uppercase bg-blue-600 text-white rounded disabled:opacity-40 hover:bg-blue-700 transition-colors"
                    >
                      Set Date
                    </button>
                  </div>
                )}
                {timeColumns.length > 0 && (
                  <div className="flex items-center gap-2">
                    <input
                      type="time"
                      className="px-2 py-1.5 text-[13px] border border-zinc-200 rounded bg-white"
                      value={bulkTime}
                      onChange={(e) => setBulkTime(e.target.value)}
                    />
                    <button
                      type="button"
                      disabled={!bulkTime}
                      onClick={applyBulkTime}
                      className="px-3 py-1.5 text-[11px] font-semibold uppercase bg-blue-600 text-white rounded disabled:opacity-40 hover:bg-blue-700 transition-colors"
                    >
                      Set Time
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Preview Table */}
            <div className="border border-zinc-200 rounded-lg overflow-hidden bg-white">
              <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                <table className="w-full text-[12px]">
                  <thead className="sticky top-0 bg-zinc-50 border-b border-zinc-200 z-10">
                    <tr>
                      <th className="px-2 py-2 text-left text-zinc-500 font-medium w-10">
                        #
                      </th>
                      {sheetHeaders.map((h) => (
                        <th
                          key={h.key}
                          className="px-2 py-2 text-left text-zinc-500 font-medium whitespace-nowrap"
                        >
                          {h.label}
                        </th>
                      ))}
                      <th className="px-2 py-2 w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {rows.map((row, rowIdx) => (
                      <tr key={rowIdx} className="hover:bg-zinc-50">
                        <td className="px-2 py-1.5 text-zinc-400 font-mono">
                          {rowIdx + 1}
                        </td>
                        {sheetHeaders.map((h) => {
                          const isEditing =
                            editingCell?.row === rowIdx &&
                            editingCell?.col === h.source_header;
                          const cellValue = row[h.source_header] ?? "";
                          return (
                            <td
                              key={h.key}
                              className={`px-2 py-1.5 ${
                                !cellValue
                                  ? "bg-zinc-50"
                                  : ""
                              }`}
                              onClick={() =>
                                setEditingCell({
                                  row: rowIdx,
                                  col: h.source_header,
                                })
                              }
                            >
                              {isEditing ? (
                                <input
                                  type="text"
                                  autoFocus
                                  className="w-full px-1 py-0.5 text-[12px] border border-blue-400 rounded bg-white outline-none"
                                  value={cellValue}
                                  onChange={(e) =>
                                    updateCell(
                                      rowIdx,
                                      h.source_header,
                                      e.target.value
                                    )
                                  }
                                  onBlur={() => setEditingCell(null)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === "Escape")
                                      setEditingCell(null);
                                  }}
                                />
                              ) : (
                                <span
                                  className={`cursor-pointer ${
                                    cellValue
                                      ? "text-zinc-900"
                                      : "text-zinc-300 italic"
                                  }`}
                                >
                                  {cellValue || "—"}
                                </span>
                              )}
                            </td>
                          );
                        })}
                        <td className="px-1 py-1.5">
                          <button
                            type="button"
                            onClick={() => deleteRow(rowIdx)}
                            className="w-6 h-6 flex items-center justify-center text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                            aria-label={`Delete row ${rowIdx + 1}`}
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Submit button */}
            <div className="mt-4 flex items-center gap-3">
              <button
                type="button"
                disabled={!rows.length || submitting}
                onClick={handleSubmit}
                className="px-6 py-2.5 text-[13px] font-semibold uppercase tracking-wider bg-emerald-700 text-white rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-emerald-800 transition-colors"
              >
                Submit All ({rows.length} rows)
              </button>
              <button
                type="button"
                onClick={() => setRows([])}
                className="px-4 py-2.5 text-[13px] font-medium text-zinc-600 hover:text-zinc-900 transition-colors"
              >
                Clear
              </button>
            </div>
          </section>
        )}

        {/* Success / Error messages */}
        {successMsg && (
          <div className="mb-4 px-4 py-3 rounded-lg bg-emerald-50 border border-emerald-200 text-[13px] text-emerald-700 font-medium">
            {successMsg}
          </div>
        )}
        {submitError && (
          <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-[13px] text-red-700 font-medium">
            {submitError}
          </div>
        )}
      </div>
    </div>
  );
}
