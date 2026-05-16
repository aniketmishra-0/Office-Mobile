"use client";

import React, { Suspense, useEffect, useState, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import ErrorToast from "@/components/ErrorToast";
import LoadingOverlay from "@/components/LoadingOverlay";
import MobileDropdown from "@/components/MobileDropdown";
import SubmitButton from "@/components/SubmitButton";
import type { FieldSchema } from "@/types/field";
import { lookupFormsBySheet, getSheetSections, updateSheetRow } from "@/lib/api";
import { safeBack } from "@/lib/navigation";
import { useStepHistory } from "@/lib/useStepHistory";

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

/* ─── Calendar Popup (fixed position) ─────────────────────────── */
function CalendarPopup({ anchorRef, onClose }: { anchorRef: React.RefObject<HTMLButtonElement | null>; onClose: () => void }) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const today = now.getDate();
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const popupRef = useRef<HTMLDivElement>(null);

  // Compute position synchronously — no effect, no flicker
  let top = 0;
  let right = 16;
  if (anchorRef.current) {
    const rect = anchorRef.current.getBoundingClientRect();
    top = rect.bottom + 8;
    right = Math.max(16, window.innerWidth - rect.right);
  }

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (popupRef.current && !popupRef.current.contains(e.target as Node) &&
          anchorRef.current && !anchorRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [onClose, anchorRef]);

  return (
    <>
      <div ref={popupRef} className="om-calendar-popup" style={{
        position: "fixed", top, right, zIndex: 99999,
        width: 270, background: "var(--cream)", border: "1px solid var(--rule)",
        borderRadius: 10, boxShadow: "0 8px 32px rgba(0,0,0,0.15)", padding: 16,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <span style={{ fontFamily: "var(--font-newsreader), Georgia, serif", fontWeight: 400, fontSize: 16, color: "var(--ink)" }}>{monthNames[month]} {year}</span>
          <span style={{ fontFamily: "var(--font-plex-mono), monospace", fontSize: 9, color: "var(--clay)", letterSpacing: "0.04em", textTransform: "uppercase", fontWeight: 500 }}>{dayNames[now.getDay()]}, {monthNames[month].slice(0, 3)} {today}</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, textAlign: "center" }}>
          {dayNames.map((d) => (
            <span key={d} style={{ fontFamily: "var(--font-plex-mono), monospace", fontSize: 9, fontWeight: 500, color: "var(--stone)", textTransform: "uppercase", padding: "4px 0 6px" }}>{d.slice(0, 2)}</span>
          ))}
          {cells.map((day, i) => (
            <span key={i} style={{
              fontFamily: "var(--font-plex-mono), monospace", fontSize: 11,
              color: day === today ? "var(--cream)" : "var(--ink)",
              background: day === today ? "var(--ink)" : "transparent",
              fontWeight: day === today ? 500 : 400,
              width: 30, height: 30, display: "inline-flex", alignItems: "center", justifyContent: "center",
              borderRadius: "50%", margin: "0 auto",
              visibility: day === null ? "hidden" : "visible",
            }}>{day ?? ""}</span>
          ))}
        </div>
      </div>
      <style jsx>{`
        .om-calendar-popup {
          transform-origin: top right;
          will-change: transform, opacity;
          animation: omCalendarReveal 280ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
          opacity: 0;
        }
        @keyframes omCalendarReveal {
          0% {
            opacity: 0;
            transform: translate3d(4px, -6px, 0) scale(0.9);
          }
          60% {
            opacity: 1;
          }
          100% {
            opacity: 1;
            transform: translate3d(0, 0, 0) scale(1);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .om-calendar-popup {
            animation: none;
            opacity: 1;
          }
        }
      `}</style>
    </>
  );
}

