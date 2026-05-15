"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import ErrorToast from "@/components/ErrorToast";
import LoadingOverlay from "@/components/LoadingOverlay";
import ClearButton from "@/components/ClearButton";
import SubmitButton from "@/components/SubmitButton";
import type { FieldSchema } from "@/types/field";
import { safeBack } from "@/lib/navigation";
import {
  getSheetHistory,
  lookupFormsBySheet,
  updateSheetRow,
  checkSheetAccess,
  getProtectedColumns,
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

type FilterOp = "contains" | "equals" | "empty" | "not_empty";
type SortMode = "default" | "most_missing" | "most_filled";

interface ActiveFilter {
  fieldKey: string;
  op: FilterOp;
  value: string;
}

interface SavedFilterPreset {
  name: string;
  filters: ActiveFilter[];
}

const SAVED_FILTERS_KEY = "datafill_saved_filters";

function loadSavedFilters(): SavedFilterPreset[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SAVED_FILTERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function persistSavedFilters(presets: SavedFilterPreset[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(SAVED_FILTERS_KEY, JSON.stringify(presets));
}

export default function DataFillPage() {
  return (
    <Suspense fallback={<LoadingOverlay message="Loading..." />}>
      <DataFillPageInner />
    </Suspense>
  );
}

function DataFillPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sheetParam = searchParams.get("sheet");

  const [formInput, setFormInput] = useState("");
  const [urlValid, setUrlValid] = useState(false);
  const [urlError, setUrlError] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [availableTabs, setAvailableTabs] = useState<TabOption[] | null>(null);
  const [allTabs, setAllTabs] = useState<TabOption[] | null>(null); // remember all tabs for back navigation
  const [sheetUrl, setSheetUrl] = useState("");
  const [loaded, setLoaded] = useState<LoadedTab | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Protected columns — headers that cannot be edited by the user
  const [protectedHeaders, setProtectedHeaders] = useState<Set<string>>(new Set());

  // Access status
  const [accessStatus, setAccessStatus] = useState<"checking" | "edit" | "read" | "none" | null>(null);

  // Auto-load sheet from URL param on mount
  useEffect(() => {
    if (sheetParam) {
      loadSheetFromUrl(sheetParam);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetParam]);

  // Filter state
  const [filters, setFilters] = useState<ActiveFilter[]>([]);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [savedPresets, setSavedPresets] = useState<SavedFilterPreset[]>(loadSavedFilters);
  const [showSaveFilterInput, setShowSaveFilterInput] = useState(false);
  const [filterPresetName, setFilterPresetName] = useState("");

  // Sort state
  const [sortMode, setSortMode] = useState<SortMode>("default");

  // Row detail + edit state
  const [selectedRowIdx, setSelectedRowIdx] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [editMode, setEditMode] = useState(false);

  // Pagination
  const ROWS_PER_PAGE = 100;
  const [visibleCount, setVisibleCount] = useState(ROWS_PER_PAGE);

  // Refs for keyboard navigation
  const editFieldRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => { setVisibleCount(ROWS_PER_PAGE); }, [filters, loaded, sortMode]);

  // Check sheet access when URL becomes valid
  useEffect(() => {
    if (!urlValid || !formInput.trim()) {
      setAccessStatus(null);
      return;
    }
    setAccessStatus("checking");
    const timer = setTimeout(async () => {
      try {
        const status = await checkSheetAccess(formInput);
        if (!status.read) {
          setAccessStatus("none");
        } else if (!status.edit) {
          setAccessStatus("read");
        } else {
          setAccessStatus("edit");
        }
      } catch {
        setAccessStatus("none");
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [formInput, urlValid]);

  // ---------------------------------------------------------------------------
  // URL validation
  // ---------------------------------------------------------------------------
  function validateUrl(value: string): boolean {
    if (!value.trim()) { setUrlError(""); setUrlValid(false); return false; }
    const isValid = value.includes("docs.google.com/spreadsheets") || /^[a-zA-Z0-9-_]{20,}$/.test(value.trim());
    setUrlValid(isValid);
    setUrlError(isValid ? "" : "This doesn't look like a Google Sheet URL");
    return isValid;
  }

  const handleUrlChange = useCallback((value: string) => {
    setFormInput(value); setError(null); setUrlError("");
    if (value.trim()) {
      const isValid = value.includes("docs.google.com/spreadsheets") || /^[a-zA-Z0-9-_]{20,}$/.test(value.trim());
      setUrlValid(isValid);
    } else { setUrlValid(false); }
  }, []);

  // ---------------------------------------------------------------------------
  // Sheet loading
  // ---------------------------------------------------------------------------
  async function handleLoadSheet() {
    if (!validateUrl(formInput)) return;
    const trimmed = formInput.trim();
    // Navigate to the same page with sheet URL as query param
    router.push(`/data-fill?sheet=${encodeURIComponent(trimmed)}`);
  }

  async function loadSheetFromUrl(url: string) {
    setLoading(true); setError(null); setAvailableTabs(null); setLoaded(null);
    setFilters([]); setSelectedRowIdx(null); setEditMode(false); setSortMode("default");
    try {
      const result = await lookupFormsBySheet(url);
      setSheetUrl(url);
      const tabs: TabOption[] = result.items.map((item) => ({
        id: item.id, worksheet_name: item.worksheet_name,
        form_title: item.form_title, fields: item.fields, has_form: item.has_form,
      }));
      if (!tabs.length) { setError("No tabs found in this sheet"); return; }
      setAllTabs(tabs); // remember all tabs for back navigation
      if (tabs.length === 1) { await selectTab(tabs[0], url); }
      else { setAvailableTabs(tabs); }
    } catch (e: any) { setError(typeof e?.message === "string" ? e.message : typeof e === "string" ? e : "Failed to load sheet"); }
    finally { setLoading(false); }
  }

  async function selectTab(tab: TabOption, sheet_url?: string) {
    setAvailableTabs(null); setLoading(true); setError(null);
    try {
      const u = sheet_url ?? sheetUrl;
      // Always read directly from the sheet to get live headers.
      // This ensures field keys match what the backend sees when saving,
      // preventing "sheet structure changed" errors.
      const data = await getSheetHistory(u, tab.worksheet_name);
      setLoaded({ worksheet_name: data.worksheet_name, fields: data.fields, rows: data.rows });

      // Fetch protected columns in background (non-blocking)
      getProtectedColumns(u, tab.worksheet_name)
        .then((res) => {
          if (res.protected_headers?.length) {
            // Match protected headers to field keys (case-insensitive)
            const protectedSet = new Set<string>();
            const protectedLower = res.protected_headers.map((h) => h.toLowerCase().trim());
            for (const field of data.fields) {
              if (protectedLower.includes(field.label.toLowerCase().trim())) {
                protectedSet.add(field.key);
              }
            }
            setProtectedHeaders(protectedSet);
          }
        })
        .catch(() => { /* non-critical, ignore */ });
    } catch (e: any) { setError(typeof e?.message === "string" ? e.message : typeof e === "string" ? e : "Failed to load entries"); }
    finally { setLoading(false); }
  }

  // ---------------------------------------------------------------------------
  // Filtering + Sorting
  // ---------------------------------------------------------------------------
  const filteredAndSortedRows = useMemo(() => {
    if (!loaded || !loaded.rows.length) return [];
    let rows = loaded.rows;
    if (filters.length) {
      rows = rows.filter((row) =>
        filters.every((f) => {
          const val = (row[f.fieldKey] ?? "").toLowerCase();
          switch (f.op) {
            case "contains": return val.includes(f.value.toLowerCase());
            case "equals": return val === f.value.toLowerCase();
            case "empty": return !val.trim();
            case "not_empty": return !!val.trim();
            default: return true;
          }
        })
      );
    }
    if (sortMode === "most_missing") {
      rows = [...rows].sort((a, b) => {
        const aMissing = loaded.fields.filter((f) => !(a[f.key] ?? "").trim()).length;
        const bMissing = loaded.fields.filter((f) => !(b[f.key] ?? "").trim()).length;
        return bMissing - aMissing;
      });
    } else if (sortMode === "most_filled") {
      rows = [...rows].sort((a, b) => {
        const aFilled = loaded.fields.filter((f) => !!(a[f.key] ?? "").trim()).length;
        const bFilled = loaded.fields.filter((f) => !!(b[f.key] ?? "").trim()).length;
        return bFilled - aFilled;
      });
    }
    return rows;
  }, [loaded, filters, sortMode]);

  const visibleRows = useMemo(() => filteredAndSortedRows.slice(0, visibleCount), [filteredAndSortedRows, visibleCount]);

  // ---------------------------------------------------------------------------
  // Row helpers
  // ---------------------------------------------------------------------------
  function getSheetRowIndex(filteredIdx: number): number {
    if (!loaded) return -1;
    const row = filteredAndSortedRows[filteredIdx];
    // Use the actual sheet row index stored in the row data (set by backend).
    // Falls back to array-index-based calculation for backward compatibility.
    if (row["_row_index"]) {
      return parseInt(row["_row_index"], 10);
    }
    const originalIdx = loaded.rows.indexOf(row);
    return originalIdx + 2;
  }

  function handleSelectRow(filteredIdx: number) {
    const row = filteredAndSortedRows[filteredIdx];
    setSelectedRowIdx(filteredIdx);
    // Exclude internal metadata keys (like _row_index) from edit values
    const { _row_index, ...editableValues } = row;
    setEditValues({ ...editableValues });
    setEditMode(false);
    setSuccessMsg(null);
  }

  function goToNextRow() {
    if (selectedRowIdx === null) return;
    const next = selectedRowIdx + 1;
    if (next < filteredAndSortedRows.length) { handleSelectRow(next); }
  }

  function goToPrevRow() {
    if (selectedRowIdx === null) return;
    const prev = selectedRowIdx - 1;
    if (prev >= 0) { handleSelectRow(prev); }
  }

  // ---------------------------------------------------------------------------
  // Save row
  // ---------------------------------------------------------------------------
  async function handleSave() {
    if (selectedRowIdx === null || !loaded) return;
    const rowIndex = getSheetRowIndex(selectedRowIdx);
    if (rowIndex < 2) { setError("Invalid row index"); return; }
    setSaving(true); setError(null); setSuccessMsg(null);
    try {
      await updateSheetRow({
        sheet_url: sheetUrl, worksheet_name: loaded.worksheet_name,
        row_index: rowIndex, values: editValues,
      });
      const updatedRows = [...loaded.rows];
      const originalIdx = loaded.rows.indexOf(filteredAndSortedRows[selectedRowIdx]);
      if (originalIdx >= 0) { updatedRows[originalIdx] = { ...editValues, _row_index: String(rowIndex) }; }
      setLoaded({ ...loaded, rows: updatedRows });
      setEditMode(false);
      setSuccessMsg("Row updated successfully!");
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (e: any) {
      const msg = typeof e?.message === "string" ? e.message : typeof e === "string" ? e : "Failed to update row";
      // If the error is a structure/key mismatch, reload fresh headers and
      // remap the edit values to the new field keys, then retry once.
      if (msg.toLowerCase().includes("structure changed") || msg.toLowerCase().includes("invalid")) {
        try {
          const freshData = await getSheetHistory(sheetUrl, loaded.worksheet_name);
          // Remap editValues: match old values to new field keys by label (case-insensitive)
          const oldFieldsByKey = Object.fromEntries(loaded.fields.map((f) => [f.key, f]));
          const remapped: Record<string, string> = {};
          for (const newField of freshData.fields) {
            // Try to find the matching old field by label
            const oldField = loaded.fields.find(
              (of) => of.label.toLowerCase().trim() === newField.label.toLowerCase().trim()
            );
            if (oldField && editValues[oldField.key] !== undefined) {
              remapped[newField.key] = editValues[oldField.key];
            } else if (editValues[newField.key] !== undefined) {
              remapped[newField.key] = editValues[newField.key];
            } else {
              remapped[newField.key] = "";
            }
          }
          // Retry with remapped values
          await updateSheetRow({
            sheet_url: sheetUrl, worksheet_name: freshData.worksheet_name,
            row_index: rowIndex, values: remapped,
          });
          // Update local state with fresh field structure
          const updatedRows = [...freshData.rows];
          const matchingRow = updatedRows.find((r) => r._row_index === String(rowIndex));
          if (matchingRow) {
            Object.assign(matchingRow, remapped, { _row_index: String(rowIndex) });
          }
          setLoaded({ worksheet_name: freshData.worksheet_name, fields: freshData.fields, rows: updatedRows });
          setEditValues(remapped);
          setEditMode(false);
          setSuccessMsg("Row updated successfully (headers refreshed)!");
          setTimeout(() => setSuccessMsg(null), 3000);
        } catch (retryErr: any) {
          setError(typeof retryErr?.message === "string" ? retryErr.message : "Failed to update row after retry");
        }
      } else {
        setError(msg);
      }
    }
    finally { setSaving(false); }
  }

  // ---------------------------------------------------------------------------
  // Filter management
  // ---------------------------------------------------------------------------
  function addFilter() {
    if (!loaded || !loaded.fields.length) return;
    setFilters([...filters, { fieldKey: loaded.fields[0].key, op: "contains", value: "" }]);
  }
  function removeFilter(idx: number) { setFilters(filters.filter((_, i) => i !== idx)); }
  function updateFilter(idx: number, patch: Partial<ActiveFilter>) {
    setFilters(filters.map((f, i) => i === idx ? { ...f, ...patch } : f));
  }

  function saveCurrentFilter() {
    if (!filterPresetName.trim() || !filters.length) return;
    const newPresets = [...savedPresets, { name: filterPresetName.trim(), filters: [...filters] }];
    setSavedPresets(newPresets);
    persistSavedFilters(newPresets);
    setFilterPresetName(""); setShowSaveFilterInput(false);
  }
  function loadPreset(preset: SavedFilterPreset) { setFilters([...preset.filters]); }
  function deletePreset(idx: number) {
    const newPresets = savedPresets.filter((_, i) => i !== idx);
    setSavedPresets(newPresets); persistSavedFilters(newPresets);
  }

  const handleReset = useCallback(() => {
    // If there were multiple tabs, go back to the tab picker (state change only)
    // instead of navigating away. This prevents skipping the tab picker step.
    if (allTabs && allTabs.length > 1) {
      setLoaded(null);
      setAvailableTabs(allTabs);
      setSelectedRowIdx(null);
      setEditMode(false);
      setFilters([]);
      setSortMode("default");
      setSuccessMsg(null);
    } else {
      // Single tab or no tabs — go back in browser history
      router.back();
    }
  }, [router, allTabs]);

  function getMissingCount(row: Record<string, string>): number {
    if (!loaded) return 0;
    return loaded.fields.filter((f) => !(row[f.key] ?? "").trim()).length;
  }
  function getFilledCount(row: Record<string, string>): number {
    if (!loaded) return 0;
    return loaded.fields.filter((f) => !!(row[f.key] ?? "").trim()).length;
  }

  // ---------------------------------------------------------------------------
  // Keyboard shortcuts
  // ---------------------------------------------------------------------------
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (selectedRowIdx === null) return;
      // Ctrl/Cmd+Enter → Save
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && editMode) {
        e.preventDefault(); handleSave(); return;
      }
      // Escape → exit edit or go back
      if (e.key === "Escape") {
        e.preventDefault();
        if (editMode) { const { _row_index: _ri, ...ev } = filteredAndSortedRows[selectedRowIdx]; setEditValues({ ...ev }); setEditMode(false); }
        else { setSelectedRowIdx(null); }
        return;
      }
      // Navigate rows when NOT editing
      if (!editMode) {
        if (e.key === "ArrowLeft" || (e.altKey && e.key === "ArrowUp")) { e.preventDefault(); goToPrevRow(); return; }
        if (e.key === "ArrowRight" || (e.altKey && e.key === "ArrowDown")) { e.preventDefault(); goToNextRow(); return; }
        if (e.key === "e" && !e.ctrlKey && !e.metaKey) { e.preventDefault(); setEditMode(true); return; }
      }
      // Tab between fields in edit mode
      if (editMode && e.key === "Tab" && loaded) {
        const activeEl = document.activeElement as HTMLInputElement;
        const currentIdx = editFieldRefs.current.indexOf(activeEl);
        if (currentIdx >= 0) {
          e.preventDefault();
          const nextIdx = e.shiftKey
            ? (currentIdx - 1 + editFieldRefs.current.length) % editFieldRefs.current.length
            : (currentIdx + 1) % editFieldRefs.current.length;
          editFieldRefs.current[nextIdx]?.focus();
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRowIdx, editMode, loaded, filteredAndSortedRows]);

  // ═══════════════════════ Detail / Edit View ═══════════════════════
  if (selectedRowIdx !== null && loaded) {
    const totalFields = loaded.fields.length;
    const filledCount = loaded.fields.filter((f) => !!(editValues[f.key] ?? "").trim()).length;
    const missingCount = totalFields - filledCount;
    const hasPrev = selectedRowIdx > 0;
    const hasNext = selectedRowIdx < filteredAndSortedRows.length - 1;
    const sortedFields = [...loaded.fields].sort((a, b) => a.order - b.order);

    return (
      <div className="flex flex-col min-h-screen bg-zinc-100">
        <AppHeader title="Data Correction" showBack onBack={() => { setSelectedRowIdx(null); setEditMode(false); }} />
        {saving && <LoadingOverlay message="Saving..." />}
        <div className="flex-1 w-full max-w-[560px] mx-auto px-5 pt-8 pb-10">
          {/* Nav: Prev / Info / Next */}
          <div className="flex items-center justify-between mb-4">
            <button onClick={goToPrevRow} disabled={!hasPrev}
              className="w-9 h-9 rounded-full flex items-center justify-center border border-zinc-200 bg-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-zinc-50 active:bg-zinc-100 transition-colors"
              aria-label="Previous row" title="Previous (← arrow)">
              <svg className="w-4 h-4 text-zinc-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            </button>
            <div className="text-center">
              <p className="text-[13px] font-bold text-zinc-950">{selectedRowIdx + 1} / {filteredAndSortedRows.length}</p>
              <p className="text-[11px] text-zinc-400">Row {getSheetRowIndex(selectedRowIdx)} in sheet</p>
            </div>
            <button onClick={goToNextRow} disabled={!hasNext}
              className="w-9 h-9 rounded-full flex items-center justify-center border border-zinc-200 bg-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-zinc-50 active:bg-zinc-100 transition-colors"
              aria-label="Next row" title="Next (→ arrow)">
              <svg className="w-4 h-4 text-zinc-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </button>
          </div>

          {/* Badges + Edit toggle */}
          <div className="mb-3 flex items-center justify-between">
            <div className="flex gap-2">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-700">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                {filledCount} Filled
              </span>
              {missingCount > 0 && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-red-100 text-red-700">
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                  {missingCount} Missing
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {!editMode ? (
                <button onClick={() => setEditMode(true)} title="Press E to edit"
                  className="om-action-btn">
                  Edit
                  <style jsx>{`
                    .om-action-btn {
                      position: relative;
                      overflow: hidden;
                      padding: 6px 12px;
                      font-family: var(--font-plex-mono), ui-monospace, monospace;
                      font-weight: 500;
                      font-size: 12px;
                      letter-spacing: 0.12em;
                      text-transform: uppercase;
                      background: var(--ink);
                      color: var(--on-ink);
                      border: 0;
                      border-radius: 0;
                      cursor: pointer;
                      transition: background-color 200ms ease-out;
                    }
                  `}</style>
                </button>
              ) : (
                <>
                  <button onClick={() => { const { _row_index: _ri, ...ev } = filteredAndSortedRows[selectedRowIdx]; setEditValues({ ...ev }); setEditMode(false); }} title="Esc"
                    className="px-3 py-1.5 text-[12px] font-medium text-zinc-600 rounded-lg hover:bg-zinc-200 transition-colors">Cancel</button>
                </>
              )}
            </div>
          </div>

          {/* Keyboard hints */}
          <div className="mb-4 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-zinc-400">
            {!editMode ? (<><span>← → navigate</span><span>E edit</span><span>Esc back</span></>)
              : (<><span>Tab next field</span><span>Shift+Tab prev</span><span>⌘+Enter save</span><span>Esc cancel</span></>)}
          </div>

          {successMsg && (
            <div className="mb-4 px-4 py-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-[13px] text-emerald-700 font-medium">{successMsg}</div>
          )}

          {/* Fields */}
          <div className="rounded-lg border border-zinc-200 bg-white divide-y divide-zinc-100 overflow-hidden desktop-detail-fields">
            {sortedFields.map((field, fieldIdx) => {
              const val = editValues[field.key] ?? "";
              // Treat as checkbox if field type is checkbox OR value is TRUE/FALSE
              const isCheckboxField = field.type === "checkbox" || 
                ((val.trim().toUpperCase() === "TRUE" || val.trim().toUpperCase() === "FALSE") && field.type !== "date" && field.type !== "time");
              const isFilled = isCheckboxField ? true : !!val.trim();
              const isMissing = !isFilled;
              const isProtected = protectedHeaders.has(field.key);
              return (
                <div key={field.key} className={`px-4 py-3 ${isProtected ? "bg-amber-50/40" : isMissing && !editMode ? "bg-red-50/40" : ""}`}>
                  <div className="flex items-center gap-2 mb-1">
                    {isProtected ? (
                      <svg className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" /></svg>
                    ) : isFilled ? (
                      <svg className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                    ) : (
                      <svg className="w-3.5 h-3.5 text-red-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                    )}
                    <p className="text-[11px] font-medium text-zinc-500 uppercase tracking-wide">{field.label}</p>
                    {isProtected && <span className="text-[10px] font-medium text-amber-600 ml-auto">RESTRICTED</span>}
                    {!isProtected && isMissing && !editMode && <span className="text-[10px] font-medium text-red-500 ml-auto">MISSING</span>}
                  </div>
                  {editMode && isProtected ? (
                    /* Protected field — show value as read-only with restriction notice */
                    <div className="mt-1">
                      <p className={`text-[15px] ml-5.5 ${val ? "text-zinc-950 font-medium" : "text-zinc-300 italic"}`}>{val || "—"}</p>
                      <p className="text-[10px] text-amber-600 mt-1 ml-5.5 flex items-center gap-1">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" /></svg>
                        Cannot change · owner restricted
                      </p>
                    </div>
                  ) : editMode ? (
                    isCheckboxField ? (
                      <button
                        type="button"
                        role="switch"
                        aria-checked={(editValues[field.key] ?? "").toUpperCase() === "TRUE"}
                        onClick={() => {
                          const current = (editValues[field.key] ?? "").toUpperCase() === "TRUE";
                          setEditValues({ ...editValues, [field.key]: current ? "FALSE" : "TRUE" });
                        }}
                        className={`mt-1 inline-flex items-center gap-3 px-0 py-2 bg-transparent border-0 cursor-pointer outline-none`}
                      >
                        <span className={`relative inline-block w-[44px] h-[24px] rounded-full transition-colors duration-200 ${(editValues[field.key] ?? "").toUpperCase() === "TRUE" ? "bg-emerald-500" : "bg-zinc-300"}`}>
                          <span className={`absolute top-[2px] left-[2px] w-[20px] h-[20px] rounded-full bg-white shadow transition-transform duration-200 ${(editValues[field.key] ?? "").toUpperCase() === "TRUE" ? "translate-x-[20px]" : ""}`} />
                        </span>
                        <span className={`text-[13px] font-semibold tracking-wide ${(editValues[field.key] ?? "").toUpperCase() === "TRUE" ? "text-emerald-600" : "text-zinc-400"}`}>
                          {(editValues[field.key] ?? "").toUpperCase() === "TRUE" ? "TRUE" : "FALSE"}
                        </span>
                      </button>
                    ) : (
                    <input ref={(el) => { editFieldRefs.current[fieldIdx] = el; }}
                      type={field.type === "number" ? "number" : field.type === "email" ? "email" : field.type === "tel" ? "tel" : field.type === "url" ? "url" : "text"}
                      value={editValues[field.key] ?? ""}
                      onChange={(e) => setEditValues({ ...editValues, [field.key]: e.target.value })}
                      placeholder={field.placeholder || `Enter ${field.label}`}
                      className={`w-full mt-1 px-3 py-2 text-[14px] rounded-md border ${isMissing ? "border-red-300 bg-red-50/30" : "border-zinc-200"} focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent`} />
                    )
                  ) : (
                    isCheckboxField ? (
                      <div className="flex items-center gap-2 ml-5.5 mt-1">
                        <span className={`inline-flex w-[18px] h-[18px] rounded border-2 items-center justify-center ${val.toUpperCase() === "TRUE" ? "bg-emerald-500 border-emerald-500" : "bg-white border-zinc-300"}`}>
                          {val.toUpperCase() === "TRUE" && (
                            <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                          )}
                        </span>
                        <span className={`text-[14px] font-medium ${val.toUpperCase() === "TRUE" ? "text-emerald-600" : "text-zinc-400"}`}>
                          {val.toUpperCase() === "TRUE" ? "TRUE" : "FALSE"}
                        </span>
                      </div>
                    ) : (
                    <p className={`text-[15px] ml-5.5 ${val ? "text-zinc-950 font-medium" : "text-zinc-300 italic"}`}>{val || "—"}</p>
                    )
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {editMode && (
          <div className="w-full max-w-[560px] mx-auto px-5 mt-6 mb-4">
            <SubmitButton
              label="Save Changes to Sheet"
              submitting={saving}
              onClick={handleSave}
            />
          </div>
        )}
        <ErrorToast message={error} onDismiss={() => setError(null)} />
      </div>
    );
  }

  // ═══════════════════════ Filtered List View ═══════════════════════
  if (loaded) {
    return (
      <div className="flex flex-col min-h-screen bg-zinc-100 overflow-y-auto">
        <AppHeader title="Data Correction" showBack onBack={handleReset} />
        {loading && <LoadingOverlay message="Loading entries..." />}
        <div className="flex-1 w-full max-w-[560px] md:max-w-[720px] lg:max-w-[900px] xl:max-w-[1100px] mx-auto px-5 pt-8 pb-10">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="min-w-0 flex-1">
              <h2 className="text-[16px] font-bold text-zinc-950 truncate">{loaded.worksheet_name}</h2>
              <p className="text-[12px] text-zinc-500">{loaded.rows.length.toLocaleString()} entries · {filteredAndSortedRows.length.toLocaleString()} shown</p>
            </div>
            <button type="button" onClick={handleReset} className="text-[12px] font-medium text-zinc-600 hover:text-zinc-900 px-3 py-1.5 rounded-lg hover:bg-zinc-200 flex-shrink-0">Change</button>
          </div>

          {/* Filter + Sort controls */}
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <button onClick={() => setShowFilterPanel(!showFilterPanel)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-semibold border transition-all ${filters.length > 0 ? "bg-zinc-900 text-white border-zinc-900" : "bg-white text-zinc-700 border-zinc-200 hover:border-zinc-400"}`}>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>
              Filters{filters.length > 0 && ` (${filters.length})`}
            </button>
            <select value={sortMode} onChange={(e) => setSortMode(e.target.value as SortMode)}
              className="px-3 py-2 rounded-lg text-[12px] font-semibold border border-zinc-200 bg-white text-zinc-700 focus:outline-none focus:ring-1 focus:ring-zinc-900">
              <option value="default">Default order</option>
              <option value="most_missing">Most missing first</option>
              <option value="most_filled">Most filled first</option>
            </select>
            {filters.length > 0 && (
              <button onClick={() => setFilters([])} className="text-[11px] font-medium text-red-500 hover:text-red-700 px-2 py-1">Clear filters</button>
            )}
          </div>

          {/* Filter panel */}
          {showFilterPanel && (
            <div className="mb-4 p-4 rounded-lg border border-zinc-200 bg-white space-y-3 animate-fade-in">
              {filters.map((filter, idx) => (
                <div key={idx} className="flex items-center gap-2 flex-wrap desktop-filter-row">
                  <select value={filter.fieldKey} onChange={(e) => updateFilter(idx, { fieldKey: e.target.value })}
                    className="flex-1 min-w-[100px] px-2 py-1.5 text-[12px] rounded-md border border-zinc-200 bg-zinc-50 focus:outline-none focus:ring-1 focus:ring-zinc-900">
                    {loaded.fields.map((f) => (<option key={f.key} value={f.key}>{f.label}</option>))}
                  </select>
                  <select value={filter.op} onChange={(e) => updateFilter(idx, { op: e.target.value as FilterOp })}
                    className="px-2 py-1.5 text-[12px] rounded-md border border-zinc-200 bg-zinc-50 focus:outline-none focus:ring-1 focus:ring-zinc-900">
                    <option value="contains">Contains</option>
                    <option value="equals">Equals</option>
                    <option value="empty">Is Empty</option>
                    <option value="not_empty">Is Not Empty</option>
                  </select>
                  {(filter.op === "contains" || filter.op === "equals") && (
                    <input type="text" value={filter.value} onChange={(e) => updateFilter(idx, { value: e.target.value })}
                      placeholder="Value..." className="flex-1 min-w-[80px] px-2 py-1.5 text-[12px] rounded-md border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-900" />
                  )}
                  <button onClick={() => removeFilter(idx)} className="w-6 h-6 rounded-full hover:bg-red-50 flex items-center justify-center text-red-400 hover:text-red-600">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              ))}
              <div className="flex items-center gap-2">
                <button onClick={addFilter} className="inline-flex items-center gap-1 text-[12px] font-medium text-zinc-600 hover:text-zinc-900 px-2 py-1 rounded hover:bg-zinc-100">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                  Add filter
                </button>
                {filters.length > 0 && (
                  <button onClick={() => setShowSaveFilterInput(true)} className="inline-flex items-center gap-1 text-[12px] font-medium text-blue-600 hover:text-blue-800 px-2 py-1 rounded hover:bg-blue-50">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" /></svg>
                    Save filter
                  </button>
                )}
              </div>
              {showSaveFilterInput && (
                <div className="flex items-center gap-2 pt-2 border-t border-zinc-100">
                  <input type="text" value={filterPresetName} onChange={(e) => setFilterPresetName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && saveCurrentFilter()} placeholder="Filter name..." autoFocus
                    className="flex-1 px-2 py-1.5 text-[12px] rounded-md border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                  <button onClick={saveCurrentFilter} disabled={!filterPresetName.trim()} className="px-2.5 py-1.5 text-[11px] font-semibold bg-blue-600 text-white rounded-md hover:bg-blue-500 disabled:opacity-40">Save</button>
                  <button onClick={() => { setShowSaveFilterInput(false); setFilterPresetName(""); }} className="px-2 py-1.5 text-[11px] text-zinc-500 hover:text-zinc-700">Cancel</button>
                </div>
              )}
              {savedPresets.length > 0 && (
                <div className="pt-2 border-t border-zinc-100">
                  <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide mb-1.5">Saved filters</p>
                  <div className="flex flex-wrap gap-1.5">
                    {savedPresets.map((preset, idx) => (
                      <div key={idx} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 border border-blue-200 text-[11px]">
                        <button onClick={() => loadPreset(preset)} className="font-medium text-blue-700 hover:text-blue-900">{preset.name}</button>
                        <button onClick={() => deletePreset(idx)} className="w-3.5 h-3.5 rounded-full hover:bg-blue-200 flex items-center justify-center text-blue-400 hover:text-blue-700">
                          <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Results */}
          {filteredAndSortedRows.length === 0 && (
            <div className="text-center py-12">
              <p className="text-[13px] text-gray-500 font-medium">No rows match your filters</p>
              <p className="text-[11px] text-gray-400 mt-0.5">Try adjusting or removing filters</p>
            </div>
          )}
          {filteredAndSortedRows.length > 0 && (
            <div className="rounded-lg border border-zinc-200 bg-white overflow-hidden desktop-grid-list">
              {visibleRows.map((row, idx) => {
                const missing = getMissingCount(row);
                const filled = getFilledCount(row);
                const total = loaded.fields.length;
                const pct = total > 0 ? Math.round((filled / total) * 100) : 0;
                const parts: string[] = [];
                for (const f of loaded.fields) { if (parts.length >= 3) break; const val = row[f.key]; if (val?.trim()) parts.push(val.trim()); }
                return (
                  <button key={idx} type="button" onClick={() => handleSelectRow(idx)}
                    className="w-full text-left px-4 py-3 text-[13px] border-b border-zinc-100 last:border-b-0 transition-colors hover:bg-zinc-50 active:bg-zinc-100 group">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <span className="truncate text-zinc-800 font-medium block">{parts.join(" · ") || "Empty row"}</span>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="w-16 h-1.5 rounded-full bg-zinc-100 overflow-hidden">
                            <div className={`h-full rounded-full transition-all ${pct === 100 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-400" : "bg-red-400"}`} style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-[10px] text-zinc-500 font-medium">{pct}%</span>
                          {missing > 0 && <span className="text-[10px] text-red-500 font-medium">{missing} missing</span>}
                        </div>
                      </div>
                      <svg className="w-3.5 h-3.5 text-zinc-300 group-hover:text-zinc-700 flex-shrink-0 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          {visibleCount < filteredAndSortedRows.length && (
            <button type="button" onClick={() => setVisibleCount((c) => Math.min(c + ROWS_PER_PAGE, filteredAndSortedRows.length))}
              className="mt-3 w-full py-2.5 rounded-lg border border-zinc-200 bg-white text-[12px] font-medium text-zinc-700 hover:bg-zinc-50">
              Show more <span className="text-zinc-400">· {(filteredAndSortedRows.length - visibleCount).toLocaleString()} remaining</span>
            </button>
          )}
        </div>
        <ErrorToast message={error} onDismiss={() => setError(null)} />
      </div>
    );
  }

  // ═══════════════════════ Initial / Tab Picker ═══════════════════════
  // If we have a sheet param, show loading state instead of input form
  if (sheetParam && !loaded && !availableTabs && !error) {
    return (
      <div className="flex flex-col min-h-screen">
        <AppHeader title="Data Correction" showBack onBack={() => safeBack(router)} />
        <LoadingOverlay message="Loading sheet..." />
      </div>
    );
  }

  // Show tab picker if we have tabs from URL param
  if (sheetParam && availableTabs) {
    return (
      <div className="flex flex-col min-h-screen">
        <AppHeader title="Data Correction" showBack onBack={() => safeBack(router)} />
        <div className="flex-1 w-full max-w-[560px] mx-auto px-6 pt-14 pb-10 space-y-8">
          <section>
            <p
              style={{
                fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                fontWeight: 500,
                fontSize: 10,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "var(--charcoal)",
                marginBottom: 12,
              }}
            >
              Pick a tab
            </p>
            <div style={{ border: "1px solid var(--rule)" }}>
              {availableTabs.map((tab, idx) => (
                <button
                  key={`${tab.worksheet_name}-${idx}`}
                  type="button"
                  onClick={() => selectTab(tab)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    width: "100%",
                    padding: "14px 16px",
                    background: "transparent",
                    border: 0,
                    borderBottom: idx < availableTabs.length - 1 ? "1px solid var(--rule)" : "none",
                    textAlign: "left",
                    cursor: "pointer",
                    transition: "background-color 200ms ease-out",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--paper)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p style={{ fontFamily: "var(--font-newsreader), Georgia, serif", fontWeight: 400, fontSize: 15, color: "var(--ink)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {tab.worksheet_name || tab.form_title}
                    </p>
                    <p style={{ fontFamily: "var(--font-plex-mono), ui-monospace, monospace", fontWeight: 300, fontSize: 10, letterSpacing: "0.04em", color: "var(--stone)", margin: "2px 0 0 0" }}>
                      {tab.has_form ? `${tab.fields.length} columns · has form` : "no form yet"}
                    </p>
                  </div>
                  <span style={{ color: "var(--stone)", fontSize: 14 }} aria-hidden>→</span>
                </button>
              ))}
            </div>
          </section>
        </div>
        <ErrorToast message={error} onDismiss={() => setError(null)} />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      <AppHeader title="Data Correction" showBack onBack={() => safeBack(router)} />
      {loading && <LoadingOverlay message="Loading sheet..." />}
      <div className="flex-1 w-full max-w-[560px] mx-auto px-6 pt-14 pb-10 space-y-8">
        {/* Editorial hero */}
        <section>
          <p
            style={{
              fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
              fontWeight: 500,
              fontSize: 10,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "var(--stone)",
              margin: "0 0 18px 0",
            }}
          >
            Data Correction
          </p>
          <h1
            style={{
              fontFamily: "var(--font-newsreader), Georgia, serif",
              fontWeight: 300,
              fontSize: 32,
              lineHeight: 1.1,
              letterSpacing: "-0.01em",
              color: "var(--ink)",
              margin: 0,
            }}
          >
            Fill & fix your
            <br />
            sheet <em style={{ fontStyle: "italic", fontWeight: 400 }}>data.</em>
          </h1>
          <p
            style={{
              fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
              fontWeight: 300,
              fontSize: 12,
              letterSpacing: "0.04em",
              color: "var(--stone)",
              margin: "18px 0 0 0",
            }}
          >
            {"// filter rows, see missing data, update values directly."}
          </p>
        </section>

        <hr style={{ border: 0, borderTop: "1px solid var(--rule)", margin: 0 }} />

        {/* URL Input */}
        <div className="space-y-4">
          <div>
            <label
              htmlFor="datafill-url"
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
              Google Sheet URL
            </label>
            <div style={{ position: "relative" }}>
              <input
                id="datafill-url"
                type="url"
                inputMode="url"
                value={formInput}
                onChange={(e) => handleUrlChange(e.target.value)}
                onBlur={() => formInput && validateUrl(formInput)}
                onKeyDown={(e) => e.key === "Enter" && handleLoadSheet()}
                placeholder="https://docs.google.com/spreadsheets/d/..."
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
                  onClick={() => { setFormInput(""); setUrlValid(false); setUrlError(""); setAccessStatus(null); }}
                  ariaLabel="Clear URL"
                  top="calc(50% - 2px)"
                />
              )}
            </div>
            {urlError && (
              <p
                style={{
                  margin: "8px 0 0 0",
                  fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                  fontSize: 10,
                  letterSpacing: "0.04em",
                  color: "var(--error)",
                }}
                role="alert"
              >
                ✕ {urlError}
              </p>
            )}
            {!urlValid && !urlError && (
              <p
                style={{
                  margin: "8px 0 0 0",
                  fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                  fontWeight: 300,
                  fontSize: 10,
                  letterSpacing: "0.04em",
                  color: "var(--stone)",
                }}
              >
                paste any google sheets link or spreadsheet id
              </p>
            )}
            {accessStatus === "checking" && (
              <p
                style={{
                  margin: "10px 0 0 0",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                  fontWeight: 400,
                  fontSize: 10,
                  letterSpacing: "0.04em",
                  color: "var(--stone)",
                }}
              >
                <span
                  style={{
                    width: 10,
                    height: 10,
                    border: "1.5px solid var(--rule)",
                    borderTopColor: "var(--ink)",
                    borderRadius: "50%",
                    display: "inline-block",
                    animation: "spin 0.8s linear infinite",
                  }}
                />
                checking permissions…
              </p>
            )}
            {accessStatus === "edit" && (
              <p
                style={{
                  margin: "10px 0 0 0",
                  fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                  fontWeight: 500,
                  fontSize: 10,
                  letterSpacing: "0.04em",
                  color: "#047857",
                }}
              >
                ✓ edit access confirmed
              </p>
            )}
            {accessStatus === "read" && (
              <p
                style={{
                  margin: "10px 0 0 0",
                  fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                  fontWeight: 400,
                  fontSize: 10,
                  letterSpacing: "0.04em",
                  color: "#b45309",
                }}
              >
                <strong style={{ fontWeight: 500 }}>view only.</strong>{" "}
                read access available, but no edit permission.
              </p>
            )}
            {accessStatus === "none" && (
              <p
                style={{
                  margin: "10px 0 0 0",
                  fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                  fontWeight: 400,
                  fontSize: 10,
                  letterSpacing: "0.04em",
                  color: "var(--clay)",
                }}
              >
                <strong style={{ fontWeight: 500 }}>no access.</strong>{" "}
                share the sheet with the service account or sign in with google.
              </p>
            )}
          </div>

          <p
            style={{
              margin: 0,
              fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
              fontWeight: 300,
              fontSize: 10,
              letterSpacing: "0.06em",
              color: "var(--stone)",
            }}
          >
            your data stays in your sheet · we never store contents
          </p>

          {/* Tab picker */}
          {availableTabs && (
            <div style={{ paddingTop: 8 }}>
              <p
                style={{
                  fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                  fontWeight: 500,
                  fontSize: 10,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "var(--charcoal)",
                  marginBottom: 12,
                }}
              >
                Pick a tab
              </p>
              <div style={{ border: "1px solid var(--rule)" }}>
                {availableTabs.map((tab, idx) => (
                  <button
                    key={`${tab.worksheet_name}-${idx}`}
                    type="button"
                    onClick={() => selectTab(tab)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                      width: "100%",
                      padding: "14px 16px",
                      background: "transparent",
                      border: 0,
                      borderBottom: idx < availableTabs.length - 1 ? "1px solid var(--rule)" : "none",
                      textAlign: "left",
                      cursor: "pointer",
                      transition: "background-color 200ms ease-out",
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--paper)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p
                        style={{
                          fontFamily: "var(--font-newsreader), Georgia, serif",
                          fontWeight: 400,
                          fontSize: 15,
                          color: "var(--ink)",
                          margin: 0,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {tab.worksheet_name || tab.form_title}
                      </p>
                      <p
                        style={{
                          fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                          fontWeight: 300,
                          fontSize: 10,
                          letterSpacing: "0.04em",
                          color: "var(--stone)",
                          margin: "2px 0 0 0",
                        }}
                      >
                        {tab.has_form ? `${tab.fields.length} columns · has form` : "no form yet"}
                      </p>
                    </div>
                    <span style={{ color: "var(--stone)", fontSize: 14 }} aria-hidden>→</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Load button */}
          {!availableTabs && (
            <div style={{ paddingTop: 4 }}>
              <SubmitButton
                label="Load Sheet"
                submitting={loading}
                onClick={handleLoadSheet}
                disabled={!formInput.trim() || accessStatus === "none"}
              />
            </div>
          )}
        </div>
      </div>
      <ErrorToast message={error} onDismiss={() => setError(null)} />
    </div>
  );
}
