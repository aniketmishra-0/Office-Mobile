"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AppHeader from "@/components/AppHeader";
import ErrorToast from "@/components/ErrorToast";
import LoadingOverlay from "@/components/LoadingOverlay";
import ClearButton from "@/components/ClearButton";
import SubmitButton from "@/components/SubmitButton";
import type { FieldSchema } from "@/types/field";
import {
  getSheetHistory,
  lookupFormsBySheet,
  getFormSuggestions,
  updateSheetRow,
  checkSheetAccess,
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
  const [formInput, setFormInput] = useState("");
  const [urlValid, setUrlValid] = useState(false);
  const [urlError, setUrlError] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [availableTabs, setAvailableTabs] = useState<TabOption[] | null>(null);
  const [sheetUrl, setSheetUrl] = useState("");
  const [loaded, setLoaded] = useState<LoadedTab | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Access status
  const [accessStatus, setAccessStatus] = useState<"checking" | "edit" | "read" | "none" | null>(null);

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

  // History state (shown on initial page below Load Sheet)
  const [historyRows, setHistoryRows] = useState<Record<string, string>[]>([]);
  const [historyFields, setHistoryFields] = useState<FieldSchema[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historySearch, setHistorySearch] = useState("");
  const [historyVisibleCount, setHistoryVisibleCount] = useState(50);

  const filteredHistoryRows = useMemo(() => {
    if (!historySearch.trim()) return historyRows;
    const q = historySearch.trim().toLowerCase();
    return historyRows.filter((row) =>
      historyFields.some((f) => (row[f.key] ?? "").toLowerCase().includes(q))
    );
  }, [historyRows, historyFields, historySearch]);

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

  // Load history preview when URL becomes valid
  useEffect(() => {
    if (!urlValid || !formInput.trim()) {
      setHistoryRows([]);
      setHistoryFields([]);
      return;
    }
    const timer = setTimeout(async () => {
      setHistoryLoading(true);
      try {
        const result = await lookupFormsBySheet(formInput.trim());
        if (result.items.length > 0) {
          const firstTab = result.items[0];
          if (firstTab.has_form && firstTab.id) {
            const data = await getFormSuggestions(firstTab.id);
            setHistoryFields(firstTab.fields);
            setHistoryRows(data.rows ?? []);
          } else {
            const data = await getSheetHistory(formInput.trim(), firstTab.worksheet_name);
            setHistoryFields(data.fields);
            setHistoryRows(data.rows ?? []);
          }
        }
      } catch {
        // silently fail — history is optional
      } finally {
        setHistoryLoading(false);
      }
    }, 800);
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
    setLoading(true); setError(null); setAvailableTabs(null); setLoaded(null);
    setFilters([]); setSelectedRowIdx(null); setEditMode(false); setSortMode("default");
    try {
      const result = await lookupFormsBySheet(trimmed);
      setSheetUrl(trimmed);
      const tabs: TabOption[] = result.items.map((item) => ({
        id: item.id, worksheet_name: item.worksheet_name,
        form_title: item.form_title, fields: item.fields, has_form: item.has_form,
      }));
      if (!tabs.length) { setError("No tabs found in this sheet"); return; }
      if (tabs.length === 1) { await selectTab(tabs[0], trimmed); }
      else { setAvailableTabs(tabs); }
    } catch (e: any) { setError(e.message ?? "Failed to load sheet"); }
    finally { setLoading(false); }
  }

  async function selectTab(tab: TabOption, sheet_url?: string) {
    setAvailableTabs(null); setLoading(true); setError(null);
    try {
      const u = sheet_url ?? sheetUrl;
      if (tab.has_form && tab.id) {
        const data = await getFormSuggestions(tab.id);
        if (data.rows && data.rows.length > 0) {
          setLoaded({ worksheet_name: tab.worksheet_name || tab.form_title, fields: tab.fields, rows: data.rows });
        } else {
          // Fallback: read directly from sheet when form-based read returns empty
          const sheetData = await getSheetHistory(u, tab.worksheet_name);
          setLoaded({ worksheet_name: sheetData.worksheet_name, fields: sheetData.fields, rows: sheetData.rows });
        }
      } else {
        const data = await getSheetHistory(u, tab.worksheet_name);
        setLoaded({ worksheet_name: data.worksheet_name, fields: data.fields, rows: data.rows });
      }
    } catch (e: any) { setError(e.message ?? "Failed to load entries"); }
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
    } catch (e: any) { setError(e.message ?? "Failed to update row"); }
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
    setLoaded(null); setAvailableTabs(null); setFilters([]);
    setSelectedRowIdx(null); setEditMode(false); setFormInput("");
    setSheetUrl(""); setUrlValid(false); setUrlError(""); setError(null);
    setSuccessMsg(null); setSortMode("default");
  }, []);

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
        <div className="flex-1 w-full max-w-[560px] mx-auto px-5 pt-8 pb-32">
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
                  className="px-3 py-1.5 text-[12px] font-semibold bg-zinc-900 text-white rounded-lg hover:bg-zinc-700 transition-colors">
                  Edit
                </button>
              ) : (
                <>
                  <button onClick={() => { const { _row_index: _ri, ...ev } = filteredAndSortedRows[selectedRowIdx]; setEditValues({ ...ev }); setEditMode(false); }} title="Esc"
                    className="px-3 py-1.5 text-[12px] font-medium text-zinc-600 rounded-lg hover:bg-zinc-200 transition-colors">Cancel</button>
                  <button onClick={handleSave} disabled={saving} title="⌘+Enter"
                    className="px-3 py-1.5 text-[12px] font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-500 disabled:opacity-50 transition-colors">
                    {saving ? "Saving..." : "Save"}
                  </button>
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
          <div className="rounded-lg border border-zinc-200 bg-white divide-y divide-zinc-100 overflow-hidden">
            {sortedFields.map((field, fieldIdx) => {
              const val = editValues[field.key] ?? "";
              const isFilled = field.type === "checkbox" ? true : !!val.trim();
              const isMissing = !isFilled;
              return (
                <div key={field.key} className={`px-4 py-3 ${isMissing && !editMode ? "bg-red-50/40" : ""}`}>
                  <div className="flex items-center gap-2 mb-1">
                    {isFilled ? (
                      <svg className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                    ) : (
                      <svg className="w-3.5 h-3.5 text-red-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                    )}
                    <p className="text-[11px] font-medium text-zinc-500 uppercase tracking-wide">{field.label}</p>
                    {isMissing && !editMode && <span className="text-[10px] font-medium text-red-500 ml-auto">MISSING</span>}
                  </div>
                  {editMode ? (
                    field.type === "checkbox" ? (
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
                    field.type === "checkbox" ? (
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
          <div className="fixed bottom-0 left-0 right-0 max-w-[560px] mx-auto px-5 pt-3 pb-3 bg-white border-t border-zinc-200 shadow-sticky z-40"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 12px)" }}>
            <button onClick={handleSave} disabled={saving}
              className="w-full bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:bg-zinc-200 disabled:text-zinc-500 text-white font-semibold text-[15px] rounded-lg h-[52px] flex items-center justify-center gap-2 transition-all duration-150">
              {saving ? (<><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /><span>Saving...</span></>) : (<span>Save Changes to Sheet</span>)}
            </button>
          </div>
        )}
        <ErrorToast message={error} onDismiss={() => setError(null)} />
      </div>
    );
  }

  // ═══════════════════════ Filtered List View ═══════════════════════
  if (loaded) {
    return (
      <div className="flex flex-col min-h-screen bg-zinc-100">
        <AppHeader title="Data Correction" showBack onBack={handleReset} />
        {loading && <LoadingOverlay message="Loading entries..." />}
        <div className="flex-1 w-full max-w-[560px] mx-auto px-5 pt-8 pb-10">
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
                <div key={idx} className="flex items-center gap-2 flex-wrap">
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
            <div className="rounded-lg border border-zinc-200 bg-white overflow-hidden">
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
  return (
    <div className="flex flex-col min-h-screen bg-zinc-100">
      <AppHeader title="Data Correction" showBack />
      {loading && <LoadingOverlay message="Loading sheet..." />}
      <div className="flex-1 w-full max-w-[560px] mx-auto px-5 pt-14 pb-10">
        <div className="mb-8">
          <h1 className="text-[26px] font-bold text-zinc-950 leading-tight tracking-tight">Fill & fix your<br />sheet data</h1>
          <p className="text-[15px] text-zinc-600 mt-2.5 leading-relaxed">Paste your sheet link, filter rows, see what&apos;s missing, and update values directly.</p>
        </div>
        <div className="mb-6">
          <label htmlFor="datafill-url" className="block text-[13px] font-semibold text-zinc-800 mb-2">Google Sheet URL</label>
          <div className="relative">
            <input id="datafill-url" type="url" inputMode="url" value={formInput}
              onChange={(e) => handleUrlChange(e.target.value)}
              onBlur={() => formInput && validateUrl(formInput)}
              onKeyDown={(e) => e.key === "Enter" && handleLoadSheet()}
              placeholder="https://docs.google.com/spreadsheets/d/..."
              aria-invalid={!!urlError}
              className={`w-full rounded-lg border px-4 py-3.5 text-[15px] min-h-[52px] pr-10 focus:outline-none focus:ring-2 transition-all ${urlError ? "border-red-300 bg-red-50/50 focus:ring-red-500" : urlValid ? "border-emerald-300 bg-emerald-50/30 focus:ring-emerald-500" : "border-zinc-300 bg-white focus:ring-zinc-900"}`} />
            {formInput && (
              <ClearButton onClick={() => { setFormInput(""); setUrlValid(false); setUrlError(""); setAccessStatus(null); }} ariaLabel="Clear URL" />
            )}
          </div>
          {urlError && (
            <p className="text-red-500 text-[13px] mt-1.5 flex items-center gap-1" role="alert">
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
              {urlError}
            </p>
          )}
          {accessStatus === "checking" && (
            <p className="text-zinc-500 text-[12px] mt-2 flex items-center gap-1.5">
              <span className="w-3 h-3 border-[1.5px] border-zinc-300 border-t-zinc-700 rounded-full inline-block animate-spin" />
              checking sheet access…
            </p>
          )}
          {accessStatus === "edit" && (
            <p className="text-emerald-700 text-[12px] mt-2 font-medium">✓ edit access confirmed</p>
          )}
          {accessStatus === "read" && (
            <p className="text-amber-700 text-[12px] mt-2"><strong>view only</strong> — read access available, but no edit permission.</p>
          )}
          {accessStatus === "none" && (
            <p className="text-red-600 text-[12px] mt-2"><strong>no access</strong> — share the sheet with the service account or sign in with Google.</p>
          )}
        </div>
        {availableTabs && (
          <div className="mb-6 animate-fade-in">
            <p className="text-[13px] font-semibold text-gray-700 mb-2.5">Pick a sheet tab</p>
            <div className="space-y-1.5">
              {availableTabs.map((tab, idx) => (
                <button key={`${tab.worksheet_name}-${idx}`} type="button" onClick={() => selectTab(tab)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-lg border border-zinc-200 bg-white hover:border-zinc-400 hover:bg-zinc-50 transition-all text-left group">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${tab.has_form ? "bg-emerald-50" : "bg-gray-100"}`}>
                      <svg className={`w-4 h-4 ${tab.has_form ? "text-emerald-600" : "text-gray-400"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25M3.375 5.625h17.25M3.375 12h17.25" /></svg>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-gray-900 truncate">{tab.worksheet_name || tab.form_title}</p>
                      <p className="text-[11px] text-gray-400 truncate">{tab.has_form ? `${tab.fields.length} columns · has form` : "No form yet"}</p>
                    </div>
                  </div>
                  <svg className="w-4 h-4 text-zinc-300 group-hover:text-zinc-700 flex-shrink-0 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                </button>
              ))}
            </div>
          </div>
        )}
        {!availableTabs && (
          <div className="mb-6">
            <SubmitButton
              label="Load Sheet"
              submitting={loading}
              onClick={handleLoadSheet}
              disabled={!formInput.trim()}
            />
          </div>
        )}
        {!availableTabs && (
          <div className="flex items-start gap-2 text-[12px] text-gray-400 mb-6">
            <svg className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5.002 5.002 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
            <span>Filter rows, see missing data, and update values directly in your Google Sheet.</span>
          </div>
        )}
        {/* ─── History Section ─── */}
        {!availableTabs && historyRows.length > 0 && (
          <div className="mt-2">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[14px] font-semibold text-zinc-800">Recent History</h3>
              <p className="text-[11px] text-zinc-400">{historyRows.length} entries</p>
            </div>
            <div className="relative mb-3">
              <svg className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <input
                type="text"
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                placeholder="Search history..."
                className="w-full rounded-lg border border-zinc-200 bg-white pl-10 pr-4 py-2.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent placeholder:text-zinc-300"
              />
              {historySearch && (
                <button type="button" onClick={() => setHistorySearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full hover:bg-gray-100 flex items-center justify-center" aria-label="Clear search">
                  <svg className="w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              )}
            </div>
            <div className="rounded-lg border border-zinc-200 bg-white overflow-hidden">
              {filteredHistoryRows.slice(0, historyVisibleCount).map((row, idx) => {
                const parts: string[] = [];
                for (const f of historyFields) {
                  if (parts.length >= 3) break;
                  const val = row[f.key];
                  if (val?.trim()) parts.push(val.trim());
                }
                return (
                  <div key={idx} className="px-4 py-3 text-[13px] border-b border-zinc-100 last:border-b-0">
                    <span className="truncate text-zinc-700">{parts.join(" · ") || "—"}</span>
                  </div>
                );
              })}
            </div>
            {historyVisibleCount < filteredHistoryRows.length && (
              <button type="button" onClick={() => setHistoryVisibleCount((c) => c + 50)}
                className="mt-2 w-full py-2 rounded-lg border border-zinc-200 bg-white text-[12px] font-medium text-zinc-600 hover:bg-zinc-50">
                Show more <span className="text-zinc-400">· {filteredHistoryRows.length - historyVisibleCount} remaining</span>
              </button>
            )}
          </div>
        )}
        {!availableTabs && historyLoading && (
          <div className="mt-4 flex items-center gap-2 text-[12px] text-zinc-400">
            <span className="w-3 h-3 border-[1.5px] border-zinc-300 border-t-zinc-700 rounded-full inline-block animate-spin" />
            Loading history...
          </div>
        )}
      </div>
      <ErrorToast message={error} onDismiss={() => setError(null)} />
    </div>
  );
}
