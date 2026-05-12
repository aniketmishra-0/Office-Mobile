"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useSearchParams } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import LoadingOverlay from "@/components/LoadingOverlay";
import ErrorToast from "@/components/ErrorToast";
import FormFieldEditor from "@/components/FormFieldEditor";
import KeywordRulesEditor from "@/components/KeywordRulesEditor";
import AutofillColumnSelector from "@/components/AutofillColumnSelector";
import SubmitButton from "@/components/SubmitButton";
import { getEditForm, updateForm, previewSheet } from "@/lib/api";
import type { EditFormResponse, FieldSchema, CustomKeywordRule } from "@/types/field";

export default function EditFormPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params.id as string;
  const token = searchParams.get("token") ?? "";

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formData, setFormData] = useState<EditFormResponse | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [fields, setFields] = useState<FieldSchema[]>([]);
  const [rules, setRules] = useState<CustomKeywordRule[]>([]);
  const [autofillColumns, setAutofillColumns] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reapplying, setReapplying] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const manuallyChangedTypes = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!token) {
      setLoadError("Missing edit token. Use the edit link you received when creating the form.");
      setLoading(false);
      return;
    }
    getEditForm(id, token)
      .then((data) => {
        setFormData(data);
        setFormTitle(data.form_title);
        setFields(data.fields);
        setRules(data.custom_keywords);
        setAutofillColumns(data.autofill_columns ?? []);
      })
      .catch((e) => setLoadError(e.message ?? "Failed to load form"))
      .finally(() => setLoading(false));
  }, [id, token]);

  function handleFieldChange(updated: FieldSchema[]) {
    updated.forEach((updatedField) => {
      const original = fields.find((f) => f.key === updatedField.key);
      if (original && original.type !== updatedField.type) {
        manuallyChangedTypes.current.add(updatedField.key);
      }
    });
    setFields(updated);
  }

  async function handleReapply() {
    if (!formData) return;
    setReapplying(true);
    setError(null);
    try {
      const fresh = await previewSheet(formData.sheet_url, formData.worksheet_name, rules);
      setFields((prev) =>
        prev.map((existing) => {
          if (manuallyChangedTypes.current.has(existing.key)) return existing;
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

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await updateForm(id, {
        edit_token: token,
        form_title: formTitle,
        fields,
        custom_keywords: rules,
        autofill_columns: autofillColumns,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e: any) {
      setError(e.message ?? "Failed to save changes");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingOverlay message="Loading editor..." />;

  if (loadError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-8 text-center bg-white">
        <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mb-4">
          <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
          </svg>
        </div>
        <h1 className="text-base font-semibold text-gray-900 mb-1.5">Cannot open editor</h1>
        <p className="text-[13px] text-gray-500 mb-6 max-w-[260px]">{loadError}</p>
        <a href="/" className="text-accent-600 text-[13px] font-medium">
          Go to Office Mobile →
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-white">
      <AppHeader title="Edit form" showBack onBack={() => window.location.href = "/"} />
      {reapplying && <LoadingOverlay message="Updating fields..." />}

      {/* Saved toast */}
      {saved && (
        <div className="fixed top-14 left-4 right-4 max-w-[448px] mx-auto z-50 animate-fade-in">
          <div className="bg-gray-900 text-white rounded-xl px-4 py-3 flex items-center gap-2.5 shadow-medium">
            <svg className="w-4 h-4 text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            <span className="text-sm font-medium">Changes saved</span>
          </div>
        </div>
      )}

      <div className="flex-1 px-5 pt-5 pb-32 space-y-5">
        {/* Warnings */}
        {warnings.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3.5">
            <p className="text-[13px] font-medium text-amber-800 mb-1">Heads up</p>
            {warnings.map((w, i) => (
              <p key={i} className="text-[12px] text-amber-600">{w}</p>
            ))}
          </div>
        )}

        {/* Form title */}
        <div>
          <label className="block text-[13px] font-medium text-gray-700 mb-2">Form title</label>
          <input
            type="text"
            value={formTitle}
            onChange={(e) => setFormTitle(e.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-[15px] min-h-[48px] focus:outline-none focus:ring-2 focus:ring-accent-500"
          />
        </div>

        {/* Field editor */}
        <FormFieldEditor
          fields={fields}
          onChange={handleFieldChange}
          autofillColumns={autofillColumns}
          onAutofillChange={setAutofillColumns}
        />

        {/* Keyword rules + re-apply */}
        <div className="space-y-2.5">
          <KeywordRulesEditor rules={rules} onChange={setRules} />
          {rules.length > 0 && (
            <button
              type="button"
              onClick={handleReapply}
              disabled={reapplying}
              className="w-full flex items-center justify-center gap-1.5 border border-gray-200 text-gray-600 rounded-xl py-2.5 text-[13px] font-medium hover:bg-gray-50 transition-colors min-h-[40px] disabled:opacity-50"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
              Re-apply rules
            </button>
          )}
        </div>

        {/* Autofill column selector */}
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <AutofillColumnSelector
            fields={fields}
            selected={autofillColumns}
            onChange={setAutofillColumns}
          />
        </div>

        {/* Sheet info */}
        {formData && (
          <div className="rounded-xl border border-gray-100 bg-gray-50/50 p-3.5">
            <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide mb-1.5">Connected sheet</p>
            <p className="text-[12px] text-gray-500 break-all font-mono">{formData.sheet_url}</p>
            {formData.worksheet_name && (
              <p className="text-[12px] text-gray-400 mt-1">Tab: {formData.worksheet_name}</p>
            )}
          </div>
        )}
      </div>

      <SubmitButton label="Save changes" submitting={saving} onClick={handleSave} />
      <ErrorToast message={error} onDismiss={() => setError(null)} />
    </div>
  );
}
