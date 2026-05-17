"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import ErrorToast from "@/components/ErrorToast";
import LoadingOverlay from "@/components/LoadingOverlay";
import ClearButton from "@/components/ClearButton";
import SubmitButton from "@/components/SubmitButton";
import type { FieldSchema } from "@/types/field";
import { useStepHistory } from "@/lib/useStepHistory";
import {
  getSheetHistory,
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

interface LoadedTab {
  worksheet_name: string;
  fields: FieldSchema[];
  rows: Record<string, string>[];
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
  const [loaded, setLoaded] = useState<LoadedTab | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accessStatus, setAccessStatus] = useState<"checking" | "edit" | "read" | "none" | null>(null);
  const [serviceAccountEmail, setServiceAccountEmail] = useState<string | null>(null);

  // Column picker + results state
  const [selectedField, setSelectedField] = useState<FieldSchema | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortMode, setSortMode] = useState<"count" | "alpha">("count");

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
          break;
        case "tabs":
          setLoaded(null);
          setSelectedField(null);
          setSearchQuery("");
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
      const data = await getSheetHistory(url, tab.worksheet_name);
      setLoaded({
        worksheet_name: data.worksheet_name,
        fields: data.fields,
        rows: data.rows,
      });
      // Auto-select a reasonable column
      autoSelectColumn(data.fields, data.rows);
    } catch (e: any) {
      setError(e.message ?? "Failed to load entries");
    } finally {
      setLoading(false);
    }
  }

  function autoSelectColumn(fields: FieldSchema[], rows: Record<string, string>[]) {
    // Pick first column with > 1 unique value and < 500 unique values
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
    // Fallback: first field
    if (fields.length > 0) {
      setSelectedField(fields[0]);
    }
  }

  // Compute frequency counts
  const analysis = useMemo(() => {
    if (!loaded || !selectedField) return null;
    const counts = new Map<string, number>();
    for (const row of loaded.rows) {
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
    const totalRows = loaded.rows.length;
    const uniqueCount = counts.size;
    return { sorted, maxCount, totalRows, uniqueCount };
  }, [loaded, selectedField, sortMode]);

  // Filter results by search
  const filteredResults = useMemo(() => {
    if (!analysis) return [];
    if (!searchQuery.trim()) return analysis.sorted;
    const q = searchQuery.trim().toLowerCase();
    return analysis.sorted.filter(([name]) => name.toLowerCase().includes(q));
  }, [analysis, searchQuery]);

  const step: 1 | 2 | 3 = availableTabs ? 2 : loaded ? 3 : 1;

  // ═══════════════════════ STEP 3: Results ═══════════════════════
  if (loaded && selectedField && analysis) {
    const sortedFields = [...loaded.fields].sort((a, b) => a.order - b.order);

    return (
      <div className="flex flex-col min-h-screen" style={{ background: "var(--cream)" }}>
        <AppHeader title="Load Analysis" showBack onBack={() => window.history.back()} />
        {loading && <LoadingOverlay message="Loading..." />}

        <div className="flex-1 w-full max-w-[560px] mx-auto px-6 pt-8 pb-10">
          {/* Header */}
          <div style={{ marginBottom: 20 }}>
            <h2 style={{
              fontFamily: "var(--font-newsreader), Georgia, serif",
              fontWeight: 400,
              fontSize: 20,
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
              {selectedField.label} · {analysis.totalRows} rows · {analysis.uniqueCount} unique
            </p>
          </div>

          {/* Column picker dropdown */}
          <div style={{ marginBottom: 16 }}>
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
                  padding: "7px 28px 7px 10px",
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
                padding: "7px 10px",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {sortMode === "count" ? "By count" : "A → Z"}
            </button>
          </div>

          <hr style={{ border: 0, borderTop: "1px solid var(--rule)", margin: "0 0 12px 0" }} />

          {/* Results list */}
          <div>
            {filteredResults.length === 0 && (
              <p style={{
                fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                fontSize: 12,
                color: "var(--stone)",
                textAlign: "center",
                padding: "40px 0",
              }}>
                No matches
              </p>
            )}
            {filteredResults.map(([name, count], idx) => {
              const pct = ((count / analysis.totalRows) * 100).toFixed(1);
              const barWidth = (count / analysis.maxCount) * 100;
              return (
                <div key={name} style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 0",
                  borderBottom: "1px solid var(--rule)",
                }}>
                  {/* Rank */}
                  <span style={{
                    fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                    fontSize: 11,
                    fontWeight: 400,
                    color: "var(--stone)",
                    width: 24,
                    textAlign: "right",
                    flexShrink: 0,
                  }}>
                    {idx + 1}
                  </span>
                  {/* Name + bar */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{
                      fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                      fontSize: 13,
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
                      marginTop: 4,
                      height: 4,
                      background: "var(--rule)",
                      borderRadius: 2,
                      overflow: "hidden",
                    }}>
                      <div style={{
                        width: `${barWidth}%`,
                        height: "100%",
                        background: "var(--clay)",
                        borderRadius: 2,
                        transition: "width 300ms ease-out",
                      }} />
                    </div>
                  </div>

                  {/* Count */}
                  <span style={{
                    fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--ink)",
                    flexShrink: 0,
                    minWidth: 32,
                    textAlign: "right",
                  }}>
                    {count}
                  </span>
                  {/* Percentage */}
                  <span style={{
                    fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                    fontSize: 11,
                    fontWeight: 400,
                    color: "var(--stone)",
                    flexShrink: 0,
                    minWidth: 48,
                    textAlign: "right",
                  }}>
                    {pct}%
                  </span>
                </div>
              );
            })}
          </div>

          {/* Summary footer */}
          <div style={{
            marginTop: 16,
            padding: "12px 0",
            borderTop: "1px solid var(--rule)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 8,
          }}>
            <p style={{
              fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
              fontSize: 11,
              fontWeight: 400,
              color: "var(--stone)",
              margin: 0,
            }}>
              {analysis.totalRows} rows · {analysis.uniqueCount} unique values
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={() => { setLoaded(null); setSelectedField(null); setSearchQuery(""); }}
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
                }}
              >
                Change sheet
              </button>
            </div>
          </div>
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
