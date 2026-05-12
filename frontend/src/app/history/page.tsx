"use client";

import React, { useCallback, useMemo, useState } from "react";
import AppHeader from "@/components/AppHeader";
import ErrorToast from "@/components/ErrorToast";
import LoadingOverlay from "@/components/LoadingOverlay";
import type { FieldSchema } from "@/types/field";
import { getPublicForm, getFormSuggestions, lookupFormsBySheet } from "@/lib/api";

interface FormInfo {
  id: string;
  form_title: string;
  worksheet_name: string | null;
  fields: FieldSchema[];
  autofill_columns: string[];
}

export default function HistoryPage() {
  const [formInput, setFormInput] = useState("");
  const [urlValid, setUrlValid] = useState(false);
  const [urlError, setUrlError] = useState("");
  const [loading, setLoading] = useState(false);
  const [availableForms, setAvailableForms] = useState<FormInfo[] | null>(null);
  const [formInfo, setFormInfo] = useState<FormInfo | null>(null);
  const [suggestions, setSuggestions] = useState<Record<string, string>[]>([]);
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
      value.includes("/f/") ||
      /^[a-zA-Z0-9-_]{6,}$/.test(value.trim());
    setUrlValid(isValid);
    setUrlError(isValid ? "" : "This doesn't look like a sheet link");
    return isValid;
  }

  const handleUrlChange = useCallback((value: string) => {
    setFormInput(value);
    setError(null);
    setUrlError("");
    if (value.trim()) {
      const isValid =
        value.includes("docs.google.com/spreadsheets") ||
        value.includes("/f/") ||
        /^[a-zA-Z0-9-_]{6,}$/.test(value.trim());
      setUrlValid(isValid);
    } else {
      setUrlValid(false);
    }
  }, []);

  function detectInputType(input: string): "sheet" | "form" | "id" {
    const trimmed = input.trim();
    if (trimmed.includes("docs.google.com/spreadsheets")) return "sheet";
    if (trimmed.includes("/f/")) return "form";
    return "id";
  }

  function extractFormId(input: string): string {
    const match = input.trim().match(/\/f\/([a-zA-Z0-9]+)/);
    return match ? match[1] : input.trim();
  }

  async function handleLoadForm() {
    if (!validateUrl(formInput)) return;

    setLoading(true);
    setError(null);
    setFormInfo(null);
    setAvailableForms(null);
    setSuggestions([]);
    setSearchQuery("");
    setSelectedRow(null);

    try {
      const trimmed = formInput.trim();
      if (detectInputType(trimmed) === "sheet") {
        const result = await lookupFormsBySheet(trimmed);
        if (!result.items.length) {
          setError("No forms found for this sheet");
          return;
        }
        const forms: FormInfo[] = result.items.map((f) => ({
          id: f.id,
          form_title: f.form_title,
          worksheet_name: f.worksheet_name,
          fields: f.fields,
          autofill_columns: f.autofill_columns ?? [],
        }));
        if (forms.length === 1) {
          await selectForm(forms[0]);
        } else {
          setAvailableForms(forms);
        }
      } else {
        const formId = extractFormId(trimmed);
        const formData = await getPublicForm(formId);
        await selectForm({
          id: formData.id,
          form_title: formData.form_title,
          worksheet_name: formData.worksheet_name ?? null,
          fields: formData.fields,
          autofill_columns: formData.autofill_columns ?? [],
        });
      }
    } catch (e: any) {
      setError(e.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  async function selectForm(info: FormInfo) {
    setFormInfo(info);
    setAvailableForms(null);
    setLoading(true);
    try {
      const data = await getFormSuggestions(info.id);
      setSuggestions(data.rows ?? []);
    } catch (e: any) {
      setError(e.message ?? "Failed to load entries");
    } finally {
      setLoading(false);
    }
  }

  // Search across ALL columns
  const matches = useMemo(() => {
    if (!formInfo || !suggestions.length) return [];
    const query = searchQuery.trim().toLowerCase();
    if (!query) return suggestions.slice(0, 100);

    const filtered = suggestions.filter((row) =>
      formInfo.fields.some((f) => (row[f.key] ?? "").toLowerCase().includes(query)),
    );
    return filtered.slice(0, 100);
  }, [formInfo, suggestions, searchQuery]);

  const handleReset = useCallback(() => {
    setFormInfo(null);
    setAvailableForms(null);
    setSuggestions([]);
    setSearchQuery("");
    setSelectedRow(null);
    setFormInput("");
    setUrlValid(false);
    setUrlError("");
    setError(null);
  }, []);

  // Step detection for the progress indicator
  const step: 1 | 2 | 3 = availableForms ? 2 : formInfo ? 3 : 1;

  // ══════════════════════════════════════════════════════════════
  // Detail view
  // ══════════════════════════════════════════════════════════════
  if (selectedRow && formInfo) {
    return (
      <div className="flex flex-col min-h-screen bg-white">
        <AppHeader title="Entry details" showBack onBack={() => setSelectedRow(null)} />
        <div className="flex-1 px-5 pt-5 pb-10">
          <div className="mb-4">
            <h2 className="text-[16px] font-bold text-gray-900">
              {formInfo.worksheet_name || formInfo.form_title}
            </h2>
            <p className="text-[12px] text-gray-500">Full entry</p>
          </div>
          <div className="rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
            {[...formInfo.fields]
              .sort((a, b) => a.order - b.order)
              .map((field) => {
                const val = selectedRow[field.key] ?? "";
                return (
                  <div key={field.key} className="px-4 py-3">
                    <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide mb-0.5">
                      {field.label}
                    </p>
                    <p className={`text-[15px] ${val ? "text-gray-900 font-medium" : "text-gray-300 italic"}`}>
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

  // ══════════════════════════════════════════════════════════════
  // Loaded: search + results (inner filter unchanged)
  // ══════════════════════════════════════════════════════════════
  if (formInfo) {
    return (
      <div className="flex flex-col min-h-screen bg-white">
        <AppHeader title="Check history" showBack onBack={handleReset} />
        {loading && <LoadingOverlay message="Loading entries..." />}

        <div className="flex-1 px-5 pt-5 pb-10">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="min-w-0 flex-1">
              <h2 className="text-[16px] font-bold text-gray-900 truncate">
                {formInfo.worksheet_name || formInfo.form_title}
              </h2>
              <p className="text-[12px] text-gray-500">
                {suggestions.length.toLocaleString()} entries
              </p>
            </div>
            <button
              type="button"
              onClick={handleReset}
              className="text-[12px] font-medium text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-100 flex-shrink-0"
            >
              Change
            </button>
          </div>

          {/* Search box */}
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
              className="w-full rounded-xl border border-gray-200 pl-11 pr-11 py-3 text-[14px] focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent min-h-[48px] placeholder:text-gray-300"
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

          {/* Results */}
          {suggestions.length === 0 && !loading && (
            <div className="text-center py-12">
              <p className="text-[13px] text-gray-400">No entries in this sheet yet</p>
            </div>
          )}

          {suggestions.length > 0 && matches.length > 0 && (
            <div>
              {searchQuery && (
                <p className="text-[11px] font-medium text-gray-500 mb-2 px-1">
                  {matches.length} {matches.length === 1 ? "match" : "matches"}{matches.length === 100 ? "+" : ""}
                </p>
              )}
              <div className="rounded-xl border border-gray-200 overflow-hidden">
                {matches.map((row, idx) => {
                  const parts: string[] = [];
                  for (const f of formInfo.fields) {
                    if (parts.length >= 4) break;
                    const val = row[f.key];
                    if (val?.trim()) parts.push(val.trim());
                  }
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setSelectedRow(row)}
                      className="w-full text-left px-4 py-3 text-[13px] border-b border-gray-100 last:border-b-0 transition-colors hover:bg-accent-50/40 active:bg-accent-50 group"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-gray-800 font-medium">
                          {parts.join(" · ")}
                        </span>
                        <svg className="w-3.5 h-3.5 text-gray-300 group-hover:text-accent-500 flex-shrink-0 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                        </svg>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {suggestions.length > 0 && matches.length === 0 && (
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

  // ══════════════════════════════════════════════════════════════
  // Initial URL input — styled like the main dashboard home
  // ══════════════════════════════════════════════════════════════
  return (
    <div className="flex flex-col min-h-screen bg-white">
      <AppHeader title="Check history" showBack />
      {loading && <LoadingOverlay message="Loading sheet..." />}

      <div className="flex-1 px-5 pt-8 pb-32">
        {/* Hero */}
        <div className="mb-8">
          <h1 className="text-[22px] font-bold text-gray-900 leading-tight tracking-tight">
            Search your
            <br />
            submission history
          </h1>
          <p className="text-[15px] text-gray-500 mt-2.5 leading-relaxed">
            Paste your sheet link. Find any past entry in seconds by searching across all columns.
          </p>
        </div>

        {/* URL Input Card */}
        <div className="mb-6">
          <label
            htmlFor="history-url"
            className="block text-[13px] font-medium text-gray-700 mb-2"
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
              onKeyDown={(e) => e.key === "Enter" && handleLoadForm()}
              placeholder="https://docs.google.com/spreadsheets/d/..."
              aria-invalid={!!urlError}
              className={`w-full rounded-xl border px-4 py-3.5 text-[15px] min-h-[52px] pr-10 focus:outline-none focus:ring-2 transition-all ${
                urlError
                  ? "border-red-300 bg-red-50/50 focus:ring-red-500"
                  : urlValid
                  ? "border-emerald-300 bg-emerald-50/30 focus:ring-emerald-500"
                  : "border-gray-200 bg-white focus:ring-accent-500"
              }`}
            />
            {urlValid && !urlError && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
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
              Paste the same link you used when creating the form
            </p>
          )}
        </div>

        {/* How it works */}
        <div className="mb-6">
          <div className="flex items-center gap-4 text-[13px] text-gray-400">
            <div className="flex items-center gap-1.5">
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-semibold ${step >= 1 ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-500"}`}>1</span>
              <span className={step >= 1 ? "text-gray-700 font-medium" : ""}>Paste link</span>
            </div>
            <svg className="w-3 h-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
            <div className="flex items-center gap-1.5">
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-semibold ${step >= 2 ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-500"}`}>2</span>
              <span className={step >= 2 ? "text-gray-700 font-medium" : ""}>Pick tab</span>
            </div>
            <svg className="w-3 h-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
            <div className="flex items-center gap-1.5">
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-semibold ${step >= 3 ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-500"}`}>3</span>
              <span className={step >= 3 ? "text-gray-700 font-medium" : ""}>Search</span>
            </div>
          </div>
        </div>

        {/* Tab picker (shown inline after URL is loaded and multiple forms exist) */}
        {availableForms && (
          <div className="mb-6 animate-fade-in">
            <p className="text-[13px] font-semibold text-gray-700 mb-2.5">
              Pick a sheet tab
            </p>
            <div className="space-y-1.5">
              {availableForms.map((form) => (
                <button
                  key={form.id}
                  type="button"
                  onClick={() => selectForm(form)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-gray-200 bg-white hover:border-accent-300 hover:bg-accent-50/30 transition-all text-left group"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
                      <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125" />
                      </svg>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-gray-900 truncate">
                        {form.worksheet_name || form.form_title}
                      </p>
                      <p className="text-[11px] text-gray-400 truncate">
                        {form.fields.length} columns
                      </p>
                    </div>
                  </div>
                  <svg className="w-4 h-4 text-gray-300 group-hover:text-accent-500 flex-shrink-0 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Trust note */}
        {!availableForms && (
          <div className="flex items-start gap-2 text-[12px] text-gray-400">
            <svg className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
            <span>Your data stays in your Google Sheet. We only read what you search.</span>
          </div>
        )}
      </div>

      {/* Sticky CTA — only when tab picker is NOT showing */}
      {!availableForms && (
        <div
          className="fixed bottom-0 left-0 right-0 max-w-[480px] mx-auto px-5 pt-3 pb-3 bg-white/95 backdrop-blur-md border-t border-gray-100 shadow-sticky z-40"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 12px)" }}
        >
          <button
            onClick={handleLoadForm}
            disabled={loading || !formInput.trim()}
            className="w-full bg-gray-900 hover:bg-gray-800 active:bg-gray-950 disabled:bg-gray-200 disabled:text-gray-400 text-white font-semibold text-[15px] rounded-xl h-[52px] flex items-center justify-center gap-2 transition-all duration-150"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Loading...</span>
              </>
            ) : (
              <span>Load entries</span>
            )}
          </button>
        </div>
      )}

      <ErrorToast message={error} onDismiss={() => setError(null)} />
    </div>
  );
}
