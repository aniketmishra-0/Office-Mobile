"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FieldSchema } from "@/types/field";

interface Props {
  fields: FieldSchema[];
  values: Record<string, string>;
  suggestions: Record<string, string>[];
  autofillColumns: string[];
  loading?: boolean;
  activeFilters?: string[];
  onActiveFiltersChange?: (keys: string[]) => void;
  resultsPlacement?: "bar" | "inline" | "both";
  onAutofill: (row: Record<string, string>) => void;
  onOpen?: () => void;
}

/**
 * AutofillBar — Interactive multi-step filter for autofill.
 *
 * The user can:
 * 1. Tick a column to use as a filter
 * 2. Type a value in that column → results narrow down
 * 3. Tick more columns to add more filters (AND logic)
 * 4. Select a matching row to auto-fill all fields
 *
 * The form creator sets which columns are available for filtering (max 5).
 * The form filler picks which ones to actually use.
 */
export default function AutofillBar({
  fields,
  values,
  suggestions,
  autofillColumns,
  loading = false,
  activeFilters,
  onActiveFiltersChange,
  resultsPlacement = "bar",
  onAutofill,
  onOpen,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [internalFilters, setInternalFilters] = useState<string[]>([]);
  const [showResults, setShowResults] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const filters = activeFilters ?? internalFilters;
  const setFilters = onActiveFiltersChange ?? setInternalFilters;
  const showResultsInBar = resultsPlacement === "bar" || resultsPlacement === "both";

  // Only show columns that the form creator marked as filterable
  const filterableFields = useMemo(
    () => fields.filter((f) => autofillColumns.includes(f.key)),
    [fields, autofillColumns],
  );

  // Toggle a filter column on/off
  const toggleFilter = useCallback((key: string) => {
    setFilters((prev) => {
      if (prev.includes(key)) {
        return prev.filter((k) => k !== key);
      }
      return [...prev, key];
    });
    setShowResults(true);
  }, [setFilters]);

  // Filter suggestions based on active filter columns that have values
  const matches = useMemo(() => {
    if (!suggestions.length || !filters.length) return [];

    // Get typed values in active filter columns
    const typedFilters = filters
      .map((key) => ({ key, value: (values[key] ?? "").trim().toLowerCase() }))
      .filter((entry) => entry.value.length > 0);

    if (typedFilters.length === 0) return suggestions.slice(0, 10);

    // AND logic: all typed filters must match
    const filtered = suggestions.filter((row) => {
      return typedFilters.every(({ key, value }) => {
        const cellValue = (row[key] ?? "").toLowerCase();
        return cellValue.includes(value);
      });
    });

    // Deduplicate
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
  }, [suggestions, values, filters]);

  // Auto-show results when user types in an active filter
  useEffect(() => {
    const hasTypedInFilter = filters.some(
      (key) => (values[key] ?? "").trim().length > 0,
    );
    if (hasTypedInFilter) {
      setShowResults(true);
    }
  }, [values, filters]);

  const handleSelect = useCallback(
    (row: Record<string, string>) => {
      // Only auto-fill fields that are NOT active filters (preserve user's filter input)
      const filteredRow: Record<string, string> = {};
      for (const [key, val] of Object.entries(row)) {
        if (!filters.includes(key)) {
          filteredRow[key] = val;
        }
      }
      // Also fill filter fields that the user hasn't typed in yet
      for (const key of filters) {
        const userVal = (values[key] ?? "").trim();
        if (!userVal && row[key]) {
          filteredRow[key] = row[key];
        }
      }
      onAutofill(filteredRow);
      setShowResults(false);
      setExpanded(false);
    },
    [onAutofill, filters, values],
  );

  // Display label for a row
  const getRowLabel = useCallback(
    (row: Record<string, string>) => {
      const parts: string[] = [];
      // Show active filter values first
      for (const key of filters) {
        const val = row[key];
        if (val?.trim()) parts.push(val.trim());
      }
      // Then other fields
      for (const f of fields) {
        if (filters.includes(f.key)) continue;
        if (parts.length >= 4) break;
        const val = row[f.key];
        if (val?.trim()) parts.push(val.trim());
      }
      return parts.join(" · ");
    },
    [fields, filters],
  );

  // Get field label by key
  const getFieldLabel = useCallback(
    (key: string) => {
      const field = fields.find((f) => f.key === key);
      return field?.label ?? key;
    },
    [fields],
  );

  if (!autofillColumns.length) return null;

  return (
    <div ref={containerRef} className="mb-5">
      {/* Toggle button */}
      <button
        type="button"
        onClick={() => {
          const next = !expanded;
          setExpanded(next);
          // Lazy-load suggestions on first open so large sheets don't
          // pay the round-trip cost unless the user actually wants autofill.
          if (next) onOpen?.();
        }}
        className={`w-full flex items-center gap-2.5 px-4 py-3 rounded-lg border transition-all duration-150 ${
          expanded
            ? "border-zinc-400 bg-white"
            : "border-zinc-200 bg-white hover:bg-zinc-50"
        }`}
      >
        <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${
          expanded ? "bg-zinc-950" : "bg-zinc-200"
        }`}>
          <svg
            className={`w-3.5 h-3.5 ${expanded ? "text-white" : "text-zinc-500"}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M13 10V3L4 14h7v7l9-11h-7z"
            />
          </svg>
        </div>
        <div className="flex-1 text-left">
          <span className={`text-[13px] font-medium ${expanded ? "text-zinc-950" : "text-zinc-700"}`}>
            Auto-fill from existing data
          </span>
          {filters.length > 0 && (
            <span className="text-[11px] text-zinc-500 ml-2">
              {filters.length} filter{filters.length > 1 ? "s" : ""} active
            </span>
          )}
        </div>
        <svg
          className={`w-4 h-4 text-zinc-500 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expanded panel */}
      {expanded && (
        <div className="mt-3 animate-in" style={{ animationDuration: "200ms" }}>
          {/* Column selector */}
          <p className="text-[12px] text-zinc-600 mb-2 px-1">
            Select columns to filter by, then type values to find matching entries:
          </p>
          <div className="flex flex-wrap gap-2 mb-3">
            {filterableFields.map((field) => {
              const isActive = filters.includes(field.key);
              return (
                <button
                  key={field.key}
                  type="button"
                  onClick={() => toggleFilter(field.key)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium border transition-all duration-150 ${
                    isActive
                      ? "border-zinc-950 bg-zinc-950 text-white"
                      : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-400"
                  }`}
                >
                  {/* Checkbox indicator */}
                  <div
                    className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${
                      isActive
                        ? "border-white bg-white"
                        : "border-zinc-300 bg-white"
                    }`}
                  >
                    {isActive && (
                      <svg className="w-2.5 h-2.5 text-zinc-950" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  {field.label}
                </button>
              );
            })}
          </div>

          {/* Active filter indicators */}
          {filters.length > 0 && (
            <div className="mb-3 px-1">
              <div className="flex flex-wrap gap-1.5">
                {filters.map((key) => {
                  const val = (values[key] ?? "").trim();
                  return (
                    <span
                      key={key}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-zinc-100 text-[11px] text-zinc-600"
                    >
                      <span className="font-medium">{getFieldLabel(key)}:</span>
                      <span className={val ? "text-zinc-950" : "text-zinc-400 italic"}>
                        {val || "type below..."}
                      </span>
                    </span>
                  );
                })}
              </div>
              <p className="text-[11px] text-zinc-500 mt-1.5">
                Type in the fields below to filter · All filters use AND logic
              </p>
            </div>
          )}

          {/* Results */}
          {showResultsInBar && showResults && filters.length > 0 && matches.length > 0 && (
            <div className="animate-in" style={{ animationDuration: "150ms" }}>
              <div className="flex items-center justify-between mb-1.5 px-1">
                <span className="text-[11px] font-medium text-zinc-600">
                  {matches.length} match{matches.length !== 1 ? "es" : ""}
                </span>
              </div>
              <div className="bg-white rounded-lg border border-zinc-200 overflow-hidden max-h-[220px] overflow-y-auto">
                {matches.map((row, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSelect(row)}
                    className="w-full text-left px-4 py-3 text-[13px] border-b border-zinc-100 last:border-b-0 transition-colors hover:bg-zinc-50 active:bg-zinc-100"
                  >
                    <div className="flex items-center gap-2">
                      <svg
                        className="w-3.5 h-3.5 text-zinc-300 flex-shrink-0"
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
                      <span className="truncate font-medium text-zinc-700">
                        {getRowLabel(row)}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-zinc-500 mt-1.5 px-1">
                Tap to auto-fill all fields · You can edit any value after
              </p>
            </div>
          )}

          {showResultsInBar && loading && (
            <div className="text-center py-4">
              <p className="text-[12px] text-zinc-500">Loading past entries...</p>
            </div>
          )}

          {showResultsInBar && !loading && suggestions.length === 0 && (
            <div className="text-center py-4">
              <p className="text-[12px] text-zinc-500">No previous entries found yet.</p>
            </div>
          )}

          {/* No results message */}
          {showResultsInBar && showResults && filters.length > 0 && matches.length === 0 && (
            <div className="text-center py-4">
              <p className="text-[12px] text-zinc-500">
                No matching entries found. Try different filter values.
              </p>
            </div>
          )}

          {/* No filters selected hint */}
          {showResultsInBar && filters.length === 0 && (
            <div className="text-center py-3">
              <p className="text-[12px] text-zinc-500">
                Tick one or more columns above to start filtering
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
