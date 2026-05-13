"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import Logo from "@/components/Logo";
import LoadingOverlay from "@/components/LoadingOverlay";
import ErrorToast from "@/components/ErrorToast";
import KeywordRulesEditor from "@/components/KeywordRulesEditor";
import FormFieldEditor from "@/components/FormFieldEditor";
import FormBuilder from "@/components/FormBuilder";
import MobileDropdown from "@/components/MobileDropdown";
import SubmitButton from "@/components/SubmitButton";
import { QRCodeCanvas } from "qrcode.react";
import {
  createSheet,
  previewSheet,
  createForm,
  getPublicConfig,
  listFormLibrary,
  listWorksheets,
} from "@/lib/api";
import type {
  FieldSchema,
  CustomKeywordRule,
  FormLibraryItem,
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
  const qrRef = useRef<HTMLCanvasElement | null>(null);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const [step, setStep] = useState<Step>("input");
  const [mode, setMode] = useState<"paste" | "create">("paste");
  const [mounted, setMounted] = useState(false);
  const [recentSheets, setRecentSheets] = useState<RecentSheet[]>([]);
  const [libraryItems, setLibraryItems] = useState<FormLibraryItem[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [libraryQuery, setLibraryQuery] = useState("");

  // Pagination state for large libraries
  const [pageSize] = useState(12);
  const [page, setPage] = useState(1);

  // Restore step from sessionStorage on mount to avoid hydration flicker
  useEffect(() => {
    const saved = sessionStorage.getItem("dashboard-step");
    if (saved === "done" || saved === "preview") {
      setStep(saved as Step);
    }
    const savedMode = sessionStorage.getItem("dashboard-mode");
    if (savedMode === "paste" || savedMode === "create") {
      setMode(savedMode);
    }
    
    try {
      const savedRecent = localStorage.getItem("recent-sheets");
      if (savedRecent) {
        setRecentSheets(JSON.parse(savedRecent));
      }
    } catch (e) {}

    setMounted(true);
  }, []);

  async function refreshLibrary() {
    try {
      const data = await listFormLibrary();
      setLibraryItems(data.items);
    } catch {
      setLibraryItems([]);
    } finally {
      setLibraryLoading(false);
    }
  }

  // Persist step to sessionStorage so back navigation restores it
  useEffect(() => {
    if (mounted) {
      sessionStorage.setItem("dashboard-step", step);
    }
  }, [step, mounted]);

  useEffect(() => {
    if (mounted) {
      sessionStorage.setItem("dashboard-mode", mode);
    }
  }, [mode, mounted]);

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

  useEffect(() => {
    void refreshLibrary();
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
      await refreshLibrary();
      setStep("done");
    } catch (e: any) {
      setError(e.message ?? "Failed to save form");
    } finally {
      setSaving(false);
    }
  }

  const visibleLibraryItems = libraryQuery.trim()
    ? libraryItems.filter((item) => {
        const query = libraryQuery.trim().toLowerCase();
        return (
          item.form_title.toLowerCase().includes(query) ||
          item.sheet_url.toLowerCase().includes(query)
        );
      })
    : libraryItems;

  // Sort by updated_at (newest first)
  const sortedVisibleLibrary = [...visibleLibraryItems].sort((a, b) => {
    const ta = a.updated_at ? new Date(a.updated_at).getTime() : 0;
    const tb = b.updated_at ? new Date(b.updated_at).getTime() : 0;
    return tb - ta;
  });

  // Paged subset for UI (infinite-scroll / show-more pattern)
  const pagedLibrary = sortedVisibleLibrary.slice(0, page * pageSize);

  const featuredForm = sortedVisibleLibrary[0] ?? null;
  const featuredShareUrl = featuredForm ? `${origin}${featuredForm.form_url}` : "";
  const featuredEditUrl = featuredForm ? `${origin}${featuredForm.edit_url}` : "";

  function formatUpdatedAt(value: string): string {
    const updated = new Date(value).getTime();
    if (Number.isNaN(updated)) return "Recently updated";
    const diffMinutes = Math.max(1, Math.round((Date.now() - updated) / 60000));
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    const diffHours = Math.round(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.round(diffHours / 24);
    return `${diffDays}d ago`;
  }

  async function handleCreateNewForm(payload: { formTitle: string; fields: FieldSchema[] }) {
    setSaving(true);
    setError(null);
    try {
      const sheet = await createSheet({
        form_title: payload.formTitle,
        fields: payload.fields,
      });
      const result = await createForm({
        sheet_url: sheet.sheet_url,
        spreadsheet_id: sheet.spreadsheet_id,
        worksheet_name: sheet.worksheet_name,
        form_title: payload.formTitle,
        fields: payload.fields,
        custom_keywords: [],
        autofill_columns: [],
      });
      setCreatedForm(result);
      setFormTitle(payload.formTitle);
      await refreshLibrary();
      setPage(1);
      setStep("done");
    } catch (e: any) {
      setError(e.message ?? "Failed to create form");
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
        try {
          window.localStorage.removeItem("om_session");
        } catch {}
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

        <div className="flex-1 w-full max-w-[560px] mx-auto px-5 pt-8 pb-32 space-y-6">
          <section className="space-y-3">
            <h1 className="text-[26px] font-bold text-zinc-950 leading-tight tracking-tight">
              Turn any Google Sheet
              <br />
              into a mobile form
            </h1>
            <p className="text-[15px] text-zinc-600 leading-relaxed">
              Paste your sheet link. Get a shareable form in seconds.
              Responses go straight back to your Sheet.
            </p>
          </section>

          <div className="grid gap-3 sm:grid-cols-3">
            <button
              type="button"
              onClick={() => setMode("create")}
              className="rounded-3xl border border-zinc-200 bg-white p-4 text-left shadow-sm transition-transform duration-150 hover:-translate-y-0.5 hover:shadow-md"
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 mb-2">Builder</p>
              <h2 className="text-[18px] font-bold text-zinc-950 leading-tight">Create a new form</h2>
              <p className="mt-2 text-[13px] text-zinc-600">Add columns, pick field types, and publish a sheet-backed form.</p>
            </button>

            <div className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 mb-2">Library</p>
              <div className="flex items-end justify-between gap-3">
                <div>
                  <h2 className="text-[18px] font-bold text-zinc-950 leading-tight">Saved forms</h2>
                  <p className="mt-2 text-[13px] text-zinc-600">{libraryItems.length} published app{libraryItems.length === 1 ? "" : "s"}</p>
                </div>
                <button
                  type="button"
                  onClick={() => router.push("/history")}
                  className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-2 text-[12px] font-medium text-zinc-700 hover:bg-zinc-100"
                >
                  History
                </button>
              </div>
            </div>

            <div className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 mb-2">Share</p>
              {featuredShareUrl ? (
                <div className="flex items-start gap-3">
                  <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-2">
                    <QRCodeCanvas ref={qrRef} value={featuredShareUrl} size={88} bgColor="#ffffff" fgColor="#09090b" includeMargin level="M" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-[18px] font-bold text-zinc-950 leading-tight">QR code ready</h2>
                    <p className="mt-2 text-[13px] text-zinc-600">Open the latest form, copy the share link, or jump to its editor.</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" onClick={() => router.push(featuredEditUrl)} className="rounded-full bg-zinc-950 px-3 py-2 text-[12px] font-medium text-white hover:bg-zinc-800">Open QR</button>
                      <button type="button" onClick={() => navigator.clipboard.writeText(featuredShareUrl)} className="rounded-full border border-zinc-200 bg-white px-3 py-2 text-[12px] font-medium text-zinc-700 hover:bg-zinc-50">Copy link</button>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <h2 className="text-[18px] font-bold text-zinc-950 leading-tight">No QR yet</h2>
                  <p className="mt-2 text-[13px] text-zinc-600">Create and publish a form to generate its shareable QR code.</p>
                </>
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 mb-1">Workspace</p>
                <h2 className="text-[18px] font-bold text-zinc-950">Your forms library</h2>
              </div>
              <div className="text-right">
                <p className="text-[11px] text-zinc-500">Saved apps</p>
                <p className="text-sm font-semibold text-zinc-950">{libraryItems.length}</p>
              </div>
            </div>

            <div className="mb-3">
              <input
                type="search"
                value={libraryQuery}
                onChange={(e) => setLibraryQuery(e.target.value)}
                placeholder="Search your forms"
                className="w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-[14px] text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
            </div>

            {libraryLoading ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {[0, 1].map((index) => (
                  <div key={index} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 animate-pulse">
                    <div className="h-4 w-24 rounded bg-zinc-200 mb-3" />
                    <div className="h-6 w-40 rounded bg-zinc-200 mb-4" />
                    <div className="h-10 rounded bg-zinc-200" />
                  </div>
                ))}
              </div>
            ) : sortedVisibleLibrary.length > 0 ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  {pagedLibrary.map((item, index) => (
                    <div key={item.id} className={`rounded-2xl border p-4 shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md ${index % 3 === 0 ? "border-emerald-200 bg-emerald-50/60" : index % 3 === 1 ? "border-sky-200 bg-sky-50/60" : "border-amber-200 bg-amber-50/60"}`}>
                      <div className="flex items-start justify-between gap-3 mb-4">
                        <div className="min-w-0">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 mb-1">Form</p>
                          <h3 className="text-[16px] font-bold text-zinc-950 truncate">{item.form_title}</h3>
                          <p className="text-[12px] text-zinc-600 mt-1">{item.field_count} fields · {item.submission_count} responses</p>
                        </div>
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-zinc-950 text-white flex-shrink-0">
                          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v7.5A2.25 2.25 0 005.25 18h13.5A2.25 2.25 0 0021 15.75V12M13.5 6l3-3m0 0l3 3m-3-3v9" />
                          </svg>
                        </div>
                      </div>

                      <div className="mb-4 space-y-2">
                        <div className="flex items-center justify-between text-[12px] text-zinc-700">
                          <span>Updated</span>
                          <span className="font-medium">{formatUpdatedAt(item.updated_at)}</span>
                        </div>
                        <div className="flex items-center justify-between text-[12px] text-zinc-700">
                          <span>Sheet tab</span>
                          <span className="font-medium truncate max-w-[140px]">{item.worksheet_name ?? "Sheet1"}</span>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <button type="button" onClick={() => router.push(item.form_url)} className="flex-1 rounded-xl bg-zinc-950 px-3 py-2.5 text-[13px] font-medium text-white hover:bg-zinc-800">Open form</button>
                        <button type="button" onClick={() => router.push(item.edit_url)} className="rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-[13px] font-medium text-zinc-700 hover:bg-zinc-50">Edit / QR</button>
                      </div>
                    </div>
                  ))}
                </div>
                {pagedLibrary.length < sortedVisibleLibrary.length && (
                  <div className="mt-4 flex justify-center">
                    <button type="button" onClick={() => setPage((p) => p + 1)} className="px-4 py-2 border rounded">Show more</button>
                  </div>
                )}
              </>
            ) : (
              <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-5 text-center">
                <p className="text-[14px] font-semibold text-zinc-900">No saved forms yet</p>
                <p className="mt-1 text-[13px] text-zinc-500">Create your first app below and it will appear here like a Glide workspace.</p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 rounded-xl border border-zinc-200 bg-white p-2 shadow-sm">
            <button type="button" onClick={() => setMode("paste")} className={`rounded-lg px-3 py-3 text-[13px] font-medium transition-colors min-h-[48px] ${mode === "paste" ? "bg-zinc-950 text-white" : "bg-transparent text-zinc-600 hover:bg-zinc-50"}`}>Paste link</button>
            <button type="button" onClick={() => setMode("create")} className={`rounded-lg px-3 py-3 text-[13px] font-medium transition-colors min-h-[48px] ${mode === "create" ? "bg-zinc-950 text-white" : "bg-transparent text-zinc-600 hover:bg-zinc-50"}`}>Create new form</button>
          </div>

          {mode === "create" && (
            <div>
              <FormBuilder submitting={saving} onSubmit={handleCreateNewForm} />
            </div>
          )}

          {mode === "paste" && (
            <div className="space-y-4">
              <div>
                <label htmlFor="sheet-url" className="block text-[13px] font-semibold text-zinc-800 mb-2">Google Sheet URL</label>
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
                    className={`w-full rounded-lg border px-4 py-3.5 text-[16px] min-h-[52px] pr-10 focus:outline-none focus:ring-2 transition-all ${urlError ? "border-red-300 bg-red-50/50 focus:ring-red-500" : urlValid ? "border-emerald-300 bg-emerald-50/30 focus:ring-emerald-500" : "border-zinc-300 bg-white focus:ring-zinc-900"}`}
                  />
                </div>
                {urlError && <p id="url-error" className="text-red-500 text-[13px] mt-1.5" role="alert">{urlError}</p>}
                {!urlValid && !urlError && <p className="text-gray-400 text-[13px] mt-1.5">Paste any Google Sheets link or spreadsheet ID</p>}
                {accessStatus === "none" && serviceAccountEmail && (
                  <p className="text-[13px] mt-1.5 text-amber-700">
                    No permission to access this sheet. Share the sheet (or Drive) with <strong>{serviceAccountEmail}</strong> or sign in with Google.
                  </p>
                )}
              </div>

              <div className="flex items-start gap-2 text-[12px] text-zinc-500">
                <svg className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                </svg>
                <span>Your data stays in your Google Sheet. We never store spreadsheet content.</span>
              </div>

              <div className="fixed bottom-0 left-0 right-0 max-w-[560px] mx-auto px-5 pt-3 pb-3 bg-white border-t border-zinc-200 shadow-sticky z-40" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 12px)" }}>
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
            </div>
          )}

          <ErrorToast message={error} onDismiss={() => setError(null)} />
        </div>
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
                Sub Sheets
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
  const appOrigin = typeof window !== "undefined" ? window.location.origin : "";
  const fullFormUrl = appOrigin + (createdForm?.form_url ?? "");
  const fullEditUrl = appOrigin + (createdForm?.edit_url ?? "");

  return (
    <div className="flex flex-col min-h-screen bg-zinc-100">
      <AppHeader
        showLogo
        showBack
          onBack={() => {
            if (previewData) {
              setStep("preview");
            } else {
              setStep("input");
            }
          }}
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
            <div className="w-6 h-6 rounded-md bg-zinc-100 flex items-center justify-center">
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
        </div>
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
