"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import LoadingOverlay from "@/components/LoadingOverlay";
import ErrorToast from "@/components/ErrorToast";
import SuccessScreen from "@/components/SuccessScreen";
import DynamicForm from "@/components/DynamicForm";
import type { DynamicFormHandle } from "@/components/DynamicForm";
import SubmitButton from "@/components/SubmitButton";
import FormThemeWrapper from "@/components/FormThemeWrapper";
import { submitForm, getPublicForm, getFormSuggestions, getAiSuggestions } from "@/lib/api";
import { safeBack } from "@/lib/navigation";
import type { AiSuggestionsResponse } from "@/lib/api";
import type { PublicFormResponse } from "@/types/field";
import AiAutofillBanner from "@/components/AiAutofillBanner";

export default function FillFormPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState<PublicFormResponse | null>(null);
  const [suggestions, setSuggestions] = useState<Record<string, string>[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  // AI Auto-Fill state
  const [aiData, setAiData] = useState<AiSuggestionsResponse | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  // Track whether suggestions have been fetched. We defer this expensive
  // call (up to 10k sheet rows) until the user actually opens autofill.
  const suggestionsRequested = useRef(false);

  useEffect(() => {
    getPublicForm(id)
      .then((data) => setFormData(data))
      .catch((e) => setError(e.message ?? "Failed to load form"))
      .finally(() => setLoading(false));
  }, [id]);

  // Load AI suggestions as soon as the form is loaded
  const loadAiSuggestions = useCallback(async () => {
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await getAiSuggestions(id);
      setAiData(res);
    } catch (e: any) {
      setAiError(e?.message ?? "Could not load AI suggestions.");
    } finally {
      setAiLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (formData) {
      void loadAiSuggestions();
    }
  }, [formData, loadAiSuggestions]);

  // Defer loading suggestions until the user actually opens the autofill
  // panel. For forms with thousands of rows this saves a 1–3 second
  // backend round trip plus a lot of Google Sheets API quota.
  const loadSuggestions = useCallback(async () => {
    if (suggestionsRequested.current) return;
    suggestionsRequested.current = true;
    setSuggestionsLoading(true);
    setSuggestionsError(null);
    try {
      const res = await getFormSuggestions(id);
      setSuggestions(res.rows ?? []);
    } catch (e: any) {
      // Autofill is optional — allow retry on next open.
      suggestionsRequested.current = false;
      setSuggestionsError(e?.message ?? "Could not load past entries.");
    } finally {
      setSuggestionsLoading(false);
    }
  }, [id]);

  // Pre-load suggestions as soon as the form is known to have filterable
  // columns. Without this, users who type directly into a filter field
  // (without tapping the autofill bar first) would see an empty state.
  useEffect(() => {
    if (formData && (formData.autofill_columns?.length ?? 0) > 0) {
      void loadSuggestions();
    }
  }, [formData, loadSuggestions]);

  const handleSubmit = useCallback(
    async (values: Record<string, string>) => {
      setSubmitting(true);
      setError(null);
      try {
        await submitForm(id, values);
        setSubmitted(true);
      } catch (e: any) {
        setError(e.message ?? "Submission failed. Please try again.");
      } finally {
        setSubmitting(false);
      }
    },
    [id],
  );

  // AI Auto-Fill: apply predicted values to the form via a ref callback
  const formRef = useRef<DynamicFormHandle | null>(null);
  const handleAiApply = useCallback((values: Record<string, string>) => {
    formRef.current?.applyValues(values);
  }, []);

  const handleSubmitAnother = useCallback(() => {
    setSubmitted(false);
    setResetKey((k) => k + 1);
  }, []);

  if (loading) {
    return <LoadingOverlay message="Loading form..." />;
  }

  if (!formData && !loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-8 text-center bg-zinc-100">
        <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mb-4">
          <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
        </div>
        <h1 className="text-base font-semibold text-zinc-950 mb-1.5">Form not found</h1>
        <p className="text-[13px] text-zinc-600 mb-6 max-w-[240px]">
          {error ?? "This form doesn't exist or has been removed."}
        </p>
        <a href="/" className="text-zinc-900 text-[13px] font-medium">
          Go to Office Mobile
        </a>
      </div>
    );
  }

  if (submitted) {
    return (
      <SuccessScreen
        formTitle={formData!.form_title}
        onSubmitAnother={handleSubmitAnother}
      />
    );
  }

  return (
    <FormThemeWrapper designId={formData!.ui_config?.design}>
      <div className="flex flex-col min-h-screen">
        <AppHeader title={formData!.worksheet_name || formData!.form_title} showBack onBack={() => safeBack(router)} />

        <div className="flex-1 w-full max-w-[560px] mx-auto px-5 pt-8 pb-8 overflow-y-auto">
          {/* Form Description / JD */}
          {formData!.description && (
            <div className="mb-6 rounded-lg border border-zinc-200 bg-white p-4">
              <p className="text-[11px] font-medium text-zinc-500 uppercase tracking-wide mb-2">Description</p>
              <p className="text-[14px] text-zinc-700 leading-relaxed whitespace-pre-wrap">{formData!.description}</p>
            </div>
          )}

          <AiAutofillBanner
            fields={formData!.fields}
            aiData={aiData}
            loading={aiLoading}
            error={aiError}
            onApply={handleAiApply}
            onRetry={loadAiSuggestions}
          />
          <DynamicForm
            ref={formRef}
            fields={formData!.fields}
            onSubmit={handleSubmit}
            submitting={submitting}
            resetKey={resetKey}
            suggestions={suggestions}
            suggestionsLoading={suggestionsLoading}
            suggestionsError={suggestionsError}
            autofillColumns={formData!.autofill_columns ?? []}
            onAutofillOpen={loadSuggestions}
            onRetrySuggestions={() => {
              suggestionsRequested.current = false;
              void loadSuggestions();
            }}
            folderName={formData!.worksheet_name || formData!.form_title}
          />
        </div>
        <SubmitButton submitting={submitting} form="dynamic-form" />
        <ErrorToast message={error} onDismiss={() => setError(null)} />
      </div>
    </FormThemeWrapper>
  );
}
