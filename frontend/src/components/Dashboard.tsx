"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import Logo from "@/components/Logo";
import LoadingOverlay from "@/components/LoadingOverlay";
import ErrorToast from "@/components/ErrorToast";
import KeywordRulesEditor from "@/components/KeywordRulesEditor";
import FormFieldEditor from "@/components/FormFieldEditor";
import MobileDropdown from "@/components/MobileDropdown";
import SubmitButton from "@/components/SubmitButton";
import {
  previewSheet,
  createForm,
  getPublicConfig,
  listWorksheets,
} from "@/lib/api";
import type {
  FieldSchema,
  CustomKeywordRule,
  PreviewResponse,
  CreateFormResponse,
} from "@/types/field";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/$/, "");

type Step = "input" | "preview" | "done";

type RecentSheet = {
  url: string;
  title: string;
  timestamp: number;
};

export default function Dashboard() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("input");
  const [mounted, setMounted] = useState(false);
  const [recentSheets, setRecentSheets] = useState<RecentSheet[]>([]);

  // Restore step from sessionStorage on mount to avoid hydration flicker
  useEffect(() => {
    const saved = sessionStorage.getItem("dashboard-step");
    if (saved === "done" || saved === "preview") {
      setStep(saved as Step);
    }
    
    try {
      const savedRecent = localStorage.getItem("recent-sheets");
      if (savedRecent) {
        setRecentSheets(JSON.parse(savedRecent));
      }
    } catch (e) {}

    setMounted(true);
  }, []);

  // Persist step to sessionStorage so back navigation restores it
  useEffect(() => {
    if (mounted) {
      sessionStorage.setItem("dashboard-step", step);
    }
  }, [step, mounted]);

  const [sheetUrl, setSheetUrl] = useState("");
  const [urlError, setUrlError] = useState("");
  const [urlValid, setUrlValid] = useState(false);
  const [rules, setRules] = useState<CustomKeywordRule[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewData, setPreviewData] = useState<PreviewResponse | null>(null);
  const [fields, setFields] = useState<FieldSchema[]>([]);
  const [formTitle, setFormTitle] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [worksheets, setWorksheets] = useState<string[]>([]);
  const [selectedWorksheet, setSelectedWorksheet] = useState<string | null>(null);
  const [createdForm, setCreatedForm] = useState<CreateFormResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [serviceAccountEmail, setServiceAccountEmail] = useState<string | null>(null);
  const [copiedForm, setCopiedForm] = useState(false);
  const [copiedEdit, setCopiedEdit] = useState(false);
  const [reapplying, setReapplying] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [autofillColumns, setAutofillColumns] = useState<string[]>([]);
  const [accessStatus, setAccessStatus] = useState<"checking" | "edit" | "read" | "none" | null>(null);

  useEffect(() => {
    getPublicConfig()
      .then((cfg) => setServiceAccountEmail(cfg.service_account_email))
      .catch(() => {});
  }, []);

  // Check sheet access when URL becomes valid
  useEffect(() => {
    if (!urlValid || !sheetUrl.trim()) {
      setAccessStatus(null);
      return;
    }

    setAccessStatus("checking");
    const timer = setTimeout(async () => {
      try {
        const { checkSheetAccess } = await import("@/lib/api");
        const status = await checkSheetAccess(sheetUrl);
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
  }, [sheetUrl, urlValid]);

  function validateUrl(value: string): boolean {
    if (!value.trim()) {
      setUrlError("Paste a Google Sheet URL to get started");
      setUrlValid(false);
      return false;
    }
    if (
      !value.includes("docs.google.com/spreadsheets") &&
      !/^[a-zA-Z0-9-_]{20,}$/.test(value.trim())
    ) {
      setUrlError("This doesn't look like a Google Sheets URL");
      setUrlValid(false);
      return false;
    }
    setUrlError("");
    setUrlValid(true);
    return true;
  }

  const handleUrlChange = useCallback((value: string) => {
    setSheetUrl(value);
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

  async function handleGenerate() {
    if (!validateUrl(sheetUrl)) return;
    setLoadingPreview(true);
    setError(null);
    try {
      const ws = await listWorksheets(sheetUrl);
      setWorksheets(ws.items);
      const initialWorksheet = ws.items[0] ?? null;
      setSelectedWorksheet(initialWorksheet);

      const data = await previewSheet(sheetUrl, initialWorksheet, rules);
      setPreviewData(data);
      setFields(data.fields);
      setFormTitle(data.spreadsheet_title);
      setWarnings(data.warnings);

      // Save to recent sheets
      try {
        const newRecent: RecentSheet = {
          url: sheetUrl,
          title: data.spreadsheet_title || "Untitled Sheet",
          timestamp: Date.now(),
        };
        setRecentSheets((prev) => {
          const filtered = prev.filter((s) => s.url !== sheetUrl);
          const updated = [newRecent, ...filtered].slice(0, 5); // Keep top 5
          localStorage.setItem("recent-sheets", JSON.stringify(updated));
          return updated;
        });
      } catch (e) {}

      setStep("preview");
    } catch (e: any) {
      setError(e.message ?? "Failed to read the sheet");
    } finally {
      setLoadingPreview(false);
    }
  }

  async function handleReapplyRules() {
    if (!previewData) return;
    setReapplying(true);
    setError(null);
    try {
      const fresh = await previewSheet(
        sheetUrl,
        selectedWorksheet ?? previewData.worksheet_name,
        rules,
      );
      setFields((prev) =>
        prev.map((existing) => {
          const updated = fresh.fields.find((f) => f.key === existing.key);
          if (!updated) return existing;
          return { ...existing, type: updated.type };
        }),
      );
      setWarnings(fresh.warnings);
    } catch (e: any) {
      setError(e.message ?? "Failed to re-apply rules");
    } finally {
      setReapplying(false);
    }
  }

  async function handleSaveForm() {
    if (!previewData) return;
    setSaving(true);
    setError(null);
    try {
      const result = await createForm({
        sheet_url: sheetUrl,
        spreadsheet_id: previewData.spreadsheet_id,
        worksheet_name: selectedWorksheet ?? previewData.worksheet_name,
        form_title: formTitle || previewData.spreadsheet_title,
        fields,
        custom_keywords: rules,
        autofill_columns: autofillColumns,
      });
      setCreatedForm(result);
      setStep("done");
    } catch (e: any) {
      setError(e.message ?? "Failed to save form");
    } finally {
      setSaving(false);
    }
  }

  function handleCopy(text: string, which: "form" | "edit") {
    navigator.clipboard.writeText(text).then(() => {
      if (which === "form") {
        setCopiedForm(true);
        setTimeout(() => setCopiedForm(false), 2000);
      } else {
        setCopiedEdit(true);
        setTimeout(() => setCopiedEdit(false), 2000);
      }
    });
  }

  function handleSignOut() {
    fetch(`${API_BASE}/api/auth/logout`, {
      method: "POST",
      credentials: "include",
    })
      .then(() => {
        window.location.reload();
      })
      .catch(() => {});
  }

  // ─── STEP: input ─────────────────────────────────────────────────────────────
  if (!mounted) {
    return <div className="min-h-screen bg-zinc-100" />; // Prevent flicker
  }

  if (step === "input") {
    return (
      <div className="flex flex-col min-h-screen bg-zinc-100">
        <AppHeader
          showLogo
          rightAction={
            <button
              type="button"
              onClick={handleSignOut}
              aria-label="Sign out"
              className="flex items-center justify-center w-9 h-9 rounded-lg border border-zinc-200 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
              </svg>
            </button>
          }
        />
        {loadingPreview && <LoadingOverlay message="Reading your sheet..." />}

        <div className="flex-1 w-full max-w-[560px] mx-auto px-5 pt-8 pb-32">
          {/* Hero */}
          <div className="mb-8">
            <h1 className="text-[26px] font-bold text-zinc-950 leading-tight tracking-tight">
              Turn any Google Sheet
              <br />
              into a mobile form
            </h1>
            <p className="text-[15px] text-zinc-600 mt-2.5 leading-relaxed">
              Paste your sheet link. Get a shareable form in seconds.
              Responses go straight back to your Sheet.
            </p>
          </div>

          {/* URL Input Card */}
          <div className="mb-6">
            <label
              htmlFor="sheet-url"
              className="block text-[13px] font-semibold text-zinc-800 mb-2"
            >
              Google Sheet URL
            </label>
            <div className="relative">
              <input
                id="sheet-url"
                type="url"
                inputMode="url"
                value={sheetUrl}
                onChange={(e) => handleUrlChange(e.target.value)}
                onBlur={() => sheetUrl && validateUrl(sheetUrl)}
                placeholder="https://docs.google.com/spreadsheets/d/..."
                aria-invalid={!!urlError}
                aria-describedby={urlError ? "url-error" : urlValid ? "url-success" : undefined}
                className={`w-full rounded-lg border px-4 py-3.5 text-[16px] min-h-[52px] pr-10 focus:outline-none focus:ring-2 transition-all ${
                  urlError
                    ? "border-red-300 bg-red-50/50 focus:ring-red-500"
                    : urlValid
                    ? "border-emerald-300 bg-emerald-50/30 focus:ring-emerald-500"
                    : "border-zinc-300 bg-white focus:ring-zinc-900"
                }`}
              />
              {/* Validation icon */}
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
              <p id="url-error" className="text-red-500 text-[13px] mt-1.5 flex items-center gap-1" role="alert">
                <svg className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                {urlError}
              </p>
            )}
            {urlValid && !urlError && (
              <div id="url-status" className="mt-1.5 space-y-1">
                {accessStatus === "checking" && (
                  <p className="text-gray-500 text-[13px] flex items-center gap-1.5">
                    <span className="w-3.5 h-3.5 border-2 border-gray-300 border-t-gray-500 rounded-full animate-spin"></span>
                    Checking permissions...
                  </p>
                )}
                {accessStatus === "none" && (
                  <p className="text-red-600 text-[13px] flex items-start gap-1">
                    <svg className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    <span><strong>No access.</strong> Please make sure this Google Sheet is shared with the logged-in account.</span>
                  </p>
                )}
                {accessStatus === "read" && (
                  <p className="text-amber-600 text-[13px] flex items-start gap-1">
                    <svg className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    <span><strong>View only.</strong> We can read the sheet, but you must grant Editor access to collect responses.</span>
                  </p>
                )}
                {accessStatus === "edit" && (
                  <p className="text-emerald-600 text-[13px] flex items-center gap-1">
                    <svg className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                Valid Google Sheet (edit access confirmed)
                  </p>
                )}
              </div>
            )}
            {!urlValid && !urlError && (
              <p className="text-gray-400 text-[13px] mt-1.5">
                Paste any Google Sheets link or spreadsheet ID
              </p>
            )}
          </div>

          {/* How it works */}
          <div className="mb-6">
            <div className="flex items-center gap-4 text-[13px] text-gray-400">
              <div className="flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center text-[11px] font-semibold">1</span>
                <span>Paste link</span>
              </div>
              <svg className="w-3 h-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
              <div className="flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center text-[11px] font-semibold">2</span>
                <span>Customize</span>
              </div>
              <svg className="w-3 h-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
              <div className="flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center text-[11px] font-semibold">3</span>
                <span>Share</span>
              </div>
            </div>
          </div>

          {/* Keyword rules (removed as requested) */}

          {/* Check History — navigates to dedicated page */}
          <button
            type="button"
            onClick={() => router.push("/history")}
            className="w-full flex items-center gap-3 px-4 py-3.5 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-50 hover:border-zinc-300 transition-all duration-150 mb-6"
          >
            <div className="w-9 h-9 rounded-lg bg-zinc-100 flex items-center justify-center flex-shrink-0">
              <svg
                className="w-4 h-4 text-zinc-700"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
                />
              </svg>
            </div>
            <div className="flex-1 text-left">
                <span className="text-[14px] font-semibold text-zinc-900 block">
                Check history
              </span>
              <span className="text-[12px] text-zinc-500">
                Search previously submitted data
              </span>
            </div>
            <svg
              className="w-4 h-4 text-gray-400 group-hover:text-gray-600 transition-colors"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </button>

          {/* Recently Used Sheets */}
          {recentSheets.length > 0 && (
            <div className="mb-6 animate-fade-in">
              <h3 className="text-[12px] font-bold text-zinc-500 mb-3 uppercase tracking-wider px-1">
                Recently used sheets
              </h3>
              <div className="space-y-2.5">
                {recentSheets.map((sheet, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setSheetUrl(sheet.url);
                      validateUrl(sheet.url);
                    }}
                    className="w-full text-left p-3.5 rounded-lg border border-zinc-200 bg-white hover:border-zinc-400 hover:bg-zinc-50 transition-all duration-200 flex items-center gap-3.5 group"
                  >
                    <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0 border border-emerald-100 group-hover:bg-emerald-100 group-hover:border-emerald-200 transition-colors">
                      <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-semibold text-zinc-950 truncate transition-colors">
                        {sheet.title}
                      </p>
                      <p className="text-[12px] text-zinc-500 truncate mt-0.5">
                        {sheet.url.replace("https://docs.google.com/spreadsheets/d/", "...")}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Setup help (collapsed) */}
          {serviceAccountEmail && (
            <div className="mb-6">
              <button
                type="button"
                onClick={() => setShowSetup(!showSetup)}
                className="text-[13px] text-zinc-500 hover:text-zinc-800 transition-colors flex items-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
                </svg>
                Need to set up sheet access?
              </button>
              {showSetup && (
                <div className="mt-3 rounded-lg border border-zinc-200 bg-white p-4 animate-fade-in">
                  <p className="text-[13px] text-zinc-600 mb-2">
                    Share your Google Sheet with this email (Editor access):
                  </p>
                  <div className="flex gap-2">
                    <input
                      readOnly
                      value={serviceAccountEmail}
                      className="flex-1 bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-[16px] text-zinc-700 font-mono select-all"
                      onFocus={(e) => e.target.select()}
                    />
                    <button
                      type="button"
                      onClick={() => navigator.clipboard.writeText(serviceAccountEmail)}
                      className="px-3 py-2 rounded-lg bg-zinc-950 text-white text-xs font-medium min-h-[36px]"
                    >
                      Copy
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Trust note */}
          <div className="flex items-start gap-2 text-[12px] text-zinc-500">
            <svg className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
            <span>Your data stays in your Google Sheet. We never store spreadsheet content.</span>
          </div>
        </div>

        {/* Sticky CTA */}
        <div
          className="fixed bottom-0 left-0 right-0 max-w-[560px] mx-auto px-5 pt-3 pb-3 bg-white border-t border-zinc-200 shadow-sticky z-40"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 12px)" }}
        >
          <button
            onClick={handleGenerate}
            disabled={loadingPreview || !sheetUrl.trim() || accessStatus === "none" || accessStatus === "read"}
            className="w-full bg-zinc-950 hover:bg-zinc-800 active:bg-black disabled:bg-zinc-200 disabled:text-zinc-500 text-white font-semibold text-[15px] rounded-lg h-[52px] flex items-center justify-center gap-2 transition-all duration-150"
          >
            {loadingPreview ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Reading sheet...</span>
              </>
            ) : (
              <span>Preview your form</span>
            )}
          </button>
        </div>

        <ErrorToast message={error} onDismiss={() => setError(null)} />
      </div>
    );
  }

  // ─── STEP: preview ────────────────────────────────────────────────────────────
  if (step === "preview") {
    return (
      <div className="flex flex-col min-h-screen bg-zinc-100">
        <AppHeader
          title="Customize"
          showBack
          onBack={() => setStep("input")}
          rightAction={
            <span className="text-[11px] font-medium text-zinc-500">2 of 3</span>
          }
        />
        {reapplying && <LoadingOverlay message="Updating fields..." />}

        <div className="flex-1 w-full max-w-[560px] mx-auto px-5 pt-5 pb-32 space-y-5">
          {/* Warnings */}
          {warnings.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3.5">
              <p className="text-[13px] font-medium text-amber-800 mb-1">Heads up</p>
              {warnings.map((w, i) => (
                <p key={i} className="text-[12px] text-amber-600">{w}</p>
              ))}
            </div>
          )}

          {/* Worksheet selector */}
          {worksheets.length > 1 && (
            <div>
              <label className="block text-[13px] font-semibold text-zinc-800 mb-2">
                Sheet tab
              </label>
              <MobileDropdown
                value={selectedWorksheet ?? ""}
                options={worksheets.map(name => ({ value: name, label: name }))}
                onChange={async (val) => {
                  const next = val || null;
                  setSelectedWorksheet(next);
                  if (!next) return;
                  setReapplying(true);
                  setError(null);
                  try {
                    const fresh = await previewSheet(sheetUrl, next, rules);
                    setPreviewData(fresh);
                    setFields(fresh.fields);
                    setWarnings(fresh.warnings);
                  } catch (err: any) {
                    setError(err.message ?? "Failed to load selected tab");
                  } finally {
                    setReapplying(false);
                  }
                }}
              />
            </div>
          )}

          {/* Form title */}
          <div>
            <label className="block text-[13px] font-semibold text-zinc-800 mb-2">
              Form title
            </label>
            <input
              type="text"
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-[16px] min-h-[48px] focus:outline-none focus:ring-2 focus:ring-zinc-900"
            />
          </div>

          {/* Field editor */}
          <FormFieldEditor
            fields={fields}
            onChange={setFields}
            autofillColumns={autofillColumns}
            onAutofillChange={setAutofillColumns}
          />

          {/* Keyword rules with re-apply */}
          <div className="space-y-2.5">
            <KeywordRulesEditor rules={rules} onChange={setRules} />
            {rules.length > 0 && (
              <button
                type="button"
                onClick={handleReapplyRules}
                disabled={reapplying}
                className="w-full flex items-center justify-center gap-1.5 border border-zinc-200 bg-white text-zinc-700 rounded-lg py-2.5 text-[13px] font-medium hover:bg-zinc-50 transition-colors min-h-[40px] disabled:opacity-50"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                </svg>
                Re-apply rules
              </button>
            )}
          </div>
        </div>

        <SubmitButton
          label="Publish & get link"
          submitting={saving}
          onClick={handleSaveForm}
        />
        <ErrorToast message={error} onDismiss={() => setError(null)} />
      </div>
    );
  }

  // ─── STEP: done ───────────────────────────────────────────────────────────────
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const fullFormUrl = origin + (createdForm?.form_url ?? "");
  const fullEditUrl = origin + (createdForm?.edit_url ?? "");

  return (
    <div className="flex flex-col min-h-screen bg-zinc-100">
      <AppHeader
        showLogo
        showBack
        onBack={() => setStep("input")}
        rightAction={
          <span className="text-[11px] font-medium text-zinc-500">3 of 3</span>
        }
      />

      <div className="flex-1 w-full max-w-[560px] mx-auto px-5 pt-6 pb-10 stagger-children">
        {/* Success header */}
        <div className="flex flex-col items-center pt-4 pb-6">
          <div className="w-14 h-14 bg-emerald-50 rounded-full flex items-center justify-center border-2 border-emerald-100">
            <svg className="w-7 h-7 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-lg font-bold text-zinc-950 mt-4">
            Your form is live
          </h1>
          <p className="text-[13px] text-zinc-600 mt-1 text-center">
            Share the link below to start collecting responses.
          </p>
        </div>

        {/* Form link */}
        <div className="rounded-lg border border-zinc-200 bg-white p-4 mb-3">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-6 h-6 rounded-md bg-accent-50 flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-zinc-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.54a4.5 4.5 0 00-1.242-7.244l-4.5-4.5a4.5 4.5 0 00-6.364 6.364L4.757 8.25" />
              </svg>
            </div>
            <span className="text-[13px] font-semibold text-zinc-950">Share link</span>
          </div>
          <div className="flex gap-2 mb-3">
            <input
              readOnly
              value={fullFormUrl}
              className="flex-1 border border-zinc-200 rounded-lg px-3 py-2.5 text-[13px] text-zinc-600 bg-zinc-50 font-mono"
              onFocus={(e) => e.target.select()}
            />
            <button
              type="button"
              onClick={() => handleCopy(fullFormUrl, "form")}
              className="px-4 py-2.5 rounded-lg bg-zinc-950 text-white text-[13px] font-medium min-h-[40px] min-w-[60px]"
            >
              {copiedForm ? "Copied" : "Copy"}
            </button>
          </div>
          <button
            type="button"
            onClick={() => router.push(createdForm?.form_url ?? "/")}
            className="block w-full text-center bg-zinc-950 hover:bg-zinc-800 text-white text-[13px] font-medium py-2.5 rounded-lg transition-colors"
          >
            Open in this App
          </button>
        </div>

        {/* Edit link */}
        <div className="rounded-lg border border-zinc-200 bg-white p-4 mb-6">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 rounded-md bg-gray-100 flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
              </svg>
            </div>
            <span className="text-[13px] font-semibold text-zinc-950">Edit link</span>
            <span className="text-[11px] text-zinc-500 ml-auto">Private</span>
          </div>
          <p className="text-[11px] text-zinc-500 mb-3">
            Keep this safe. Anyone with this link can edit your form.
          </p>
          <div className="flex gap-2">
            <input
              readOnly
              value={fullEditUrl}
              className="flex-1 border border-zinc-200 rounded-lg px-3 py-2.5 text-[13px] text-zinc-600 bg-zinc-50 font-mono"
              onFocus={(e) => e.target.select()}
            />
            <button
              type="button"
              onClick={() => handleCopy(fullEditUrl, "edit")}
              className="px-4 py-2.5 rounded-lg border border-zinc-200 bg-white text-zinc-700 text-[13px] font-medium min-h-[40px] min-w-[60px] hover:bg-zinc-50"
            >
              {copiedEdit ? "Copied" : "Copy"}
            </button>
          </div>
        </div>

        {/* Create another */}
        <button
          type="button"
          onClick={() => {
            setStep("input");
            setSheetUrl("");
            setUrlValid(false);
            setRules([]);
            setCreatedForm(null);
            setAutofillColumns([]);
          }}
          className="w-full text-[13px] text-zinc-600 font-medium py-3 hover:text-zinc-900 transition-colors"
        >
          + Create another form
        </button>
      </div>
    </div>
  );
}
