"use client";

import React, { useState } from "react";
import type { CustomKeywordRule, FieldType } from "@/types/field";

interface Props {
  rules: CustomKeywordRule[];
  onChange: (rules: CustomKeywordRule[]) => void;
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
};

const BUILTIN_PREVIEW: { keyword: string; type: string }[] = [
  { keyword: "email", type: "email" },
  { keyword: "phone/mobile", type: "tel" },
  { keyword: "date/dob", type: "date" },
  { keyword: "amount/price", type: "number" },
  { keyword: "notes/address", type: "textarea" },
];

export default function KeywordRulesEditor({ rules, onChange }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-xl border border-gray-150 overflow-hidden">
      {/* Header toggle */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-4 py-3.5 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center">
            <svg className="w-3.5 h-3.5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
            </svg>
          </div>
          <div>
            <p className="font-medium text-gray-900 text-sm">Field detection rules</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {rules.length > 0 ? `${rules.length} custom rule${rules.length !== 1 ? "s" : ""}` : "Customize how columns map to types"}
            </p>
          </div>
        </div>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {open && (
        <div className="border-t border-gray-100 px-4 py-4 space-y-3 animate-fade-in">
          {/* Built-in rules preview */}
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2">Built-in detection</p>
            <div className="flex flex-wrap gap-1.5">
              {BUILTIN_PREVIEW.map((r) => (
                <span
                  key={r.keyword}
                  className="text-[11px] bg-gray-50 text-gray-500 px-2 py-1 rounded-md border border-gray-100"
                >
                  {r.keyword} → {r.type}
                </span>
              ))}
            </div>
          </div>

          {/* Custom rules */}
          {rules.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-500">Your rules</p>
              {rules.map((rule, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input
                    type="text"
                    value={rule.keyword}
                    onChange={(e) => {
                      const updated = [...rules];
                      updated[i] = { ...updated[i], keyword: e.target.value.toLowerCase() };
                      onChange(updated);
                    }}
                    placeholder="keyword"
                    className="flex-1 rounded-lg border border-gray-200 px-3 py-2.5 text-sm min-h-[44px] focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent"
                  />
                  <select
                    value={rule.type}
                    onChange={(e) => {
                      const updated = [...rules];
                      updated[i] = { ...updated[i], type: e.target.value as FieldType };
                      onChange(updated);
                    }}
                    className="rounded-lg border border-gray-200 px-2 py-2.5 text-sm min-h-[44px] focus:outline-none focus:ring-2 focus:ring-accent-500"
                  >
                    {(Object.keys(TYPE_LABELS) as FieldType[]).map((t) => (
                      <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => onChange(rules.filter((_, idx) => idx !== i))}
                    aria-label="Remove rule"
                    className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={() => onChange([...rules, { keyword: "", type: "text" }])}
            className="w-full flex items-center justify-center gap-1.5 border border-dashed border-gray-200 text-gray-500 rounded-lg py-2.5 text-sm font-medium hover:border-accent-300 hover:text-accent-600 hover:bg-accent-50/50 transition-colors min-h-[44px]"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add rule
          </button>
        </div>
      )}
    </div>
  );
}
