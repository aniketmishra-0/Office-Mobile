"use client";

import React, { Suspense, useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import ErrorToast from "@/components/ErrorToast";
import LoadingOverlay from "@/components/LoadingOverlay";
import MobileDropdown from "@/components/MobileDropdown";
import SubmitButton from "@/components/SubmitButton";
import type { FieldSchema } from "@/types/field";
import { lookupFormsBySheet, getSheetSections, batchAppendRows } from "@/lib/api";
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

export default function SubSheetFilterPage() {
  return (
    <Suspense fallback={<LoadingOverlay message="Loading..." />}>
      <SubSheetFilterInner />
    </Suspense>
  );
}

function SubSheetFilterInner() {
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

  // Column-level filters
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [showFilters, setShowFilters] = useState(false);

  // Bulk paste/add rows
  const [showPastePanel, setShowPastePanel] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasteRows, setPasteRows] = useState<Record<string, string>[]>([]);
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

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
    router.push(`/sub-sheet-filter?sheet=${encodeURIComponent(formInput.trim())}`);
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

    // Apply column filters
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

    // Apply search
    const q = searchQuery.trim().toLowerCase();
    if (q && loaded) {
      rows = rows.filter((row) =>
        loaded.fields.some((f) => (row[f.key] ?? "").toLowerCase().includes(q))
      );
    }
    return rows;
  };

  // Unique values per column for filter dropdowns (across all selected sections)
  const columnUniqueValues = React.useMemo(() => {
    if (!loaded || selectedSections.length === 0) return {};
    const result: Record<string, string[]> = {};
    for (const field of loaded.fields) {
      const valSet = new Set<string>();
      for (const idx of selectedSections) {
        const section = loaded.sections[idx];
        if (!section) continue;
        for (const row of section.rows) {
          const v = (row[field.key] ?? "").trim();
          if (v) valSet.add(v);
        }
      }
      if (valSet.size > 0 && valSet.size < 500) {
        result[field.key] = [...valSet].sort((a, b) => a.localeCompare(b));
      }
    }
    return result;
  }, [loaded, selectedSections]);

  const totalRows = loaded?.sections.reduce((sum, s) => sum + s.rows.length, 0) ?? 0;
  const closeCalendar = useCallback(() => setShowCalendar(false), []);

  // ─── Paste / Bulk Add logic ─────────────────────────────────────────
  function parseText(raw: string): string[][] {
    if (!raw.trim()) return [];
    const lines = raw.split(/\r?\n/).filter((l) => l.trim() !== "");
    if (!lines.length) return [];
    const hasTab = lines.some((l) => l.includes("\t"));
    const hasComma = !hasTab && lines.some((l) => l.includes(","));
    const delimiter = hasTab ? "\t" : hasComma ? "," : null;
    return lines.map((line) => {
      if (!delimiter) return [line.trim()];
      if (delimiter === ",") {
        const cells: string[] = [];
        let current = "";
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          const ch = line[i];
          if (ch === '"' && (i === 0 || line[i - 1] !== "\\")) { inQuotes = !inQuotes; }
          else if (ch === "," && !inQuotes) { cells.push(current.trim()); current = ""; }
          else { current += ch; }
        }
        cells.push(current.trim());
        return cells;
      }
      return line.split(delimiter).map((c) => c.trim());
    });
  }

  const handlePaste = () => {
    setPasteError(null);
    setPasteRows([]);
    setSuccessMsg(null);
    if (!pasteText.trim()) { setPasteError("Paste some data first"); return; }
    if (!loaded || !loaded.fields.length) { setPasteError("No sheet loaded"); return; }

    const parsed = parseText(pasteText);
    if (!parsed.length) { setPasteError("No rows found"); return; }

    const sortedF = [...loaded.fields].sort((a, b) => a.order - b.order);

    // Auto-skip header row
    let dataRows = parsed;
    const headerNames = sortedF.map((h) => h.source_header.toLowerCase().trim());
    const firstRow = parsed[0].map((c) => c.toLowerCase().trim());
    const matchCount = firstRow.filter((c) => headerNames.includes(c)).length;
    if (matchCount >= Math.ceil(headerNames.length * 0.5) && parsed.length > 1) {
      dataRows = parsed.slice(1);
    }

    const mapped = dataRows.map((cells) => {
      const row: Record<string, string> = {};
      sortedF.forEach((h, i) => {
        row[h.source_header] = cells[i] ?? "";
      });
      return row;
    });
    setPasteRows(mapped);
  };

  const handleBulkSubmit = async () => {
    if (!pasteRows.length || !sheetUrl || !loaded) return;
    setSubmitting(true);
    setSuccessMsg(null);
    setPasteError(null);
    try {
      const result = await batchAppendRows({
        sheet_url: sheetUrl,
        worksheet_name: loaded.worksheet_name,
        rows: pasteRows,
      });
      setSuccessMsg(`✓ ${result.appended_count} rows added to sheet!`);
      setPasteRows([]);
      setPasteText("");
    } catch (e: any) {
      setPasteError(e?.message ?? "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  };

  // Bulk apply date/time to pasted rows
  const [bulkDate, setBulkDate] = useState("");
  const [bulkTime, setBulkTime] = useState("");

  const dateFields = useMemo(() => loaded?.fields.filter((f) => f.type === "date") ?? [], [loaded]);
  const timeFields = useMemo(() => loaded?.fields.filter((f) => f.type === "time") ?? [], [loaded]);

  const applyBulkDate = () => {
    if (!bulkDate || !dateFields.length) return;
    setPasteRows((prev) => prev.map((row) => {
      const updated = { ...row };
      dateFields.forEach((f) => { updated[f.source_header] = bulkDate; });
      return updated;
    }));
  };

  const applyBulkTime = () => {
    if (!bulkTime || !timeFields.length) return;
    setPasteRows((prev) => prev.map((row) => {
      const updated = { ...row };
      timeFields.forEach((f) => { updated[f.source_header] = bulkTime; });
      return updated;
    }));
  };

  // ─── Back-gesture wiring ────────────────────────────────────────────
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
        <AppHeader title="Sub-Sheet Filter" showBack onBack={() => safeBack(router)} />
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ width: "100%", maxWidth: 400 }}>
            <h2 style={{ fontFamily: "var(--font-newsreader), Georgia, serif", fontWeight: 400, fontSize: 22, color: "var(--ink)", marginBottom: 6, textAlign: "center" }}>Sub-Sheet Filter</h2>
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
        <AppHeader title="Sub-Sheet Filter" showBack onBack={() => safeBack(router)} />
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
        <AppHeader title="Sub-Sheet Filter" showBack onBack={() => safeBack(router)} />
        {loading && <LoadingOverlay message="Loading data..." />}
        {error && <ErrorToast message={error} onDismiss={() => setError(null)} />}
      </div>
    );
  }

  // Step 3: Main data view
  const sortedFields = [...loaded.fields].sort((a, b) => a.order - b.order);

  // ─── Row Detail View ────────────────────────────────────────────
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
    }
    function goToNext() {
      if (!hasNext) return;
      const nextIdx = rowIdx + 1;
      setSelectedRow({ sectionIdx, rowIdx: nextIdx, row: sectionRows[nextIdx] });
    }

    return (
      <div style={{ display: "flex", flexDirection: "column", minHeight: "100dvh", backgroundColor: "var(--cream)" }}>
        <AppHeader title="Row Details" showBack onBack={() => setSelectedRow(null)} />
        <div style={{ flex: 1, width: "100%", maxWidth: 700, margin: "0 auto", padding: "20px 16px 40px" }}>
          {/* Nav row */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <button onClick={goToPrev} disabled={!hasPrev}
              style={{ width: 32, height: 32, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid var(--rule)", background: "var(--paper)", cursor: hasPrev ? "pointer" : "not-allowed", opacity: hasPrev ? 1 : 0.3 }}
              aria-label="Previous row">
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            </button>
            <p style={{ fontFamily: "var(--font-plex-mono), monospace", fontSize: 12, color: "var(--ink)", margin: 0 }}>
              <strong>{rowIdx + 1}</strong> of <strong>{totalInSection}</strong>
              <span style={{ color: "var(--stone)", marginLeft: 8 }}>· Row {row._row_index ?? rowIdx + 1}</span>
            </p>
            <button onClick={goToNext} disabled={!hasNext}
              style={{ width: 32, height: 32, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid var(--rule)", background: "var(--paper)", cursor: hasNext ? "pointer" : "not-allowed", opacity: hasNext ? 1 : 0.3 }}
              aria-label="Next row">
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </button>
          </div>

          {/* 2-column fields grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, background: "var(--rule)", border: "1px solid var(--rule)", borderRadius: 10, overflow: "hidden" }}>
            {sortedFields.map((field) => {
              const val = (row[field.key] ?? "").trim();
              return (
                <div key={field.key} style={{ padding: "14px 16px", background: "var(--paper)", display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ fontFamily: "var(--font-plex-mono), monospace", fontSize: 9, fontWeight: 500, color: "var(--stone)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    {field.label || field.source_header || field.key}
                  </span>
                  <p style={{ fontFamily: "var(--font-plex-mono), monospace", fontSize: 14, color: val ? "var(--ink)" : "var(--clay)", fontWeight: val ? 500 : 400, margin: 0, fontStyle: val ? "normal" : "italic", wordBreak: "break-word" }}>
                    {val || "—"}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
        {error && <ErrorToast message={error} onDismiss={() => setError(null)} />}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100dvh", backgroundColor: "var(--cream)" }}>
      <AppHeader title="Sub-Sheet Filter" showBack onBack={() => window.history.back()} />

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

            {/* Batch Add button */}
            <button
              type="button"
              onClick={() => setShowPastePanel((v) => !v)}
              style={{
                fontFamily: "var(--font-plex-mono), monospace",
                fontSize: 10, fontWeight: 500,
                letterSpacing: "0.04em", textTransform: "uppercase",
                color: showPastePanel ? "var(--cream)" : "var(--ink)",
                background: showPastePanel ? "var(--ink)" : "var(--paper)",
                border: "1px solid var(--rule)",
                borderRadius: 4, padding: "6px 10px", cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              + Batch Add
            </button>
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

          {/* Column Filters */}
          {selectedSections.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <button
                type="button"
                onClick={() => setShowFilters((v) => !v)}
                style={{
                  fontFamily: "var(--font-plex-mono), monospace",
                  fontSize: 10, fontWeight: 500,
                  letterSpacing: "0.04em", textTransform: "uppercase",
                  color: Object.values(columnFilters).some((v) => v) ? "var(--ink)" : "var(--stone)",
                  background: Object.values(columnFilters).some((v) => v) ? "rgba(200, 98, 58, 0.08)" : "transparent",
                  border: Object.values(columnFilters).some((v) => v) ? "1px solid rgba(200, 98, 58, 0.3)" : "1px solid var(--rule)",
                  borderRadius: 4, padding: "5px 10px", cursor: "pointer",
                }}
              >
                ⚙ Filter{Object.values(columnFilters).filter((v) => v).length > 0 ? ` (${Object.values(columnFilters).filter((v) => v).length})` : ""}
              </button>

              {showFilters && (
                <div style={{ marginTop: 8, padding: 10, border: "1px solid var(--rule)", borderRadius: 8, background: "var(--paper)" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ fontFamily: "var(--font-plex-mono), monospace", fontSize: 9, fontWeight: 500, color: "var(--stone)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                      Column Filters
                    </span>
                    {Object.values(columnFilters).some((v) => v) && (
                      <button onClick={() => setColumnFilters({})}
                        style={{ fontFamily: "var(--font-plex-mono), monospace", fontSize: 9, color: "var(--stone)", background: "none", border: 0, cursor: "pointer", textDecoration: "underline" }}>
                        Clear all
                      </button>
                    )}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {sortedFields.map((field) => {
                      const uniqueVals = columnUniqueValues[field.key];
                      if (!uniqueVals) return null;
                      const listId = `ssf-filter-${field.key}`;
                      return (
                        <div key={field.key} style={{ minWidth: 130 }}>
                          <label style={{ display: "block", fontFamily: "var(--font-plex-mono), monospace", fontSize: 8, fontWeight: 500, color: "var(--stone)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2, paddingLeft: 2 }}>
                            {field.label || field.source_header}
                          </label>
                          <input
                            type="text"
                            list={listId}
                            placeholder="All"
                            value={columnFilters[field.key] ?? ""}
                            onChange={(e) => setColumnFilters((prev) => ({ ...prev, [field.key]: e.target.value }))}
                            style={{
                              width: "100%", fontFamily: "var(--font-plex-mono), monospace", fontSize: 11,
                              color: columnFilters[field.key] ? "var(--ink)" : "var(--stone)",
                              background: "var(--cream)",
                              border: columnFilters[field.key] ? "1px solid rgba(200, 98, 58, 0.4)" : "1px solid var(--rule)",
                              borderRadius: 4, padding: "5px 8px",
                            }}
                          />
                          <datalist id={listId}>
                            {uniqueVals.map((val) => (
                              <option key={val} value={val} />
                            ))}
                          </datalist>
                        </div>
                      );
                    })}
                  </div>
                  {Object.values(columnFilters).some((v) => v) && (
                    <p style={{ fontFamily: "var(--font-plex-mono), monospace", fontSize: 10, color: "var(--stone)", margin: "8px 0 0" }}>
                      Filtered results shown below
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ─── Batch Add / Paste Panel ─── */}
        {showPastePanel && loaded && (
          <div style={{ borderBottom: "1px solid var(--rule)", padding: "12px 16px", background: "var(--paper)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontFamily: "var(--font-plex-mono), monospace", fontSize: 10, fontWeight: 500, color: "var(--ink)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Batch Add Rows
              </span>
              <button onClick={() => { setShowPastePanel(false); setPasteRows([]); setPasteText(""); setPasteError(null); setSuccessMsg(null); }}
                style={{ fontFamily: "var(--font-plex-mono), monospace", fontSize: 10, color: "var(--stone)", background: "none", border: 0, cursor: "pointer" }}>
                ✕ Close
              </button>
            </div>

            {/* Paste textarea */}
            {pasteRows.length === 0 && (
              <>
                <textarea
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  placeholder={"Paste rows here from Excel, WhatsApp, or any text.\nTab or comma separated columns auto-detected."}
                  style={{
                    width: "100%", minHeight: 100, fontFamily: "var(--font-plex-mono), monospace",
                    fontSize: 11, color: "var(--ink)", background: "var(--cream)",
                    border: "1px solid var(--rule)", borderRadius: 6, padding: "10px 12px",
                    resize: "vertical", outline: "none",
                  }}
                />
                <button onClick={handlePaste} disabled={!pasteText.trim()}
                  style={{
                    marginTop: 8, fontFamily: "var(--font-plex-mono), monospace",
                    fontSize: 10, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em",
                    color: "var(--cream)", background: "var(--ink)",
                    border: "none", borderRadius: 6, padding: "8px 16px",
                    cursor: pasteText.trim() ? "pointer" : "not-allowed",
                    opacity: pasteText.trim() ? 1 : 0.4,
                  }}>
                  Parse & Preview
                </button>
              </>
            )}

            {/* Preview table with bulk apply */}
            {pasteRows.length > 0 && (
              <div>
                {/* Bulk apply date/time */}
                {(dateFields.length > 0 || timeFields.length > 0) && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10, alignItems: "center" }}>
                    <span style={{ fontFamily: "var(--font-plex-mono), monospace", fontSize: 9, color: "var(--stone)", textTransform: "uppercase", fontWeight: 500 }}>Bulk Apply:</span>
                    {dateFields.length > 0 && (
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <input type="date" value={bulkDate} onChange={(e) => setBulkDate(e.target.value)}
                          style={{ fontFamily: "var(--font-plex-mono), monospace", fontSize: 11, border: "1px solid var(--rule)", borderRadius: 4, padding: "4px 8px", background: "var(--cream)" }} />
                        <button onClick={applyBulkDate} disabled={!bulkDate}
                          style={{ fontFamily: "var(--font-plex-mono), monospace", fontSize: 9, fontWeight: 500, color: "var(--cream)", background: bulkDate ? "#2563eb" : "var(--stone)", border: "none", borderRadius: 4, padding: "5px 8px", cursor: bulkDate ? "pointer" : "not-allowed" }}>
                          Set Date
                        </button>
                      </div>
                    )}
                    {timeFields.length > 0 && (
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <input type="time" value={bulkTime} onChange={(e) => setBulkTime(e.target.value)}
                          style={{ fontFamily: "var(--font-plex-mono), monospace", fontSize: 11, border: "1px solid var(--rule)", borderRadius: 4, padding: "4px 8px", background: "var(--cream)" }} />
                        <button onClick={applyBulkTime} disabled={!bulkTime}
                          style={{ fontFamily: "var(--font-plex-mono), monospace", fontSize: 9, fontWeight: 500, color: "var(--cream)", background: bulkTime ? "#2563eb" : "var(--stone)", border: "none", borderRadius: 4, padding: "5px 8px", cursor: bulkTime ? "pointer" : "not-allowed" }}>
                          Set Time
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Preview table */}
                <div style={{ border: "1px solid var(--rule)", borderRadius: 6, overflow: "hidden", maxHeight: 250, overflowY: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--font-plex-mono), monospace", fontSize: 10 }}>
                    <thead>
                      <tr>
                        <th style={{ padding: "5px 8px", background: "var(--ink)", color: "var(--cream)", fontSize: 8, textTransform: "uppercase", letterSpacing: "0.04em", position: "sticky", top: 0 }}>#</th>
                        {[...loaded.fields].sort((a, b) => a.order - b.order).map((f) => (
                          <th key={f.key} style={{ padding: "5px 8px", background: "var(--ink)", color: "var(--cream)", fontSize: 8, textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap", position: "sticky", top: 0 }}>
                            {f.label || f.source_header}
                          </th>
                        ))}
                        <th style={{ padding: "5px 8px", background: "var(--ink)", position: "sticky", top: 0 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {pasteRows.map((row, rIdx) => (
                        <tr key={rIdx} style={{ borderBottom: "1px solid var(--rule)" }}>
                          <td style={{ padding: "4px 8px", color: "var(--stone)", fontSize: 9 }}>{rIdx + 1}</td>
                          {[...loaded.fields].sort((a, b) => a.order - b.order).map((f) => (
                            <td key={f.key} style={{ padding: "4px 8px", color: "var(--ink)", maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {row[f.source_header] ?? ""}
                            </td>
                          ))}
                          <td style={{ padding: "4px 4px" }}>
                            <button onClick={() => setPasteRows((prev) => prev.filter((_, i) => i !== rIdx))}
                              style={{ background: "none", border: "none", color: "var(--stone)", cursor: "pointer", fontSize: 12 }}>×</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Submit */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
                  <button onClick={handleBulkSubmit} disabled={submitting || !pasteRows.length}
                    style={{
                      fontFamily: "var(--font-plex-mono), monospace", fontSize: 11, fontWeight: 500,
                      color: "var(--cream)", background: "#166534",
                      border: "none", borderRadius: 6, padding: "9px 18px",
                      cursor: submitting ? "not-allowed" : "pointer", opacity: submitting ? 0.6 : 1,
                    }}>
                    {submitting ? "Submitting..." : `Submit All (${pasteRows.length} rows)`}
                  </button>
                  <button onClick={() => { setPasteRows([]); setPasteText(""); }}
                    style={{ fontFamily: "var(--font-plex-mono), monospace", fontSize: 10, color: "var(--stone)", background: "none", border: "none", cursor: "pointer" }}>
                    Clear
                  </button>
                </div>
              </div>
            )}

            {pasteError && <p style={{ fontFamily: "var(--font-plex-mono), monospace", fontSize: 11, color: "var(--error)", marginTop: 6 }}>{pasteError}</p>}
            {successMsg && <p style={{ fontFamily: "var(--font-plex-mono), monospace", fontSize: 11, color: "#166534", marginTop: 6, fontWeight: 500 }}>{successMsg}</p>}
          </div>
        )}

        {/* Data area */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px 24px" }}>
          {selectedSections.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--stone)" }}>
              <p style={{ fontFamily: "var(--font-plex-mono), monospace", fontSize: 12, marginBottom: 8 }}>No section selected</p>
              <p style={{ fontFamily: "var(--font-plex-mono), monospace", fontSize: 10, margin: 0 }}>Use the dropdown above to select a date section</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {selectedSections.map((idx) => {
                const section = loaded.sections[idx];
                if (!section) return null;
                const rows = getFilteredRows(section);
                return (
                  <div key={idx} style={{ border: "1px solid var(--rule)", borderRadius: 8, overflow: "hidden", background: "var(--paper)" }}>
                    <div style={{ display: "flex", alignItems: "center", padding: "10px 14px", background: "var(--ink)", color: "var(--cream)", gap: 8 }}>
                      <span style={{ fontFamily: "var(--font-plex-mono), monospace", fontSize: 12, fontWeight: 500, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{section.title}</span>
                      <span style={{ fontFamily: "var(--font-plex-mono), monospace", fontSize: 9, opacity: 0.7, flexShrink: 0 }}>
                        {searchQuery ? `${rows.length} matches` : `${section.rows.length} rows`}
                      </span>
                      <button onClick={() => removeSection(idx)}
                        style={{ background: "none", border: "none", color: "var(--cream)", cursor: "pointer", fontSize: 16, padding: "0 4px", opacity: 0.7, lineHeight: 1 }}
                        aria-label="Close section">×</button>
                    </div>
                    <div style={{ overflowX: "auto", maxHeight: 450, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--font-plex-mono), monospace", fontSize: 11 }}>
                        <thead>
                          <tr>
                            <th style={{ padding: "6px 10px", textAlign: "left", fontSize: 9, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--stone)", borderBottom: "1px solid var(--rule)", whiteSpace: "nowrap", position: "sticky", top: 0, background: "var(--paper)", fontWeight: 500 }}>#</th>
                            {sortedFields.map((field) => (
                              <th key={field.key} style={{ padding: "6px 10px", textAlign: "left", fontSize: 9, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--stone)", borderBottom: "1px solid var(--rule)", whiteSpace: "nowrap", position: "sticky", top: 0, background: "var(--paper)", fontWeight: 500 }}>
                                {field.source_header || field.label || field.key}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {rows.slice(0, 150).map((row, rIdx) => (
                            <tr key={rIdx}
                              onClick={() => setSelectedRow({ sectionIdx: idx, rowIdx: rIdx, row })}
                              style={{ borderBottom: "1px solid var(--rule)", background: rIdx % 2 !== 0 ? "rgba(0,0,0,0.015)" : "transparent", cursor: "pointer" }}>
                              <td style={{ padding: "5px 10px", color: "var(--stone)", fontSize: 9 }}>{row._row_index ?? rIdx + 1}</td>
                              {sortedFields.map((field) => (
                                <td key={field.key} style={{ padding: "5px 10px", color: "var(--ink)", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={row[field.key] ?? ""}>
                                  {row[field.key] ?? ""}
                                </td>
                              ))}
                            </tr>
                          ))}
                          {rows.length === 0 && (
                            <tr><td colSpan={sortedFields.length + 1} style={{ padding: 24, textAlign: "center", color: "var(--stone)", fontSize: 11 }}>
                              {searchQuery ? "No matches" : "No data in this section"}
                            </td></tr>
                          )}
                          {rows.length > 150 && (
                            <tr><td colSpan={sortedFields.length + 1} style={{ padding: 8, textAlign: "center", color: "var(--stone)", fontSize: 9 }}>
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
