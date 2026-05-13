"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FieldSchema } from "@/types/field";
import FieldRenderer from "./FieldRenderer";
import AutofillBar from "./AutofillBar";

interface Props {
  fields: FieldSchema[];
  onSubmit: (values: Record<string, string>) => void;
  submitting: boolean;
  resetKey?: number;
  suggestions?: Record<string, string>[];
  autofillColumns?: string[];
  onAutofillOpen?: () => void;
}

export default function DynamicForm({
  fields,
  onSubmit,
  submitting,
  resetKey = 0,
  suggestions = [],
  autofillColumns = [],
  onAutofillOpen,
}: Props) {
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
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    setValues(Object.fromEntries(fields.map((f) => [f.key, ""])));
    setErrors({});
    setTouched(new Set());
    setAutofilled(false);
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
      {/* Progress bar */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[12px] font-medium text-gray-400">
            {filledCount} of {totalCount} filled
          </span>
          <span className="text-[12px] font-medium text-gray-400">
            {Math.round(progress)}%
          </span>
        </div>
        <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-gray-900 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Autofill suggestions */}
      {autofillColumns.length > 0 && !autofilled && (
        <AutofillBar
          fields={sortedFields}
          values={values}
          suggestions={suggestions}
          autofillColumns={autofillColumns}
          onAutofill={handleAutofill}
          onOpen={onAutofillOpen}
        />
      )}

      {/* Autofill notice */}
      {autofilled && (
        <div className="mb-4 px-3 py-2.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 animate-in">
          <svg
            className="w-4 h-4 text-emerald-600 flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-[12px] text-emerald-700 font-medium">
            Auto-filled from existing data · Edit any field below
          </span>
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
            error={errors[field.key]}
            touched={touched.has(field.key)}
          />
        </div>
      ))}
    </form>
  );
}
