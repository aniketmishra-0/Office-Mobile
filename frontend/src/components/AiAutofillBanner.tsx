"use client";

import React, { useCallback, useMemo, useState } from "react";
import type { FieldSchema } from "@/types/field";
import type { AiSuggestionsResponse } from "@/lib/api";

interface Props {
  fields: FieldSchema[];
  aiData: AiSuggestionsResponse | null;
  loading: boolean;
  error: string | null;
  onApply: (values: Record<string, string>) => void;
  onRetry?: () => void;
}

/**
 * AiAutofillBanner — Shows AI-predicted field values based on submission
 * history patterns (e.g., "Every Monday you submit the same data").
 *
 * Displays a compact banner with a one-tap "Apply" action.
 */
const EMPTY_OBJ: Record<string, any> = {};

export default function AiAutofillBanner({
  fields,
  aiData,
  loading,
  error,
  onApply,
  onRetry,
}: Props) {
  const [dismissed, setDismissed] = useState(false);
  const [applied, setApplied] = useState(false);

  const predictions = aiData?.predictions ?? EMPTY_OBJ;
  const confidence = aiData?.confidence ?? EMPTY_OBJ;
  const patternType = aiData?.pattern_type ?? EMPTY_OBJ;
  const context = aiData?.context;

  const hasPredictions = Object.keys(predictions).length > 0;

  // Build a human-readable summary of what was detected
  const summary = useMemo(() => {
    if (!hasPredictions || !context) return "";

    const dayPatterns = Object.values(patternType).filter(
      (t) => t === "day_of_week",
    ).length;
    const recurringPatterns = Object.values(patternType).filter(
      (t) => t === "recurring",
    ).length;

    const parts: string[] = [];
    if (dayPatterns > 0) {
      parts.push(
        `${dayPatterns} field${dayPatterns > 1 ? "s" : ""} match your ${context.current_day} pattern`,
      );
    }
    if (recurringPatterns > 0) {
      parts.push(
        `${recurringPatterns} field${recurringPatterns > 1 ? "s" : ""} always the same`,
      );
    }
    return parts.join(" · ");
  }, [hasPredictions, patternType, context]);

  // Get field labels for the predicted fields
  const predictionDetails = useMemo(() => {
    return Object.entries(predictions)
      .map(([key, value]) => {
        const field = fields.find((f) => f.key === key);
        return {
          key,
          label: field?.label ?? key,
          value,
          confidence: confidence[key] ?? 0,
          type: patternType[key] ?? "recurring",
        };
      })
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 5); // Show max 5 predictions in the preview
  }, [predictions, fields, confidence, patternType]);

  const handleApply = useCallback(() => {
    onApply(predictions);
    setApplied(true);
  }, [predictions, onApply]);

  // Don't render if dismissed, no predictions, or still loading with no error
  if (dismissed) return null;
  if (!loading && !error && !hasPredictions) return null;

  return (
    <div className="mb-5">
      <div
        className={`relative rounded-lg border transition-all duration-200 overflow-hidden ${
          applied
            ? "border-emerald-200 bg-emerald-50"
            : "border-indigo-200 bg-gradient-to-r from-indigo-50 to-violet-50"
        }`}
      >
        {/* Header */}
        <div className="flex items-center gap-2.5 px-4 py-3">
          <div
            className={`w-6 h-6 rounded-lg flex items-center justify-center ${
              applied ? "bg-emerald-500" : "bg-indigo-500"
            }`}
          >
            {applied ? (
              <svg
                className="w-3.5 h-3.5 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 13l4 4L19 7"
                />
              </svg>
            ) : (
              <svg
                className="w-3.5 h-3.5 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z"
                />
              </svg>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <span
              className={`text-[13px] font-medium ${
                applied ? "text-emerald-800" : "text-indigo-900"
              }`}
            >
              {applied ? "AI suggestions applied" : "AI Auto-Fill"}
            </span>
            {summary && !applied && (
              <p className="text-[11px] text-indigo-600 mt-0.5 truncate">
                {summary}
              </p>
            )}
            {applied && (
              <p className="text-[11px] text-emerald-600 mt-0.5">
                You can edit any field before submitting
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {!applied && hasPredictions && (
              <button
                type="button"
                onClick={handleApply}
                className="px-3 py-1.5 rounded-md bg-indigo-600 text-white text-[12px] font-medium hover:bg-indigo-700 active:bg-indigo-800 transition-colors"
              >
                Apply
              </button>
            )}
            <button
              type="button"
              onClick={() => setDismissed(true)}
              className={`p-1 rounded-md transition-colors ${
                applied
                  ? "text-emerald-400 hover:text-emerald-600"
                  : "text-indigo-300 hover:text-indigo-500"
              }`}
              aria-label="Dismiss AI suggestions"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Prediction details (collapsed preview) */}
        {!applied && hasPredictions && predictionDetails.length > 0 && (
          <div className="px-4 pb-3 pt-0">
            <div className="flex flex-wrap gap-1.5">
              {predictionDetails.map(({ key, label, value, type }) => (
                <span
                  key={key}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white/70 border border-indigo-100 text-[11px]"
                >
                  <span className="text-indigo-600 font-medium">{label}:</span>
                  <span className="text-indigo-900 truncate max-w-[120px]">
                    {value}
                  </span>
                  {type === "day_of_week" && (
                    <span className="text-indigo-400" title="Day-of-week pattern">
                      📅
                    </span>
                  )}
                  {type === "recurring" && (
                    <span className="text-indigo-400" title="Always the same">
                      🔁
                    </span>
                  )}
                </span>
              ))}
              {Object.keys(predictions).length > 5 && (
                <span className="inline-flex items-center px-2 py-1 text-[11px] text-indigo-500">
                  +{Object.keys(predictions).length - 5} more
                </span>
              )}
            </div>
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div className="px-4 pb-3 pt-0">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
              <span className="text-[11px] text-indigo-600">
                Analyzing your submission patterns...
              </span>
            </div>
          </div>
        )}

        {/* Error state */}
        {error && !loading && (
          <div className="px-4 pb-3 pt-0">
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-red-600">{error}</span>
              {onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="text-[11px] text-indigo-600 font-medium underline"
                >
                  Retry
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
