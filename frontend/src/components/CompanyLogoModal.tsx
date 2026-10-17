"use client";

import React, { useState, useEffect } from "react";
import { getApiBase } from "@/lib/api";
import { getDirectImageUrl } from "@/lib/driveImage";

const API_BASE = getApiBase();

interface Props {
  isOpen: boolean;
  onClose: () => void;
  formId: string;
  folderName?: string;
  currentLogoUrl?: string | null;
  currentTitle?: string;
  currentCompanyName?: string;
  onSave: (payload: { logoUrl: string; formTitle?: string; companyName?: string }) => Promise<void>;
}

export default function CompanyLogoModal({
  isOpen,
  onClose,
  formId,
  folderName,
  currentLogoUrl,
  currentTitle,
  currentCompanyName,
  onSave,
}: Props) {
  const [mode, setMode] = useState<"upload" | "url">("upload");
  const [logoUrl, setLogoUrl] = useState(currentLogoUrl || "");
  const [formTitle, setFormTitle] = useState(currentTitle || "");
  const [companyName, setCompanyName] = useState(currentCompanyName || "");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLogoUrl(currentLogoUrl || "");
    setFormTitle(currentTitle || "");
    setCompanyName(currentCompanyName || "");
    setError(null);
  }, [currentLogoUrl, currentTitle, currentCompanyName, isOpen]);

  if (!isOpen) return null;

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);
    const formData = new FormData();
    formData.append("file", file);
    // Use a clean Drive folder name — never raw tab codes
    formData.append("folder_name", formTitle || "OfficeMobile Forms");
    if (formId) formData.append("form_id", formId);

    try {
      const headers: Record<string, string> = {};
      const sessionKey = typeof window !== "undefined" ? window.localStorage.getItem("om_session") : null;
      if (sessionKey) headers["X-Session-Key"] = sessionKey;

      const res = await fetch(`${API_BASE}/api/upload`, {
        method: "POST",
        body: formData,
        credentials: "include",
        headers,
      });

      if (!res.ok) {
        let errMsg = "Upload failed";
        try {
          const errData = await res.json();
          errMsg = errData.detail || errMsg;
        } catch {}
        throw new Error(errMsg);
      }

      const data = await res.json();
      if (!data.url) throw new Error("No URL returned from upload");
      setLogoUrl(data.url);
    } catch (err: any) {
      setError(err?.message || "Failed to upload logo to Google Drive.");
    } finally {
      setUploading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await onSave({
        logoUrl: logoUrl.trim(),
        formTitle: formTitle.trim() || undefined,
        companyName: companyName.trim() || undefined,
      });
      onClose();
    } catch (err: any) {
      setError(err?.message || "Failed to save branding.");
    } finally {
      setSaving(false);
    }
  }

  const directPreview = getDirectImageUrl(logoUrl);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white dark:bg-[#1E1B18] border border-black/10 dark:border-white/10 shadow-2xl p-6 text-left relative overflow-hidden max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        style={{ color: "var(--ink, #1A1714)" }}
      >
        <div className="flex items-center justify-between pb-3 border-b border-black/5 dark:border-white/5">
          <div className="flex items-center gap-2">
            <span className="text-xl">🏢</span>
            <h3 className="text-base font-bold font-serif">Form Branding & Logo</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 text-lg leading-none cursor-pointer p-1"
          >
            ✕
          </button>
        </div>

        <p className="text-xs text-stone-500 dark:text-stone-400 mt-2.5 leading-relaxed">
          Customize your form title, company name, and logo. Files stream directly to your Google Drive — never saved on our server.
        </p>

        {/* Form Title & Company Name */}
        <div className="mt-4 space-y-3">
          <div>
            <label className="text-[11px] font-mono uppercase tracking-wider text-stone-500 dark:text-stone-400 block mb-1">
              Form / Position Title
            </label>
            <input
              type="text"
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              placeholder="e.g. Job Application, Software Engineer"
              className="w-full text-sm font-semibold px-3 py-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-black/30 outline-none focus:border-clay"
            />
          </div>
          <div>
            <label className="text-[11px] font-mono uppercase tracking-wider text-stone-500 dark:text-stone-400 block mb-1">
              Company / Organization Name (Optional)
            </label>
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="e.g. Acme Corp, Tech Innovations"
              className="w-full text-xs px-3 py-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-black/30 outline-none focus:border-clay"
            />
          </div>
        </div>

        {/* Live Logo Preview Badge */}
        {directPreview ? (
          <div className="my-4 p-4 rounded-xl bg-stone-50 dark:bg-black/30 border border-stone-200 dark:border-stone-800 flex flex-col items-center justify-center gap-2">
            <div className="relative p-2 rounded-xl bg-white dark:bg-zinc-900 border border-black/10 dark:border-white/10 shadow-xs max-h-20 max-w-[200px] flex items-center justify-center overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={directPreview}
                alt="Logo Preview"
                className="max-h-16 max-w-full object-contain"
                onError={() => setError("Could not load preview. Ensure the image is public or valid.")}
              />
            </div>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">✓ Logo Ready</span>
              <button
                type="button"
                onClick={() => setLogoUrl("")}
                className="text-[11px] text-red-500 hover:underline cursor-pointer"
              >
                Remove
              </button>
            </div>
          </div>
        ) : (
          <div className="my-4 p-3 rounded-xl bg-stone-50 dark:bg-black/20 border border-dashed border-stone-300 dark:border-stone-700 text-center text-xs text-stone-400">
            No logo currently set
          </div>
        )}

        {/* Mode Selector */}
        <div className="flex rounded-lg bg-stone-100 dark:bg-stone-900 p-1 text-xs font-medium mb-3">
          <button
            type="button"
            onClick={() => setMode("upload")}
            className={`flex-1 py-1.5 rounded-md transition-all cursor-pointer ${
              mode === "upload"
                ? "bg-white dark:bg-stone-800 text-zinc-900 dark:text-zinc-100 shadow-2xs font-semibold"
                : "text-stone-500 hover:text-zinc-800 dark:hover:text-zinc-200"
            }`}
          >
            Upload to Google Drive
          </button>
          <button
            type="button"
            onClick={() => setMode("url")}
            className={`flex-1 py-1.5 rounded-md transition-all cursor-pointer ${
              mode === "url"
                ? "bg-white dark:bg-stone-800 text-zinc-900 dark:text-zinc-100 shadow-2xs font-semibold"
                : "text-stone-500 hover:text-zinc-800 dark:hover:text-zinc-200"
            }`}
          >
            Paste Image URL
          </button>
        </div>

        {/* Mode 1: Upload */}
        {mode === "upload" && (
          <div className="space-y-2">
            <label className="relative flex flex-col items-center justify-center p-6 border-2 border-dashed border-stone-300 dark:border-stone-700 hover:border-clay rounded-xl cursor-pointer transition-all bg-stone-50/50 dark:bg-black/10">
              <input
                type="file"
                accept="image/png,image/jpeg,image/svg+xml,image/webp,image/gif"
                onChange={handleFileUpload}
                disabled={uploading}
                className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
              />
              {uploading ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="w-5 h-5 border-2 border-clay border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs font-medium text-clay">Uploading to your Google Drive...</span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-1.5 text-center">
                  <span className="text-2xl">📁</span>
                  <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                    Tap to select PNG, SVG, or JPG
                  </span>
                  <span className="text-[11px] text-stone-400">
                    Saves directly into your personal Google Drive
                  </span>
                </div>
              )}
            </label>
          </div>
        )}

        {/* Mode 2: Paste URL */}
        {mode === "url" && (
          <div className="space-y-1.5">
            <label className="text-[11px] font-mono uppercase tracking-wider text-stone-500">
              Image URL (Web or Drive link)
            </label>
            <input
              type="url"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://company.com/logo.png"
              className="w-full text-xs font-mono px-3 py-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-black/30 outline-none focus:border-clay"
            />
            <span className="text-[10px] text-stone-400">
              Paste any public company logo or Google Drive image link.
            </span>
          </div>
        )}

        {error && (
          <p className="mt-3 text-xs text-red-500 font-medium">✕ {error}</p>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2.5 mt-6 pt-3 border-t border-black/5 dark:border-white/5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || uploading}
            className="px-5 py-2 rounded-lg text-xs font-bold uppercase tracking-wider bg-clay text-white hover:opacity-90 active:scale-95 transition-all shadow-xs cursor-pointer disabled:opacity-50"
          >
            {saving ? "Saving..." : "Apply Branding"}
          </button>
        </div>
      </div>
    </div>
  );
}
