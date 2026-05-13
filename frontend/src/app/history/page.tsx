"use client";

import React, { useCallback, useMemo, useState } from "react";
import AppHeader from "@/components/AppHeader";
import ErrorToast from "@/components/ErrorToast";
import LoadingOverlay from "@/components/LoadingOverlay";
import ClearButton from "@/components/ClearButton";
import type { FieldSchema } from "@/types/field";
import {
  getFormSuggestions,
  getSheetHistory,
  lookupFormsBySheet,
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

export default function HistoryPage() {
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
    }
  }, []);

  async function handleLoadSheet() {
    if (!validateUrl(formInput)) return;
    const trimmed = formInput.trim();

    setLoading(true);
    setError(null);
    setAvailableTabs(null);
    setLoaded(null);
    setSearchQuery("");
    setSelectedRow(null);

    try {
      const result = await lookupFormsBySheet(trimmed);
      setSheetUrl(trimmed);

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

      // If only one tab, auto-select it
      if (tabs.length === 1) {
        await selectTab(tabs[0], trimmed);
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
      if (tab.has_form && tab.id) {
        // Load via form suggestions (uses the form's saved schema)
        const data = await getFormSuggestions(tab.id);
        setLoaded({
          worksheet_name: tab.worksheet_name || tab.form_title,
          fields: tab.fields,
          rows: data.rows ?? [],
        });
      } else {
        // Load directly from the sheet tab (no form exists)
        const url = sheet_url ?? sheetUrl;
        const data = await getSheetHistory(url, tab.worksheet_name);
        setLoaded({
          worksheet_name: data.worksheet_name,
          fields: data.fields,
          rows: data.rows,
        });
      }
    } catch (e: any) {
      setError(e.message ?? "Failed to load entries");
      // Re-show the tab picker so user can try another
      if (availableTabs === null) {
        // already cleared — bring user back to URL step
        handleReset();
      }
    } finally {
      setLoading(false);
    }
  }

  // Search across ALL columns
  const matches = useMemo(() => {
    if (!loaded || !loaded.rows.length) return [];
    const query = searchQuery.trim().toLowerCase();
    if (!query) return loaded.rows;
    return loaded.rows.filter((row) =>
      loaded.fields.some((f) => (row[f.key] ?? "").toLowerCase().includes(query)),
    );
  }, [loaded, searchQuery]);

  // Virtualized view: only render a page at a time so 10k+ rows don't choke the DOM
  const ROWS_PER_PAGE = 200;
  const [visibleCount, setVisibleCount] = useState(ROWS_PER_PAGE);

  // Reset visible count when query or dataset changes
  React.useEffect(() => {
    setVisibleCount(ROWS_PER_PAGE);
  }, [searchQuery, loaded]);

  const visibleMatches = useMemo(
    () => matches.slice(0, visibleCount),
    [matches, visibleCount],
  );

  const handleReset = useCallback(() => {
    setLoaded(null);
    setAvailableTabs(null);
    setSearchQuery("");
    setSelectedRow(null);
    setFormInput("");
    setSheetUrl("");
    setUrlValid(false);
    setUrlError("");
    setError(null);
  }, []);

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

  // ═══════════════════════ Detail view ═══════════════════════
  if (selectedRow && loaded) {
    return (
      <div className="flex flex-col min-h-screen bg-zinc-100">
        <AppHeader title="Entry details" showBack onBack={() => setSelectedRow(null)} />
        <div className="flex-1 w-full max-w-[560px] mx-auto px-5 pt-5 pb-10">
          <div className="mb-4">
            <h2 className="text-[16px] font-bold text-zinc-950">
              {loaded.worksheet_name}
            </h2>
            <p className="text-[12px] text-zinc-500">Full entry</p>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white divide-y divide-zinc-100 overflow-hidden">
            {[...loaded.fields]
              .sort((a, b) => a.order - b.order)
              .map((field) => {
                const val = selectedRow[field.key] ?? "";
                return (
                  <div key={field.key} className="px-4 py-3">
                    <p className="text-[11px] font-medium text-zinc-500 uppercase tracking-wide mb-0.5">
                      {field.label}
                    </p>
                    <p className={`text-[15px] ${val ? "text-zinc-950 font-medium" : "text-zinc-300 italic"}`}>
                      {val || "—"}
                    </p>
                  </div>
                );
              })}
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════ Search + results view ═══════════════════════
  if (loaded) {
    return (
      <div className="flex flex-col min-h-screen bg-zinc-100">
        <AppHeader title="Check history" showBack onBack={handleBackToTabs} />
        {loading && <LoadingOverlay message="Loading entries..." />}

        <div className="flex-1 w-full max-w-[560px] mx-auto px-5 pt-5 pb-10">
          <div className="flex items-center justify-between mb-4">
            <div className="min-w-0 flex-1">
              <h2 className="text-[16px] font-bold text-zinc-950 truncate">
                {loaded.worksheet_name}
              </h2>
              <p className="text-[12px] text-zinc-500">
                {loaded.rows.length.toLocaleString()} entries
              </p>
            </div>
            <button
              type="button"
              onClick={handleReset}
              className="text-[12px] font-medium text-zinc-600 hover:text-zinc-900 px-3 py-1.5 rounded-lg hover:bg-zinc-200 flex-shrink-0"
            >
              Change
            </button>
          </div>

          <div className="relative mb-4">
            <svg className="w-4 h-4 text-gray-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setSelectedRow(null); }}
              placeholder="Search any column..."
              autoFocus
              className="w-full rounded-lg border border-zinc-300 bg-white pl-11 pr-11 py-3 text-[14px] focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent min-h-[48px] placeholder:text-zinc-300"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full hover:bg-gray-100 flex items-center justify-center"
                aria-label="Clear search"
              >
                <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {loaded.rows.length === 0 && !loading && (
            <div className="text-center py-12">
              <p className="text-[13px] text-gray-400">No entries in this tab yet</p>
            </div>
          )}

          {loaded.rows.length > 0 && matches.length > 0 && (
            <div>
              {searchQuery && (
                <p className="text-[11px] font-medium text-gray-500 mb-2 px-1">
                  {matches.length.toLocaleString()}{" "}
                  {matches.length === 1 ? "match" : "matches"}
                </p>
              )}
              <div className="rounded-lg border border-zinc-200 bg-white overflow-hidden">
                {visibleMatches.map((row, idx) => {
                  const parts: string[] = [];
                  for (const f of loaded.fields) {
                    if (parts.length >= 4) break;
                    const val = row[f.key];
                    if (val?.trim()) parts.push(val.trim());
                  }
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setSelectedRow(row)}
                      className="w-full text-left px-4 py-3 text-[13px] border-b border-zinc-100 last:border-b-0 transition-colors hover:bg-zinc-50 active:bg-zinc-100 group"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-zinc-800 font-medium">
                          {parts.join(" · ")}
                        </span>
                        <svg className="w-3.5 h-3.5 text-zinc-300 group-hover:text-zinc-700 flex-shrink-0 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                        </svg>
                      </div>
                    </button>
                  );
                })}
              </div>
              {visibleCount < matches.length && (
                <button
                  type="button"
                  onClick={() =>
                    setVisibleCount((c) => Math.min(c + ROWS_PER_PAGE, matches.length))
                  }
                  className="mt-3 w-full py-2.5 rounded-lg border border-zinc-200 bg-white text-[12px] font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  Show {Math.min(ROWS_PER_PAGE, matches.length - visibleCount)} more
                  <span className="text-zinc-400"> · {(matches.length - visibleCount).toLocaleString()} remaining</span>
                </button>
              )}
            </div>
          )}

          {loaded.rows.length > 0 && matches.length === 0 && (
            <div className="text-center py-10">
              <p className="text-[13px] text-gray-500 font-medium">No matches</p>
              <p className="text-[11px] text-gray-400 mt-0.5">Try a different search term</p>
            </div>
          )}
        </div>

        <ErrorToast message={error} onDismiss={() => setError(null)} />
      </div>
    );
  }

  // ═══════════════════════ Initial / Tab picker ═══════════════════════
  return (
    <div className="flex flex-col min-h-screen bg-zinc-100">
      <AppHeader title="Check history" showBack />
      {loading && <LoadingOverlay message="Loading sheet..." />}

      <div className="flex-1 w-full max-w-[560px] mx-auto px-5 pt-8 pb-32">
        {/* Hero */}
        <div className="mb-8">
          <h1 className="text-[26px] font-bold text-zinc-950 leading-tight tracking-tight">
            Search your
            <br />
            submission history
          </h1>
          <p className="text-[15px] text-zinc-600 mt-2.5 leading-relaxed">
            Paste your sheet link. Find any past entry in seconds by searching across all columns.
          </p>
        </div>

        {/* URL Input */}
        <div className="mb-6">
          <label
            htmlFor="history-url"
            className="block text-[13px] font-semibold text-zinc-800 mb-2"
          >
            Google Sheet URL
          </label>
          <div className="relative">
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
              className={`w-full rounded-lg border px-4 py-3.5 text-[15px] min-h-[52px] pr-10 focus:outline-none focus:ring-2 transition-all ${
                urlError
                  ? "border-red-300 bg-red-50/50 focus:ring-red-500"
                  : urlValid
                  ? "border-emerald-300 bg-emerald-50/30 focus:ring-emerald-500"
                  : "border-zinc-300 bg-white focus:ring-zinc-900"
              }`}
            />
            {formInput && !urlValid && (
              <ClearButton
                onClick={() => {
                  setFormInput("");
                  setUrlValid(false);
                  setUrlError("");
                }}
                ariaLabel="Clear URL"
              />
            )}
            {urlValid && !urlError && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setFormInput("");
                    setUrlValid(false);
                    setUrlError("");
                  }}
                  aria-label="Clear URL"
                  className="w-5 h-5 rounded-full text-gray-400 hover:text-gray-700 flex items-center justify-center"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
                <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center">
                  <svg className="w-3 h-3 text-emerald-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
              </div>
            )}
          </div>
          {urlError && (
            <p className="text-red-500 text-[13px] mt-1.5 flex items-center gap-1" role="alert">
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              {urlError}
            </p>
          )}
          {!urlValid && !urlError && (
            <p className="text-gray-400 text-[13px] mt-1.5">
              Paste any Google Sheets link
            </p>
          )}
        </div>

        {/* Step indicator */}
        <div className="mb-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-4 text-[13px] text-gray-400 min-w-0 overflow-x-auto">
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-semibold ${step >= 1 ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-500"}`}>1</span>
                <span className={step >= 1 ? "text-gray-700 font-medium" : ""}>Paste link</span>
              </div>
              <svg className="w-3 h-3 text-gray-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-semibold ${step >= 2 ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-500"}`}>2</span>
                <span className={step >= 2 ? "text-gray-700 font-medium" : ""}>Pick tab</span>
              </div>
              <svg className="w-3 h-3 text-gray-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-semibold ${step >= 3 ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-500"}`}>3</span>
                <span className={step >= 3 ? "text-gray-700 font-medium" : ""}>Search</span>
              </div>
            </div>
            {(formInput || availableTabs) && (
              <button
                type="button"
                onClick={handleReset}
                className="flex-shrink-0 text-[11px] font-medium uppercase tracking-[0.12em] text-stone hover:text-clay transition-colors"
                style={{
                  fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                  color: "var(--stone)",
                  background: "transparent",
                  border: 0,
                  padding: 0,
                  cursor: "pointer",
                }}
                aria-label="Clear all fields and start over"
              >
                ✕ clear all
              </button>
            )}
          </div>
        </div>

        {/* Tab picker */}
        {availableTabs && (
          <div className="mb-6 animate-fade-in">
            <p className="text-[13px] font-semibold text-gray-700 mb-2.5">
              Pick a sheet tab
            </p>
            <div className="space-y-1.5">
              {availableTabs.map((tab, idx) => (
                <button
                  key={`${tab.worksheet_name}-${idx}`}
                  type="button"
                  onClick={() => selectTab(tab)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-lg border border-zinc-200 bg-white hover:border-zinc-400 hover:bg-zinc-50 transition-all text-left group"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${tab.has_form ? "bg-emerald-50" : "bg-gray-100"}`}>
                      <svg className={`w-4 h-4 ${tab.has_form ? "text-emerald-600" : "text-gray-400"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25M3.375 5.625h17.25M3.375 12h17.25M3.375 19.5c-.621 0-1.125-.504-1.125-1.125V5.625c0-.621.504-1.125 1.125-1.125h17.25c.621 0 1.125.504 1.125 1.125v12.75c0 .621-.504 1.125-1.125 1.125H3.375z" />
                      </svg>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-gray-900 truncate">
                        {tab.worksheet_name || tab.form_title}
                      </p>
                      <p className="text-[11px] text-gray-400 truncate">
                        {tab.has_form
                          ? `${tab.fields.length} columns · has form`
                          : "No form yet · read-only"}
                      </p>
                    </div>
                  </div>
                  <svg className="w-4 h-4 text-zinc-300 group-hover:text-zinc-700 flex-shrink-0 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </button>
              ))}
            </div>
          </div>
        )}

        {!availableTabs && (
          <div className="flex items-start gap-2 text-[12px] text-gray-400">
            <svg className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
            <span>Your data stays in your Google Sheet. We only read what you search.</span>
          </div>
        )}
      </div>

      {/* Sticky CTA */}
      {!availableTabs && (
        <div
          className="fixed bottom-0 left-0 right-0 max-w-[560px] mx-auto px-5 pt-3 pb-3 bg-white border-t border-zinc-200 shadow-sticky z-40"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 12px)" }}
        >
          <button
            onClick={handleLoadSheet}
            disabled={loading || !formInput.trim()}
            className="w-full bg-zinc-950 hover:bg-zinc-800 active:bg-black disabled:bg-zinc-200 disabled:text-zinc-500 text-white font-semibold text-[15px] rounded-lg h-[52px] flex items-center justify-center gap-2 transition-all duration-150"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Loading...</span>
              </>
            ) : (
              <span>Load sheet</span>
            )}
          </button>
        </div>
      )}

      <ErrorToast message={error} onDismiss={() => setError(null)} />
    </div>
  );
}
