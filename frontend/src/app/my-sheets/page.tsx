"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import ErrorToast from "@/components/ErrorToast";
import LoadingOverlay from "@/components/LoadingOverlay";
import SubmitButton from "@/components/SubmitButton";
import OpenInModal from "@/components/OpenInModal";
import {
  listSavedSheets,
  saveSheet,
  deleteSavedSheet,
  renameSavedSheet,
  type SavedSheetItem,
} from "@/lib/api";

export default function MySheetsPage() {
  const router = useRouter();
  const [sheets, setSheets] = useState<SavedSheetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add sheet form
  const [showAdd, setShowAdd] = useState(false);
  const [addUrl, setAddUrl] = useState("");
  const [addTitle, setAddTitle] = useState("");
  const [addWorksheet, setAddWorksheet] = useState("");
  const [saving, setSaving] = useState(false);

  // Rename state
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // "Open In" modal state
  const [openInSheet, setOpenInSheet] = useState<SavedSheetItem | null>(null);

  const loadSheets = useCallback(async () => {
    try {
      setLoading(true);
      const data = await listSavedSheets();
      setSheets(data.items);
    } catch (e: any) {
      setError(e.message ?? "Failed to load saved sheets");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSheets();
  }, [loadSheets]);

  function extractSpreadsheetId(url: string): string | null {
    const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : null;
  }

  async function handleSave() {
    const url = addUrl.trim();
    const title = addTitle.trim();
    if (!url || !title) {
      setError("Sheet URL and name are required");
      return;
    }

    const spreadsheetId = extractSpreadsheetId(url);
    if (!spreadsheetId) {
      setError("Invalid Google Sheet URL");
      return;
    }

    setSaving(true);
    try {
      const saved = await saveSheet({
        sheet_url: url,
        spreadsheet_id: spreadsheetId,
        title,
        worksheet_name: addWorksheet.trim() || null,
      });
      setSheets((prev) => [saved, ...prev]);
      setAddUrl("");
      setAddTitle("");
      setAddWorksheet("");
      setShowAdd(false);
    } catch (e: any) {
      setError(e.message ?? "Failed to save sheet");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteSavedSheet(id);
      setSheets((prev) => prev.filter((s) => s.id !== id));
    } catch (e: any) {
      setError(e.message ?? "Failed to delete");
    }
  }

  async function handleRename(id: string) {
    const title = renameValue.trim();
    if (!title) return;
    try {
      await renameSavedSheet(id, title);
      setSheets((prev) =>
        prev.map((s) => (s.id === id ? { ...s, title } : s)),
      );
      setRenamingId(null);
      setRenameValue("");
    } catch (e: any) {
      setError(e.message ?? "Failed to rename");
    }
  }

  function openSheet(sheet: SavedSheetItem) {
    // Show the "Open In" modal so user can pick how to open this sheet
    setOpenInSheet(sheet);
  }

  function handleOpenInSelect(optionId: string) {
    if (!openInSheet) return;
    const sheetUrl = encodeURIComponent(openInSheet.sheet_url);
    setOpenInSheet(null);

    switch (optionId) {
      case "quick-view":
        router.push(`/history?sheet=${sheetUrl}`);
        break;
      case "data-correction":
        router.push(`/data-fill?sheet=${sheetUrl}`);
        break;
      case "form-fill":
        router.push(`/form-fill?sheet=${sheetUrl}`);
        break;
      case "multi-header":
        router.push(`/multi-header-filter?sheet=${sheetUrl}`);
        break;
      default:
        // Future options — fallback to Quick View
        router.push(`/history?sheet=${sheetUrl}`);
        break;
    }
  }

  function formatDate(iso: string): string {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    } catch {
      return iso;
    }
  }

  return (
    <div className="flex flex-col min-h-screen" style={{ background: "var(--cream)" }}>
      <AppHeader title="My Sheets" showBack onBack={() => router.push("/")} />
      {loading && sheets.length === 0 && <LoadingOverlay message="Loading..." />}

      <div className="flex-1 w-full max-w-[560px] mx-auto px-6 pt-10 pb-32">
        {/* Hero */}
        <section style={{ marginBottom: 32 }}>
          <p
            style={{
              fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
              fontWeight: 500,
              fontSize: 10,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "var(--stone)",
              margin: "0 0 14px 0",
            }}
          >
            My Sheets
          </p>
          <h1
            style={{
              fontFamily: "var(--font-newsreader), Georgia, serif",
              fontWeight: 300,
              fontSize: 28,
              lineHeight: 1.15,
              letterSpacing: "-0.01em",
              color: "var(--ink)",
              margin: 0,
            }}
          >
            Your saved
            <br />
            <em style={{ fontStyle: "italic", fontWeight: 400 }}>sheets.</em>
          </h1>
          <p
            style={{
              fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
              fontWeight: 300,
              fontSize: 12,
              letterSpacing: "0.04em",
              color: "var(--stone)",
              margin: "14px 0 0 0",
            }}
          >
            {"// save sheets here. open them anytime."}
          </p>
        </section>

        <hr style={{ border: 0, borderTop: "1px solid var(--rule)", margin: "0 0 24px 0" }} />

        {/* Add button */}
        {!showAdd && (
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              width: "100%",
              padding: "14px 16px",
              background: "transparent",
              border: "1px dashed var(--rule)",
              cursor: "pointer",
              fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
              fontSize: 12,
              fontWeight: 500,
              color: "var(--charcoal)",
              letterSpacing: "0.04em",
              marginBottom: 24,
              transition: "border-color 200ms ease-out, color 200ms ease-out",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "var(--ink)";
              e.currentTarget.style.color = "var(--ink)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--rule)";
              e.currentTarget.style.color = "var(--charcoal)";
            }}
          >
            <span style={{ fontSize: 16 }} aria-hidden>+</span>
            <span>Save a new sheet</span>
          </button>
        )}

        {/* Add form */}
        {showAdd && (
          <div
            style={{
              border: "1px solid var(--rule)",
              padding: "20px 16px",
              marginBottom: 24,
              background: "var(--paper)",
            }}
          >
            <p
              style={{
                fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                fontWeight: 500,
                fontSize: 10,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "var(--charcoal)",
                margin: "0 0 16px 0",
              }}
            >
              Save a sheet
            </p>

            <div style={{ marginBottom: 14 }}>
              <label
                htmlFor="save-title"
                style={{
                  display: "block",
                  fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                  fontWeight: 500,
                  fontSize: 10,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: "var(--stone)",
                  marginBottom: 6,
                }}
              >
                Name
              </label>
              <input
                id="save-title"
                type="text"
                value={addTitle}
                onChange={(e) => setAddTitle(e.target.value)}
                placeholder="e.g. Attendance Sheet, Sales Data"
                style={{
                  width: "100%",
                  fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                  fontSize: 13,
                  color: "var(--ink)",
                  background: "transparent",
                  border: 0,
                  borderBottom: "1.5px solid var(--rule)",
                  padding: "8px 0",
                  outline: "none",
                }}
                onFocus={(e) => { e.currentTarget.style.borderBottomColor = "var(--ink)"; }}
                onBlur={(e) => { e.currentTarget.style.borderBottomColor = "var(--rule)"; }}
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label
                htmlFor="save-url"
                style={{
                  display: "block",
                  fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                  fontWeight: 500,
                  fontSize: 10,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: "var(--stone)",
                  marginBottom: 6,
                }}
              >
                Google Sheet URL
              </label>
              <input
                id="save-url"
                type="url"
                inputMode="url"
                value={addUrl}
                onChange={(e) => setAddUrl(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/..."
                style={{
                  width: "100%",
                  fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                  fontSize: 13,
                  color: "var(--ink)",
                  background: "transparent",
                  border: 0,
                  borderBottom: "1.5px solid var(--rule)",
                  padding: "8px 0",
                  outline: "none",
                }}
                onFocus={(e) => { e.currentTarget.style.borderBottomColor = "var(--ink)"; }}
                onBlur={(e) => { e.currentTarget.style.borderBottomColor = "var(--rule)"; }}
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label
                htmlFor="save-worksheet"
                style={{
                  display: "block",
                  fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                  fontWeight: 500,
                  fontSize: 10,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: "var(--stone)",
                  marginBottom: 6,
                }}
              >
                Worksheet tab (optional)
              </label>
              <input
                id="save-worksheet"
                type="text"
                value={addWorksheet}
                onChange={(e) => setAddWorksheet(e.target.value)}
                placeholder="Sheet1"
                style={{
                  width: "100%",
                  fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                  fontSize: 13,
                  color: "var(--ink)",
                  background: "transparent",
                  border: 0,
                  borderBottom: "1.5px solid var(--rule)",
                  padding: "8px 0",
                  outline: "none",
                }}
                onFocus={(e) => { e.currentTarget.style.borderBottomColor = "var(--ink)"; }}
                onBlur={(e) => { e.currentTarget.style.borderBottomColor = "var(--rule)"; }}
              />
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <SubmitButton
                label={saving ? "Saving..." : "Save"}
                submitting={saving}
                onClick={handleSave}
                disabled={!addUrl.trim() || !addTitle.trim()}
              />
              <button
                type="button"
                onClick={() => { setShowAdd(false); setAddUrl(""); setAddTitle(""); setAddWorksheet(""); }}
                style={{
                  fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                  fontSize: 11,
                  fontWeight: 500,
                  color: "var(--stone)",
                  background: "none",
                  border: "1px solid var(--rule)",
                  padding: "8px 14px",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Sheets list */}
        {!loading && sheets.length === 0 && (
          <div style={{ textAlign: "center", padding: "40px 20px" }}>
            <p
              style={{
                fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                fontSize: 12,
                color: "var(--stone)",
              }}
            >
              No saved sheets yet. Save one to get started.
            </p>
          </div>
        )}

        {sheets.length > 0 && (
          <div style={{ border: "1px solid var(--rule)" }}>
            {sheets.map((sheet, idx) => (
              <div
                key={sheet.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "14px 16px",
                  borderBottom: idx < sheets.length - 1 ? "1px solid var(--rule)" : "none",
                  transition: "background-color 200ms ease-out",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--paper)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                {/* Icon */}
                <span
                  style={{
                    fontSize: 16,
                    color: "var(--stone)",
                    flexShrink: 0,
                    width: 20,
                    textAlign: "center",
                  }}
                  aria-hidden
                >
                  ☰
                </span>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  {renamingId === sheet.id ? (
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <input
                        type="text"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleRename(sheet.id);
                          if (e.key === "Escape") { setRenamingId(null); setRenameValue(""); }
                        }}
                        autoFocus
                        style={{
                          flex: 1,
                          fontFamily: "var(--font-newsreader), Georgia, serif",
                          fontSize: 14,
                          color: "var(--ink)",
                          background: "transparent",
                          border: 0,
                          borderBottom: "1.5px solid var(--ink)",
                          padding: "2px 0",
                          outline: "none",
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => handleRename(sheet.id)}
                        style={{
                          fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                          fontSize: 10,
                          fontWeight: 500,
                          color: "var(--ink)",
                          background: "none",
                          border: "1px solid var(--rule)",
                          padding: "4px 8px",
                          cursor: "pointer",
                        }}
                      >
                        ✓
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => openSheet(sheet)}
                      style={{
                        display: "block",
                        width: "100%",
                        textAlign: "left",
                        background: "none",
                        border: 0,
                        padding: 0,
                        cursor: "pointer",
                      }}
                    >
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
                        {sheet.title}
                      </p>
                      <p
                        style={{
                          fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                          fontWeight: 300,
                          fontSize: 10,
                          letterSpacing: "0.04em",
                          color: "var(--stone)",
                          margin: "2px 0 0 0",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {sheet.worksheet_name ? `${sheet.worksheet_name} · ` : ""}
                        saved {formatDate(sheet.saved_at)}
                      </p>
                    </button>
                  )}
                </div>

                {/* Actions */}
                {renamingId !== sheet.id && (
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <button
                      type="button"
                      onClick={() => { setRenamingId(sheet.id); setRenameValue(sheet.title); }}
                      title="Rename"
                      style={{
                        background: "none",
                        border: 0,
                        cursor: "pointer",
                        padding: "4px 6px",
                        fontSize: 12,
                        color: "var(--stone)",
                      }}
                      aria-label="Rename sheet"
                    >
                      ✎
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(sheet.id)}
                      title="Remove"
                      style={{
                        background: "none",
                        border: 0,
                        cursor: "pointer",
                        padding: "4px 6px",
                        fontSize: 12,
                        color: "var(--error, #c0392b)",
                      }}
                      aria-label="Remove saved sheet"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Open In modal */}
      {openInSheet && (
        <OpenInModal
          sheetTitle={openInSheet.title}
          onSelect={handleOpenInSelect}
          onClose={() => setOpenInSheet(null)}
        />
      )}

      <ErrorToast message={error} onDismiss={() => setError(null)} />
    </div>
  );
}