/* ─── Section dropdown now uses MobileDropdown (multi-select) ── */

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
  const [showCalendar, setShowCalendar] = useState(false);
  const calBtnRef = useRef<HTMLButtonElement | null>(null);

  const [selectedSections, setSelectedSections] = useState<number[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRow, setSelectedRow] = useState<{ sectionIdx: number; rowIdx: number; row: Record<string, string> } | null>(null);

  // Edit mode state for row detail view
  const [editMode, setEditMode] = useState(false);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Day-of-week column filter — empty means show all
  const ALL_DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];
  const [visibleDays, setVisibleDays] = useState<string[]>([]);

  const toggleDay = (day: string) => {
    setVisibleDays((prev) => {
      if (prev.includes(day)) {
        const next = prev.filter((d) => d !== day);
        return next; // empty = show all
      }
      return [...prev, day];
    });
  };

  // Filter fields based on selected days
  const getVisibleFields = (fields: FieldSchema[]) => {
    if (visibleDays.length === 0) return fields; // no filter = show all
    return fields.filter((f) => {
      const header = (f.source_header || f.label || f.key).toUpperCase().trim();
      // If this field IS a day column, only show it if it's in visibleDays
      if (ALL_DAYS.includes(header)) {
        return visibleDays.includes(header);
      }
      // Non-day columns always show
      return true;
    });
  };

  // Detect if the sheet actually has day columns
  const hasDayColumns = loaded?.fields.some((f) => {
    const header = (f.source_header || f.label || f.key).toUpperCase().trim();
    return ALL_DAYS.includes(header);
  }) ?? false;

  // Check if a field is a highlighted (selected) day column
  const isDayHighlighted = (field: FieldSchema): boolean => {
    if (visibleDays.length === 0) return false;
    const header = (field.source_header || field.label || field.key).toUpperCase().trim();
    return visibleDays.includes(header);
  };

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

  const removeSection = (idx: number) => {
    setSelectedSections((prev) => prev.filter((i) => i !== idx));
  };

  const getFilteredRows = (section: Section): Record<string, string>[] => {
    let rows = section.rows;

    // Day filter: if specific days are selected, only show rows that have data in at least one selected day column
    if (visibleDays.length > 0 && loaded) {
      const dayFieldKeys = loaded.fields
        .filter((f) => visibleDays.includes((f.source_header || f.label || f.key).toUpperCase().trim()))
        .map((f) => f.key);
      if (dayFieldKeys.length > 0) {
        rows = rows.filter((row) =>
          dayFieldKeys.some((key) => (row[key] ?? "").trim() !== "")
        );
      }
    }

    // Text search filter
    const q = searchQuery.trim().toLowerCase();
    if (q && loaded) {
      rows = rows.filter((row) =>
        loaded.fields.some((f) => (row[f.key] ?? "").toLowerCase().includes(q))
      );
    }

    return rows;
  };

  const totalRows = loaded?.sections.reduce((sum, s) => sum + s.rows.length, 0) ?? 0;
  const closeCalendar = useCallback(() => setShowCalendar(false), []);

  // ─── Back-gesture wiring ────────────────────────────────────────────
  // Translate the multi-state flow (input → tabs → loaded) into a single
  // derived step name for useStepHistory.
  type FlowStep = "input" | "tabs" | "loaded" | "detail";
  const flowStep: FlowStep = selectedRow ? "detail" : loaded ? "loaded" : availableTabs ? "tabs" : "input";

  const setFlowStep = useCallback(
    (next: FlowStep) => {
      switch (next) {
        case "input":
          setLoaded(null);
          setAvailableTabs(null);
          setSelectedSections([]);
          setSearchQuery("");
          setSelectedRow(null);
          break;
        case "tabs":
          setLoaded(null);
          setSelectedSections([]);
          setSearchQuery("");
          setSelectedRow(null);
          break;
        case "loaded":
          setSelectedRow(null);
          break;
        case "detail":
          break;
      }
    },
    [],
  );

  useStepHistory(flowStep, setFlowStep, ["input", "tabs", "loaded", "detail"]);

  // --- RENDER ---

  // Step 1: URL input
  if (!sheetParam && !loaded && !availableTabs) {
    return (
      <div style={{ display: "flex", flexDirection: "column", minHeight: "100dvh", backgroundColor: "var(--cream)" }}>
        <AppHeader title="Multi-Header Filtering" showBack onBack={() => safeBack(router)} />
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ width: "100%", maxWidth: 400 }}>
            <h2 style={{ fontFamily: "var(--font-newsreader), Georgia, serif", fontWeight: 400, fontSize: 22, color: "var(--ink)", marginBottom: 6, textAlign: "center" }}>Multi-Header Filtering</h2>
            <p style={{ fontFamily: "var(--font-plex-mono), monospace", fontSize: 11, color: "var(--stone)", textAlign: "center", marginBottom: 20, lineHeight: 1.5 }}>
              Select up to 2 date sections to view and search within them.
            </p>
            <input type="url" value={formInput}
              onChange={(e) => { setFormInput(e.target.value); validateUrl(e.target.value); }}
              onKeyDown={(e) => e.key === "Enter" && handleLoadSheet()}
              placeholder="Paste Google Sheet URL..."
              style={{ width: "100%", fontFamily: "var(--font-plex-mono), monospace", fontSize: 13, color: "var(--ink)", background: "var(--paper)", border: `1px solid ${urlError ? "var(--error)" : "var(--rule)"}`, borderRadius: 6, padding: "11px 14px", outline: "none", marginBottom: 8 }}
            />
            {urlError && <p style={{ color: "var(--error)", fontSize: 11, margin: "0 0 8px" }}>{urlError}</p>}
            <SubmitButton
              label="Load Sheet"
              submitting={loading}
              onClick={handleLoadSheet}
              disabled={!urlValid}
            />
          </div>
        </div>
        {error && <ErrorToast message={error} onDismiss={() => setError(null)} />}
      </div>
    );
  }

  // Step 2: Tab selection
  if (availableTabs && !loaded) {
    return (
      <div style={{ display: "flex", flexDirection: "column", minHeight: "100dvh", backgroundColor: "var(--cream)" }}>
        <AppHeader title="Multi-Header Filtering" showBack onBack={() => safeBack(router)} />
        {loading && <LoadingOverlay message="Loading..." />}
        <div style={{ flex: 1, padding: 24 }}>
          <h3 style={{ fontFamily: "var(--font-newsreader), Georgia, serif", fontWeight: 400, fontSize: 18, color: "var(--ink)", marginBottom: 16, textAlign: "center" }}>Select a tab</h3>
          <div style={{ maxWidth: 400, margin: "0 auto", display: "flex", flexDirection: "column", gap: 8 }}>
            {availableTabs.map((tab, i) => (
              <button key={i} onClick={() => selectTab(tab)}
                style={{ fontFamily: "var(--font-plex-mono), monospace", fontSize: 13, color: "var(--ink)", background: "var(--paper)", border: "1px solid var(--rule)", borderRadius: 6, padding: "12px 16px", cursor: "pointer", textAlign: "left" }}>
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
      <div style={{ display: "flex", flexDirection: "column", minHeight: "100dvh", backgroundColor: "var(--cream)" }}>
        <AppHeader title="Multi-Header Filtering" showBack onBack={() => safeBack(router)} />
        {loading && <LoadingOverlay message="Loading data..." />}
        {error && <ErrorToast message={error} onDismiss={() => setError(null)} />}
      </div>
    );
  }

  // Step 3: Main data view — matching original mobile layout exactly
  const sortedFields = [...loaded.fields].sort((a, b) => a.order - b.order);
  const displayFields = getVisibleFields(sortedFields);

  // ─── Row Detail View (like data-fill detail) ────────────────────────
  if (selectedRow) {
    const { sectionIdx, rowIdx, row } = selectedRow;
    const section = loaded.sections[sectionIdx];
    const sectionRows = getFilteredRows(section);
    const totalInSection = sectionRows.length;
    const hasPrev = rowIdx > 0;
    const hasNext = rowIdx < totalInSection - 1;

    function goToPrev() {
      if (!hasPrev) return;
      const prevIdx = rowIdx - 1;
      setSelectedRow({ sectionIdx, rowIdx: prevIdx, row: sectionRows[prevIdx] });
      setEditMode(false);
      setEditValues({});
    }
    function goToNext() {
      if (!hasNext) return;
      const nextIdx = rowIdx + 1;
      setSelectedRow({ sectionIdx, rowIdx: nextIdx, row: sectionRows[nextIdx] });
      setEditMode(false);
      setEditValues({});
    }

    return (
      <div style={{ display: "flex", flexDirection: "column", minHeight: "100dvh", backgroundColor: "var(--cream)" }}>
        <AppHeader title="Row Details" showBack onBack={() => { setSelectedRow(null); setEditMode(false); setEditValues({}); }} />
        <div style={{ flex: 1, width: "100%", maxWidth: 700, margin: "0 auto", padding: "20px 16px 40px" }}>
          {/* Nav row */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <button onClick={goToPrev} disabled={!hasPrev || editMode}
              style={{ width: 32, height: 32, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid var(--rule)", background: "var(--paper)", cursor: hasPrev && !editMode ? "pointer" : "not-allowed", opacity: hasPrev && !editMode ? 1 : 0.3 }}
              aria-label="Previous row">
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            </button>
            <p style={{ fontFamily: "var(--font-plex-mono), monospace", fontSize: 12, color: "var(--ink)", margin: 0 }}>
              <strong>{rowIdx + 1}</strong> of <strong>{totalInSection}</strong>
              <span style={{ color: "var(--stone)", marginLeft: 8 }}>· Row {row._row_index ?? rowIdx + 1}</span>
            </p>
            <button onClick={goToNext} disabled={!hasNext || editMode}
              style={{ width: 32, height: 32, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid var(--rule)", background: "var(--paper)", cursor: hasNext && !editMode ? "pointer" : "not-allowed", opacity: hasNext && !editMode ? 1 : 0.3 }}
              aria-label="Next row">
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </button>
          </div>

          {/* Edit / Save / Cancel buttons */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            {!editMode ? (
              <button
                onClick={() => {
                  // Initialize edit values from current row
                  const initial: Record<string, string> = {};
                  getVisibleFields(sortedFields).forEach((field) => {
                    initial[field.key] = row[field.key] ?? "";
                  });
                  setEditValues(initial);
                  setEditMode(true);
                }}
                style={{
                  fontFamily: "var(--font-plex-mono), monospace", fontSize: 11, fontWeight: 500,
                  padding: "8px 16px", borderRadius: 6, cursor: "pointer",
                  border: "1px solid var(--ink)", background: "var(--ink)", color: "var(--cream)",
                  display: "inline-flex", alignItems: "center", gap: 6,
                }}
              >
                <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                </svg>
                Edit
              </button>
            ) : (
              <>
                <button
                  onClick={async () => {
                    const rowIndex = Number(row._row_index);
                    if (!rowIndex || rowIndex < 2) {
                      setError("Cannot determine row index for update");
                      return;
                    }
                    setSaving(true);
                    try {
                      await updateSheetRow({
                        sheet_url: sheetUrl,
                        worksheet_name: loaded.worksheet_name,
                        row_index: rowIndex,
                        values: editValues,
                      });
                      // Update local state with new values
                      const updatedRow = { ...row, ...editValues };
                      setSelectedRow({ sectionIdx, rowIdx, row: updatedRow });
                      // Also update the section data in loaded state
                      setLoaded((prev) => {
                        if (!prev) return prev;
                        const newSections = [...prev.sections];
                        const sec = { ...newSections[sectionIdx] };
                        const newRows = [...sec.rows];
                        // Find the actual row in the section by _row_index
                        const actualIdx = newRows.findIndex((r) => r._row_index === row._row_index);
                        if (actualIdx >= 0) {
                          newRows[actualIdx] = updatedRow;
                        }
                        sec.rows = newRows;
                        newSections[sectionIdx] = sec;
                        return { ...prev, sections: newSections };
                      });
                      setEditMode(false);
                      setEditValues({});
                    } catch (e: any) {
                      setError(e.message ?? "Failed to save changes");
                    } finally {
                      setSaving(false);
                    }
                  }}
                  disabled={saving}
                  style={{
                    fontFamily: "var(--font-plex-mono), monospace", fontSize: 11, fontWeight: 500,
                    padding: "8px 16px", borderRadius: 6, cursor: saving ? "not-allowed" : "pointer",
                    border: "1px solid #27ae60", background: "#27ae60", color: "#fff",
                    display: "inline-flex", alignItems: "center", gap: 6, opacity: saving ? 0.6 : 1,
                  }}
                >
                  <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                  {saving ? "Saving..." : "Save"}
                </button>
                <button
                  onClick={() => { setEditMode(false); setEditValues({}); }}
                  disabled={saving}
                  style={{
                    fontFamily: "var(--font-plex-mono), monospace", fontSize: 11, fontWeight: 500,
                    padding: "8px 16px", borderRadius: 6, cursor: "pointer",
                    border: "1px solid var(--rule)", background: "var(--paper)", color: "var(--ink)",
                  }}
                >
                  Cancel
                </button>
              </>
            )}
          </div>

          {/* 2-column fields grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, background: "var(--rule)", border: "1px solid var(--rule)", borderRadius: 10, overflow: "hidden" }}>
            {getVisibleFields(sortedFields).map((field) => {
              const val = editMode ? (editValues[field.key] ?? "") : (row[field.key] ?? "").trim();
              return (
                <div key={field.key} style={{ padding: "14px 16px", background: "var(--paper)", display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ fontFamily: "var(--font-plex-mono), monospace", fontSize: 9, fontWeight: 500, color: "var(--stone)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    {field.label || field.source_header || field.key}
                  </span>
                  {editMode ? (
                    <input
                      type="text"
                      value={editValues[field.key] ?? ""}
                      onChange={(e) => setEditValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                      style={{
                        fontFamily: "var(--font-plex-mono), monospace", fontSize: 13, color: "var(--ink)",
                        background: "var(--cream)", border: "1px solid var(--rule)", borderRadius: 4,
                        padding: "6px 8px", outline: "none", width: "100%",
                      }}
                    />
                  ) : (
                    <p style={{ fontFamily: "var(--font-plex-mono), monospace", fontSize: 14, color: val ? "var(--ink)" : "var(--clay)", fontWeight: val ? 500 : 400, margin: 0, fontStyle: val ? "normal" : "italic", wordBreak: "break-word" }}>
                      {val || "—"}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        {saving && <LoadingOverlay message="Saving changes..." />}
        {error && <ErrorToast message={error} onDismiss={() => setError(null)} />}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100dvh", backgroundColor: "var(--cream)" }}>
      <AppHeader title="Multi-Header Filtering" showBack onBack={() => window.history.back()} />

      {/* Content */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>

        {/* Top controls area */}
        <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid var(--rule)" }}>
          {/* Title row with calendar */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 10 }}>
            <div>
              <h2 style={{ fontFamily: "var(--font-newsreader), Georgia, serif", fontWeight: 400, fontSize: 18, color: "var(--ink)", margin: 0 }}>{loaded.worksheet_name}</h2>
              <p style={{ fontFamily: "var(--font-plex-mono), monospace", fontSize: 10, color: "var(--stone)", margin: "2px 0 0" }}>
                {loaded.sections.length} sections · {totalRows.toLocaleString()} rows
              </p>
            </div>
            <button
              ref={calBtnRef}
              type="button"
              onClick={() => setShowCalendar((s) => !s)}
              aria-label="Show calendar"
              style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                width: 36, height: 36, borderRadius: "50%",
                border: showCalendar ? "1.5px solid var(--ink)" : "1px solid var(--rule)",
                background: showCalendar ? "var(--paper)" : "transparent",
                color: "var(--ink)", cursor: "pointer", flexShrink: 0,
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </button>
          </div>

          {/* Dropdown + Search row */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 0, maxWidth: 300 }}>
              <MobileDropdown
                multiple
                size="sm"
                selectedValues={selectedSections.map(String)}
                options={loaded.sections.map((section, idx) => ({
                  value: String(idx),
                  label: section.title,
                  subtitle: `${section.rows.length} rows`,
                }))}
                onMultiChange={(values) => setSelectedSections(values.map(Number))}
                maxSelect={MAX_OPEN}
                placeholder={`Select date section (max ${MAX_OPEN})...`}
              />
            </div>
            <div style={{ position: "relative", flex: 1, minWidth: 120, maxWidth: 220 }}>
              <svg style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", width: 13, height: 13, color: "var(--stone)", pointerEvents: "none" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search..."
                style={{ width: "100%", fontFamily: "var(--font-plex-mono), monospace", fontSize: 12, color: "var(--ink)", background: "var(--paper)", border: "1px solid var(--rule)", borderRadius: 6, padding: "9px 12px 9px 28px", outline: "none" }}
              />
            </div>
            {searchQuery && (
              <button onClick={() => setSearchQuery("")}
                style={{ fontFamily: "var(--font-plex-mono), monospace", fontSize: 10, color: "var(--clay)", background: "none", border: "1px solid var(--clay)", borderRadius: 4, padding: "4px 8px", cursor: "pointer" }}>
                Clear
              </button>
            )}
          </div>

          {/* Chips */}
          {selectedSections.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
              {selectedSections.map((idx) => (
                <span key={idx} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: "var(--font-plex-mono), monospace", fontSize: 10, background: "var(--ink)", color: "var(--cream)", borderRadius: 14, padding: "4px 10px 4px 12px" }}>
                  {loaded.sections[idx]?.title ?? `Section ${idx}`}
                  <button onClick={() => removeSection(idx)}
                    style={{ background: "none", border: "none", color: "var(--cream)", cursor: "pointer", fontSize: 13, padding: 0, lineHeight: 1, opacity: 0.7 }}
                    aria-label="Remove">×</button>
                </span>
              ))}
            </div>
          )}

          {/* Day-of-week filter */}
          {hasDayColumns && (
            <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <span style={{ fontFamily: "var(--font-plex-mono), monospace", fontSize: 9, color: "var(--stone)", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 500, marginRight: 2 }}>Days:</span>
              {ALL_DAYS.map((day) => {
                const isActive = visibleDays.includes(day);
                return (
                  <button
                    key={day}
                    onClick={() => toggleDay(day)}
                    style={{
                      fontFamily: "var(--font-plex-mono), monospace",
                      fontSize: 10,
                      fontWeight: 500,
                      padding: "4px 10px",
                      borderRadius: 14,
                      border: isActive ? "1.5px solid var(--ink)" : "1px solid var(--rule)",
                      background: isActive ? "var(--ink)" : "var(--paper)",
                      color: isActive ? "var(--cream)" : "var(--stone)",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                  >
                    {day.slice(0, 3)}
                  </button>
                );
              })}
              {visibleDays.length > 0 && (
                <button
                  onClick={() => setVisibleDays([])}
                  style={{ fontFamily: "var(--font-plex-mono), monospace", fontSize: 9, color: "var(--clay)", background: "none", border: "1px solid var(--clay)", borderRadius: 4, padding: "3px 7px", cursor: "pointer" }}
                >
                  All
                </button>
              )}
            </div>
          )}
        </div>

        {/* Data area */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px 24px" }}>
          {selectedSections.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--stone)" }}>
              <p style={{ fontFamily: "var(--font-plex-mono), monospace", fontSize: 12, marginBottom: 8 }}>No section selected</p>
              <p style={{ fontFamily: "var(--font-plex-mono), monospace", fontSize: 10, margin: 0 }}>Use the dropdown above to select a date section</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {selectedSections.map((idx) => {
                const section = loaded.sections[idx];
                if (!section) return null;
                const rows = getFilteredRows(section);
                return (
                  <div key={idx} style={{ border: "1px solid var(--rule)", borderRadius: 12, overflow: "hidden", background: "var(--paper)", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
                    {/* Section header — taller, more breathing room */}
                    <div style={{ display: "flex", alignItems: "center", padding: "14px 16px", background: "var(--ink)", color: "var(--cream)", gap: 10 }}>
                      <span style={{ fontFamily: "var(--font-plex-mono), monospace", fontSize: 13, fontWeight: 500, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{section.title}</span>
                      <span style={{ fontFamily: "var(--font-plex-mono), monospace", fontSize: 10, opacity: 0.7, flexShrink: 0 }}>
                        {searchQuery ? `${rows.length} matches` : `${section.rows.length} rows`}
                      </span>
                      <button onClick={() => removeSection(idx)}
                        style={{ background: "none", border: "none", color: "var(--cream)", cursor: "pointer", fontSize: 18, padding: "0 4px", opacity: 0.7, lineHeight: 1 }}
                        aria-label="Close section">×</button>
                    </div>
                    {/* Table area — more generous heights */}
                    <div style={{ overflowX: "auto", maxHeight: 500, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--font-plex-mono), monospace", fontSize: 12 }}>
                        <thead>
                          <tr>
                            <th style={{ padding: "10px 12px", textAlign: "left", fontSize: 10, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--ink)", borderBottom: "1px solid var(--rule)", whiteSpace: "nowrap", position: "sticky", top: 0, background: "rgba(0,0,0,0.04)", fontWeight: 600 }}>#</th>
                            {displayFields.map((field) => {
                              const highlighted = isDayHighlighted(field);
                              return (
                                <th key={field.key} style={{ padding: "10px 12px", textAlign: "left", fontSize: 10, letterSpacing: "0.04em", textTransform: "uppercase", color: highlighted ? "#fff" : "var(--ink)", borderBottom: highlighted ? "2px solid #e67e22" : "1px solid var(--rule)", whiteSpace: "nowrap", position: "sticky", top: 0, background: highlighted ? "#e67e22" : "rgba(0,0,0,0.04)", fontWeight: 600 }}>
                                  {field.source_header || field.label || field.key}
                                </th>
                              );
                            })}
                          </tr>
                        </thead>
                        <tbody>
                          {rows.slice(0, 150).map((row, rIdx) => (
                            <tr key={rIdx}
                              onClick={() => setSelectedRow({ sectionIdx: idx, rowIdx: rIdx, row })}
                              style={{ borderBottom: "1px solid var(--rule)", background: rIdx % 2 !== 0 ? "rgba(0,0,0,0.02)" : "transparent", cursor: "pointer" }}>
                              <td style={{ padding: "10px 12px", color: "var(--stone)", fontSize: 10 }}>{row._row_index ?? rIdx + 1}</td>
                              {displayFields.map((field) => {
                                const highlighted = isDayHighlighted(field);
                                return (
                                  <td key={field.key} style={{ padding: "10px 12px", color: highlighted ? "#e67e22" : "var(--ink)", background: highlighted ? "rgba(230,126,34,0.15)" : "transparent", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: highlighted ? 600 : 400, borderLeft: highlighted ? "2px solid #e67e22" : "none", borderRight: highlighted ? "2px solid #e67e22" : "none" }} title={row[field.key] ?? ""}>
                                    {row[field.key] ?? ""}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                          {rows.length === 0 && (
                            <tr><td colSpan={displayFields.length + 1} style={{ padding: 32, textAlign: "center", color: "var(--stone)", fontSize: 12 }}>
                              {searchQuery ? "No matches" : "No data in this section"}
                            </td></tr>
                          )}
                          {rows.length > 150 && (
                            <tr><td colSpan={displayFields.length + 1} style={{ padding: 10, textAlign: "center", color: "var(--stone)", fontSize: 10 }}>
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

      {/* Calendar popup — fixed overlay */}
      {showCalendar && <CalendarPopup anchorRef={calBtnRef} onClose={closeCalendar} />}
      {error && <ErrorToast message={error} onDismiss={() => setError(null)} />}
    </div>
  );
}

