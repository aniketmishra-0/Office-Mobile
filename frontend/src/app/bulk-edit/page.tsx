"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import LoadingOverlay from "@/components/LoadingOverlay";
import { safeBack } from "@/lib/navigation";
import {
  batchAppendRows,
  listSavedSheets,
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

  // Paste area
  const [pasteText, setPasteText] = useState("");

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
    try {
      const result = await lookupFormsBySheet(url);
      const tabs = result.items.map((item) => ({
        worksheet_name: item.worksheet_name,
        form_title: item.form_title,
        fields: item.fields,
      }));
      if (!tabs.length) {
        setSheetError("No worksheets found in this sheet");
        return;
      }
      if (tabs.length === 1) {
        setSheetHeaders(tabs[0].fields);
        setWorksheetName(tabs[0].worksheet_name);
        setSheetReady(true);
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
    (tab: { worksheet_name: string | null; fields: FieldSchema[] }) => {
      setSheetHeaders(tab.fields);
      setWorksheetName(tab.worksheet_name);
      setAvailableTabs(null);
      setSheetReady(true);
    },
    []
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

    const headerCount = sheetHeaders.length;
    const colCount = parsed[0].length;

    if (colCount === headerCount) {
      // Auto-map columns in order
      const mapped = parsed.map((cells) => {
        const row: Record<string, string> = {};
        sheetHeaders.forEach((h, i) => {
          row[h.source_header] = cells[i] ?? "";
        });
        return row;
      });
      setRows(mapped);
    } else {
      // Show column mapping UI
      setParsedRaw(parsed);
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
  return (
    <div className="flex flex-col min-h-screen bg-zinc-100">
      <AppHeader
        title="Bulk Edit"
        showBack
        onBack={() => safeBack(router, "/dashboard")}
      />
      {(sheetLoading || submitting) && (
        <LoadingOverlay
          message={submitting ? "Submitting rows..." : "Loading sheet..."}
        />
      )}

      <div className="flex-1 w-full max-w-[700px] mx-auto px-5 pt-6 pb-10">
        {/* ─── Step 1: Sheet Selection ─── */}
        <section className="mb-6">
          <h2 className="text-[13px] font-semibold text-zinc-500 uppercase tracking-wide mb-3">
            1. Select Target Sheet
          </h2>

          {/* Saved sheets dropdown */}
          {savedSheets.length > 0 && (
            <div className="mb-3">
              <select
                className="w-full px-3 py-2.5 text-[14px] border border-zinc-200 rounded-lg bg-white text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-400"
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
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* URL input */}
          <div className="flex gap-2">
            <input
              type="url"
              placeholder="https://docs.google.com/spreadsheets/..."
              className="flex-1 px-3 py-2.5 text-[14px] border border-zinc-200 rounded-lg bg-white text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-400"
              value={sheetUrl}
              onChange={(e) => setSheetUrl(e.target.value)}
            />
            <button
              type="button"
              disabled={!isValidSheetUrl || sheetLoading}
              onClick={() => loadSheet(sheetUrl)}
              className="px-4 py-2.5 text-[12px] font-semibold uppercase tracking-wider bg-zinc-900 text-white rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-zinc-800 transition-colors"
            >
              Load
            </button>
          </div>

          {sheetError && (
            <p className="mt-2 text-[13px] text-red-600">{sheetError}</p>
          )}

          {/* Tab selection */}
          {availableTabs && (
            <div className="mt-3 space-y-2">
              <p className="text-[13px] text-zinc-600">
                Multiple worksheets found. Select one:
              </p>
              {availableTabs.map((tab, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => selectTab(tab)}
                  className="block w-full text-left px-4 py-3 border border-zinc-200 rounded-lg bg-white hover:bg-zinc-50 transition-colors"
                >
                  <span className="text-[14px] font-medium text-zinc-900">
                    {tab.form_title || tab.worksheet_name || `Sheet ${i + 1}`}
                  </span>
                  <span className="ml-2 text-[12px] text-zinc-400">
                    {tab.fields.length} columns
                  </span>
                </button>
              ))}
            </div>
          )}

          {sheetReady && (
            <div className="mt-2 flex items-center gap-3">
              <p className="text-[13px] text-emerald-600 font-medium">
                ✓ Sheet loaded — {sheetHeaders.length} columns detected
              </p>
              <button
                type="button"
                disabled={sheetLoading}
                onClick={() => loadSheet(sheetUrl)}
                className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wider border border-zinc-300 text-zinc-600 rounded-md hover:bg-zinc-200 hover:text-zinc-900 transition-colors disabled:opacity-40"
                title="Refresh columns from sheet"
              >
                ↻ Refresh
              </button>
            </div>
          )}
        </section>

        {/* ─── Step 2: Paste Area ─── */}
        <section className="mb-6">
          <h2 className="text-[13px] font-semibold text-zinc-500 uppercase tracking-wide mb-3">
            2. Paste Your Data
          </h2>
          <textarea
            className="w-full min-h-[160px] px-4 py-3 text-[13px] font-mono border border-zinc-200 rounded-lg bg-white text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-400 resize-y"
            placeholder={"Paste rows here from Excel, WhatsApp, or any text source.\nTab-separated or comma-separated columns will be auto-detected."}
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
          />
          <div className="mt-2 flex items-center gap-3">
            <button
              type="button"
              disabled={!pasteText.trim() || !sheetReady}
              onClick={handleParse}
              className="px-4 py-2 text-[12px] font-semibold uppercase tracking-wider bg-zinc-900 text-white rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-zinc-800 transition-colors"
            >
              Parse & Preview
            </button>
            {!sheetReady && pasteText.trim() && (
              <span className="text-[12px] text-amber-600">
                Select a sheet first
              </span>
            )}
          </div>
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
