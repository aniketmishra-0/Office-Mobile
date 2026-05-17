"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import LoadingOverlay from "@/components/LoadingOverlay";
import SubmitButton from "@/components/SubmitButton";
import MobileDropdown from "@/components/MobileDropdown";
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

  // Detect delimiter: tabs first, then commas
  const hasTab = raw.includes("\t");
  const delimiter = hasTab ? "\t" : ",";

  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = "";
  let inQuotes = false;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    const nextCh = raw[i + 1];

    if (ch === '"') {
      if (inQuotes && nextCh === '"') {
        // Escaped quote
        currentCell += '"';
        i++; // Skip the next quote
      } else {
        // Toggle quotes
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      // End of cell
      currentRow.push(currentCell.trim());
      currentCell = "";
    } else if ((ch === '\n' || (ch === '\r' && nextCh === '\n')) && !inQuotes) {
      // End of row
      if (ch === '\r') i++; // Skip \n
      currentRow.push(currentCell.trim());
      rows.push(currentRow);
      currentRow = [];
      currentCell = "";
    } else {
      currentCell += ch;
    }
  }

  // Push the last cell and row if anything is left
  if (currentCell || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    // Only push if row is not just a single empty string (e.g., trailing newline)
    if (currentRow.length > 1 || currentRow[0] !== "") {
      rows.push(currentRow);
    }
  }

  return rows;
}

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// ---------------------------------------------------------------------------
// Date format detection & conversion
// ---------------------------------------------------------------------------

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTH_FULL = ["January","February","March","April","May","June","July","August","September","October","November","December"];

/** Detect date format from existing sheet data samples */
function detectDateFormat(samples: string[]): string {
  // Try to find a pattern from the first few non-empty samples
  for (const sample of samples.slice(0, 20)) {
    const s = sample.trim();
    if (!s) continue;
    // DD-MMM-YYYY (e.g. 16-May-2026)
    if (/^\d{1,2}[-/]\w{3}[-/]\d{4}$/.test(s)) return "DD-MMM-YYYY";
    // DD-MMM-YY (e.g. 16-May-26)
    if (/^\d{1,2}[-/]\w{3}[-/]\d{2}$/.test(s)) return "DD-MMM-YY";
    // DD/MM/YYYY (e.g. 16/05/2026)
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) return "DD/MM/YYYY";
    // MM/DD/YYYY (e.g. 05/16/2026) — assume if first num > 12 it's DD/MM
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) {
      const parts = s.split("/");
      return parseInt(parts[0]) > 12 ? "DD/MM/YYYY" : "MM/DD/YYYY";
    }
    // YYYY-MM-DD (e.g. 2026-05-16)
    if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(s)) return "YYYY-MM-DD";
    // DD-MM-YYYY (e.g. 16-05-2026)
    if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(s)) return "DD-MM-YYYY";
    // D Month YYYY (e.g. 16 May 2026)
    if (/^\d{1,2}\s+\w+\s+\d{4}$/.test(s)) return "DD MMMM YYYY";
  }
  return "DD-MMM-YYYY"; // default
}

/** Parse any date input into a Date object */
function parseAnyDate(input: string): Date | null {
  const s = input.trim();
  if (!s) return null;

  // Try native Date parse first (handles ISO, common formats)
  // But first try specific patterns

  // DD-MMM-YYYY or DD/MMM/YYYY
  const dmy3 = s.match(/^(\d{1,2})[-/\s](\w{3,})[-/\s](\d{2,4})$/);
  if (dmy3) {
    const day = parseInt(dmy3[1]);
    const monStr = dmy3[2].toLowerCase();
    let year = parseInt(dmy3[3]);
    if (year < 100) year += 2000;
    const monIdx = MONTH_NAMES.findIndex((m) => m.toLowerCase() === monStr.slice(0, 3));
    if (monIdx >= 0) return new Date(year, monIdx, day);
  }

  // DD/MM/YYYY or DD-MM-YYYY
  const dmy = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmy) {
    const a = parseInt(dmy[1]);
    const b = parseInt(dmy[2]);
    const year = parseInt(dmy[3]);
    // If first > 12, it must be day
    if (a > 12) return new Date(year, b - 1, a);
    // If second > 12, it must be day
    if (b > 12) return new Date(year, a - 1, b);
    // Ambiguous — assume DD/MM/YYYY (Indian format)
    return new Date(year, b - 1, a);
  }

  // YYYY-MM-DD
  const ymd = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (ymd) {
    return new Date(parseInt(ymd[1]), parseInt(ymd[2]) - 1, parseInt(ymd[3]));
  }

  // MM/DD/YYYY (US format — only if clearly month first)
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) {
    const m = parseInt(mdy[1]);
    const d = parseInt(mdy[2]);
    if (m <= 12 && d > 12) return new Date(parseInt(mdy[3]), m - 1, d);
  }

  // Try "today", "yesterday", "tomorrow"
  const lower = s.toLowerCase();
  const now = new Date();
  if (lower === "today" || lower === "aaj") return now;
  if (lower === "yesterday" || lower === "kal" || lower === "kl") {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  }
  if (lower === "tomorrow") {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  }

  // Fallback: native Date parse
  const native = new Date(s);
  if (!isNaN(native.getTime())) return native;

  return null;
}

