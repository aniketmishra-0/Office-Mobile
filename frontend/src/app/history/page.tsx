"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import ErrorToast from "@/components/ErrorToast";
import LoadingOverlay from "@/components/LoadingOverlay";
import ClearButton from "@/components/ClearButton";
import SubmitButton from "@/components/SubmitButton";
import type { FieldSchema } from "@/types/field";
import {
  getFormSuggestions,
  getSheetHistory,
  lookupFormsBySheet,
  checkSheetAccess,
  getPublicConfig,
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
  const [accessStatus, setAccessStatus] = useState<"checking" | "edit" | "read" | "none" | null>(null);
  const [serviceAccountEmail, setServiceAccountEmail] = useState<string | null>(null);

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
      } catch (e) {
        setAccessStatus("none");
      }
    }, 500); // 500ms debounce

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
    setLoading(true);
    setError(null);
    setAvailableTabs(null);
    setLoaded(null);
    setSearchQuery("");
    setSelectedRow(null);

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

      // If only one tab, auto-select it
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

  // ═══════════════════════ Detail view ═══════════════════════
  if (selectedRow && loaded) {
    return (
      <div className="flex flex-col min-h-screen bg-zinc-100">
        <AppHeader title="Entry details" showBack onBack={() => setSelectedRow(null)} />
        <div className="flex-1 w-full max-w-[560px] mx-auto px-5 pt-8 pb-10">
          <div className="mb-4">
            <h2 className="text-[16px] font-bold text-zinc-950">
              {loaded.worksheet_name}
            </h2>
            <p className="text-[12px] text-zinc-500">Full entry</p>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white divide-y divide-zinc-100 overflow-hidden desktop-detail-fields">
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
        <AppHeader title="History" showBack onBack={handleBackToTabs} />
        {loading && <LoadingOverlay message="Loading entries..." />}

        <div className="flex-1 w-full max-w-[560px] mx-auto px-5 pt-8 pb-10">
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
              <div className="rounded-lg border border-zinc-200 bg-white overflow-hidden desktop-grid-list">
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
  // If we have a sheet param, show loading state instead of input form
  if (sheetParam && !loaded && !availableTabs && !error) {
    return (
      <div className="flex flex-col min-h-screen">
        <AppHeader title="History" showBack onBack={() => router.back()} />
        <LoadingOverlay message="Loading sheet..." />
      </div>
    );
  }

  // Show tab picker if we have tabs from URL param
  if (sheetParam && availableTabs) {
    return (
      <div className="flex flex-col min-h-screen">
        <AppHeader title="History" showBack onBack={() => router.back()} />
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
                      {tab.has_form ? `${tab.fields.length} columns · has form` : "no form yet · read-only"}
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
      <AppHeader title="History" showBack onBack={() => router.push("/")} />
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
            Submission History
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
            Search your
            <br />
            past <em style={{ fontStyle: "italic", fontWeight: 400 }}>entries.</em>
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
            {"// paste a sheet link. find any entry in seconds."}
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
                        {tab.has_form
                          ? `${tab.fields.length} columns · has form`
                          : "no form yet · read-only"}
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
                label="Load sheet"
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
