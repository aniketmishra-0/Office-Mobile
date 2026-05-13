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
import ClearButton from "@/components/ClearButton";
import { QRCodeCanvas } from "qrcode.react";
import { usePrefs } from "@/lib/usePrefs";
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
  const { copy } = usePrefs();
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
      <div className="flex flex-col min-h-screen">
        <AppHeader showLogo />
        {loadingPreview && <LoadingOverlay message="Reading your sheet..." />}

        <div className="flex-1 w-full max-w-[560px] mx-auto px-6 pt-10 pb-32 space-y-8">
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
              Step · 01 of 03
            </p>
            <h1
              style={{
                fontFamily: "var(--font-newsreader), Georgia, serif",
                fontWeight: 300,
                fontSize: 36,
                lineHeight: 1.1,
                letterSpacing: "-0.01em",
                color: "var(--ink)",
                margin: 0,
                whiteSpace: "pre-line",
              }}
            >
              {copy.hero_title ? (
                copy.hero_title
              ) : (
                <>
                  Your Spreadsheet.
                  <br />
                  Your <em style={{ fontStyle: "italic", fontWeight: 400 }}>Form.</em>
                </>
              )}
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
              {copy.hero_sub ?? "// connect a google sheet. collect data. done."}
            </p>
          </section>

          <hr style={{ border: 0, borderTop: "1px solid var(--rule)", margin: 0 }} />

          {/* Mode toggle — minimal segmented bar */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 0,
              border: "1px solid var(--rule)",
            }}
          >
            <button
              type="button"
              onClick={() => setMode("paste")}
              style={{
                padding: "12px 16px",
                background: mode === "paste" ? "var(--ink)" : "transparent",
                color: mode === "paste" ? "var(--on-ink)" : "var(--ink)",
                border: 0,
                fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                fontWeight: 500,
                fontSize: 11,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                cursor: "pointer",
                transition: "background-color 200ms ease-out",
              }}
            >
              paste link
            </button>
            <button
              type="button"
              onClick={() => setMode("create")}
              style={{
                padding: "12px 16px",
                background: mode === "create" ? "var(--ink)" : "transparent",
                color: mode === "create" ? "var(--on-ink)" : "var(--ink)",
                border: 0,
                borderLeft: "1px solid var(--rule)",
                fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                fontWeight: 500,
                fontSize: 11,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                cursor: "pointer",
                transition: "background-color 200ms ease-out",
              }}
            >
              create new
            </button>
          </div>

          {mode === "create" && (
            <div>
              <FormBuilder submitting={saving} onSubmit={handleCreateNewForm} />
            </div>
          )}

          {mode === "paste" && (
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
                    value={sheetUrl}
                    onChange={(e) => handleUrlChange(e.target.value)}
                    onBlur={() => sheetUrl && validateUrl(sheetUrl)}
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
                  {sheetUrl && (
                    <ClearButton
                      onClick={() => {
                        setSheetUrl("");
                        setUrlValid(false);
                        setUrlError("");
                        setAccessStatus(null);
                      }}
                      ariaLabel="Clear sheet URL"
                      top="calc(50% - 2px)"
                    />
                  )}
                </div>                {urlError && (
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
                    we can read the sheet, but you must grant editor access{" "}
                    {serviceAccountEmail ? (
                      <>
                        to <strong style={{ fontWeight: 500 }}>{serviceAccountEmail}</strong>{" "}
                      </>
                    ) : null}
                    to collect responses.
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
                your data stays in your sheet · we never store contents
              </p>
            </div>
          )}

          {/* Library */}
          {sortedVisibleLibrary.length > 0 && (
            <section>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  marginBottom: 12,
                  borderTop: "1px solid var(--rule)",
                  paddingTop: 24,
                }}
              >
                <div>
                  <p
                    style={{
                      fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                      fontWeight: 500,
                      fontSize: 10,
                      letterSpacing: "0.18em",
                      textTransform: "uppercase",
                      color: "var(--stone)",
                      margin: "0 0 8px 0",
                    }}
                  >
                    Library
                  </p>
                  <h2
                    style={{
                      fontFamily: "var(--font-newsreader), Georgia, serif",
                      fontWeight: 400,
                      fontSize: 20,
                      color: "var(--ink)",
                      margin: 0,
                    }}
                  >
                    Saved forms
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => router.push("/history")}
                  style={{
                    background: "transparent",
                    border: 0,
                    padding: 0,
                    fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                    fontWeight: 500,
                    fontSize: 11,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: "var(--clay)",
                    cursor: "pointer",
                  }}
                >
                  history →
                </button>
              </div>

              <div style={{ marginBottom: 16, position: "relative" }}>
                <input
                  type="search"
                  value={libraryQuery}
                  onChange={(e) => setLibraryQuery(e.target.value)}
                  placeholder="search forms"
                  style={{
                    width: "100%",
                    fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                    fontSize: 13,
                    color: "var(--ink)",
                    background: "transparent",
                    border: 0,
                    borderBottom: "1px solid var(--rule)",
                    borderRadius: 0,
                    padding: "8px 28px 8px 0",
                    outline: "none",
                  }}
                />
                {libraryQuery && (
                  <ClearButton
                    onClick={() => setLibraryQuery("")}
                    ariaLabel="Clear search"
                    top="calc(50% - 2px)"
                  />
                )}
              </div>

              <div style={{ borderTop: "1px solid var(--rule)" }}>
                {pagedLibrary.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr auto",
                      gap: 12,
                      padding: "14px 0",
                      borderBottom: "1px solid var(--rule)",
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <p
                        style={{
                          fontFamily: "var(--font-newsreader), Georgia, serif",
                          fontWeight: 400,
                          fontSize: 15,
                          color: "var(--ink)",
                          margin: "0 0 4px 0",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {item.form_title}
                      </p>
                      <p
                        style={{
                          fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                          fontWeight: 300,
                          fontSize: 10,
                          letterSpacing: "0.04em",
                          color: "var(--stone)",
                          margin: 0,
                        }}
                      >
                        {String(item.field_count).padStart(2, "0")} fields ·{" "}
                        {item.submission_count} entries · {formatUpdatedAt(item.updated_at)}
                      </p>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <button
                        type="button"
                        onClick={() => router.push(item.form_url)}
                        style={{
                          background: "transparent",
                          border: 0,
                          padding: 0,
                          fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                          fontWeight: 500,
                          fontSize: 10,
                          letterSpacing: "0.12em",
                          textTransform: "uppercase",
                          color: "var(--ink)",
                          cursor: "pointer",
                        }}
                      >
                        open
                      </button>
                      <span style={{ color: "var(--rule)" }}>·</span>
                      <button
                        type="button"
                        onClick={() => router.push(item.edit_url)}
                        style={{
                          background: "transparent",
                          border: 0,
                          padding: 0,
                          fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                          fontWeight: 500,
                          fontSize: 10,
                          letterSpacing: "0.12em",
                          textTransform: "uppercase",
                          color: "var(--stone)",
                          cursor: "pointer",
                        }}
                      >
                        edit
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {pagedLibrary.length < sortedVisibleLibrary.length && (
                <button
                  type="button"
                  onClick={() => setPage((p) => p + 1)}
                  style={{
                    marginTop: 16,
                    background: "transparent",
                    border: 0,
                    padding: 0,
                    fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                    fontWeight: 500,
                    fontSize: 11,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: "var(--clay)",
                    cursor: "pointer",
                  }}
                >
                  show more →
                </button>
              )}
            </section>
          )}

          <ErrorToast message={error} onDismiss={() => setError(null)} />
        </div>

        {/* Submit band — generate form */}
        {mode === "paste" && (
          <SubmitButton
            label={copy.submit_label ?? "Preview your form"}
            submitting={loadingPreview}
            onClick={handleGenerate}
            disabled={!sheetUrl.trim() || accessStatus === "none" || accessStatus === "read"}
          />
        )}
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
            <div className="relative">
              <input
                type="text"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 pr-10 text-[16px] min-h-[48px] focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
              {formTitle && <ClearButton onClick={() => setFormTitle("")} right={10} ariaLabel="Clear title" />}
            </div>
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