/** Format a Date object to the detected sheet format */
function formatDateToSheet(date: Date, format: string): string {
  const day = date.getDate();
  const month = date.getMonth(); // 0-indexed
  const year = date.getFullYear();
  const dd = String(day).padStart(2, "0");
  const mm = String(month + 1).padStart(2, "0");

  switch (format) {
    case "DD-MMM-YYYY":
      return `${day}-${MONTH_NAMES[month]}-${year}`;
    case "DD-MMM-YY":
      return `${day}-${MONTH_NAMES[month]}-${String(year).slice(-2)}`;
    case "DD/MM/YYYY":
      return `${dd}/${mm}/${year}`;
    case "DD-MM-YYYY":
      return `${dd}-${mm}-${year}`;
    case "MM/DD/YYYY":
      return `${mm}/${dd}/${year}`;
    case "YYYY-MM-DD":
      return `${year}-${mm}-${dd}`;
    case "DD MMMM YYYY":
      return `${day} ${MONTH_FULL[month]} ${year}`;
    default:
      return `${day}-${MONTH_NAMES[month]}-${year}`;
  }
}

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
    <div ref={ref} style={{ position: "relative", minWidth: 0 }}>
      <label style={{
        display: "block",
        fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
        fontSize: 9,
        fontWeight: 500,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: "var(--stone)",
        marginBottom: 2,
        paddingLeft: 2,
      }}>
        {label}
      </label>
      <button
        type="button"
        onClick={() => { setOpen(!open); setSearch(""); }}
        style={{
          width: "100%",
          padding: "7px 8px",
          fontSize: 11,
          fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
          textAlign: "left",
          border: value ? "1px solid rgba(200, 98, 58, 0.4)" : "1px solid var(--rule)",
          borderRadius: 0,
          background: value ? "rgba(200, 98, 58, 0.06)" : "var(--cream)",
          color: value ? "var(--ink)" : "var(--stone)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 4,
          cursor: "pointer",
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value || "All"}</span>
        {value ? (
          <span
            onClick={(e) => { e.stopPropagation(); onChange(""); setOpen(false); }}
            style={{ color: "var(--stone)", fontSize: 13, lineHeight: 1, flexShrink: 0, cursor: "pointer" }}
          >
            ×
          </span>
        ) : (
          <svg style={{ width: 12, height: 12, flexShrink: 0, color: "var(--stone)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </button>
      {open && (
        <div style={{
          position: "absolute",
          zIndex: 50,
          marginTop: 4,
          left: 0,
          right: 0,
          background: "var(--cream)",
          border: "1px solid var(--rule)",
          overflow: "hidden",
        }}>
          {options.length > 6 && (
            <div style={{ padding: 6, borderBottom: "1px solid var(--rule)" }}>
              <input
                type="text"
                autoFocus
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  width: "100%",
                  padding: "5px 8px",
                  fontSize: 11,
                  fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                  border: "1px solid var(--rule)",
                  borderRadius: 0,
                  background: "var(--paper)",
                  color: "var(--ink)",
                  outline: "none",
                }}
              />
            </div>
          )}
          <div style={{ maxHeight: 180, overflowY: "auto" }}>
            <button
              type="button"
              onClick={() => { onChange(""); setOpen(false); setSearch(""); }}
              style={{
                width: "100%",
                textAlign: "left",
                padding: "7px 12px",
                fontSize: 11,
                fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                background: "transparent",
                border: 0,
                color: !value ? "var(--clay)" : "var(--stone)",
                fontWeight: !value ? 500 : 400,
                cursor: "pointer",
              }}
            >
              All
            </button>
            {filtered.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => { onChange(opt); setOpen(false); setSearch(""); }}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: "7px 12px",
                  fontSize: 11,
                  fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                  background: opt === value ? "rgba(200, 98, 58, 0.06)" : "transparent",
                  border: 0,
                  color: opt === value ? "var(--clay)" : "var(--ink)",
                  fontWeight: opt === value ? 500 : 400,
                  cursor: "pointer",
                }}
              >
                {opt}
              </button>
            ))}
            {filtered.length === 0 && (
              <p style={{
                padding: "8px 12px",
                fontSize: 11,
                fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                color: "var(--stone)",
                fontStyle: "italic",
                margin: 0,
              }}>No matches</p>
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
  const [dataMode, setDataMode] = useState<"paste" | "filter" | "manual">("paste");

  // Manual entry form state
  const [manualRow, setManualRow] = useState<Record<string, string>>({});
  const [manualBatches, setManualBatches] = useState<string[]>([]);

  // Detected date format from sheet data
  const detectedDateFormat = useMemo(() => {
    if (!sheetData || !sheetHeaders.length) return "DD-MMM-YYYY";
    const dateField = sheetHeaders.find((f) => f.type === "date" || f.label.toLowerCase().includes("date"));
    if (!dateField) return "DD-MMM-YYYY";
    const samples = sheetData.slice(0, 30).map((row) => row[dateField.key] ?? "").filter((v) => v.trim());
    return detectDateFormat(samples);
  }, [sheetData, sheetHeaders]);

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

          // Sheet is accessible — retry listWorksheets now that OAuth token
          // may have been refreshed by the history call
          try {
            const wsRetry = await listWorksheets(url);
            if (wsRetry.items.length > 1) {
              setAllTabNames(wsRetry.items);
              const mergedTabs = wsRetry.items.map((name) => ({
                worksheet_name: name,
                form_title: name,
                fields: name === hist.worksheet_name ? hist.fields : [] as FieldSchema[],
              }));
              setAvailableTabs(mergedTabs);
              setSheetReady(false);
              setSheetHeaders([]);
              return;
            }
            if (wsRetry.items.length === 1) {
              setAllTabNames(wsRetry.items);
            }
          } catch {
            // Still can't list tabs — proceed with single tab
            setAllTabNames([hist.worksheet_name]);
          }

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

    let dataRows = parsed;
    const sheetHeaderNorms = sheetHeaders.map((h) => normalizeHeader(h.source_header));
    const firstRowNorms = parsed[0].map((c) => normalizeHeader(c));
    const matchCount = firstRowNorms.filter((c) => c !== "" && sheetHeaderNorms.includes(c)).length;

    // If we detect headers in the first row, auto-map by normalized match
    if (matchCount > 0 && parsed.length > 1) {
      dataRows = parsed.slice(1);
      const mapped = dataRows.map((cells) => {
        const row: Record<string, string> = {};
        firstRowNorms.forEach((colHeader, i) => {
          if (!colHeader) return;
          const matchedHeader = sheetHeaders.find(
            (h) =>
              normalizeHeader(h.source_header) === colHeader ||
              normalizeHeader(h.label) === colHeader
          );
          if (matchedHeader && cells[i] !== undefined) {
            row[matchedHeader.source_header] = cells[i];
          }
        });
        return row;
      });
      setRows(mapped);
      return;
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
      
      // Attempt to auto-map default values in the UI by matching the first row values against headers
      const defaultMapping = Array.from({ length: colCount }, (_, i) => {
        const valNorm = normalizeHeader(parsed[0][i] || "");
        if (valNorm) {
          const match = sheetHeaders.find(
            (h) => normalizeHeader(h.source_header) === valNorm || normalizeHeader(h.label) === valNorm
          );
          if (match) return match.source_header;
        }
        return i < sheetHeaders.length ? sheetHeaders[i].source_header : null;
      });
      
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
      // Extract row numbers from updated_range (e.g. "Sheet1!A31743:I31750")
      let rangeInfo = "";
      if (result.updated_range) {
        const rangeMatch = result.updated_range.match(/!?[A-Z]+(\d+):[A-Z]+(\d+)/);
        if (rangeMatch) {
          rangeInfo = ` (Rows ${rangeMatch[1]}–${rangeMatch[2]})`;
        }
      }
      setSuccessMsg(
        `✓ ${result.appended_count} rows added to "${worksheetName || "Sheet"}"${rangeInfo}`
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
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100dvh", backgroundColor: "var(--cream)" }}>
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

      <div className="flex-1 w-full max-w-[560px] mx-auto" style={{ padding: "20px 16px 40px" }}>

        {/* Sheet info bar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, paddingBottom: 14, borderBottom: "1px solid var(--rule)" }}>
          <div>
            <h2 style={{
              fontFamily: "var(--font-newsreader), Georgia, serif",
              fontWeight: 400,
              fontSize: 18,
              color: "var(--ink)",
              margin: 0,
            }}>
              {worksheetName || "Sheet"}
            </h2>
            <p style={{
              fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
              fontWeight: 300,
              fontSize: 10,
              letterSpacing: "0.04em",
              color: "var(--stone)",
              margin: "2px 0 0 0",
            }}>
              {sheetHeaders.length} columns{rows.length > 0 ? ` · ${rows.length} rows queued` : ""}
            </p>
          </div>
          {allTabNames.length > 1 && (
            <button
              type="button"
              onClick={() => {
                setSheetReady(false);
                setSheetHeaders([]);
                setRows([]);
                setSheetData(null);
                loadSheet(sheetUrl);
              }}
              style={{
                fontSize: 10,
                fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                fontWeight: 500,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "var(--stone)",
                background: "none",
                border: "1px solid var(--rule)",
                padding: "6px 10px",
                cursor: "pointer",
              }}
            >
              Change Tab
            </button>
          )}
        </div>

        {/* Data Source */}
        <section style={{ marginBottom: 24 }}>
          <p style={{
            fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
            fontWeight: 500,
            fontSize: 10,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--stone)",
            margin: "0 0 12px 0",
          }}>
            Choose Data Source
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 0, border: "1px solid var(--rule)", marginBottom: 16 }}>
            <button type="button" onClick={() => setDataMode("paste")}
              style={{
                padding: "12px 10px",
                background: dataMode === "paste" ? "var(--ink)" : "transparent",
                color: dataMode === "paste" ? "var(--on-ink)" : "var(--ink)",
                border: 0,
                fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                fontWeight: 500,
                fontSize: 10,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                cursor: "pointer",
              }}>
              Paste Data
            </button>
            <button type="button" onClick={() => { setDataMode("filter"); if (!sheetData) loadSheetData(); }}
              style={{
                padding: "12px 10px",
                background: dataMode === "filter" ? "var(--ink)" : "transparent",
                color: dataMode === "filter" ? "var(--on-ink)" : "var(--ink)",
                border: 0,
                borderLeft: "1px solid var(--rule)",
                fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                fontWeight: 500,
                fontSize: 10,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                cursor: "pointer",
              }}>
              Filter Sheet
            </button>
            <button type="button" onClick={() => { setDataMode("manual"); if (!sheetData) loadSheetData(); }}
              style={{
                padding: "12px 10px",
                background: dataMode === "manual" ? "var(--ink)" : "transparent",
                color: dataMode === "manual" ? "var(--on-ink)" : "var(--ink)",
                border: 0,
                borderLeft: "1px solid var(--rule)",
                fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                fontWeight: 500,
                fontSize: 10,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                cursor: "pointer",
              }}>
              Add Manually
            </button>
          </div>

          {/* Paste mode */}
          {dataMode === "paste" && (
            <>
              <textarea
                style={{
                  width: "100%",
                  minHeight: 160,
                  padding: "12px 14px",
                  fontSize: 13,
                  fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                  color: "var(--ink)",
                  background: "var(--paper)",
                  border: "1px solid var(--rule)",
                  borderRadius: 0,
                  outline: "none",
                  resize: "vertical",
                }}
                placeholder={"Paste rows here from Excel, WhatsApp, or any text source.\nTab-separated or comma-separated columns will be auto-detected.\n\nTip: Copy from Google Sheets directly."}
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
              />
              <div style={{ marginTop: 12 }}>
                <SubmitButton
                  label="Parse & Preview"
                  submitting={false}
                  onClick={handleParse}
                  disabled={!pasteText.trim() || !sheetReady}
                />
              </div>
            </>
          )}

          {/* Filter mode */}
          {dataMode === "filter" && (
            <>
              {sheetDataLoading && (
                <p style={{ fontSize: 12, fontFamily: "var(--font-plex-mono), ui-monospace, monospace", color: "var(--stone)" }}>Loading sheet data...</p>
              )}

              {sheetData && (
                <div>
                  <p style={{
                    fontSize: 11,
                    fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                    color: "var(--stone)",
                    margin: "0 0 16px 0",
                  }}>
                    {sheetData.length.toLocaleString()} total rows loaded. Use filters to select rows:
                  </p>

                  {/* Filter dropdowns — form-fill style, each field stacked */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                    {sheetHeaders.map((field) => {
                      const uniqueVals = columnUniqueValues[field.key];
                      if (!uniqueVals) return null;
                      return (
                        <div key={field.key} style={{ padding: "14px 0", borderBottom: "1px solid var(--rule)" }}>
                          <label style={{
                            display: "block",
                            fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                            fontWeight: 500,
                            fontSize: 10,
                            letterSpacing: "0.14em",
                            textTransform: "uppercase",
                            color: "var(--charcoal)",
                            marginBottom: 8,
                          }}>
                            {field.label}
                          </label>
                          <MobileDropdown
                            value={columnFilters[field.key] ?? ""}
                            options={[{ value: "", label: "All" }, ...uniqueVals.map((v) => ({ value: v, label: v }))]}
                            onChange={(val) =>
                              setColumnFilters((prev) => ({
                                ...prev,
                                [field.key]: val,
                              }))
                            }
                            placeholder="All"
                          />
                        </div>
                      );
                    })}
                  </div>

                  {/* Active filter count */}
                  {Object.values(columnFilters).some((v) => v) && (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 14 }}>
                      <p style={{
                        fontSize: 11,
                        fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                        fontWeight: 500,
                        color: "var(--clay)",
                        margin: 0,
                      }}>
                        {filteredSheetRows.length.toLocaleString()} rows match
                      </p>
                      <button
                        type="button"
                        onClick={() => setColumnFilters({})}
                        style={{
                          fontSize: 10,
                          fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                          color: "var(--stone)",
                          background: "none",
                          border: 0,
                          textDecoration: "underline",
                          cursor: "pointer",
                        }}
                      >
                        Clear all filters
                      </button>
                    </div>
                  )}

                  {/* Use rows button — full width */}
                  <div style={{ marginTop: 20 }}>
                    <SubmitButton
                      label={Object.values(columnFilters).some((v) => v) ? `Use Filtered (${filteredSheetRows.length}) Rows` : `Use All (${sheetData.length}) Rows`}
                      submitting={false}
                      onClick={() => {
                        const mapped = filteredSheetRows.map((row) => {
                          const newRow: Record<string, string> = {};
                          sheetHeaders.forEach((h) => {
                            newRow[h.source_header] = row[h.key] ?? "";
                          });
                          return newRow;
                        });
                        setRows(mapped);
                      }}
                      disabled={!filteredSheetRows.length}
                    />
                  </div>
                </div>
              )}
            </>
          )}

          {/* Manual entry mode — form-fill style */}
          {dataMode === "manual" && (
            <div>
              {(sheetDataLoading || !sheetData) && (
                <p style={{ fontSize: 12, fontFamily: "var(--font-plex-mono), ui-monospace, monospace", color: "var(--stone)", margin: "0 0 16px 0" }}>
                  Loading field options...
                </p>
              )}
              {sheetData && (<>
              <p style={{
                fontSize: 11,
                fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                color: "var(--stone)",
                margin: "0 0 16px 0",
              }}>
                Fill each field below. Batch Name supports multiple selection — each batch will create a separate row.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                {sheetHeaders.map((field) => {
                  const uniqueVals = columnUniqueValues[field.key];
                  const hasDropdown = uniqueVals && uniqueVals.length > 0 && uniqueVals.length < 200;
                  const isBatchField = field.label.toLowerCase().includes("batch");
                  const isDateField = field.type === "date" || field.label.toLowerCase().includes("date");
                  const isTimeField = field.type === "time" || field.label.toLowerCase().includes("time");

                  return (
                    <div key={field.key} style={{ padding: "14px 0", borderBottom: "1px solid var(--rule)" }}>
                      <label style={{
                        display: "block",
                        fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                        fontWeight: 500,
                        fontSize: 10,
                        letterSpacing: "0.14em",
                        textTransform: "uppercase",
                        color: "var(--charcoal)",
                        marginBottom: 8,
                      }}>
                        {field.label}
                        {isBatchField && (
                          <span style={{ color: "var(--stone)", fontWeight: 400, letterSpacing: "0.04em", textTransform: "none", marginLeft: 6 }}>
                            (multi-select)
                          </span>
                        )}
                      </label>

                      {/* Batch field — multi-select with search */}
                      {isBatchField ? (
                        <MobileDropdown
                          multiple
                          selectedValues={manualBatches}
                          options={(uniqueVals || []).map((v) => ({ value: v, label: v }))}
                          onMultiChange={(vals) => setManualBatches(vals)}
                          placeholder="Search or add batch name..."
                          allowCreate={true}
                        />
                      ) : isDateField ? (
                        /* Date field — native date picker, auto-formats to sheet format */
                        <div>
                          <input
                            type="date"
                            value={manualRow[field.source_header] ?? ""}
                            onChange={(e) => setManualRow((prev) => ({ ...prev, [field.source_header]: e.target.value }))}
                            style={{
                              width: "100%",
                              fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                              fontWeight: 400,
                              fontSize: 14,
                              color: "var(--ink)",
                              background: "transparent",
                              border: 0,
                              borderBottom: "2px solid var(--ink)",
                              borderRadius: 0,
                              padding: "8px 0",
                              outline: "none",
                            }}
                          />
                          <p style={{
                            fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                            fontSize: 9,
                            color: "var(--stone)",
                            margin: "4px 0 0 0",
                            letterSpacing: "0.04em",
                          }}>
                            will be saved as: {detectedDateFormat.toLowerCase()}
                          </p>
                        </div>
                      ) : isTimeField ? (
                        /* Time field — manual text input with AM/PM, no dropdown */
                        <input
                          type="text"
                          value={manualRow[field.source_header] ?? ""}
                          onChange={(e) => setManualRow((prev) => ({ ...prev, [field.source_header]: e.target.value }))}
                          placeholder="e.g. Morning, Evening, 9:00 AM"
                          style={{
                            width: "100%",
                            fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                            fontWeight: 400,
                            fontSize: 14,
                            color: "var(--ink)",
                            background: "transparent",
                            border: 0,
                            borderBottom: "2px solid var(--ink)",
                            borderRadius: 0,
                            padding: "8px 0",
                            outline: "none",
                          }}
                        />
                      ) : hasDropdown ? (
                        <MobileDropdown
                          value={manualRow[field.source_header] ?? ""}
                          options={uniqueVals.map((v) => ({ value: v, label: v }))}
                          onChange={(val) => setManualRow((prev) => ({ ...prev, [field.source_header]: val }))}
                          placeholder={`Select ${field.label.toLowerCase()}`}
                        />
                      ) : (
                        <input
                          type={field.type === "time" ? "time" : field.type === "number" ? "number" : "text"}
                          value={manualRow[field.source_header] ?? ""}
                          onChange={(e) => setManualRow((prev) => ({ ...prev, [field.source_header]: e.target.value }))}
                          placeholder={`Enter ${field.label.toLowerCase()}`}
                          style={{
                            width: "100%",
                            fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                            fontWeight: 400,
                            fontSize: 14,
                            color: "var(--ink)",
                            background: "transparent",
                            border: 0,
                            borderBottom: "2px solid var(--ink)",
                            borderRadius: 0,
                            padding: "8px 0",
                            outline: "none",
                          }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Selected batches preview */}
              {manualBatches.length > 0 && (
                <div style={{ marginTop: 12, padding: "10px 0", borderBottom: "1px solid var(--rule)" }}>
                  <p style={{
                    fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                    fontSize: 10,
                    fontWeight: 500,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    color: "var(--stone)",
                    margin: "0 0 6px 0",
                  }}>
                    {manualBatches.length} batch{manualBatches.length > 1 ? "es" : ""} selected → {manualBatches.length} row{manualBatches.length > 1 ? "s" : ""} will be created
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {manualBatches.map((b) => (
                      <span key={b} style={{
                        fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                        fontSize: 11,
                        color: "var(--ink)",
                        background: "var(--paper)",
                        border: "1px solid var(--rule)",
                        padding: "4px 8px",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                      }}>
                        {b}
                        <button
                          type="button"
                          onClick={() => setManualBatches((prev) => prev.filter((x) => x !== b))}
                          style={{ background: "none", border: 0, color: "var(--stone)", cursor: "pointer", fontSize: 13, lineHeight: 1, padding: 0 }}
                        >×</button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ marginTop: 20, display: "flex", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <SubmitButton
                    label={manualBatches.length > 1 ? `Add ${manualBatches.length} Rows (${rows.length} queued)` : `Add Row (${rows.length} queued)`}
                    submitting={false}
                    onClick={() => {
                      const hasAnyValue = Object.values(manualRow).some((v) => v.trim());
                      if (!hasAnyValue && manualBatches.length === 0) return;

                      // Convert date fields to sheet format
                      const processedRow = { ...manualRow };
                      sheetHeaders.forEach((f) => {
                        const isDate = f.type === "date" || f.label.toLowerCase().includes("date");
                        if (isDate && processedRow[f.source_header]) {
                          const parsed = parseAnyDate(processedRow[f.source_header]);
                          if (parsed) {
                            processedRow[f.source_header] = formatDateToSheet(parsed, detectedDateFormat);
                          }
                        }
                      });

                      // Find the batch field's source_header
                      const batchField = sheetHeaders.find((f) => f.label.toLowerCase().includes("batch"));
                      const batchHeader = batchField?.source_header;

                      if (manualBatches.length > 0 && batchHeader) {
                        // Create one row per batch, all other data stays same
                        const newRows = manualBatches.map((batchVal) => ({
                          ...processedRow,
                          [batchHeader]: batchVal,
                        }));
                        setRows((prev) => [...prev, ...newRows]);
                      } else {
                        // Single row (no batch multi-select)
                        setRows((prev) => [...prev, { ...processedRow }]);
                      }
                      setManualRow({});
                      setManualBatches([]);
                    }}
                    disabled={!Object.values(manualRow).some((v) => v.trim()) && manualBatches.length === 0}
                  />
                </div>
                {(Object.values(manualRow).some((v) => v) || manualBatches.length > 0) && (
                  <button
                    type="button"
                    onClick={() => { setManualRow({}); setManualBatches([]); }}
                    style={{
                      padding: "10px 16px",
                      fontSize: 10,
                      fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                      fontWeight: 500,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      color: "var(--stone)",
                      background: "none",
                      border: "1px solid var(--rule)",
                      cursor: "pointer",
                    }}
                  >
                    Clear
                  </button>
                )}
              </div>
              </>)}
            </div>
          )}

          {parseError && (
            <p style={{ marginTop: 10, fontSize: 12, fontFamily: "var(--font-plex-mono), ui-monospace, monospace", color: "var(--error)" }}>{parseError}</p>
          )}
        </section>

        {/* ─── Column Mapping UI ─── */}
        {showMapping && (
          <section style={{ marginBottom: 24, padding: 16, border: "1px solid var(--rule)", background: "var(--paper)" }}>
            <h3 style={{
              fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--ink)",
              marginBottom: 10,
            }}>
              Column count mismatch — Map your columns
            </h3>
            <p style={{
              fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
              fontSize: 11,
              color: "var(--stone)",
              marginBottom: 12,
            }}>
              Your data has {parsedRaw[0]?.length ?? 0} columns but the sheet
              has {sheetHeaders.length}. Assign each parsed column to a sheet
              header:
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {columnMapping.map((mapped, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{
                    fontSize: 11,
                    fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                    color: "var(--charcoal)",
                    width: 80,
                    flexShrink: 0,
                  }}>
                    Col {i + 1}
                    {parsedRaw[0]?.[i] && (
                      <span style={{ color: "var(--stone)", marginLeft: 4 }}>
                        ({parsedRaw[0][i].slice(0, 15)}
                        {(parsedRaw[0][i].length > 15) ? "…" : ""})
                      </span>
                    )}
                  </span>
                  <select
                    style={{
                      flex: 1,
                      padding: "7px 10px",
                      fontSize: 12,
                      fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                      border: "1px solid var(--rule)",
                      borderRadius: 0,
                      background: "var(--cream)",
                      color: "var(--ink)",
                    }}
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
            <div style={{ marginTop: 14 }}>
              <SubmitButton
                label="Apply Mapping"
                submitting={false}
                onClick={applyMapping}
              />
            </div>
          </section>
        )}

        {/* ─── Step 3: Preview Grid + Bulk Apply ─── */}
        {rows.length > 0 && (
          <section style={{ marginBottom: 24 }}>
            <p style={{
              fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
              fontWeight: 500,
              fontSize: 10,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--stone)",
              margin: "0 0 14px 0",
            }}>
              Preview & Edit ({rows.length} rows)
            </p>

            {/* Bulk Apply Controls */}
            {(dateColumns.length > 0 || timeColumns.length > 0) && (
              <div style={{ marginBottom: 16, padding: 14, border: "1px solid var(--rule)", display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: 12 }}>
                <span style={{
                  fontSize: 10,
                  fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                  fontWeight: 500,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: "var(--charcoal)",
                }}>
                  Bulk Apply:
                </span>
                {dateColumns.length > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input
                      type="date"
                      style={{ padding: "6px 8px", fontSize: 13, fontFamily: "var(--font-plex-mono), ui-monospace, monospace", border: "1px solid var(--rule)", borderRadius: 0, background: "var(--cream)", color: "var(--ink)" }}
                      value={bulkDate}
                      onChange={(e) => setBulkDate(e.target.value)}
                    />
                    <button
                      type="button"
                      disabled={!bulkDate}
                      onClick={applyBulkDate}
                      style={{
                        padding: "6px 12px",
                        fontSize: 10,
                        fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                        fontWeight: 500,
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                        background: "var(--ink)",
                        color: "var(--on-ink)",
                        border: 0,
                        cursor: "pointer",
                        opacity: bulkDate ? 1 : 0.4,
                      }}
                    >
                      Set Date
                    </button>
                  </div>
                )}
                {timeColumns.length > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input
                      type="time"
                      style={{ padding: "6px 8px", fontSize: 13, fontFamily: "var(--font-plex-mono), ui-monospace, monospace", border: "1px solid var(--rule)", borderRadius: 0, background: "var(--cream)", color: "var(--ink)" }}
                      value={bulkTime}
                      onChange={(e) => setBulkTime(e.target.value)}
                    />
                    <button
                      type="button"
                      disabled={!bulkTime}
                      onClick={applyBulkTime}
                      style={{
                        padding: "6px 12px",
                        fontSize: 10,
                        fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                        fontWeight: 500,
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                        background: "var(--ink)",
                        color: "var(--on-ink)",
                        border: 0,
                        cursor: "pointer",
                        opacity: bulkTime ? 1 : 0.4,
                      }}
                    >
                      Set Time
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Preview Table */}
            <div style={{ border: "1px solid var(--rule)", overflow: "hidden" }}>
              <div style={{ overflowX: "auto", maxHeight: 400, overflowY: "auto" }}>
                <table style={{
                  width: "100%",
                  minWidth: sheetHeaders.length * 140,
                  borderCollapse: "collapse",
                  fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                  fontSize: 12,
                }}>
                  <thead>
                    <tr>
                      <th style={{
                        position: "sticky",
                        top: 0,
                        zIndex: 10,
                        background: "var(--ink)",
                        color: "var(--on-ink)",
                        fontWeight: 500,
                        fontSize: 10,
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                        padding: "10px 8px",
                        textAlign: "center",
                        borderRight: "1px solid rgba(255,255,255,0.1)",
                        width: 40,
                      }}>
                        #
                      </th>
                      {sheetHeaders.map((h, colIdx) => (
                        <th
                          key={h.key}
                          style={{
                            position: "sticky",
                            top: 0,
                            zIndex: 10,
                            background: "var(--ink)",
                            color: "var(--on-ink)",
                            fontWeight: 500,
                            fontSize: 10,
                            letterSpacing: "0.06em",
                            textTransform: "uppercase",
                            padding: "10px 12px",
                            textAlign: "left",
                            whiteSpace: "nowrap",
                            borderRight: colIdx < sheetHeaders.length - 1 ? "1px solid rgba(255,255,255,0.1)" : "none",
                            minWidth: 100,
                          }}
                        >
                          {h.label}
                        </th>
                      ))}
                      <th style={{
                        position: "sticky",
                        top: 0,
                        zIndex: 10,
                        background: "var(--ink)",
                        width: 32,
                        padding: "10px 4px",
                      }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, rowIdx) => (
                      <tr key={rowIdx} style={{ borderBottom: "1px solid var(--rule)" }}>
                        <td style={{ padding: "8px", textAlign: "center", color: "var(--stone)", fontSize: 11 }}>
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
                              style={{
                                padding: "6px 10px",
                                background: !cellValue ? "var(--paper)" : "transparent",
                                cursor: "pointer",
                              }}
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
                                  style={{
                                    width: "100%",
                                    padding: "3px 6px",
                                    fontSize: 12,
                                    fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                                    border: "1px solid var(--clay)",
                                    borderRadius: 0,
                                    background: "var(--cream)",
                                    color: "var(--ink)",
                                    outline: "none",
                                  }}
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
                                <span style={{
                                  color: cellValue ? "var(--ink)" : "var(--stone)",
                                  fontStyle: cellValue ? "normal" : "italic",
                                }}>
                                  {cellValue || "—"}
                                </span>
                              )}
                            </td>
                          );
                        })}
                        <td style={{ padding: "4px" }}>
                          <button
                            type="button"
                            onClick={() => deleteRow(rowIdx)}
                            style={{
                              width: 24,
                              height: 24,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              color: "var(--stone)",
                              background: "none",
                              border: 0,
                              cursor: "pointer",
                              fontSize: 14,
                            }}
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
            <div style={{ marginTop: 20, display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <SubmitButton
                  label={`Submit All (${rows.length} rows)`}
                  submitting={submitting}
                  onClick={handleSubmit}
                  disabled={!rows.length}
                />
              </div>
              <button
                type="button"
                onClick={() => setRows([])}
                style={{
                  padding: "10px 16px",
                  fontSize: 11,
                  fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                  fontWeight: 500,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: "var(--stone)",
                  background: "none",
                  border: "1px solid var(--rule)",
                  cursor: "pointer",
                }}
              >
                Clear
              </button>
            </div>
          </section>
        )}

        {/* Success / Error messages */}
        {successMsg && (
          <div style={{
            marginBottom: 20,
            padding: "14px 16px",
            border: "1px solid var(--rule)",
            background: "var(--paper)",
            fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
            fontSize: 12,
            fontWeight: 500,
            color: "var(--ink)",
          }}>
            {successMsg}
          </div>
        )}
        {submitError && (
          <div style={{
            marginBottom: 20,
            padding: "14px 16px",
            border: "1px solid var(--error)",
            fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
            fontSize: 12,
            fontWeight: 500,
            color: "var(--error)",
          }}>
            {submitError}
          </div>
        )}
      </div>
    </div>
  );
}
