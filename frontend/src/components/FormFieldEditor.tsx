"use client";

import React, { useMemo } from "react";
import type { FieldSchema, FieldType } from "@/types/field";
import MobileDropdown from "./MobileDropdown";

interface Props {
  fields: FieldSchema[];
  onChange: (fields: FieldSchema[]) => void;
  autofillColumns?: string[];
  onAutofillChange?: (columns: string[]) => void;
}

const TYPE_LABELS: Record<FieldType, string> = {
  text: "Short Text",
  tel: "Phone",
  email: "Email",
  date: "Date",
  time: "Time",
  number: "Number",
  textarea: "Long Text",
  url: "URL",
  file: "File Upload",
  checkbox: "Checkbox",
};

export default function FormFieldEditor({ fields, onChange, autofillColumns = [], onAutofillChange }: Props) {
  const sortedFields = useMemo(
    () => [...fields].sort((a, b) => a.order - b.order),
    [fields],
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-950">Form fields</h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            {fields.length} fields detected
            {onAutofillChange && autofillColumns.length > 0 && (
              <span className="text-blue-500"> · {autofillColumns.length} filter{autofillColumns.length > 1 ? "s" : ""} selected</span>
            )}
          </p>
        </div>
      </div>

      <div className="space-y-2.5">
        {sortedFields.map((field) => {
          const fieldIndex = fields.findIndex((f) => f.key === field.key);
          return (
            <div
              key={field.key}
              className="rounded-lg border border-zinc-200 bg-white p-3.5 hover:border-zinc-300 transition-colors"
            >
              {/* Header row: label + source */}
              <div className="flex items-start justify-between gap-2 mb-3">
                <input
                  type="text"
                  value={field.label}
                  onChange={(e) => {
                    const updated = [...fields];
                    updated[fieldIndex] = { ...updated[fieldIndex], label: e.target.value };
                    onChange(updated);
                  }}
                  className="flex-1 text-sm font-medium text-zinc-950 bg-transparent border-0 p-0 focus:outline-none focus:ring-0 placeholder:text-zinc-300"
                  placeholder="Field label"
                />
                <span className="text-[10px] bg-zinc-100 text-zinc-500 px-1.5 py-0.5 rounded font-mono flex-shrink-0">
                  {field.source_header}
                </span>
              </div>

              {/* Controls row */}
              <div className="flex items-center gap-2.5">
                <div className="flex-1">
                  <MobileDropdown
                    size="sm"
                    value={field.type}
                    options={(Object.keys(TYPE_LABELS) as FieldType[]).map((t) => ({ value: t, label: TYPE_LABELS[t] }))}
                    onChange={(val) => {
                      const updated = [...fields];
                      updated[fieldIndex] = { ...updated[fieldIndex], type: val as FieldType };
                      onChange(updated);
                    }}
                  />
                </div>

                {/* Required toggle */}
                <button
                  type="button"
                  onClick={() => {
                    const updated = [...fields];
                    updated[fieldIndex] = { ...updated[fieldIndex], required: !field.required };
                    onChange(updated);
                  }}
                  className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-colors min-h-[36px] ${
                    field.required
                      ? "bg-zinc-950 text-white border border-zinc-950"
                      : "bg-zinc-50 text-zinc-500 border border-zinc-200 hover:text-zinc-800"
                  }`}
                >
                  <div className={`w-3 h-3 rounded-sm border-2 flex items-center justify-center transition-colors ${
                    field.required ? "border-white bg-white" : "border-zinc-300"
                  }`}>
                    {field.required && (
                      <svg className="w-2 h-2 text-zinc-950" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </div>
                  Required
                </button>

                {/* Filter/Autofill toggle */}
                {onAutofillChange && (
                  <button
                    type="button"
                    onClick={() => {
                      if (!onAutofillChange) return;
                      const isSelected = autofillColumns.includes(field.key);
                      if (isSelected) {
                        onAutofillChange(autofillColumns.filter((k) => k !== field.key));
                      } else {
                        if (autofillColumns.length >= 5) return;
                        onAutofillChange([...autofillColumns, field.key]);
                      }
                    }}
                    title={autofillColumns.includes(field.key) ? "Remove from autofill filters" : "Add as autofill filter"}
                    className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-colors min-h-[36px] ${
                      autofillColumns.includes(field.key)
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : "bg-zinc-50 text-zinc-500 border border-zinc-200 hover:text-zinc-800"
                    }`}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" />
                    </svg>
                    Filter
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
