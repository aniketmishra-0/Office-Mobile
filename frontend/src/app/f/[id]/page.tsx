"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import LoadingOverlay from "@/components/LoadingOverlay";
import ErrorToast from "@/components/ErrorToast";
import SuccessScreen from "@/components/SuccessScreen";
import DynamicForm from "@/components/DynamicForm";
import SubmitButton from "@/components/SubmitButton";
import { submitForm, getPublicForm, getFormSuggestions } from "@/lib/api";
import { saveOfflineSubmission, getOfflineSubmissions, removeOfflineSubmission } from "@/lib/sync";
import type { PublicFormResponse } from "@/types/field";

export default function FillFormPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState<PublicFormResponse | null>(null);
  const [suggestions, setSuggestions] = useState<Record<string, string>[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [isOffline, setIsOffline] = useState(false);
  const [syncing, setSyncing] = useState(false);
  // Track whether suggestions have been fetched. We defer this expensive
  // call (up to 10k sheet rows) until the user actually opens autofill.
  const suggestionsRequested = useRef(false);

  const syncPendingSubmissions = useCallback(async () => {
    if (syncing) return;
    try {
      setSyncing(true);
      const pending = await getOfflineSubmissions();
      if (pending.length === 0) return;
      
      for (const sub of pending) {
        try {
          await submitForm(sub.formId, sub.values);
          await removeOfflineSubmission(sub.id);
        } catch (err) {
          console.error("Failed to sync offline submission", err);
          // Keep in queue if it failed to submit
        }
      }
    } finally {
      setSyncing(false);
    }
  }, [syncing]);

  useEffect(() => {
    // Initial offline check
    setIsOffline(!navigator.onLine);

    const handleOnline = () => {
      setIsOffline(false);
      syncPendingSubmissions();
    };
    const handleOffline = () => setIsOffline(true);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Initial sync check if online
    if (navigator.onLine) {
      syncPendingSubmissions();
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [syncPendingSubmissions]);

  useEffect(() => {
    getPublicForm(id)
      .then((data) => setFormData(data))
      .catch((e) => setError(e.message ?? "Failed to load form"))
      .finally(() => setLoading(false));
  }, [id]);

  // Defer loading suggestions until the user actually opens the autofill
  // panel. For forms with thousands of rows this saves a 1–3 second
  // backend round trip plus a lot of Google Sheets API quota.
  const loadSuggestions = useCallback(async () => {
    if (suggestionsRequested.current) return;
    suggestionsRequested.current = true;
    try {
      const res = await getFormSuggestions(id);
      setSuggestions(res.rows ?? []);
    } catch {
      // Autofill is optional — allow retry on next open.
      suggestionsRequested.current = false;
    }
  }, [id]);

  const handleSubmit = useCallback(
    async (values: Record<string, string>) => {
      setSubmitting(true);
      setError(null);
      try {
        if (!navigator.onLine) {
          // Save offline
          await saveOfflineSubmission(id, values);
          setSubmitted(true);
          return;
        }

        await submitForm(id, values);
        setSubmitted(true);
      } catch (e: any) {
        // If it was a network error during fetch, save offline
        if (e.message?.includes("Failed to fetch") || !navigator.onLine) {
          await saveOfflineSubmission(id, values);
          setSubmitted(true);
        } else {
          setError(e.message ?? "Submission failed. Please try again.");
        }
      } finally {
        setSubmitting(false);
      }
    },
    [id],
  );

  const handleSubmitAnother = useCallback(() => {
    setSubmitted(false);
    setResetKey((k) => k + 1);
  }, []);

  if (loading) {
    return <LoadingOverlay message="Loading form..." />;
  }

  if (!formData && !loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-8 text-center bg-white">
        <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mb-4">
          <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
        </div>
        <h1 className="text-base font-semibold text-gray-900 mb-1.5">Form not found</h1>
        <p className="text-[13px] text-gray-500 mb-6 max-w-[240px]">
          {error ?? "This form doesn't exist or has been removed."}
        </p>
        <a href="/" className="text-accent-600 text-[13px] font-medium">
          Go to Office Mobile →
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
    <div className="flex flex-col min-h-screen bg-white">
      <AppHeader title={formData!.worksheet_name || formData!.form_title} showBack onBack={() => router.push("/")} />
      
      {/* Offline/Sync Banner */}
      {(isOffline || syncing) && (
        <div className={`px-4 py-2 flex items-center justify-center gap-2 text-[13px] font-medium transition-colors ${
          isOffline ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-700"
        }`}>
          {isOffline ? (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3l18 18M18.364 5.636a9 9 0 00-12.728 0M16 12a5 9 0 00-8 0" />
              </svg>
              You're offline. Submissions will be saved.
            </>
          ) : (
            <>
              <div className="w-3.5 h-3.5 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
              Syncing offline submissions...
            </>
          )}
        </div>
      )}

      <div className="flex-1 px-5 pt-6 pb-20 overflow-y-auto">
        <DynamicForm
          fields={formData!.fields}
          onSubmit={handleSubmit}
          submitting={submitting}
          resetKey={resetKey}
          suggestions={suggestions}
          autofillColumns={formData!.autofill_columns ?? []}
          onAutofillOpen={loadSuggestions}
        />
      </div>
      <SubmitButton submitting={submitting} form="dynamic-form" />
      <ErrorToast message={error} onDismiss={() => setError(null)} />
    </div>
  );
}
