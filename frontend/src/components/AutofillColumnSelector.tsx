"use client";

import React from "react";
import type { FieldSchema } from "@/types/field";

interface Props {
  fields: FieldSchema[];
  selected: string[];
  onChange: (keys: string[]) => void;
}

const MAX_COLUMNS = 5;

/**
 * AutofillColumnSelector — Lets the form creator pick 1–5 columns
 * as "master" filter columns for autofill.
 *
 * When users fill the form, typing in any of these master columns
 * will search existing sheet data and offer to auto-fill the entire row.
 */
export default function AutofillColumnSelector({ fields, selected, onChange }: Props) {
  const sortedFields = [...fields].sort((a, b) => a.order - b.order);

  function toggleColumn(key: string) {
    if (selected.includes(key)) {
      onChange(selected.filter((k) => k !== key));
    } else {
      if (selected.length >= MAX_COLUMNS) return; // Max 5
      onChange([...selected, key]);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <label className="block text-[13px] font-medium text-gray-700">
          Autofill filter columns
        </label>
        <span className="text-[11px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
          {selected.length}/{MAX_COLUMNS}
        </span>
      </div>
      <p className="text-[12px] text-gray-500 mb-3">
        Select up to {MAX_COLUMNS} columns as master filters. When users type in these fields,
        matching entries from the sheet will appear as suggestions to auto-fill the form.
      </p>

      <div className="space-y-1.5">
        {sortedFields.map((field) => {
          const isSelected = selected.includes(field.key);
          const isDisabled = !isSelected && selected.length >= MAX_COLUMNS;

          return (
            <button
              key={field.key}
              type="button"
              onClick={() => toggleColumn(field.key)}
              disabled={isDisabled}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl border text-left transition-all duration-150 ${
                isSelected
                  ? "border-accent-300 bg-accent-50 ring-1 ring-accent-200"
                  : isDisabled
                    ? "border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed"
                    : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
              }`}
            >
              {/* Checkbox */}
              <div
                className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                  isSelected
                    ? "border-accent-500 bg-accent-500"
                    : "border-gray-300 bg-white"
                }`}
              >
                {isSelected && (
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>

              {/* Label */}
              <div className="flex-1 min-w-0">
                <span className={`text-[13px] font-medium truncate block ${
                  isSelected ? "text-accent-700" : "text-gray-700"
                }`}>
                  {field.label}
                </span>
                <span className="text-[11px] text-gray-400">{field.type}</span>
              </div>

              {/* Order badge */}
              {isSelected && (
                <span className="text-[11px] font-bold text-accent-600 bg-accent-100 w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0">
                  {selected.indexOf(field.key) + 1}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {selected.length === 0 && (
        <p className="text-[11px] text-gray-400 mt-2 px-1">
          No columns selected — autofill will be disabled for this form.
        </p>
      )}
    </div>
  );
}
