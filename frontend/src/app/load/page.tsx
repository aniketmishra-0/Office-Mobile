"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import ErrorToast from "@/components/ErrorToast";
import LoadingOverlay from "@/components/LoadingOverlay";
import ClearButton from "@/components/ClearButton";
import SubmitButton from "@/components/SubmitButton";
import MobileDropdown from "@/components/MobileDropdown";
import type { FieldSchema } from "@/types/field";
import { useStepHistory } from "@/lib/useStepHistory";
import {
  getSheetHistory,
  getSheetSections,
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

interface Section {
  title: string;
  rows: Record<string, string>[];
  start_row: number;
}

interface LoadedData {
  worksheet_name: string;
  fields: FieldSchema[];
  rows: Record<string, string>[];
  sections: Section[];
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
  const [loaded, setLoaded] = useState<LoadedData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accessStatus, setAccessStatus] = useState<"checking" | "edit" | "read" | "none" | null>(null);
  const [serviceAccountEmail, setServiceAccountEmail] = useState<string | null>(null);

  // Column picker + results state
  const [selectedField, setSelectedField] = useState<FieldSchema | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortMode, setSortMode] = useState<"count" | "alpha">("count");

  // Section/week filter: multi-select (indices into sections[])
  const [selectedSections, setSelectedSections] = useState<number[]>([]);

  // Month filter: auto-detected from section titles or row dates
  const [selectedMonth, setSelectedMonth] = useState<string>("all"); // "all" or month key

  // Date range filter
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Filter panel toggle
  const [showFilters, setShowFilters] = useState(false);

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
          setSelectedSections([]);
          setSelectedMonth("all");
          setDateFrom("");
          setDateTo("");
          break;
        case "tabs":
          setLoaded(null);
          setSelectedField(null);
          setSearchQuery("");
          setSelectedSections([]);
          setSelectedMonth("all");
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
    setSelectedSections([]);
    setSelectedMonth("all");
    setDateFrom("");
    setDateTo("");

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
      // Load both: all rows (for "All" mode) and sections (for week filter)
      const [historyData, sectionsData] = await Promise.all([
        getSheetHistory(url, tab.worksheet_name),
        getSheetSections(url, tab.worksheet_name).catch(() => null),
      ]);
      const sections: Section[] = sectionsData?.sections ?? [];
      setLoaded({
        worksheet_name: historyData.worksheet_name,
        fields: historyData.fields,
        rows: historyData.rows,
        sections,
      });
      // Auto-select a reasonable column
      autoSelectColumn(historyData.fields, historyData.rows);
    } catch (e: any) {
      setError(e.message ?? "Failed to load entries");
    } finally {
      setLoading(false);
    }
  }

  function autoSelectColumn(fields: FieldSchema[], rows: Record<string, string>[]) {
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
    if (fields.length > 0) {
      setSelectedField(fields[0]);
    }
  }

  // ─── Date/Month detection ─────────────────────────────────────────
  // Strategy: detect months from section titles first. If that yields nothing,
  // fall back to scanning row-level date columns. Handles ALL common date formats:
  // DD/MM/YYYY, MM/DD/YYYY, YYYY-MM-DD, DD-Mon-YYYY, Mon DD YYYY, DDMMYY, MMDDYY, etc.
  const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const MONTH_FULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  const MONTH_ABBRS: Record<string, number> = {
    jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2,
    apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6,
    aug: 7, august: 7, sep: 8, sept: 8, september: 8, oct: 9, october: 9,
    nov: 10, november: 10, dec: 11, december: 11,
  };

  // Check if a string looks like a date (any format)
  function looksLikeDate(val: string): boolean {
    if (!val) return false;
    const v = val.trim();
    // DD/MM/YYYY, MM/DD/YYYY, DD-MM-YYYY, DD.MM.YYYY (with separators)
    if (/^\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}$/.test(v)) return true;
    // YYYY-MM-DD, YYYY/MM/DD
    if (/^\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}$/.test(v)) return true;
    // DD-Mon-YYYY, DD Mon YYYY, D-Mon-YY (e.g. "09-Feb-2026", "9 Feb 26")
    if (/^\d{1,2}[\s\-.](jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\w*[\s\-.,]+\d{2,4}$/i.test(v)) return true;
    // Mon DD, YYYY or Mon-DD-YYYY (e.g. "Feb 9, 2026", "February 9 2026")
    if (/^(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\w*[\s\-.]+\d{1,2}[\s,\-.]+\d{2,4}$/i.test(v)) return true;
    // Mon DD or DD Mon (without year, e.g. "Feb 9", "9 Feb")
    if (/^\d{1,2}[\s\-](jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\w*$/i.test(v)) return true;
    if (/^(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\w*[\s\-]\d{1,2}$/i.test(v)) return true;
    // DDMMYYYY or MMDDYYYY (8 digits, no separator)
    if (/^\d{8}$/.test(v)) return true;
    // DDMMYY or MMDDYY (6 digits, no separator)
    if (/^\d{6}$/.test(v)) return true;
    // DD/MM/YY or MM/DD/YY (2-digit year)
    if (/^\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2}$/.test(v)) return true;
    return false;
  }

  // Parse a date string flexibly — handles virtually every common format.
  // For ambiguous numeric formats (DD/MM vs MM/DD), assumes DD/MM (Indian convention).
  function parseDate(val: string): Date | null {
    if (!val) return null;
    const v = val.trim();

    // 1. DD-Mon-YYYY, DD Mon YYYY, D-Mon-YY (e.g. "09-Feb-2026", "9 Feb 26")
    const dMonY = v.match(/^(\d{1,2})[\s\-.](jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\w*[\s\-.,]+(\d{2,4})$/i);
    if (dMonY) {
      const day = parseInt(dMonY[1]);
      const monthIdx = MONTH_ABBRS[dMonY[2].toLowerCase().slice(0, 3)] ?? MONTH_ABBRS[dMonY[2].toLowerCase()];
      const year = parseInt(dMonY[3]) < 100 ? 2000 + parseInt(dMonY[3]) : parseInt(dMonY[3]);
      if (monthIdx !== undefined && day >= 1 && day <= 31) {
        return new Date(year, monthIdx, day);
      }
    }

    // 2. Mon DD, YYYY or Mon DD YYYY (e.g. "Feb 9, 2026", "February 9 2026")
    const monDY = v.match(/^(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\w*[\s\-.]+(\d{1,2})[\s,\-.]+(\d{2,4})$/i);
    if (monDY) {
      const monthIdx = MONTH_ABBRS[monDY[1].toLowerCase()];
      const day = parseInt(monDY[2]);
      const year = parseInt(monDY[3]) < 100 ? 2000 + parseInt(monDY[3]) : parseInt(monDY[3]);
      if (monthIdx !== undefined && day >= 1 && day <= 31) {
        return new Date(year, monthIdx, day);
      }
    }

    // 3. YYYY-MM-DD or YYYY/MM/DD (ISO-like)
    const iso = v.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
    if (iso) {
      const year = parseInt(iso[1]);
      const month = parseInt(iso[2]) - 1;
      const day = parseInt(iso[3]);
      if (year > 1990 && year < 2100 && month >= 0 && month < 12 && day >= 1 && day <= 31) {
        return new Date(year, month, day);
      }
    }

    // 4. DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY (with separators, assumes DD/MM for Indian format)
    const dmy = v.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
    if (dmy) {
      let a = parseInt(dmy[1]);
      let b = parseInt(dmy[2]);
      let year = parseInt(dmy[3]);
      if (year < 100) year = 2000 + year;
      // Heuristic: if first number > 12, it must be day (DD/MM/YYYY)
      // if second number > 12, it must be day (MM/DD/YYYY)
      // otherwise assume DD/MM/YYYY (Indian convention)
      let day: number, month: number;
      if (a > 12 && b <= 12) {
        day = a; month = b - 1; // DD/MM
      } else if (b > 12 && a <= 12) {
        day = b; month = a - 1; // MM/DD
      } else {
        // Ambiguous — assume DD/MM (Indian convention)
        day = a; month = b - 1;
      }
      if (month >= 0 && month < 12 && day >= 1 && day <= 31 && year > 1990 && year < 2100) {
        return new Date(year, month, day);
      }
    }

    // 5. DDMMYYYY (8 digits, no separator) — assume DDMMYYYY
    const d8 = v.match(/^(\d{2})(\d{2})(\d{4})$/);
    if (d8) {
      let a = parseInt(d8[1]);
      let b = parseInt(d8[2]);
      const year = parseInt(d8[3]);
      let day: number, month: number;
      if (a > 12 && b <= 12) { day = a; month = b - 1; }
      else if (b > 12 && a <= 12) { day = b; month = a - 1; }
      else { day = a; month = b - 1; } // assume DDMM
      if (month >= 0 && month < 12 && day >= 1 && day <= 31 && year > 1990 && year < 2100) {
        return new Date(year, month, day);
      }
    }

    // 6. DDMMYY (6 digits, no separator) — assume DDMMYY
    const d6 = v.match(/^(\d{2})(\d{2})(\d{2})$/);
    if (d6) {
      let a = parseInt(d6[1]);
      let b = parseInt(d6[2]);
      let year = 2000 + parseInt(d6[3]);
      let day: number, month: number;
      if (a > 12 && b <= 12) { day = a; month = b - 1; }
      else if (b > 12 && a <= 12) { day = b; month = a - 1; }
      else { day = a; month = b - 1; } // assume DDMM
      if (month >= 0 && month < 12 && day >= 1 && day <= 31) {
        return new Date(year, month, day);
      }
    }

    // 7. Fallback: native Date parse (handles "May 17, 2026", ISO strings, etc.)
    const d = new Date(v);
    if (!isNaN(d.getTime()) && d.getFullYear() > 1990 && d.getFullYear() < 2100) return d;

    return null;
  }

  // Detect date columns from row data — scans ALL columns, picks the best one.
  // Prioritizes columns whose header contains "date" or "तारीख", then by highest match ratio.
  const dateColumn = useMemo(() => {
    if (!loaded) return null;

    type Candidate = { field: FieldSchema; ratio: number; checked: number };
    const candidates: Candidate[] = [];

    for (const field of loaded.fields) {
      let dateCount = 0;
      let checked = 0;
      for (const row of loaded.rows) {
        const val = (row[field.key] ?? "").trim();
        if (!val) continue;
        checked++;
        if (checked > 50) break;
        if (looksLikeDate(val)) {
          dateCount++;
        }
      }
      if (checked >= 3 && dateCount / checked >= 0.4) {
        candidates.push({ field, ratio: dateCount / checked, checked });
      }
    }

    if (candidates.length === 0) return null;

    // Prefer columns whose label/header contains "date" (case-insensitive)
    const dateNamedCols = candidates.filter((c) => {
      const label = (c.field.label || c.field.source_header || "").toLowerCase();
      return label.includes("date") || label.includes("तारीख") || label.includes("dob") || label === "dt";
    });

    if (dateNamedCols.length > 0) {
      // Among date-named columns, pick the one with highest ratio
      dateNamedCols.sort((a, b) => b.ratio - a.ratio);
      return dateNamedCols[0].field;
    }

    // Otherwise pick the column with highest date-match ratio
    candidates.sort((a, b) => b.ratio - a.ratio);
    return candidates[0].field;
  }, [loaded]);

  // Extract months: first try section titles, then fall back to row dates
  const availableMonths = useMemo(() => {
    if (!loaded) return [];

    // Strategy 1: from section titles
    if (loaded.sections.length > 0) {
      const monthSet = new Map<string, { label: string; indices: number[] }>();
      loaded.sections.forEach((section, idx) => {
        const title = section.title.toLowerCase();
        for (let m = 0; m < MONTH_NAMES.length; m++) {
          const short = MONTH_NAMES[m].toLowerCase();
          const full = MONTH_FULL[m].toLowerCase();
          if (title.includes(short) || title.includes(full)) {
            const key = MONTH_NAMES[m];
            if (!monthSet.has(key)) {
              monthSet.set(key, { label: MONTH_NAMES[m], indices: [] });
            }
            monthSet.get(key)!.indices.push(idx);
            break;
          }
        }
      });
      if (monthSet.size > 0) {
        return [...monthSet.entries()].map(([key, val]) => ({
          value: key,
          label: val.label,
          indices: val.indices,
          rowCount: val.indices.reduce((sum, i) => sum + (loaded.sections[i]?.rows.length ?? 0), 0),
          source: "sections" as const,
        }));
      }
    }

    // Strategy 2: from row-level date column
    if (dateColumn) {
      const monthMap = new Map<string, number>(); // "YYYY-MM" → count
      for (const row of loaded.rows) {
        const val = (row[dateColumn.key] ?? "").trim();
        const d = parseDate(val);
        if (!d) continue;
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        monthMap.set(key, (monthMap.get(key) ?? 0) + 1);
      }
      if (monthMap.size > 0) {
        return [...monthMap.entries()]
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([key, count]) => {
            const [y, m] = key.split("-");
            const label = `${MONTH_NAMES[parseInt(m) - 1]} ${y}`;
            return { value: key, label, indices: [], rowCount: count, source: "rows" as const };
          });
      }
    }

    return [];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, dateColumn]);

  // Get the active rows based on section selection + month filter + date range
  const activeRows = useMemo(() => {
    if (!loaded) return [];
    let rows = loaded.rows;

    // Apply month filter
    if (selectedMonth !== "all") {
      const monthData = availableMonths.find((m) => m.value === selectedMonth);
      if (monthData) {
        if (monthData.source === "sections" && monthData.indices.length > 0) {
          // Section-based month: gather rows from matching sections
          rows = [];
          for (const idx of monthData.indices) {
            const section = loaded.sections[idx];
            if (section) rows = rows.concat(section.rows);
          }
        } else if (monthData.source === "rows" && dateColumn) {
          // Row-based month: filter by parsed date
          const [yearStr, monthStr] = selectedMonth.split("-");
          const filterYear = Number(yearStr);
          const filterMonth = Number(monthStr) - 1;
          rows = rows.filter((row) => {
            const d = parseDate((row[dateColumn.key] ?? "").trim());
            return d && d.getFullYear() === filterYear && d.getMonth() === filterMonth;
          });
        }
      }
    }

    // Apply section filter (on top of month filter)
    if (selectedSections.length > 0) {
      const sectionRows = new Set<string>();
      for (const idx of selectedSections) {
        const section = loaded.sections[idx];
        if (section) {
          for (const row of section.rows) {
            sectionRows.add(row._row_index ?? "");
          }
        }
      }
      if (sectionRows.size > 0) {
        rows = rows.filter((row) => sectionRows.has(row._row_index ?? ""));
      }
    }

    // Apply date range filter
    if ((dateFrom || dateTo) && dateColumn) {
      if (dateFrom) {
        const from = new Date(dateFrom);
        from.setHours(0, 0, 0, 0);
        if (!isNaN(from.getTime())) {
          rows = rows.filter((row) => {
            const d = parseDate((row[dateColumn.key] ?? "").trim());
            if (!d) return false;
            d.setHours(0, 0, 0, 0);
            return d >= from;
          });
        }
      }
      if (dateTo) {
        const to = new Date(dateTo);
        to.setHours(23, 59, 59, 999);
        if (!isNaN(to.getTime())) {
          rows = rows.filter((row) => {
            const d = parseDate((row[dateColumn.key] ?? "").trim());
            if (!d) return false;
            return d <= to;
          });
        }
      }
    }

    return rows;
  }, [loaded, selectedSections, selectedMonth, availableMonths, dateColumn, dateFrom, dateTo]);

  // Compute frequency counts
  const analysis = useMemo(() => {
    if (!loaded || !selectedField || activeRows.length === 0) return null;
    const counts = new Map<string, number>();
    for (const row of activeRows) {
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
    const totalRows = activeRows.length;
    const uniqueCount = counts.size;
    return { sorted, maxCount, totalRows, uniqueCount };
  }, [loaded, selectedField, sortMode, activeRows]);

  // Filter results by search
  const filteredResults = useMemo(() => {
    if (!analysis) return [];
    if (!searchQuery.trim()) return analysis.sorted;
    const q = searchQuery.trim().toLowerCase();
    return analysis.sorted.filter(([name]) => name.toLowerCase().includes(q));
  }, [analysis, searchQuery]);

  // ═══════════════════════ STEP 3: Results ═══════════════════════
  if (loaded && selectedField) {
    const sortedFields = [...loaded.fields].sort((a, b) => a.order - b.order);
    const hasSections = loaded.sections.length > 0;

    return (
      <div className="flex flex-col min-h-screen" style={{ background: "var(--cream)" }}>
        <AppHeader title="Load Analysis" showBack onBack={() => window.history.back()} />
        {loading && <LoadingOverlay message="Loading..." />}

        <div className="load-results-container" style={{
          flex: 1,
          width: "100%",
          maxWidth: 800,
          margin: "0 auto",
          padding: "24px 24px 40px",
        }}>
          {/* Header */}
          <div style={{ marginBottom: 24 }}>
            <h2 style={{
              fontFamily: "var(--font-newsreader), Georgia, serif",
              fontWeight: 400,
              fontSize: 22,
              color: "var(--ink)",
              margin: 0,
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
              {selectedField.label} · {analysis?.totalRows ?? 0} rows · {analysis?.uniqueCount ?? 0} unique
              {selectedMonth !== "all" && (
                <> · {availableMonths.find((m) => m.value === selectedMonth)?.label ?? selectedMonth}</>
              )}
              {selectedSections.length > 0 && selectedMonth === "all" && (
                <> · {selectedSections.length} section{selectedSections.length > 1 ? "s" : ""} selected</>
              )}
              {(dateFrom || dateTo) && (
                <> · {dateFrom || "…"} → {dateTo || "…"}</>
              )}
            </p>
          </div>

          {/* Filter toggle button */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: showFilters ? 0 : 20 }}>
            <button
              type="button"
              onClick={() => setShowFilters((v) => !v)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                fontSize: 11,
                fontWeight: 500,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: showFilters ? "var(--ink)" : "var(--charcoal)",
                background: showFilters ? "var(--paper)" : "transparent",
                border: "1px solid var(--rule)",
                borderRadius: 4,
                padding: "7px 12px",
                cursor: "pointer",
                transition: "all 180ms ease-out",
              }}
              aria-expanded={showFilters}
              aria-label="Toggle filters"
            >
              {/* Filter icon */}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
              </svg>
              Filters
              {/* Show active filter count */}
              {(selectedSections.length > 0 || selectedMonth !== "all" || dateFrom || dateTo) && (
                <span style={{
                  background: "var(--clay)",
                  color: "#fff",
                  fontSize: 9,
                  fontWeight: 700,
                  borderRadius: "50%",
                  width: 16,
                  height: 16,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}>
                  {(selectedSections.length > 0 ? 1 : 0) + (selectedMonth !== "all" ? 1 : 0) + ((dateFrom || dateTo) ? 1 : 0)}
                </span>
              )}
            </button>
          </div>

          {/* Collapsible controls panel */}
          {showFilters && (
          <div className="load-controls-grid" style={{
            display: "grid",
            gap: 16,
            marginBottom: 20,
            marginTop: 12,
            padding: "16px",
            background: "var(--paper)",
            border: "1px solid var(--rule)",
            borderRadius: 8,
          }}>
            {/* Column picker */}
            <div>
              <label style={{
                display: "block",
                fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                fontWeight: 500,
                fontSize: 10,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "var(--charcoal)",
                marginBottom: 6,
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
                  border: 0,
                  borderBottom: "2px solid var(--ink)",
                  borderRadius: 0,
                  padding: "8px 0",
                  outline: "none",
                  cursor: "pointer",
                }}
              >
                {sortedFields.map((f) => (
                  <option key={f.key} value={f.key}>{f.label}</option>
                ))}
              </select>
            </div>

            {/* Section/Week multi-select dropdown */}
            {hasSections && (
              <div>
                <label style={{
                  display: "block",
                  fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                  fontWeight: 500,
                  fontSize: 10,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "var(--charcoal)",
                  marginBottom: 6,
                }}>
                  Week / Section
                </label>
                <MobileDropdown
                  multiple
                  size="sm"
                  selectedValues={selectedSections.map(String)}
                  options={loaded.sections.map((section, idx) => ({
                    value: String(idx),
                    label: section.title,
                    subtitle: `${section.rows.length} rows`,
                  }))}
                  onMultiChange={(values) => {
                    setSelectedSections(values.map(Number));
                    setSearchQuery("");
                  }}
                  placeholder={`All sections (${loaded.rows.length} rows)`}
                />
              </div>
            )}

            {/* Month dropdown */}
            {availableMonths.length > 0 && (
              <div>
                <label style={{
                  display: "block",
                  fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                  fontWeight: 500,
                  fontSize: 10,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "var(--charcoal)",
                  marginBottom: 6,
                }}>
                  Month
                </label>
                <MobileDropdown
                  size="sm"
                  value={selectedMonth}
                  options={[
                    { value: "all", label: `All months (${loaded.rows.length} rows)` },
                    ...availableMonths.map(({ value, label, rowCount }) => ({
                      value,
                      label: `${label} (${rowCount})`,
                    })),
                  ]}
                  onChange={(val) => { setSelectedMonth(val); setSearchQuery(""); }}
                  placeholder="All months"
                />
              </div>
            )}

            {/* Date Range dropdown-style filter */}
            {dateColumn && (
              <div>
                <label style={{
                  display: "block",
                  fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                  fontWeight: 500,
                  fontSize: 10,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "var(--charcoal)",
                  marginBottom: 6,
                }}>
                  Date Range
                </label>
                <div className="load-date-range" style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  background: "var(--paper)",
                  border: "1px solid var(--rule)",
                  borderRadius: 6,
                  padding: "5px 10px",
                }}>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    style={{
                      fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                      fontSize: 11,
                      color: "var(--ink)",
                      background: "transparent",
                      border: 0,
                      outline: "none",
                      width: "100%",
                      minWidth: 0,
                    }}
                  />
                  <span style={{
                    fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                    fontSize: 9,
                    color: "var(--stone)",
                    flexShrink: 0,
                  }}>→</span>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    style={{
                      fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                      fontSize: 11,
                      color: "var(--ink)",
                      background: "transparent",
                      border: 0,
                      outline: "none",
                      width: "100%",
                      minWidth: 0,
                    }}
                  />
                  {(dateFrom || dateTo) && (
                    <button
                      type="button"
                      onClick={() => { setDateFrom(""); setDateTo(""); }}
                      style={{
                        fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                        fontSize: 8,
                        fontWeight: 600,
                        color: "var(--clay)",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        padding: "2px 4px",
                        flexShrink: 0,
                      }}
                      aria-label="Clear date range"
                    >
                      ✕
                    </button>
                  )}
                </div>
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
                  padding: "9px 28px 9px 12px",
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
                padding: "9px 14px",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {sortMode === "count" ? "By count" : "A → Z"}
            </button>
          </div>

          <hr style={{ border: 0, borderTop: "1px solid var(--rule)", margin: "0 0 16px 0" }} />

          {/* Results list */}
          <div>
            {(!analysis || filteredResults.length === 0) && (
              <p style={{
                fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                fontSize: 12,
                color: "var(--stone)",
                textAlign: "center",
                padding: "40px 0",
              }}>
                {activeRows.length === 0 ? "No data in this section" : "No matches"}
              </p>
            )}
            {analysis && filteredResults.map(([name, count], idx) => {
              const pct = ((count / analysis.totalRows) * 100).toFixed(1);
              const barWidth = (count / analysis.maxCount) * 100;
              return (
                <div key={name} style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 0",
                  borderBottom: "1px solid var(--rule)",
                }}>
                  {/* Rank */}
                  <span style={{
                    fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                    fontSize: 12,
                    fontWeight: 400,
                    color: "var(--stone)",
                    width: 28,
                    textAlign: "right",
                    flexShrink: 0,
                  }}>
                    {idx + 1}
                  </span>
                  {/* Name + bar */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{
                      fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                      fontSize: 14,
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
                      marginTop: 6,
                      height: 6,
                      background: "var(--rule)",
                      borderRadius: 3,
                      overflow: "hidden",
                    }}>
                      <div style={{
                        width: `${barWidth}%`,
                        height: "100%",
                        background: "var(--clay)",
                        borderRadius: 3,
                        transition: "width 300ms ease-out",
                      }} />
                    </div>
                  </div>

                  {/* Count */}
                  <span style={{
                    fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                    fontSize: 14,
                    fontWeight: 600,
                    color: "var(--ink)",
                    flexShrink: 0,
                    minWidth: 36,
                    textAlign: "right",
                  }}>
                    {count}
                  </span>
                  {/* Percentage */}
                  <span style={{
                    fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                    fontSize: 12,
                    fontWeight: 400,
                    color: "var(--stone)",
                    flexShrink: 0,
                    minWidth: 52,
                    textAlign: "right",
                  }}>
                    {pct}%
                  </span>
                </div>
              );
            })}
          </div>

          {/* Summary footer */}
          {analysis && (
            <div style={{
              marginTop: 20,
              padding: "14px 0",
              borderTop: "1px solid var(--rule)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 10,
            }}>
              <p style={{
                fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                fontSize: 12,
                fontWeight: 400,
                color: "var(--stone)",
                margin: 0,
              }}>
                {analysis.totalRows} rows · {analysis.uniqueCount} unique values
              </p>
              <button
                type="button"
                onClick={() => { setLoaded(null); setSelectedField(null); setSearchQuery(""); setSelectedSections([]); setSelectedMonth("all"); setDateFrom(""); setDateTo(""); }}
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
                  padding: "7px 12px",
                  cursor: "pointer",
                }}
              >
                Change sheet
              </button>
            </div>
          )}
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
