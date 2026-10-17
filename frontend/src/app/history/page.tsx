"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import ErrorToast from "@/components/ErrorToast";
import LoadingOverlay from "@/components/LoadingOverlay";
import ClearButton from "@/components/ClearButton";
import SubmitButton from "@/components/SubmitButton";
import FieldRenderer from "@/components/FieldRenderer";
import SubsheetSearchModal from "@/components/SubsheetSearchModal";
import type { FieldSchema } from "@/types/field";
import { safeBack } from "@/lib/navigation";
import { useStepHistory } from "@/lib/useStepHistory";
import {
  getFormSuggestions,
  getSheetHistory,
  lookupFormsBySheet,
  checkSheetAccess,
  getPublicConfig,
  updateSheetRow,
  batchAppendRows,
  batchDeleteRows,
  getSheetSections,
} from "@/lib/api";

interface TabOption {
  id: string | null; // form id if form exists, else null
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

const HIST_CACHE_TTL = 180_000; // 3 minutes

function getCachedHistory(url: string, wsName?: string | null): LoadedTab | null {
  try {
    const raw = sessionStorage.getItem(`om_hist_${url}_${wsName || ""}`);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts < HIST_CACHE_TTL) return data;
  } catch {}
  return null;
}

function setCachedHistory(url: string, wsName: string | null | undefined, data: LoadedTab) {
  try {
    sessionStorage.setItem(`om_hist_${url}_${wsName || ""}`, JSON.stringify({ data, ts: Date.now() }));
  } catch {}
}

function getCachedTabs(url: string): TabOption[] | null {
  try {
    const raw = sessionStorage.getItem(`om_tabs_${url}`);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts < HIST_CACHE_TTL) return data;
  } catch {}
  return null;
}

function setCachedTabs(url: string, data: TabOption[]) {
  try {
    sessionStorage.setItem(`om_tabs_${url}`, JSON.stringify({ data, ts: Date.now() }));
  } catch {}
}

export default function HistoryPage() {
  return (
    <Suspense fallback={<LoadingOverlay message="Loading..." />}>
      <HistoryPageInner />
    </Suspense>
  );
}

function HistoryPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sheetParam = searchParams.get("sheet");

  const [formInput, setFormInput] = useState("");
  const [urlValid, setUrlValid] = useState(false);
  const [urlError, setUrlError] = useState("");
  const [loading, setLoading] = useState(false);
  const [availableTabs, setAvailableTabs] = useState<TabOption[] | null>(null);
  const [sheetUrl, setSheetUrl] = useState(""); // keep original URL for non-form tab reads
  const [loaded, setLoaded] = useState<LoadedTab | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [selectedRow, setSelectedRow] = useState<Record<string, string> | null>(null);
  const [rowEditValues, setRowEditValues] = useState<Record<string, string>>({});
  const [savingRow, setSavingRow] = useState(false);
  const [rowSaveSuccess, setRowSaveSuccess] = useState<string | null>(null);
  const [rowSaveError, setRowSaveError] = useState<string | null>(null);
  const [formViewMode, setFormViewMode] = useState<"form" | "summary">("form");
  const [isAddingNewRow, setIsAddingNewRow] = useState(false);
  const [newRowValues, setNewRowValues] = useState<Record<string, string>>({});
  const [isSavingNewRow, setIsSavingNewRow] = useState(false);
  const [isDeletingRow, setIsDeletingRow] = useState(false);
  const [fieldSearch, setFieldSearch] = useState("");
  const [detectedSectionsCount, setDetectedSectionsCount] = useState<number | null>(null);
  const [showMultiHeaderAlert, setShowMultiHeaderAlert] = useState(false);
  const [accessStatus, setAccessStatus] = useState<"checking" | "edit" | "read" | "none" | null>(null);
  const [serviceAccountEmail, setServiceAccountEmail] = useState<string | null>(null);
  const hasEditPermission = accessStatus !== "read" && accessStatus !== "none";
  const [tabSearch, setTabSearch] = useState("");
  const [showSubsheetModal, setShowSubsheetModal] = useState(false);
  const [allDiscoveredTabs, setAllDiscoveredTabs] = useState<TabOption[]>([]);

  const filteredTabs = useMemo(() => {
    if (!availableTabs) return [];
    const q = tabSearch.trim().toLowerCase();
    if (!q) return availableTabs;
    return availableTabs.filter((tab) =>
      (tab.worksheet_name || tab.form_title || "").toLowerCase().includes(q)
    );
  }, [availableTabs, tabSearch]);

  // Column-level filters: key = field.key, value = selected filter value
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [showFilterPanel, setShowFilterPanel] = useState(false);

  // Month filter & date range filter
  const [selectedMonth, setSelectedMonth] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Auto-load sheet from URL param on mount
  useEffect(() => {
    if (sheetParam) {
      loadSheetFromUrl(sheetParam);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetParam]);

  // Synchronize loaded state with sessionStorage cache
  useEffect(() => {
    if (loaded && (sheetUrl || sheetParam)) {
      const url = sheetUrl || sheetParam || "";
      setCachedHistory(url, loaded.worksheet_name, loaded);
    }
  }, [loaded, sheetUrl, sheetParam]);

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

    // Fast path: check sessionStorage cache (2-min TTL)
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
        if (!status.read) {
          setAccessStatus("none");
        } else if (!status.edit) {
          setAccessStatus("read");
        } else {
          setAccessStatus("edit");
        }
      } catch (e) {
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

  async function handleLoadSheet() {
    if (!validateUrl(formInput)) return;
    const trimmed = formInput.trim();
    // Navigate to the same page with sheet URL as query param
    // This opens a "new view" so the input page stays fresh
    router.push(`/history?sheet=${encodeURIComponent(trimmed)}`);
  }

  async function loadSheetFromUrl(url: string) {
    setError(null);
    setSearchQuery("");
    setColumnFilters({});
    setSelectedMonth("");
    setDateFrom("");
    setDateTo("");
    setSelectedRow(null);

    // SWR Fast Path: Instant render from cache if available
    const cachedTabs = getCachedTabs(url);
    if (cachedTabs && cachedTabs.length > 0) {
      setSheetUrl(url);
      setAllDiscoveredTabs(cachedTabs);
      if (cachedTabs.length === 1) {
        const cachedData = getCachedHistory(url, cachedTabs[0].worksheet_name);
        if (cachedData) {
          setLoaded(cachedData);
          setLoading(false);
        } else {
          setLoading(true);
        }
      } else {
        setAvailableTabs(cachedTabs);
        setLoading(false);
      }
    } else {
      setLoading(true);
      setAvailableTabs(null);
      setLoaded(null);
    }

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
        if (!cachedTabs) setError("No tabs found in this sheet");
        return;
      }

      setCachedTabs(url, tabs);
      setAllDiscoveredTabs(tabs);

      // If only one tab, auto-select it
      if (tabs.length === 1) {
        await selectTab(tabs[0], url);
      } else {
        setAvailableTabs(tabs);
        setLoading(false);
      }
    } catch (e: any) {
      if (!cachedTabs) {
        setError(e.message ?? "Failed to load sheet");
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleSwitchWorksheet(wsName: string) {
    const url = sheetUrl || sheetParam || "";
    if (!url) return;
    setError(null);

    const cachedData = getCachedHistory(url, wsName);
    if (cachedData) {
      setLoaded(cachedData);
      setLoading(false);
    } else {
      setLoading(true);
    }

    try {
      const matchingTab = allDiscoveredTabs.find(
        (t) => (t.worksheet_name || t.form_title) === wsName
      );
      if (matchingTab && matchingTab.has_form && matchingTab.id) {
        await selectTab(matchingTab, url);
        return;
      }

      const data = await getSheetHistory(url, wsName);
      const freshData = {
        worksheet_name: data.worksheet_name,
        fields: data.fields,
        rows: data.rows,
      };
      setLoaded(freshData);
      setCachedHistory(url, wsName, freshData);
      setSelectedRow(null);
      setIsAddingNewRow(false);
      setFieldSearch("");
      setSearchQuery("");
      setColumnFilters({});
      setSelectedMonth("");
      setDateFrom("");
      setDateTo("");

      getSheetSections(url, wsName)
        .then((secData) => {
          if (secData && secData.sections && secData.sections.length > 1) {
            setDetectedSectionsCount(secData.sections.length);
            setShowMultiHeaderAlert(true);
          } else {
            setDetectedSectionsCount(null);
            setShowMultiHeaderAlert(false);
          }
        })
        .catch(() => {});
    } catch (e: any) {
      if (!cachedData) {
        setError(e.message ?? "Failed to switch subsheet");
      }
    } finally {
      setLoading(false);
    }
  }

  async function selectTab(tab: TabOption, sheet_url?: string) {
    const url = sheet_url ?? sheetUrl;
    setAvailableTabs(null);
    setError(null);

    // Instant load from cache if available
    const cachedData = getCachedHistory(url, tab.worksheet_name);
    if (cachedData) {
      setLoaded(cachedData);
      setLoading(false);
    } else {
      setLoading(true);
    }

    try {
      if (tab.has_form && tab.id) {
        // Load via form suggestions (uses the form's saved schema)
        const data = await getFormSuggestions(tab.id);
        const freshData = {
          worksheet_name: tab.worksheet_name || tab.form_title,
          fields: tab.fields,
          rows: data.rows ?? [],
        };
        setLoaded(freshData);
        setCachedHistory(url, tab.worksheet_name, freshData);
      } else {
        // Load directly from the sheet tab (no form exists)
        const data = await getSheetHistory(url, tab.worksheet_name);
        const freshData = {
          worksheet_name: data.worksheet_name,
          fields: data.fields,
          rows: data.rows,
        };
        setLoaded(freshData);
        setCachedHistory(url, tab.worksheet_name, freshData);

        // Auto-detect multi-header / section structure
        const targetUrl = sheet_url ?? sheetUrl;
        getSheetSections(targetUrl, tab.worksheet_name)
          .then((secData) => {
            if (secData && secData.sections && secData.sections.length > 1) {
              setDetectedSectionsCount(secData.sections.length);
              setShowMultiHeaderAlert(true);
            } else {
              setDetectedSectionsCount(null);
              setShowMultiHeaderAlert(false);
            }
          })
          .catch(() => {});
      }
    } catch (e: any) {
      if (!cachedData) {
        setError(e.message ?? "Failed to load entries");
        // Re-show the tab picker so user can try another
        if (availableTabs === null) {
          // already cleared — bring user back to URL step
          handleReset();
        }
      }
    } finally {
      setLoading(false);
    }
  }

  // Detect the date column key (look for a field with "date" in label/key)
  const dateFieldKey = useMemo(() => {
    if (!loaded) return null;
    const dateField = loaded.fields.find(
      (f) =>
        f.key.toLowerCase() === "date" ||
        f.label.toLowerCase() === "date" ||
        f.key.toLowerCase().includes("date")
    );
    return dateField?.key ?? null;
  }, [loaded]);

  // Parse a date string (supports DD-Mon-YYYY, DD/MM/YYYY, YYYY-MM-DD, etc.)
  const parseDate = useCallback((str: string): Date | null => {
    if (!str) return null;
    const trimmed = str.trim();
    // Try DD-Mon-YYYY (e.g. 10-Feb-2026)
    const monMatch = trimmed.match(/^(\d{1,2})[-/](\w{3})[-/](\d{4})$/);
    if (monMatch) {
      const d = new Date(`${monMatch[2]} ${monMatch[1]}, ${monMatch[3]}`);
      if (!isNaN(d.getTime())) return d;
    }
    // Try standard Date.parse
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) return d;
    // Try DD/MM/YYYY
    const slashMatch = trimmed.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
    if (slashMatch) {
      const d2 = new Date(+slashMatch[3], +slashMatch[2] - 1, +slashMatch[1]);
      if (!isNaN(d2.getTime())) return d2;
    }
    return null;
  }, []);

  // Available months from the date column
  const availableMonths = useMemo(() => {
    if (!loaded || !dateFieldKey) return [];
    const monthSet = new Map<string, string>(); // value -> label
    for (const row of loaded.rows) {
      const d = parseDate(row[dateFieldKey] ?? "");
      if (d) {
        const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        if (!monthSet.has(val)) {
          const label = d.toLocaleString("en-US", { month: "short", year: "numeric" });
          monthSet.set(val, label);
        }
      }
    }
    // Sort descending (newest first)
    return [...monthSet.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([value, label]) => ({ value, label }));
  }, [loaded, dateFieldKey, parseDate]);

  // Search across ALL columns + column-specific filters + month + date range
  const matches = useMemo(() => {
    if (!loaded || !loaded.rows.length) return [];
    let filtered = loaded.rows;

    // Apply month filter
    if (selectedMonth && dateFieldKey) {
      const [yr, mo] = selectedMonth.split("-").map(Number);
      filtered = filtered.filter((row) => {
        const d = parseDate(row[dateFieldKey] ?? "");
        if (!d) return false;
        return d.getFullYear() === yr && d.getMonth() + 1 === mo;
      });
    }

    // Apply date range filter
    if ((dateFrom || dateTo) && dateFieldKey) {
      const from = dateFrom ? new Date(dateFrom + "T00:00:00") : null;
      const to = dateTo ? new Date(dateTo + "T23:59:59") : null;
      filtered = filtered.filter((row) => {
        const d = parseDate(row[dateFieldKey] ?? "");
        if (!d) return false;
        if (from && d < from) return false;
        if (to && d > to) return false;
        return true;
      });
    }

    // Apply column-specific filters
    const activeFilters = Object.entries(columnFilters).filter(([, v]) => v);
    if (activeFilters.length > 0) {
      filtered = filtered.filter((row) =>
        activeFilters.every(([key, val]) => {
          const cellValue = (row[key] ?? "").toLowerCase().trim();
          const filterVal = val.toLowerCase().trim();
          return cellValue === filterVal || cellValue.includes(filterVal);
        })
      );
    }

    // Apply search query
    const query = searchQuery.trim().toLowerCase();
    if (query) {
      filtered = filtered.filter((row) =>
        loaded.fields.some((f) => (row[f.key] ?? "").toLowerCase().includes(query)),
      );
    }

    return filtered;
  }, [loaded, searchQuery, columnFilters, selectedMonth, dateFrom, dateTo, dateFieldKey, parseDate]);

  // Get unique values per column for filter dropdowns
  const columnUniqueValues = useMemo(() => {
    if (!loaded || !loaded.rows.length) return {};
    const result: Record<string, string[]> = {};
    for (const field of loaded.fields) {
      const valSet = new Set<string>();
      for (const row of loaded.rows) {
        const v = (row[field.key] ?? "").trim();
        if (
          v &&
          !v.startsWith("#") &&
          v.toUpperCase() !== "NULL" &&
          v.toUpperCase() !== "UNDEFINED"
        ) {
          valSet.add(v);
        }
      }
      // Only show filter if column has reasonable number of unique values (< 500)
      if (valSet.size > 0 && valSet.size < 500) {
        result[field.key] = [...valSet].sort((a, b) => a.localeCompare(b));
      }
    }
    return result;
  }, [loaded]);

  // Fields enriched with unique sheet values for select dropdowns
  const enrichedFields = useMemo(() => {
    if (!loaded) return [];
    return [...loaded.fields]
      .sort((a, b) => a.order - b.order)
      .map((field) => {
        // If field already has options, ensure it renders as select (unless date/time/checkbox/file)
        if (field.options && field.options.length > 0) {
          return {
            ...field,
            type:
              field.type === "checkbox" ||
              field.type === "date" ||
              field.type === "time" ||
              field.type === "file"
                ? field.type
                : ("select" as const),
          };
        }

        // Never convert date, time, checkbox, or file fields into selects
        if (
          field.type === "date" ||
          field.type === "time" ||
          field.type === "checkbox" ||
          field.type === "file"
        ) {
          return field;
        }

        // Auto-promote column to select if it has unique values in the sheet
        const uniqueVals = columnUniqueValues[field.key];
        if (uniqueVals && uniqueVals.length > 0 && uniqueVals.length <= 250) {
          return {
            ...field,
            type: "select" as const,
            options: uniqueVals,
          };
        }

        return field;
      });
  }, [loaded, columnUniqueValues]);

  // Virtualized view: only render a page at a time so 10k+ rows don't choke the DOM
  const ROWS_PER_PAGE = 200;
  const [visibleCount, setVisibleCount] = useState(ROWS_PER_PAGE);

  // Reset visible count when query or dataset changes
  React.useEffect(() => {
    setVisibleCount(ROWS_PER_PAGE);
  }, [searchQuery, loaded, columnFilters, selectedMonth, dateFrom, dateTo]);

  const visibleMatches = useMemo(
    () => matches.slice(0, visibleCount),
    [matches, visibleCount],
  );

  const handleReset = useCallback(() => {
    // Go back in browser history instead of pushing a new entry
    router.back();
  }, [router]);

  const handleBackToTabs = useCallback(() => {
    setLoaded(null);
    setSelectedRow(null);
    setSearchQuery("");
    // Re-fetch tabs if we have a sheet URL
    if (sheetUrl && !availableTabs) {
      lookupFormsBySheet(sheetUrl)
        .then((result) => {
          const tabs: TabOption[] = result.items.map((item) => ({
            id: item.id,
            worksheet_name: item.worksheet_name,
            form_title: item.form_title,
            fields: item.fields,
            has_form: item.has_form,
          }));
          setAvailableTabs(tabs);
        })
        .catch(() => handleReset());
    }
  }, [sheetUrl, availableTabs, handleReset]);

  // Step indicator
  const step: 1 | 2 | 3 = availableTabs ? 2 : loaded ? 3 : 1;

  // ─── Back-gesture wiring ────────────────────────────────────────────
  // Translate the multi-state flow (input → tabs → loaded → detail) into
  // a single derived step name so the step-history hook can record each
  // transition as a synthetic browser history entry and drive backwards
  // motion on swipe / back button.
  type FlowStep = "input" | "tabs" | "loaded" | "detail";
  const flowStep: FlowStep = selectedRow || isAddingNewRow
    ? "detail"
    : loaded
    ? "loaded"
    : availableTabs
    ? "tabs"
    : "input";

  const setFlowStep = useCallback(
    (next: FlowStep) => {
      switch (next) {
        case "input":
          setSelectedRow(null);
          setIsAddingNewRow(false);
          setLoaded(null);
          setAvailableTabs(null);
          setSearchQuery("");
          setSelectedMonth("");
          setDateFrom("");
          setDateTo("");
          break;
        case "tabs":
          // Pop from "loaded" or "detail" back to the tab picker.
          setSelectedRow(null);
          setIsAddingNewRow(false);
          setLoaded(null);
          setSearchQuery("");
          setSelectedMonth("");
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
        case "loaded":
          // From "detail", clearing the row puts us back on the loaded list.
          setSelectedRow(null);
          setIsAddingNewRow(false);
          break;
        case "detail":
          // Forward-only via row click — nothing to do for back.
          break;
      }
    },
    [sheetUrl, availableTabs],
  );

  useStepHistory(flowStep, setFlowStep, ["input", "tabs", "loaded", "detail"]);

  // ════════════════════════════════════════════════════════════════════
  const handleOpenRowForm = useCallback(
    (row: Record<string, string>) => {
      setSelectedRow(row);
      const initial: Record<string, string> = {};
      if (loaded) {
        loaded.fields.forEach((f) => {
          initial[f.key] = row[f.key] ?? "";
        });
      }
      setRowEditValues(initial);
      setRowSaveSuccess(null);
      setRowSaveError(null);
    },
    [loaded],
  );

  const isRowDirty = useMemo(() => {
    if (!selectedRow || !loaded) return false;
    return loaded.fields.some((f) => {
      const orig = (selectedRow[f.key] ?? "").trim();
      const curr = (rowEditValues[f.key] ?? "").trim();
      return orig !== curr;
    });
  }, [selectedRow, loaded, rowEditValues]);

  const handleSaveRow = async () => {
    if (!selectedRow || !loaded) return;
    const rowIndex = Number(selectedRow._row_index);
    if (!rowIndex || rowIndex < 2) {
      setRowSaveError("Cannot determine row index in Google Sheet");
      return;
    }
    setSavingRow(true);
    setRowSaveError(null);
    setRowSaveSuccess(null);
    try {
      const targetUrl = sheetUrl || sheetParam || formInput;
      await updateSheetRow({
        sheet_url: targetUrl,
        worksheet_name: loaded.worksheet_name,
        row_index: rowIndex,
        values: rowEditValues,
      });

      const updatedRow = { ...selectedRow, ...rowEditValues };
      setSelectedRow(updatedRow);

      setLoaded((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          rows: prev.rows.map((r) =>
            r._row_index === selectedRow._row_index ? updatedRow : r
          ),
        };
      });

      setRowSaveSuccess(`Row ${rowIndex} updated successfully in Google Sheet!`);
      setTimeout(() => setRowSaveSuccess(null), 4000);
    } catch (err: any) {
      setRowSaveError(err.message || "Failed to update row in Google Sheet");
    } finally {
      setSavingRow(false);
    }
  };

  const handleSaveNewRow = async () => {
    if (!loaded) return;
    setIsSavingNewRow(true);
    setRowSaveError(null);
    try {
      const targetUrl = sheetUrl || sheetParam || formInput;
      await batchAppendRows({
        sheet_url: targetUrl,
        worksheet_name: loaded.worksheet_name,
        rows: [newRowValues],
      });

      const nextIdx = loaded.rows.length > 0
        ? (Number(loaded.rows[loaded.rows.length - 1]._row_index) || loaded.rows.length + 1) + 1
        : 2;
      const addedRow = { ...newRowValues, _row_index: String(nextIdx) };

      setLoaded((prev) => {
        if (!prev) return prev;
        return { ...prev, rows: [...prev.rows, addedRow] };
      });

      setIsAddingNewRow(false);
      setRowSaveSuccess("✓ New row appended successfully to Google Sheet!");
      setTimeout(() => setRowSaveSuccess(null), 4000);
    } catch (err: any) {
      setRowSaveError(err.message || "Failed to add row to Google Sheet");
    } finally {
      setIsSavingNewRow(false);
    }
  };

  const handleDeleteRow = async () => {
    if (!selectedRow || !loaded) return;
    const rowIndex = Number(selectedRow._row_index);
    if (!rowIndex || rowIndex < 2) {
      setRowSaveError("Cannot determine row index in Google Sheet");
      return;
    }
    if (!window.confirm(`Are you sure you want to delete Row #${rowIndex} from Google Sheet?\nThis action cannot be undone.`)) {
      return;
    }
    setIsDeletingRow(true);
    setRowSaveError(null);
    try {
      const targetUrl = sheetUrl || sheetParam || formInput;
      await batchDeleteRows(targetUrl, loaded.worksheet_name, [rowIndex]);

      setLoaded((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          rows: prev.rows.filter((r) => r._row_index !== selectedRow._row_index),
        };
      });

      setSelectedRow(null);
      setRowSaveSuccess(`✓ Row #${rowIndex} deleted from Google Sheet!`);
      setTimeout(() => setRowSaveSuccess(null), 4000);
    } catch (err: any) {
      setRowSaveError(err.message || "Failed to delete row from Google Sheet");
    } finally {
      setIsDeletingRow(false);
    }
  };

  const handleDuplicateRow = () => {
    if (!selectedRow || !loaded) return;
    const duplicateData: Record<string, string> = {};
    loaded.fields.forEach((f) => {
      duplicateData[f.key] = rowEditValues[f.key] ?? selectedRow[f.key] ?? "";
    });
    setNewRowValues(duplicateData);
    setIsAddingNewRow(true);
    setSelectedRow(null);
    setFieldSearch("");
  };

  // Keyboard navigation & shortcuts for Row Form and Add Row
  useEffect(() => {
    if (!selectedRow && !isAddingNewRow) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      const isInput = tag === "input" || tag === "textarea" || tag === "select";

      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        if (isAddingNewRow) handleSaveNewRow();
        else handleSaveRow();
      } else if (e.key === "Escape") {
        e.preventDefault();
        setSelectedRow(null);
        setIsAddingNewRow(false);
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d" && selectedRow) {
        e.preventDefault();
        handleDuplicateRow();
      } else if (!isInput && selectedRow) {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          const currentIdx = matches.findIndex((r) => r === selectedRow);
          if (currentIdx > 0) handleOpenRowForm(matches[currentIdx - 1]);
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          const currentIdx = matches.findIndex((r) => r === selectedRow);
          if (currentIdx >= 0 && currentIdx < matches.length - 1) handleOpenRowForm(matches[currentIdx + 1]);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRow, isAddingNewRow, loaded, matches, rowEditValues, newRowValues, isRowDirty]);

  // ═══════════════════════ Add New Row Form View ═══════════════════════
  if (isAddingNewRow && loaded) {
    const displayFields = fieldSearch.trim()
      ? enrichedFields.filter(
          (f) =>
            f.label.toLowerCase().includes(fieldSearch.toLowerCase().trim()) ||
            f.key.toLowerCase().includes(fieldSearch.toLowerCase().trim())
        )
      : enrichedFields;

    return (
      <div className="flex flex-col min-h-screen" style={{ background: "var(--cream)" }}>
        <AppHeader title="New Entry Form" showBack onBack={() => setIsAddingNewRow(false)} />
        {isSavingNewRow && <LoadingOverlay message="Appending new row to Google Sheet..." />}

        <div className="flex-1 w-full max-w-[620px] mx-auto px-4 sm:px-6 pt-6 pb-28">
          {/* Header card */}
          <div style={{
            background: "var(--paper)",
            border: "1px solid var(--rule)",
            borderRadius: 0,
            padding: "16px 18px",
            marginBottom: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
          }}>
            <div>
              <span style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "2px 8px",
                borderRadius: 0,
                background: "var(--clay)",
                color: "var(--on-clay)",
                fontFamily: "var(--font-plex-mono), monospace",
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}>
                + New Entry
              </span>
              <h2 style={{
                fontFamily: "var(--font-newsreader), Georgia, serif",
                fontWeight: 400,
                fontSize: 18,
                color: "var(--ink)",
                margin: "4px 0 0 0",
              }}>
                {loaded.worksheet_name}
              </h2>
            </div>

            <button
              type="button"
              onClick={() => setIsAddingNewRow(false)}
              style={{
                fontFamily: "var(--font-plex-mono), monospace",
                fontSize: 11,
                color: "var(--stone)",
                background: "transparent",
                border: "1px solid var(--rule)",
                borderRadius: 0,
                padding: "6px 12px",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>

          {/* Field search input */}
          {enrichedFields.length > 4 && (
            <div style={{ marginBottom: 12, position: "relative" }}>
              <input
                type="text"
                placeholder="🔍 Filter fields by name..."
                value={fieldSearch}
                onChange={(e) => setFieldSearch(e.target.value)}
                style={{
                  width: "100%",
                  fontFamily: "var(--font-plex-mono), monospace",
                  fontSize: 11,
                  padding: "8px 12px",
                  background: "var(--paper)",
                  border: "1px solid var(--rule)",
                  borderRadius: 0,
                  color: "var(--ink)",
                  outline: "none",
                }}
              />
              {fieldSearch && (
                <button
                  type="button"
                  onClick={() => setFieldSearch("")}
                  style={{
                    position: "absolute",
                    right: 8,
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: 0,
                    color: "var(--stone)",
                    cursor: "pointer",
                    fontSize: 12,
                  }}
                >
                  ✕
                </button>
              )}
            </div>
          )}

          {/* Error alert */}
          {rowSaveError && (
            <div style={{
              background: "#fef2f2",
              border: "1px solid #fecaca",
              color: "#991b1b",
              padding: "10px 14px",
              borderRadius: 0,
              fontSize: 12,
              fontFamily: "var(--font-plex-mono), monospace",
              marginBottom: 14,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}>
              <span>✕</span>
              <span>{rowSaveError}</span>
            </div>
          )}

          {/* Form fields */}
          <div style={{
            background: "var(--paper)",
            border: "1px solid var(--rule)",
            borderRadius: 0,
            padding: "20px 20px 8px 20px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
          }}>
            {displayFields.map((field) => (
              <FieldRenderer
                key={field.key}
                field={field}
                value={newRowValues[field.key] ?? ""}
                onChange={(key, val) => {
                  setNewRowValues((prev) => ({ ...prev, [key]: val }));
                }}
              />
            ))}
            {displayFields.length === 0 && (
              <p style={{ fontFamily: "var(--font-plex-mono), monospace", fontSize: 12, color: "var(--stone)", textAlign: "center", padding: "20px 0" }}>
                No fields match &quot;{fieldSearch}&quot;
              </p>
            )}
          </div>

          {/* Floating bottom action bar */}
          <div style={{
            position: "sticky",
            bottom: 16,
            marginTop: 20,
            background: "var(--paper)",
            border: "1px solid var(--rule)",
            borderRadius: 0,
            padding: "12px 16px",
            boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
            zIndex: 10,
          }}>
            <button
              type="button"
              onClick={() => setIsAddingNewRow(false)}
              style={{
                fontFamily: "var(--font-plex-mono), monospace",
                fontSize: 11,
                fontWeight: 500,
                color: "var(--stone)",
                background: "transparent",
                border: "1px solid var(--rule)",
                borderRadius: 0,
                padding: "8px 14px",
                cursor: "pointer",
              }}
            >
              ← Cancel
            </button>

            <button
              type="button"
              onClick={handleSaveNewRow}
              disabled={isSavingNewRow}
              style={{
                fontFamily: "var(--font-plex-mono), monospace",
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                padding: "9px 18px",
                borderRadius: 0,
                background: "var(--ink)",
                color: "var(--on-ink)",
                border: 0,
                cursor: isSavingNewRow ? "not-allowed" : "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {isSavingNewRow ? "Appending..." : "+ Append to Sheet"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════ Row Form View ═══════════════════════
  if (selectedRow && loaded) {
    const currentIdx = matches.findIndex((r) => r === selectedRow);
    const hasPrev = currentIdx > 0;
    const hasNext = currentIdx >= 0 && currentIdx < matches.length - 1;

    const goToPrev = () => {
      if (hasPrev) handleOpenRowForm(matches[currentIdx - 1]);
    };
    const goToNext = () => {
      if (hasNext) handleOpenRowForm(matches[currentIdx + 1]);
    };

    const displayFields = fieldSearch.trim()
      ? enrichedFields.filter(
          (f) =>
            f.label.toLowerCase().includes(fieldSearch.toLowerCase().trim()) ||
            f.key.toLowerCase().includes(fieldSearch.toLowerCase().trim())
        )
      : enrichedFields;
    const rowNum = selectedRow._row_index || (currentIdx >= 0 ? currentIdx + 2 : "—");

    return (
      <div className="flex flex-col min-h-screen" style={{ background: "var(--cream)" }}>
        <AppHeader title="Row Form" showBack onBack={() => window.history.back()} />
        {(savingRow || isDeletingRow) && (
          <LoadingOverlay message={isDeletingRow ? "Deleting row from Google Sheet..." : "Updating Google Sheet..."} />
        )}

        <div className="flex-1 w-full max-w-[620px] mx-auto px-4 sm:px-6 pt-6 pb-28">
          {/* Top navigation & info card */}
          <div style={{
            background: "var(--paper)",
            border: "1px solid var(--rule)",
            borderRadius: 0,
            padding: "14px 16px",
            marginBottom: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
          }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "2px 8px",
                  borderRadius: 0,
                  background: "var(--ink)",
                  color: "var(--on-ink)",
                  fontFamily: "var(--font-plex-mono), monospace",
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                }}>
                  Row #{rowNum}
                </span>
                <span style={{
                  fontFamily: "var(--font-plex-mono), monospace",
                  fontSize: 11,
                  color: "var(--stone)",
                }}>
                  {currentIdx >= 0 ? `${currentIdx + 1} of ${matches.length} entries` : ""}
                </span>
                {!hasEditPermission && (
                  <span style={{
                    padding: "2px 6px",
                    borderRadius: 0,
                    background: "#fef3c7",
                    color: "#92400e",
                    fontFamily: "var(--font-plex-mono), monospace",
                    fontSize: 9,
                    fontWeight: 600,
                    textTransform: "uppercase",
                  }}>
                    Read-Only
                  </span>
                )}
              </div>
              <h2 style={{
                fontFamily: "var(--font-newsreader), Georgia, serif",
                fontWeight: 400,
                fontSize: 18,
                color: "var(--ink)",
                margin: "4px 0 0 0",
              }}>
                {loaded.worksheet_name}
              </h2>
            </div>

            {/* Prev / Next navigation buttons */}
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button
                type="button"
                onClick={goToPrev}
                disabled={!hasPrev || savingRow}
                aria-label="Previous row"
                title="Previous row (← arrow)"
                style={{
                  height: 32,
                  padding: "0 10px",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  borderRadius: 0,
                  border: "1px solid var(--rule)",
                  background: hasPrev ? "var(--cream)" : "transparent",
                  cursor: hasPrev && !savingRow ? "pointer" : "not-allowed",
                  opacity: hasPrev && !savingRow ? 1 : 0.35,
                  transition: "opacity 0.15s",
                  fontFamily: "var(--font-plex-mono), monospace",
                  fontSize: 11,
                  color: "var(--ink)",
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
                Prev
              </button>
              <button
                type="button"
                onClick={goToNext}
                disabled={!hasNext || savingRow}
                aria-label="Next row"
                title="Next row (→ arrow)"
                style={{
                  height: 32,
                  padding: "0 10px",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  borderRadius: 0,
                  border: "1px solid var(--rule)",
                  background: hasNext ? "var(--cream)" : "transparent",
                  cursor: hasNext && !savingRow ? "pointer" : "not-allowed",
                  opacity: hasNext && !savingRow ? 1 : 0.35,
                  transition: "opacity 0.15s",
                  fontFamily: "var(--font-plex-mono), monospace",
                  fontSize: 11,
                  color: "var(--ink)",
                }}
              >
                Next
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </div>
          </div>

          {/* Mode switch, search & quick actions */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button
                type="button"
                onClick={() => setFormViewMode("form")}
                style={{
                  fontFamily: "var(--font-plex-mono), monospace",
                  fontSize: 11,
                  fontWeight: 500,
                  padding: "6px 12px",
                  borderRadius: 0,
                  border: formViewMode === "form" ? "1px solid var(--ink)" : "1px solid var(--rule)",
                  background: formViewMode === "form" ? "var(--ink)" : "var(--paper)",
                  color: formViewMode === "form" ? "var(--on-ink)" : "var(--stone)",
                  cursor: "pointer",
                }}
              >
                ◫ Form (Edit)
              </button>
              <button
                type="button"
                onClick={() => setFormViewMode("summary")}
                style={{
                  fontFamily: "var(--font-plex-mono), monospace",
                  fontSize: 11,
                  fontWeight: 500,
                  padding: "6px 12px",
                  borderRadius: 0,
                  border: formViewMode === "summary" ? "1px solid var(--ink)" : "1px solid var(--rule)",
                  background: formViewMode === "summary" ? "var(--ink)" : "var(--paper)",
                  color: formViewMode === "summary" ? "var(--on-ink)" : "var(--stone)",
                  cursor: "pointer",
                }}
              >
                📄 Summary View
              </button>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {isRowDirty && (
                <span style={{
                  fontFamily: "var(--font-plex-mono), monospace",
                  fontSize: 10,
                  color: "var(--clay)",
                  fontWeight: 600,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                }}>
                  ● Unsaved changes
                </span>
              )}
              {hasEditPermission && (
                <button
                  type="button"
                  onClick={handleDuplicateRow}
                  style={{
                    fontFamily: "var(--font-plex-mono), monospace",
                    fontSize: 10,
                    fontWeight: 500,
                    padding: "5px 10px",
                    borderRadius: 0,
                    background: "var(--paper)",
                    border: "1px solid var(--rule)",
                    color: "var(--ink)",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                  title="Clone this row into a new entry (⌘+D)"
                >
                  <span>⧉</span> Duplicate
                </button>
              )}
            </div>
          </div>

          {/* Field search input */}
          {enrichedFields.length > 4 && (
            <div style={{ marginBottom: 12, position: "relative" }}>
              <input
                type="text"
                placeholder="🔍 Filter fields by name..."
                value={fieldSearch}
                onChange={(e) => setFieldSearch(e.target.value)}
                style={{
                  width: "100%",
                  fontFamily: "var(--font-plex-mono), monospace",
                  fontSize: 11,
                  padding: "8px 12px",
                  background: "var(--paper)",
                  border: "1px solid var(--rule)",
                  borderRadius: 0,
                  color: "var(--ink)",
                  outline: "none",
                }}
              />
              {fieldSearch && (
                <button
                  type="button"
                  onClick={() => setFieldSearch("")}
                  style={{
                    position: "absolute",
                    right: 8,
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: 0,
                    color: "var(--stone)",
                    cursor: "pointer",
                    fontSize: 12,
                  }}
                >
                  ✕
                </button>
              )}
            </div>
          )}

          {/* Success / Error alerts */}
          {rowSaveSuccess && (
            <div style={{
              background: "#ecfdf5",
              border: "1px solid #a7f3d0",
              color: "#065f46",
              padding: "10px 14px",
              borderRadius: 0,
              fontSize: 12,
              fontFamily: "var(--font-plex-mono), monospace",
              marginBottom: 14,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}>
              <span>✓</span>
              <span>{rowSaveSuccess}</span>
            </div>
          )}
          {rowSaveError && (
            <div style={{
              background: "#fef2f2",
              border: "1px solid #fecaca",
              color: "#991b1b",
              padding: "10px 14px",
              borderRadius: 0,
              fontSize: 12,
              fontFamily: "var(--font-plex-mono), monospace",
              marginBottom: 14,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}>
              <span>✕</span>
              <span>{rowSaveError}</span>
            </div>
          )}

          {/* Form container */}
          {formViewMode === "form" ? (
            <div style={{
              background: "var(--paper)",
              border: "1px solid var(--rule)",
              borderRadius: 0,
              padding: "20px 20px 8px 20px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
            }}>
              {displayFields.map((field) => (
                <FieldRenderer
                  key={field.key}
                  field={field}
                  value={rowEditValues[field.key] ?? ""}
                  onChange={(key, val) => {
                    setRowEditValues((prev) => ({ ...prev, [key]: val }));
                    setRowSaveSuccess(null);
                    setRowSaveError(null);
                  }}
                />
              ))}
              {displayFields.length === 0 && (
                <p style={{ fontFamily: "var(--font-plex-mono), monospace", fontSize: 12, color: "var(--stone)", textAlign: "center", padding: "20px 0" }}>
                  No fields match &quot;{fieldSearch}&quot;
                </p>
              )}
            </div>
          ) : (
            <div style={{
              border: "1px solid var(--rule)",
              background: "var(--paper)",
              borderRadius: 0,
              overflow: "hidden",
            }} className="desktop-detail-fields">
              {displayFields.map((field, idx) => {
                const val = (rowEditValues[field.key] ?? selectedRow[field.key] ?? "").trim();
                return (
                  <div
                    key={field.key}
                    style={{
                      padding: "12px 16px",
                      borderBottom: idx < displayFields.length - 1 ? "1px solid var(--rule)" : "none",
                    }}
                  >
                    <p style={{
                      fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                      fontWeight: 500,
                      fontSize: 10,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      color: "var(--stone)",
                      margin: "0 0 3px 0",
                    }}>
                      {field.label}
                    </p>
                    <p style={{
                      fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                      fontSize: 13,
                      fontWeight: val ? 400 : 300,
                      fontStyle: val ? "normal" : "italic",
                      color: val ? "var(--ink)" : "var(--stone)",
                      margin: 0,
                      wordBreak: "break-word",
                    }}>
                      {val || "—"}
                    </p>
                  </div>
                );
              })}
            </div>
          )}

          {/* Bottom Floating Action Bar */}
          <div style={{
            position: "sticky",
            bottom: 16,
            marginTop: 20,
            background: "var(--paper)",
            border: "1px solid var(--rule)",
            borderRadius: 0,
            padding: "12px 16px",
            boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
            zIndex: 10,
          }}>
            <button
              type="button"
              onClick={() => setSelectedRow(null)}
              style={{
                fontFamily: "var(--font-plex-mono), monospace",
                fontSize: 11,
                fontWeight: 500,
                color: "var(--stone)",
                background: "transparent",
                border: "1px solid var(--rule)",
                borderRadius: 0,
                padding: "8px 14px",
                cursor: "pointer",
              }}
            >
              ← Back to Table
            </button>

            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {hasEditPermission && (
                <button
                  type="button"
                  onClick={handleDeleteRow}
                  disabled={isDeletingRow || savingRow}
                  style={{
                    fontFamily: "var(--font-plex-mono), monospace",
                    fontSize: 11,
                    fontWeight: 500,
                    color: "#dc2626",
                    background: "transparent",
                    border: "1px solid rgba(220, 38, 38, 0.3)",
                    borderRadius: 0,
                    padding: "8px 12px",
                    cursor: isDeletingRow ? "not-allowed" : "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                  title="Delete this row from Google Sheet"
                >
                  <span>🗑</span>
                  <span>{isDeletingRow ? "Deleting..." : "Delete"}</span>
                </button>
              )}

              {isRowDirty && (
                <button
                  type="button"
                  onClick={() => {
                    const orig: Record<string, string> = {};
                    loaded.fields.forEach((f) => {
                      orig[f.key] = selectedRow[f.key] ?? "";
                    });
                    setRowEditValues(orig);
                    setRowSaveSuccess(null);
                    setRowSaveError(null);
                  }}
                  disabled={savingRow}
                  style={{
                    fontFamily: "var(--font-plex-mono), monospace",
                    fontSize: 11,
                    fontWeight: 500,
                    color: "var(--stone)",
                    background: "transparent",
                    border: 0,
                    padding: "8px 10px",
                    cursor: "pointer",
                  }}
                >
                  Reset
                </button>
              )}

              {hasEditPermission && (
                <button
                  type="button"
                  onClick={handleSaveRow}
                  disabled={savingRow || (!isRowDirty && !rowSaveError)}
                  style={{
                    fontFamily: "var(--font-plex-mono), monospace",
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    padding: "9px 18px",
                    borderRadius: 0,
                    background: isRowDirty ? "var(--clay)" : "var(--ink)",
                    color: isRowDirty ? "var(--on-clay)" : "var(--on-ink)",
                    border: 0,
                    cursor: savingRow || (!isRowDirty && !rowSaveError) ? "not-allowed" : "pointer",
                    opacity: !isRowDirty && !rowSaveError ? 0.45 : 1,
                    transition: "all 0.15s ease",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  {savingRow ? "Saving..." : isRowDirty ? "Save to Sheet" : "Saved ✓"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════ Spreadsheet view ═══════════════════════
  if (loaded) {
    // Highlight matching text in cells
    const highlightCell = (text: string) => {
      if (!searchQuery.trim()) return text;
      const query = searchQuery.trim();
      const idx = text.toLowerCase().indexOf(query.toLowerCase());
      if (idx === -1) return text;
      return (
        <>
          {text.slice(0, idx)}
          <mark style={{ background: "rgba(200, 98, 58, 0.25)", color: "inherit", borderRadius: 2, padding: "0 1px" }}>
            {text.slice(idx, idx + query.length)}
          </mark>
          {text.slice(idx + query.length)}
        </>
      );
    };

    const sortedFields = [...loaded.fields].sort((a, b) => a.order - b.order);

    return (
      <div className="flex flex-col min-h-screen" style={{ background: "var(--cream)" }}>
        <AppHeader title="Quick View" showBack onBack={() => window.history.back()} />
        {loading && <LoadingOverlay message="Loading entries..." />}

        {/* Multi-Header auto-detected alert banner */}
        {showMultiHeaderAlert && detectedSectionsCount && detectedSectionsCount > 1 && (
          <div style={{
            background: "linear-gradient(90deg, rgba(200, 98, 58, 0.12), rgba(200, 98, 58, 0.05))",
            borderBottom: "1px solid rgba(200, 98, 58, 0.25)",
            padding: "10px 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 16 }}>📑</span>
              <span style={{
                fontFamily: "var(--font-plex-mono), monospace",
                fontSize: 11,
                color: "var(--ink)",
                fontWeight: 500,
              }}>
                <strong>Multi-Header Sheet Detected:</strong> Found {detectedSectionsCount} sections with repeated headers.
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button
                type="button"
                onClick={() => {
                  const url = sheetUrl || sheetParam || formInput;
                  router.push(`/multi-header-filter?sheet=${encodeURIComponent(url)}`);
                }}
                style={{
                  fontFamily: "var(--font-plex-mono), monospace",
                  fontSize: 11,
                  fontWeight: 600,
                  padding: "6px 12px",
                  borderRadius: 6,
                  background: "var(--clay)",
                  color: "var(--on-clay)",
                  border: 0,
                  cursor: "pointer",
                }}
              >
                Switch to Multi-Header View ↗
              </button>
              <button
                type="button"
                onClick={() => setShowMultiHeaderAlert(false)}
                style={{
                  background: "transparent",
                  border: 0,
                  color: "var(--stone)",
                  cursor: "pointer",
                  fontSize: 14,
                  padding: "4px 8px",
                }}
                title="Dismiss"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* Top bar: sheet info + search */}
        <div style={{ borderBottom: "1px solid var(--rule)", padding: "12px 16px" }}>
          <div style={{ maxWidth: 1400, margin: "0 auto", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            {/* Sheet info */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: "0 0 auto" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <h2 style={{
                    fontFamily: "var(--font-newsreader), Georgia, serif",
                    fontWeight: 400,
                    fontSize: 16,
                    color: "var(--ink)",
                    margin: 0,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    maxWidth: 200,
                  }}>
                    {loaded.worksheet_name}
                  </h2>
                  <button
                    type="button"
                    onClick={() => setShowSubsheetModal(true)}
                    title="Search & switch subsheets"
                    style={{
                      fontFamily: "var(--font-plex-mono), monospace",
                      fontSize: 10,
                      fontWeight: 600,
                      letterSpacing: "0.04em",
                      padding: "2px 8px",
                      background: "rgba(0,0,0,0.05)",
                      border: "1px solid var(--rule)",
                      borderRadius: 4,
                      cursor: "pointer",
                      color: "var(--stone)",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      transition: "all 150ms ease-out",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = "var(--ink)";
                      e.currentTarget.style.borderColor = "var(--stone)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = "var(--stone)";
                      e.currentTarget.style.borderColor = "var(--rule)";
                    }}
                  >
                    <span>Subsheets ▾</span>
                  </button>
                </div>
                <p style={{
                  fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                  fontWeight: 300,
                  fontSize: 10,
                  letterSpacing: "0.04em",
                  color: "var(--stone)",
                  margin: "2px 0 0 0",
                }}>
                  {loaded.rows.length.toLocaleString()} rows · {sortedFields.length} columns
                </p>
              </div>
            </div>

            {/* Search */}
            <div style={{ position: "relative", flex: 1, minWidth: 180, maxWidth: 400 }}>
              <svg style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", width: 14, height: 14, color: "var(--stone)", pointerEvents: "none" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setSelectedRow(null); }}
                placeholder="Search all columns..."
                autoFocus
                style={{
                  width: "100%",
                  fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                  fontSize: 12,
                  color: "var(--ink)",
                  background: "var(--paper)",
                  border: "1px solid var(--rule)",
                  borderRadius: 4,
                  padding: "7px 30px 7px 30px",
                  outline: "none",
                }}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: 0, cursor: "pointer", padding: 2 }}
                  aria-label="Clear search"
                >
                  <svg style={{ width: 12, height: 12, color: "var(--stone)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            {/* Month dropdown */}
            {dateFieldKey && availableMonths.length > 0 && (
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                style={{
                  fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                  fontSize: 11,
                  fontWeight: 500,
                  color: selectedMonth ? "var(--ink)" : "var(--charcoal)",
                  background: selectedMonth ? "rgba(200, 98, 58, 0.08)" : "var(--paper)",
                  border: selectedMonth ? "1px solid rgba(200, 98, 58, 0.4)" : "1px solid var(--rule)",
                  borderRadius: 4,
                  padding: "6px 8px",
                  cursor: "pointer",
                  minWidth: 0,
                }}
              >
                <option value="">All months</option>
                {availableMonths.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            )}

            {/* Date range filter */}
            {dateFieldKey && (
              <div className="date-range-filter" style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  style={{
                    fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                    fontSize: 11,
                    color: dateFrom ? "var(--ink)" : "var(--stone)",
                    background: dateFrom ? "rgba(200, 98, 58, 0.08)" : "var(--paper)",
                    border: dateFrom ? "1px solid rgba(200, 98, 58, 0.4)" : "1px solid var(--rule)",
                    borderRadius: 4,
                    padding: "5px 6px",
                    minWidth: 0,
                    maxWidth: 130,
                  }}
                  title="From date"
                />
                <span style={{
                  fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                  fontSize: 10,
                  color: "var(--stone)",
                }}>→</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  style={{
                    fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                    fontSize: 11,
                    color: dateTo ? "var(--ink)" : "var(--stone)",
                    background: dateTo ? "rgba(200, 98, 58, 0.08)" : "var(--paper)",
                    border: dateTo ? "1px solid rgba(200, 98, 58, 0.4)" : "1px solid var(--rule)",
                    borderRadius: 4,
                    padding: "5px 6px",
                    minWidth: 0,
                    maxWidth: 130,
                  }}
                  title="To date"
                />
                {(dateFrom || dateTo) && (
                  <button
                    type="button"
                    onClick={() => { setDateFrom(""); setDateTo(""); }}
                    style={{
                      background: "none",
                      border: 0,
                      cursor: "pointer",
                      padding: 2,
                      display: "flex",
                      alignItems: "center",
                    }}
                    aria-label="Clear date range"
                    title="Clear date range"
                  >
                    <svg style={{ width: 12, height: 12, color: "var(--stone)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            )}

            {/* Match count */}
            {(searchQuery || selectedMonth || dateFrom || dateTo || Object.values(columnFilters).some((v) => v)) && (
              <span style={{
                fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                fontSize: 10,
                fontWeight: 500,
                color: "var(--stone)",
                whiteSpace: "nowrap",
              }}>
                {matches.length.toLocaleString()} {matches.length === 1 ? "match" : "matches"}
              </span>
            )}

            {/* Add New Row button */}
            {hasEditPermission && (
              <button
                type="button"
                onClick={() => {
                  const initial: Record<string, string> = {};
                  loaded.fields.forEach((f) => { initial[f.key] = ""; });
                  setNewRowValues(initial);
                  setIsAddingNewRow(true);
                  setSelectedRow(null);
                  setFieldSearch("");
                }}
                style={{
                  fontFamily: "var(--font-plex-mono), monospace",
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: "var(--on-ink)",
                  background: "var(--ink)",
                  border: 0,
                  borderRadius: 0,
                  padding: "6px 12px",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
                title="Add a new row to this Google Sheet via form"
              >
                <span style={{ fontSize: 13, lineHeight: 1 }}>+</span>
                <span>Add Row</span>
              </button>
            )}

            {/* Click row to open Form indicator */}
            <div
              style={{
                fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                fontSize: 10,
                fontWeight: 500,
                letterSpacing: "0.04em",
                color: "var(--clay)",
                background: "rgba(200, 98, 58, 0.08)",
                border: "1px solid rgba(200, 98, 58, 0.25)",
                borderRadius: 0,
                padding: "6px 10px",
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                whiteSpace: "nowrap",
              }}
              title="Click on any row to open and edit it as a form"
            >
              <span style={{ fontSize: 12 }}>◫</span>
              <span>Click row to open as Form</span>
            </div>

            {/* Filter button */}
            <button
              type="button"
              onClick={() => setShowFilterPanel((v) => !v)}
              style={{
                fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                fontSize: 10,
                fontWeight: 500,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: Object.values(columnFilters).some((v) => v) ? "var(--ink)" : "var(--charcoal)",
                background: Object.values(columnFilters).some((v) => v) ? "rgba(200, 98, 58, 0.1)" : "var(--paper)",
                border: Object.values(columnFilters).some((v) => v) ? "1px solid rgba(200, 98, 58, 0.4)" : "1px solid var(--rule)",
                borderRadius: 4,
                padding: "6px 10px",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              ⚙ Filter{Object.values(columnFilters).filter((v) => v).length > 0 ? ` (${Object.values(columnFilters).filter((v) => v).length})` : ""}
            </button>

            {/* Change sheet button */}
            <button
              type="button"
              onClick={() => {
                if (!loaded) return;
                const sf = [...loaded.fields].sort((a, b) => a.order - b.order);
                const header = sf.map((f) => f.label).join("\t");
                const dataRows = matches.map((row) =>
                  sf.map((f) => (row[f.key] ?? "").replace(/\t/g, " ").replace(/\n/g, " ")).join("\t")
                );
                const tsv = [header, ...dataRows].join("\n");
                navigator.clipboard.writeText(tsv).then(() => {
                  alert(`Copied ${matches.length} rows to clipboard!\nPaste in Bulk Edit.`);
                }).catch(() => {
                  alert("Copy failed — try again");
                });
              }}
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
                padding: "6px 10px",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              📋 Copy {Object.values(columnFilters).some((v) => v) || searchQuery || selectedMonth || dateFrom || dateTo ? `Filtered (${matches.length})` : "All"}
            </button>

            <button
              type="button"
              onClick={handleReset}
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
                whiteSpace: "nowrap",
              }}
            >
              Change sheet
            </button>
          </div>
        </div>

        {/* Filter Panel */}
        {showFilterPanel && (
          <div style={{ borderBottom: "1px solid var(--rule)", padding: "12px 16px", background: "var(--paper)" }}>
            <div style={{ maxWidth: 1400, margin: "0 auto" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <p style={{
                  fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                  fontWeight: 500,
                  fontSize: 10,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: "var(--charcoal)",
                  margin: 0,
                }}>
                  Column Filters
                </p>
                {Object.values(columnFilters).some((v) => v) && (
                  <button
                    type="button"
                    onClick={() => setColumnFilters({})}
                    style={{
                      fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                      fontSize: 10,
                      color: "var(--stone)",
                      background: "none",
                      border: 0,
                      cursor: "pointer",
                      textDecoration: "underline",
                    }}
                  >
                    Clear all filters
                  </button>
                )}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {sortedFields.map((field) => {
                  const uniqueVals = columnUniqueValues[field.key];
                  if (!uniqueVals) return null;
                  const listId = `hist-filter-${field.key}`;
                  return (
                    <div key={field.key} style={{ minWidth: 140 }}>
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
                          fontSize: 11,
                          color: columnFilters[field.key] ? "var(--ink)" : "var(--stone)",
                          background: "var(--cream)",
                          border: columnFilters[field.key] ? "1px solid rgba(200, 98, 58, 0.4)" : "1px solid var(--rule)",
                          borderRadius: 4,
                          padding: "6px 8px",
                          outline: "none",
                        }}
                      >
                        <option value="">All</option>
                        {uniqueVals.map((val) => (
                          <option key={val} value={val}>
                            {val}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
              {(Object.values(columnFilters).some((v) => v) || selectedMonth || dateFrom || dateTo) && (
                <p style={{
                  fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                  fontSize: 10,
                  color: "var(--stone)",
                  margin: "8px 0 0 0",
                }}>
                  Showing {matches.length.toLocaleString()} of {loaded.rows.length.toLocaleString()} rows
                </p>
              )}
            </div>
          </div>
        )}

        {/* Spreadsheet table */}
        <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          {loaded.rows.length === 0 && !loading && (
            <div style={{ textAlign: "center", padding: "60px 20px" }}>
              <p style={{ fontFamily: "var(--font-plex-mono), ui-monospace, monospace", fontSize: 12, color: "var(--stone)" }}>
                No entries in this tab yet
              </p>
            </div>
          )}

          {loaded.rows.length > 0 && matches.length === 0 && (
            <div style={{ textAlign: "center", padding: "60px 20px" }}>
              <p style={{ fontFamily: "var(--font-plex-mono), ui-monospace, monospace", fontSize: 12, fontWeight: 500, color: "var(--charcoal)" }}>No matches</p>
              <p style={{ fontFamily: "var(--font-plex-mono), ui-monospace, monospace", fontSize: 11, color: "var(--stone)", marginTop: 4 }}>Try a different search term</p>
            </div>
          )}

          {loaded.rows.length > 0 && matches.length > 0 && (
            <div style={{ flex: 1, overflow: "auto", position: "relative" }}>
              <table style={{
                width: "100%",
                minWidth: sortedFields.length * 150,
                borderCollapse: "collapse",
                fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                fontSize: 12,
              }}>
                {/* Sticky header */}
                <thead>
                  <tr>
                    {/* Row number column */}
                    <th style={{
                      position: "sticky",
                      top: 0,
                      zIndex: 20,
                      background: "var(--ink)",
                      color: "var(--on-ink)",
                      fontWeight: 500,
                      fontSize: 10,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      padding: "10px 8px",
                      textAlign: "center",
                      borderRight: "1px solid rgba(255,255,255,0.1)",
                      width: 44,
                      minWidth: 44,
                    }}>
                      #
                    </th>
                    {/* Open Form column */}
                    <th style={{
                      position: "sticky",
                      top: 0,
                      zIndex: 20,
                      background: "var(--ink)",
                      color: "var(--on-ink)",
                      fontWeight: 500,
                      fontSize: 10,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      padding: "10px 8px",
                      textAlign: "center",
                      borderRight: "1px solid rgba(255,255,255,0.1)",
                      width: 76,
                      minWidth: 76,
                    }}>
                      Form
                    </th>
                    {sortedFields.map((field, colIdx) => (
                      <th
                        key={field.key}
                        style={{
                          position: "sticky",
                          top: 0,
                          zIndex: 20,
                          background: "var(--ink)",
                          color: "var(--on-ink)",
                          fontWeight: 500,
                          fontSize: 10,
                          letterSpacing: "0.06em",
                          textTransform: "uppercase",
                          padding: "10px 12px",
                          textAlign: "left",
                          whiteSpace: "nowrap",
                          borderRight: colIdx < sortedFields.length - 1 ? "1px solid rgba(255,255,255,0.1)" : "none",
                          minWidth: 120,
                          maxWidth: 280,
                        }}
                      >
                        {field.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleMatches.map((row, rowIdx) => (
                    <tr
                      key={rowIdx}
                      onClick={() => handleOpenRowForm(row)}
                      title={`Click row to open as form (Row #${row._row_index || rowIdx + 1})`}
                      style={{
                        cursor: "pointer",
                        borderBottom: "1px solid var(--rule)",
                        transition: "background-color 120ms ease-out",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--paper)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
                    >
                      {/* Row number */}
                      <td style={{
                        padding: "8px",
                        textAlign: "center",
                        fontSize: 10,
                        color: "var(--stone)",
                        borderRight: "1px solid var(--rule)",
                        fontWeight: 400,
                        width: 44,
                        minWidth: 44,
                      }}>
                        {rowIdx + 1}
                      </td>
                      {/* Form action button */}
                      <td style={{
                        padding: "6px 8px",
                        textAlign: "center",
                        borderRight: "1px solid var(--rule)",
                        width: 76,
                        minWidth: 76,
                      }}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenRowForm(row);
                          }}
                          style={{
                            fontFamily: "var(--font-plex-mono), monospace",
                            fontSize: 10,
                            fontWeight: 500,
                            padding: "3px 8px",
                            borderRadius: 0,
                            background: "var(--cream)",
                            border: "1px solid var(--rule)",
                            color: "var(--clay)",
                            cursor: "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 3,
                          }}
                          title="Open this row as a form"
                        >
                          <span>◫</span> Edit
                        </button>
                      </td>
                      {sortedFields.map((field, colIdx) => {
                        const val = row[field.key] ?? "";
                        return (
                          <td
                            key={field.key}
                            style={{
                              padding: "8px 12px",
                              fontSize: 12,
                              color: val ? "var(--ink)" : "var(--stone)",
                              fontWeight: val ? 400 : 300,
                              fontStyle: val ? "normal" : "italic",
                              borderRight: colIdx < sortedFields.length - 1 ? "1px solid var(--rule)" : "none",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              maxWidth: 280,
                            }}
                            title={val || undefined}
                          >
                            {val ? highlightCell(val) : "—"}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Load more */}
              {visibleCount < matches.length && (
                <div style={{ padding: "12px 16px", textAlign: "center", borderTop: "1px solid var(--rule)" }}>
                  <button
                    type="button"
                    onClick={() => setVisibleCount((c) => Math.min(c + ROWS_PER_PAGE, matches.length))}
                    style={{
                      fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                      fontSize: 11,
                      fontWeight: 500,
                      color: "var(--charcoal)",
                      background: "var(--paper)",
                      border: "1px solid var(--rule)",
                      borderRadius: 4,
                      padding: "8px 16px",
                      cursor: "pointer",
                    }}
                  >
                    Show {Math.min(ROWS_PER_PAGE, matches.length - visibleCount)} more rows
                    <span style={{ color: "var(--stone)", marginLeft: 6 }}>
                      · {(matches.length - visibleCount).toLocaleString()} remaining
                    </span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <SubsheetSearchModal
          isOpen={showSubsheetModal}
          onClose={() => setShowSubsheetModal(false)}
          sheetUrl={sheetUrl || sheetParam || ""}
          currentWorksheet={loaded.worksheet_name}
          preloadedWorksheets={allDiscoveredTabs.map((t) => t.worksheet_name || t.form_title).filter(Boolean)}
          onSelectWorksheet={handleSwitchWorksheet}
        />

        <ErrorToast message={error} onDismiss={() => setError(null)} />
      </div>
    );
  }

  // ═══════════════════════ Initial / Tab picker ═══════════════════════
  // If we have a sheet param, show loading state instead of input form
  if (sheetParam && !loaded && !availableTabs && !error) {
    return (
      <div className="flex flex-col min-h-screen">
        <AppHeader title="Quick View" showBack onBack={() => safeBack(router)} />
        <LoadingOverlay message="Loading sheet..." />
      </div>
    );
  }

  // Show tab picker if we have tabs from URL param
  if (sheetParam && availableTabs) {
    return (
      <div className="flex flex-col min-h-screen">
        <AppHeader title="Quick View" showBack onBack={() => safeBack(router)} />
        <div className="flex-1 w-full max-w-[560px] mx-auto px-6 pt-14 pb-10 space-y-8">
          <section>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
              <p
                style={{
                  fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                  fontWeight: 500,
                  fontSize: 10,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "var(--charcoal)",
                  margin: 0,
                }}
              >
                Pick a tab ({availableTabs.length})
              </p>
              {availableTabs.length > 3 && (
                <span style={{ fontSize: 10, fontFamily: "var(--font-plex-mono), monospace", color: "var(--stone)" }}>
                  {filteredTabs.length} of {availableTabs.length}
                </span>
              )}
            </div>

            {/* Subsheet Search Input */}
            {availableTabs.length > 2 && (
              <div style={{ position: "relative", marginBottom: 12 }}>
                <span
                  style={{
                    position: "absolute",
                    left: 10,
                    top: "50%",
                    transform: "translateY(-50%)",
                    fontSize: 12,
                    color: "var(--stone)",
                    pointerEvents: "none",
                  }}
                >
                  🔍
                </span>
                <input
                  type="text"
                  value={tabSearch}
                  onChange={(e) => setTabSearch(e.target.value)}
                  placeholder={`Search ${availableTabs.length} subsheets...`}
                  style={{
                    width: "100%",
                    padding: "8px 28px 8px 30px",
                    background: "var(--paper)",
                    border: "1px solid var(--rule)",
                    borderRadius: 4,
                    fontSize: 12,
                    fontFamily: "var(--font-plex-mono), monospace",
                    color: "var(--ink)",
                    outline: "none",
                  }}
                />
                {tabSearch && (
                  <button
                    type="button"
                    onClick={() => setTabSearch("")}
                    aria-label="Clear subsheet search"
                    style={{
                      position: "absolute",
                      right: 8,
                      top: "50%",
                      transform: "translateY(-50%)",
                      background: "none",
                      border: 0,
                      color: "var(--stone)",
                      cursor: "pointer",
                      fontSize: 12,
                      padding: 2,
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>
            )}

            <div style={{ border: "1px solid var(--rule)" }}>
              {filteredTabs.map((tab, idx) => (
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
                    borderBottom: idx < filteredTabs.length - 1 ? "1px solid var(--rule)" : "none",
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
                      {tab.has_form ? `${tab.fields.length} columns · has form` : "no form yet · read-only"}
                    </p>
                  </div>
                  <span style={{ color: "var(--stone)", fontSize: 14 }} aria-hidden>→</span>
                </button>
              ))}

              {filteredTabs.length === 0 && (
                <div style={{ padding: "24px 16px", textAlign: "center", fontFamily: "var(--font-plex-mono), monospace", fontSize: 12, color: "var(--stone)" }}>
                  <p style={{ margin: "0 0 8px" }}>No subsheets match &quot;{tabSearch}&quot;</p>
                  <button
                    type="button"
                    onClick={() => setTabSearch("")}
                    style={{ fontSize: 11, color: "var(--clay)", textDecoration: "underline", background: "none", border: 0, cursor: "pointer" }}
                  >
                    Clear filter
                  </button>
                </div>
              )}
            </div>
          </section>
        </div>
        <ErrorToast message={error} onDismiss={() => setError(null)} />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      <AppHeader title="Quick View" showBack onBack={() => safeBack(router)} />
      {loading && <LoadingOverlay message="Loading sheet..." />}

      <div className="flex-1 w-full max-w-[560px] mx-auto px-6 pt-14 pb-32 space-y-8">
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
            Quick View
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
            View your
            <br />
            sheet <em style={{ fontStyle: "italic", fontWeight: 400 }}>instantly.</em>
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
            {"// paste a sheet link. see all data like excel."}
          </p>
        </section>

        <hr style={{ border: 0, borderTop: "1px solid var(--rule)", margin: 0 }} />

        {/* URL Input */}
        <div className="space-y-4">
          <div>
            <label
              htmlFor="history-url"
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
                id="history-url"
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
                  onClick={() => {
                    setFormInput("");
                    setUrlValid(false);
                    setUrlError("");
                    setAccessStatus(null);
                  }}
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
                read access confirmed — you can search history.
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
            your data stays in your sheet · we only read what you search
          </p>

          {/* Tab picker */}
          {availableTabs && (
            <div style={{ paddingTop: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
                <p
                  style={{
                    fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                    fontWeight: 500,
                    fontSize: 10,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    color: "var(--charcoal)",
                    margin: 0,
                  }}
                >
                  Pick a tab ({availableTabs.length})
                </p>
                {availableTabs.length > 3 && (
                  <span style={{ fontSize: 10, fontFamily: "var(--font-plex-mono), monospace", color: "var(--stone)" }}>
                    {filteredTabs.length} of {availableTabs.length}
                  </span>
                )}
              </div>

              {/* Subsheet Search Input */}
              {availableTabs.length > 2 && (
                <div style={{ position: "relative", marginBottom: 12 }}>
                  <span
                    style={{
                      position: "absolute",
                      left: 10,
                      top: "50%",
                      transform: "translateY(-50%)",
                      fontSize: 12,
                      color: "var(--stone)",
                      pointerEvents: "none",
                    }}
                  >
                    🔍
                  </span>
                  <input
                    type="text"
                    value={tabSearch}
                    onChange={(e) => setTabSearch(e.target.value)}
                    placeholder={`Search ${availableTabs.length} subsheets...`}
                    style={{
                      width: "100%",
                      padding: "8px 28px 8px 30px",
                      background: "var(--paper)",
                      border: "1px solid var(--rule)",
                      borderRadius: 4,
                      fontSize: 12,
                      fontFamily: "var(--font-plex-mono), monospace",
                      color: "var(--ink)",
                      outline: "none",
                    }}
                  />
                  {tabSearch && (
                    <button
                      type="button"
                      onClick={() => setTabSearch("")}
                      aria-label="Clear subsheet search"
                      style={{
                        position: "absolute",
                        right: 8,
                        top: "50%",
                        transform: "translateY(-50%)",
                        background: "none",
                        border: 0,
                        color: "var(--stone)",
                        cursor: "pointer",
                        fontSize: 12,
                        padding: 2,
                      }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              )}

              <div style={{ border: "1px solid var(--rule)" }}>
                {filteredTabs.map((tab, idx) => (
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
                      borderBottom: idx < filteredTabs.length - 1 ? "1px solid var(--rule)" : "none",
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
                        {tab.has_form
                          ? `${tab.fields.length} columns · has form`
                          : "no form yet · read-only"}
                      </p>
                    </div>
                    <span style={{ color: "var(--stone)", fontSize: 14 }} aria-hidden>→</span>
                  </button>
                ))}

                {filteredTabs.length === 0 && (
                  <div style={{ padding: "24px 16px", textAlign: "center", fontFamily: "var(--font-plex-mono), monospace", fontSize: 12, color: "var(--stone)" }}>
                    <p style={{ margin: "0 0 8px" }}>No subsheets match &quot;{tabSearch}&quot;</p>
                    <button
                      type="button"
                      onClick={() => setTabSearch("")}
                      style={{ fontSize: 11, color: "var(--clay)", textDecoration: "underline", background: "none", border: 0, cursor: "pointer" }}
                    >
                      Clear filter
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Load button */}
          {!availableTabs && (
            <div style={{ paddingTop: 4 }}>
              <SubmitButton
                label="Load sheet"
                submitting={loading}
                onClick={handleLoadSheet}
                disabled={!formInput.trim() || accessStatus === "none"}
              />
            </div>
          )}
        </div>
      </div>

      <SubsheetSearchModal
        isOpen={showSubsheetModal}
        onClose={() => setShowSubsheetModal(false)}
        sheetUrl={sheetUrl || sheetParam || ""}
        currentWorksheet={null}
        preloadedWorksheets={allDiscoveredTabs.map((t) => t.worksheet_name || t.form_title).filter(Boolean)}
        onSelectWorksheet={handleSwitchWorksheet}
      />

      <ErrorToast message={error} onDismiss={() => setError(null)} />
    </div>
  );
}
