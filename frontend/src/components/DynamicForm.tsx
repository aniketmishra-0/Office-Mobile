"use client";

import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import type { FieldSchema } from "@/types/field";
import FieldRenderer from "./FieldRenderer";
import AutofillBar from "./AutofillBar";

interface Props {
  fields: FieldSchema[];
  onSubmit: (values: Record<string, string>) => void;
  submitting: boolean;
  resetKey?: number;
  suggestions?: Record<string, string>[];
  suggestionsLoading?: boolean;
  suggestionsError?: string | null;
  autofillColumns?: string[];
  onAutofillOpen?: () => void;
  onRetrySuggestions?: () => void;
  folderName?: string;
}

export interface DynamicFormHandle {
  applyValues: (values: Record<string, string>) => void;
}

const DynamicForm = forwardRef<DynamicFormHandle, Props>(function DynamicForm({
  fields,
  onSubmit,
  submitting,
  resetKey = 0,
  suggestions = [],
  suggestionsLoading = false,
  suggestionsError = null,
  autofillColumns = [],
  onAutofillOpen,
  onRetrySuggestions,
  folderName,
}, ref) {
  const sortedFields = useMemo(
    () => [...fields].sort((a, b) => a.order - b.order),
    [fields],
  );

  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((f) => [f.key, ""])),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [autofilled, setAutofilled] = useState(false);
  const [activeFilters, setActiveFilters] = useState<string[]>([]);
  const [activeFieldKey, setActiveFieldKey] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // Expose applyValues to parent via ref (for AI Auto-Fill)
  useImperativeHandle(ref, () => ({
    applyValues: (incoming: Record<string, string>) => {
      setValues((prev) => {
        const next = { ...prev };
        for (const [key, val] of Object.entries(incoming)) {
          if (key in next) {
            next[key] = val ?? "";
          }
        }
        return next;
      });
      setErrors({});
      setAutofilled(true);
    },
  }));

  useEffect(() => {
    setValues(Object.fromEntries(fields.map((f) => [f.key, ""])));
    setErrors({});
    setTouched(new Set());
    setAutofilled(false);
    setActiveFilters([]);
    setActiveFieldKey(null);
  }, [resetKey, fields]);

  const handleChange = useCallback((key: string, val: string) => {
    setValues((prev) => ({ ...prev, [key]: val }));
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
    // If user edits after autofill, that's fine — they can change anything
  }, []);

  const handleBlur = useCallback((key: string) => {
    setTouched((prev) => new Set(prev).add(key));
  }, []);

  const handleFocus = useCallback((key: string) => {
    setActiveFieldKey(key);
  }, []);

  const handleAutofill = useCallback((row: Record<string, string>) => {
    setValues((prev) => {
      const next = { ...prev };
      for (const [key, val] of Object.entries(row)) {
        next[key] = val ?? "";
      }
      return next;
    });
    setErrors({});
    setAutofilled(true);
  }, []);

  const autofillMatches = useMemo(() => {
    if (!suggestions.length || !activeFilters.length) return [];

    const typedFilters = activeFilters
      .map((key) => ({ key, value: (values[key] ?? "").trim().toLowerCase() }))
      .filter((entry) => entry.value.length > 0);

    if (typedFilters.length === 0) return suggestions.slice(0, 10);

    const filtered = suggestions.filter((row) =>
      typedFilters.every(({ key, value }) =>
        (row[key] ?? "").toLowerCase().includes(value),
      ),
    );

    const seen = new Set<string>();
    const unique: Record<string, string>[] = [];
    for (const row of filtered) {
      const rowKey = JSON.stringify(row);
      if (!seen.has(rowKey)) {
        seen.add(rowKey);
        unique.push(row);
      }
    }

    return unique.slice(0, 10);
  }, [suggestions, values, activeFilters]);

  const applyAutofillRow = useCallback((row: Record<string, string>) => {
    handleAutofill(row);
  }, [handleAutofill]);

  const handleSubmit = () => {
    if (submitting) return;

    const newErrors: Record<string, string> = {};
    for (const field of sortedFields) {
      if (field.required && !values[field.key]?.trim()) {
        newErrors[field.key] = `${field.label} is required`;
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      setTouched(new Set(Object.keys(newErrors)));
      const firstKey = Object.keys(newErrors)[0];
      const el = formRef.current?.querySelector(`[data-field-key="${firstKey}"]`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    const completeValues: Record<string, string> = {};
    for (const field of fields) {
      completeValues[field.key] = values[field.key] ?? "";
    }
    onSubmit(completeValues);
  };

  // Progress
  const filledCount = sortedFields.filter((f) => values[f.key]?.trim()).length;
  const totalCount = sortedFields.length;
  const progress = totalCount > 0 ? (filledCount / totalCount) * 100 : 0;

  return (
    <form
      id="dynamic-form"
      ref={formRef}
      onSubmit={(e) => {
        e.preventDefault();
        handleSubmit();
      }}
      noValidate
    >
      {/* Progress rule — thin terracotta fill, no percent label */}
      <div className="om-dform-progress" aria-hidden>
        <div
          className="om-dform-progress__fill"
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="om-dform-meta">
        {String(totalCount).padStart(2, "0")} fields · {filledCount} complete
      </p>

      <style jsx>{`
        .om-dform-progress {
          position: relative;
          height: 2px;
          background: var(--rule);
          margin-bottom: 8px;
        }
        .om-dform-progress__fill {
          height: 100%;
          background: var(--clay);
          transition: width 400ms ease-out;
        }
        .om-dform-meta {
          margin: 0 0 24px 0;
          font-family: var(--font-plex-mono), ui-monospace, monospace;
          font-weight: 300;
          font-size: 11px;
          letter-spacing: 0.04em;
          color: var(--stone);
        }
        .om-dform-autofilled {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 14px;
          margin-bottom: 24px;
          border: 1px solid var(--clay);
          font-family: var(--font-plex-mono), ui-monospace, monospace;
          font-weight: 400;
          font-size: 11px;
          letter-spacing: 0.04em;
          color: var(--ink);
          animation: fadeIn 200ms ease-out;
        }
        .om-dform-autofilled__mark {
          color: var(--clay);
          font-family: var(--font-newsreader), Georgia, serif;
          font-size: 14px;
          line-height: 1;
        }
      `}</style>

      {/* Autofill suggestions */}
      {autofillColumns.length > 0 && !autofilled && (
        <AutofillBar
          fields={sortedFields}
          values={values}
          suggestions={suggestions}
          autofillColumns={autofillColumns}
          loading={suggestionsLoading}
          activeFilters={activeFilters}
          onActiveFiltersChange={setActiveFilters}
          resultsPlacement="inline"
          onAutofill={handleAutofill}
          onOpen={onAutofillOpen}
        />
      )}

      {/* Autofill notice */}
      {autofilled && (
        <div className="om-dform-autofilled" role="status">
          <span className="om-dform-autofilled__mark" aria-hidden>✓</span>
          <span>auto-filled from an existing row · edit any field below</span>
        </div>
      )}

      {sortedFields.map((field, index) => (
        <div
          key={field.key}
          data-field-key={field.key}
          className="animate-in"
          style={{ animationDelay: `${index * 30}ms` }}
        >
          <FieldRenderer
            field={field}
            value={values[field.key] ?? ""}
            onChange={handleChange}
            onBlur={handleBlur}
            onFocus={handleFocus}
            error={errors[field.key]}
            touched={touched.has(field.key)}
          />
          {activeFieldKey === field.key && activeFilters.includes(field.key) && (
            <div className="mt-3">
              {suggestionsLoading && (
                <div className="text-center py-3">
                  <p className="text-[12px] text-zinc-500">Loading past entries...</p>
                </div>
              )}

              {!suggestionsLoading && suggestionsError && (
                <div className="text-center py-3">
                  <p className="text-[12px] text-zinc-500">
                    Could not load past entries.
                  </p>
                  {onRetrySuggestions && (
                    <button
                      type="button"
                      onClick={onRetrySuggestions}
                      className="mt-1 text-[11px] font-medium uppercase tracking-[0.12em]"
                      style={{
                        fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                        color: "var(--clay)",
                        background: "transparent",
                        border: 0,
                        cursor: "pointer",
                      }}
                    >
                      retry
                    </button>
                  )}
                </div>
              )}

              {!suggestionsLoading && !suggestionsError && suggestions.length === 0 && (
                <div className="text-center py-3">
                  <p className="text-[12px] text-zinc-500">No previous entries found yet.</p>
                </div>
              )}

              {!suggestionsLoading && !suggestionsError && suggestions.length > 0 && autofillMatches.length === 0 && (
                <div className="text-center py-3">
                  <p className="text-[12px] text-zinc-500">
                    No matching entries found. Try different filter values.
                  </p>
                </div>
              )}

              {!suggestionsLoading && !suggestionsError && autofillMatches.length > 0 && (
                <div className="rounded-lg border border-zinc-200 bg-white overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-100">
                    <span className="text-[11px] font-medium text-zinc-600">
                      {autofillMatches.length} match{autofillMatches.length !== 1 ? "es" : ""}
                    </span>
                  </div>
                  <div className="max-h-[220px] overflow-y-auto">
                    {autofillMatches.map((row, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => applyAutofillRow(row)}
                        className="w-full text-left px-3 py-3 border-b border-zinc-100 last:border-b-0 hover:bg-zinc-50 active:bg-zinc-100"
                      >
                        <div className="flex items-start gap-2">
                          <svg
                            className="w-3.5 h-3.5 text-zinc-300 flex-shrink-0 mt-0.5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={1.5}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776"
                            />
                          </svg>
                          <div className="min-w-0 flex-1 space-y-2">
                            {(() => {
                              const primaryField =
                                sortedFields.find((f) => activeFilters.includes(f.key)) ??
                                sortedFields[0];
                              const primaryValue = primaryField ? (row[primaryField.key] ?? "") : "";

                              if (!primaryField) return null;

                              return (
                                <div className="rounded-md bg-zinc-100 px-2 py-1 text-[11px] text-zinc-600">
                                  <span className="font-medium text-zinc-500">{primaryField.label}:</span>{" "}
                                  <span className={primaryValue ? "text-zinc-900 break-words" : "text-zinc-400 italic"}>
                                    {primaryValue || "-"}
                                  </span>
                                </div>
                              );
                            })()}
                            <div className="flex flex-wrap gap-2">
                              {sortedFields
                                .filter((f) => !activeFilters.includes(f.key))
                                .slice(0, 4)
                                .map((f) => {
                                  const value = row[f.key] ?? "";
                                  return (
                                    <span
                                      key={f.key}
                                      className="inline-flex max-w-full items-start gap-1 rounded-md bg-zinc-100 px-2 py-1 text-[11px] text-zinc-600"
                                    >
                                      <span className="shrink-0 text-zinc-500">{f.label}:</span>
                                      <span className={value ? "text-zinc-900 break-words" : "text-zinc-400 italic"}>
                                        {value || "-"}
                                      </span>
                                    </span>
                                  );
                                })}
                            </div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-zinc-500 px-3 py-2 border-t border-zinc-100">
                    Tap to auto-fill all fields. You can edit any value after.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </form>
  );
});

export default DynamicForm;
