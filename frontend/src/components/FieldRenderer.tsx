"use client";

import React, { useId, useRef, useState, useMemo, useEffect } from "react";
import type { FieldSchema } from "@/types/field";
import { getApiBase } from "@/lib/api";

const API_BASE = getApiBase();

interface Props {
  field: FieldSchema;
  value: string;
  onChange: (key: string, value: string) => void;
  onBlur?: (key: string) => void;
  onFocus?: (key: string) => void;
  error?: string;
  touched?: boolean;
  folderName?: string;
  formId?: string;
  suggestions?: string[];
  calculatedFormula?: string;
  onUploadingChange?: (key: string, isUploading: boolean) => void;
}

/**
 * FieldRenderer — premium card container for a single form field.
 *
 * Each field renders as an elevated, rounded card with high contrast text,
 * subtle hover accent, glowing focus ring, and clear feedback.
 */
export default function FieldRenderer({
  field,
  value,
  onChange,
  onBlur,
  onFocus,
  error,
  touched,
  folderName,
  formId,
  suggestions,
  calculatedFormula,
  onUploadingChange,
}: Props) {
  const id = useId();
  const [focused, setFocused] = useState(false);
  const showError = !!error && !!touched;

  const handleFocus = () => {
    setFocused(true);
    onFocus?.(field.key);
  };
  const handleBlur = () => {
    setFocused(false);
    onBlur?.(field.key);
  };

  return (
    <div
      className={`om-field ${focused ? "is-focused" : ""} ${showError ? "has-error" : ""}`}
    >
      <div className="om-field__header">
        <label htmlFor={id} className="om-field__label">
          {field.label}
          {field.required && <span className="om-field__req" aria-label="required"> *</span>}
        </label>
        {calculatedFormula && (
          <span className="om-field__formula" title={`Auto-calculated: ${calculatedFormula}`}>
            <span className="om-field__formula-fx">fx</span> {calculatedFormula}
          </span>
        )}
      </div>

      <div className="om-field__control">
        <FieldControl
          id={id}
          field={field}
          value={value}
          onChange={onChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          showError={showError}
          folderName={folderName}
          formId={formId}
          suggestions={suggestions}
          onUploadingChange={(uploading) => onUploadingChange?.(field.key, uploading)}
        />
      </div>

      {showError && (
        <span className="om-field__error" role="alert">
          ✕ {error}
        </span>
      )}

      <style jsx>{`
        .om-field {
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-bottom: 16px;
          padding: 16px 18px 18px;
          background: var(--ft-field-bg, var(--ft-card-bg, rgba(255, 255, 255, 0.04)));
          border: 1px solid var(--ft-input-border, var(--rule));
          border-radius: var(--ft-input-radius, 14px);
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
          transition: border-color 200ms cubic-bezier(0.16, 1, 0.3, 1),
                      box-shadow 200ms cubic-bezier(0.16, 1, 0.3, 1),
                      background 200ms ease;
          position: relative;
        }
        .om-field:hover {
          border-color: var(--ft-accent, var(--clay));
        }
        .om-field.is-focused {
          border-color: var(--ft-accent, var(--clay));
          background: var(--ft-field-focus-bg, var(--ft-card-bg, rgba(255, 255, 255, 0.06)));
          box-shadow: var(--ft-input-focus-ring, 0 0 0 3px rgba(200, 98, 58, 0.18)), 0 4px 14px rgba(0, 0, 0, 0.08);
        }
        .om-field.has-error {
          border-color: var(--error, #ef4444) !important;
          box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.15) !important;
        }
        .om-field__header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }
        .om-field__formula {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 2px 8px;
          border-radius: 9999px;
          font-family: var(--font-plex-mono), ui-monospace, monospace;
          font-size: 10px;
          background: rgba(14, 165, 233, 0.1);
          color: #0284c7;
          border: 1px solid rgba(14, 165, 233, 0.25);
        }
        .om-field__formula-fx {
          font-weight: 700;
          font-style: italic;
        }
        .om-field__label {
          font-family: var(--font-plex-mono), ui-monospace, monospace;
          font-weight: 600;
          font-size: 11px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--ft-label-color, var(--stone));
          transition: color 200ms ease-out;
        }
        .om-field__req {
          color: var(--ft-accent, var(--clay));
        }
        .om-field.is-focused .om-field__label {
          color: var(--ft-accent, var(--clay));
        }
        .om-field.has-error .om-field__label {
          color: var(--error, #ef4444);
        }
        .om-field__error {
          font-family: var(--font-plex-mono), ui-monospace, monospace;
          font-weight: 500;
          font-size: 11px;
          letter-spacing: 0.02em;
          color: var(--error, #ef4444);
          animation: fadeIn 150ms ease-out;
          margin-top: 2px;
        }
      `}</style>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────
   Switchboard for the individual control type.
   ──────────────────────────────────────────────────────────────────── */

function isPhoneField(field?: FieldSchema) {
  if (!field) return false;
  if (field.type === "tel") return true;
  const s = `${field.label || ""} ${field.key || ""}`.toLowerCase();
  return s.includes("mobile") || s.includes("phone") || s.includes("contact");
}

function FieldControl({
  id,
  field,
  value,
  onChange,
  onFocus,
  onBlur,
  showError,
  folderName,
  formId,
  suggestions,
  onUploadingChange,
}: {
  id: string;
  field: FieldSchema;
  value: string;
  onChange: (key: string, value: string) => void;
  onFocus: () => void;
  onBlur: () => void;
  showError: boolean;
  folderName?: string;
  formId?: string;
  suggestions?: string[];
  onUploadingChange?: (uploading: boolean) => void;
}) {
  const set = (v: string) => onChange(field.key, v);

  const isSelect =
    field.type === "select" ||
    (Boolean(field.options?.length) &&
      field.type !== "checkbox" &&
      field.type !== "date" &&
      field.type !== "time" &&
      field.type !== "file");

  if (isSelect) {
    const combinedOptions = Array.from(new Set([...(field.options || []), ...(suggestions || [])]));
    return (
      <ComboboxControl
        id={id}
        value={value}
        options={combinedOptions}
        onChange={set}
        onFocus={onFocus}
        onBlur={onBlur}
        placeholder={field.placeholder}
        required={field.required}
      />
    );
  }

  // Treat text fields as checkbox if the current value is TRUE/FALSE
  const effectiveType =
    field.type !== "checkbox" &&
    field.type !== "date" &&
    field.type !== "time" &&
    (value.trim().toUpperCase() === "TRUE" || value.trim().toUpperCase() === "FALSE")
      ? "checkbox"
      : field.type;

  switch (effectiveType) {
    case "checkbox":
      return (
        <CheckboxControl
          id={id}
          value={value}
          onChange={set}
          onFocus={onFocus}
          onBlur={onBlur}
          label={field.label}
        />
      );
    case "textarea":
      return (
        <TextareaControl
          id={id}
          value={value}
          onChange={set}
          onFocus={onFocus}
          onBlur={onBlur}
          placeholder={field.placeholder}
          required={field.required}
          showError={showError}
        />
      );
    case "date":
      return (
        <DateTriple
          value={value}
          onChange={set}
          onFocus={onFocus}
          onBlur={onBlur}
        />
      );
    case "time":
      return (
        <TimeControl
          id={id}
          value={value}
          onChange={set}
          onFocus={onFocus}
          onBlur={onBlur}
          placeholder={field.placeholder}
          required={field.required}
        />
      );
    case "file":
      return (
        <FileControl
          id={id}
          value={value}
          onChange={set}
          onFocus={onFocus}
          required={field.required}
          folderName={folderName}
          formId={formId}
          onUploadingChange={onUploadingChange}
        />
      );
    default: {
      const isPhone = isPhoneField(field);
      return (
        <TextInput
          id={id}
          type={isPhone ? "tel" : textTypeFor(field.type)}
          value={value}
          onChange={set}
          onFocus={onFocus}
          onBlur={onBlur}
          placeholder={field.placeholder}
          required={field.required}
          inputMode={isPhone ? "tel" : inputModeFor(field.type)}
          autoComplete={autoCompleteFor(field.type)}
          suggestions={suggestions}
        />
      );
    }
  }
}

function textTypeFor(t: FieldSchema["type"]) {
  switch (t) {
    case "email": return "email";
    case "tel":   return "tel";
    case "number":return "number";
    case "url":   return "url";
    default:      return "text";
  }
}
function inputModeFor(t: FieldSchema["type"]): React.HTMLAttributes<HTMLInputElement>["inputMode"] {
  switch (t) {
    case "email":  return "email";
    case "tel":    return "tel";
    case "number": return "numeric";
    case "url":    return "url";
    default:       return "text";
  }
}
function autoCompleteFor(t: FieldSchema["type"]) {
  switch (t) {
    case "email": return "email";
    case "tel":   return "tel";
    case "url":   return "url";
    default:      return "off";
  }
}

/* ────────────────────────────────────────────────────────────────────
   Text-style input — bottom-border only, turns clay on focus.
   ──────────────────────────────────────────────────────────────────── */

function TextInput({
  id,
  type,
  value,
  onChange,
  onFocus,
  onBlur,
  placeholder,
  required,
  inputMode,
  autoComplete,
  suggestions = [],
}: {
  id: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  onFocus: () => void;
  onBlur: () => void;
  placeholder?: string;
  required?: boolean;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  autoComplete?: string;
  suggestions?: string[];
}) {
  const [isFocused, setIsFocused] = useState(false);

  const cleanSuggestions = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const s of suggestions) {
      const trimmed = s ? s.trim() : "";
      if (trimmed && !isFormulaError(trimmed) && !seen.has(trimmed.toLowerCase())) {
        seen.add(trimmed.toLowerCase());
        list.push(trimmed);
      }
    }
    return list;
  }, [suggestions]);

  const filteredSuggestions = useMemo(() => {
    if (cleanSuggestions.length === 0) return [];
    const q = (value || "").trim().toLowerCase();
    const list = q ? cleanSuggestions.filter((s) => s.toLowerCase().includes(q) && s.toLowerCase() !== q) : cleanSuggestions;
    return list.slice(0, 5);
  }, [cleanSuggestions, value]);

  return (
    <>
      <div className="om-input-wrap">
        <input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => {
            setIsFocused(true);
            onFocus();
          }}
          onBlur={() => {
            setIsFocused(false);
            onBlur();
          }}
          placeholder={placeholder}
          required={required}
          inputMode={inputMode}
          autoComplete={autoComplete}
          className="om-input"
        />

        {value && (
          <button
            type="button"
            tabIndex={-1}
            aria-label="Clear"
            className="om-input-clear"
            onMouseDown={(e) => {
              // Prevent blur so the user stays in the field after clearing.
              e.preventDefault();
              onChange("");
            }}
          >
            ×
          </button>
        )}
      </div>

      {/* Smart Auto-Complete quick suggestion chips inside app */}
      {isFocused && filteredSuggestions.length > 0 && (
        <div className="om-suggestions-row">
          <span className="om-suggestions-label">Suggestions:</span>
          {filteredSuggestions.map((sug) => (
            <button
              key={sug}
              type="button"
              tabIndex={-1}
              className="om-suggestion-chip"
              onPointerDown={(e) => {
                e.preventDefault();
                onChange(sug);
              }}
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(sug);
              }}
            >
              + {sug}
            </button>
          ))}
        </div>
      )}

      <style jsx>{`
        .om-input-wrap {
          position: relative;
          width: 100%;
        }
        .om-suggestions-row {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
          margin-top: 6px;
        }
        .om-suggestions-label {
          font-family: var(--font-plex-mono), ui-monospace, monospace;
          font-size: 10px;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          color: var(--stone);
          margin-right: 2px;
        }
        .om-suggestion-chip {
          display: inline-flex;
          align-items: center;
          padding: 4px 10px;
          font-family: inherit;
          font-size: 12px;
          font-weight: 500;
          color: var(--ft-input-text, var(--ink));
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid var(--rule);
          border-radius: 9999px;
          cursor: pointer;
          transition: all 140ms ease;
        }
        :global(.dark) .om-suggestion-chip {
          background: rgba(255, 255, 255, 0.08);
          border-color: rgba(255, 255, 255, 0.15);
        }
        .om-suggestion-chip:hover {
          background: var(--ft-accent, var(--clay));
          color: #FFFFFF;
          border-color: var(--ft-accent, var(--clay));
          transform: translateY(-1px);
        }
        .om-input {
          width: 100%;
          font-family: inherit;
          font-weight: 500;
          font-size: 15px;
          line-height: 1.5;
          color: var(--ft-input-text, var(--ink)) !important;
          -webkit-text-fill-color: var(--ft-input-text, var(--ink)) !important;
          background: transparent;
          border: 0;
          border-bottom: 1.5px solid var(--rule);
          border-radius: 0;
          padding: 8px 30px 8px 0;
          outline: none;
          transition: border-color 200ms ease-out, padding 200ms ease-out;
        }
        .om-input::placeholder {
          color: var(--ft-placeholder-color, var(--stone)) !important;
          -webkit-text-fill-color: var(--ft-placeholder-color, var(--stone)) !important;
          opacity: 0.7;
        }
        .om-input:focus {
          border-bottom: 2px solid var(--ft-accent, var(--clay));
          padding-bottom: 7.5px;
        }
        :global(.om-field.has-error) .om-input {
          border-bottom-color: var(--error, #ef4444) !important;
        }
        .om-input-clear {
          position: absolute;
          top: 50%;
          right: 0;
          transform: translateY(-50%);
          width: 22px;
          height: 22px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          border: 0;
          color: var(--stone);
          font-family: var(--font-plex-mono), ui-monospace, monospace;
          font-size: 16px;
          line-height: 1;
          cursor: pointer;
          padding: 0;
          transition: color 200ms ease-out;
        }
        .om-input-clear:hover,
        .om-input-clear:focus-visible {
          color: var(--ink);
          outline: none;
        }
      `}</style>
    </>
  );
}

/* ────────────────────────────────────────────────────────────────────
   Select/Dropdown — mobile-friendly dropdown with quick chip pills.
   ──────────────────────────────────────────────────────────────────── */

function isFormulaError(val: string): boolean {
  if (!val) return false;
  const s = val.trim().toUpperCase();
  return (
    s.startsWith("#") ||
    s === "NULL" ||
    s === "UNDEFINED" ||
    s === "NAN"
  );
}

function ComboboxControl({
  id,
  value,
  options,
  onChange,
  onFocus,
  onBlur,
  placeholder,
  required,
}: {
  id: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  onFocus: () => void;
  onBlur: () => void;
  placeholder?: string;
  required?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Clean options: omit sheet formula errors like #REF!, #N/A, #VALUE!
  const cleanOptions = useMemo(() => {
    const list: string[] = [];
    for (const opt of options) {
      const trimmed = opt ? opt.trim() : "";
      if (trimmed && !isFormulaError(trimmed) && !list.includes(trimmed)) {
        list.push(trimmed);
      }
    }
    return list;
  }, [options]);

  // Filter options as user types
  const filteredOptions = useMemo(() => {
    if (!value.trim()) return cleanOptions;
    const q = value.trim().toLowerCase();
    const matches = cleanOptions.filter((opt) => opt.toLowerCase().includes(q));
    return matches.length > 0 ? matches : cleanOptions;
  }, [cleanOptions, value]);

  // Close dropdown on outside click or touch
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("touchend", handleClick);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("touchend", handleClick);
    };
  }, [isOpen]);

  return (
    <div ref={containerRef} className="om-combobox-wrap">
      <div className="om-combobox-input-row">
        <input
          ref={inputRef}
          id={id}
          type="text"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            if (!isOpen && cleanOptions.length > 0) setIsOpen(true);
          }}
          onFocus={() => {
            onFocus();
            if (cleanOptions.length > 0) setIsOpen(true);
          }}
          onClick={() => {
            if (cleanOptions.length > 0) setIsOpen(true);
          }}
          placeholder={placeholder || (cleanOptions.length > 0 ? "Select or type…" : "Enter text…")}
          required={required}
          className="om-combobox-input"
          autoComplete="off"
        />

        <div className="om-combobox-actions">
          {value && (
            <button
              type="button"
              tabIndex={-1}
              aria-label="Clear"
              className="om-combobox-btn"
              onClick={() => {
                onChange("");
                inputRef.current?.focus();
              }}
            >
              ×
            </button>
          )}

          {cleanOptions.length > 0 && (
            <button
              type="button"
              tabIndex={-1}
              aria-label="Toggle options"
              className="om-combobox-btn om-combobox-arrow"
              onClick={() => {
                setIsOpen((prev) => !prev);
                inputRef.current?.focus();
              }}
            >
              <span style={{ transform: isOpen ? "rotate(180deg)" : "none", display: "inline-block", transition: "transform 150ms" }}>
                ▾
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Floating Options Dropdown Menu inside app */}
      {isOpen && cleanOptions.length > 0 && (
        <div className="om-combobox-dropdown">
          {filteredOptions.length === 0 ? (
            <div className="om-combobox-empty">No options match &quot;{value}&quot;</div>
          ) : (
            filteredOptions.map((opt) => {
              const isSelected = value.trim() === opt.trim();
              return (
                <button
                  type="button"
                  key={opt}
                  className={`om-combobox-option ${isSelected ? "is-selected" : ""}`}
                  onClick={() => {
                    onChange(opt);
                    setIsOpen(false);
                  }}
                >
                  <span className="truncate">{opt}</span>
                  {isSelected && <span style={{ color: "var(--clay)", fontSize: 13, fontWeight: 700 }}>✓</span>}
                </button>
              );
            })
          )}
        </div>
      )}

      <style jsx>{`
        .om-combobox-wrap {
          position: relative;
          width: 100%;
        }
        .om-combobox-input-row {
          position: relative;
          width: 100%;
          display: flex;
          align-items: center;
        }
        .om-combobox-input {
          width: 100%;
          font-family: inherit;
          font-weight: 500;
          font-size: 15px;
          line-height: 1.5;
          color: var(--ft-input-text, var(--ink)) !important;
          -webkit-text-fill-color: var(--ft-input-text, var(--ink)) !important;
          background: transparent;
          border: 0;
          border-bottom: 1.5px solid var(--rule);
          border-radius: 0;
          padding: 8px 52px 8px 0;
          outline: none;
          transition: border-color 200ms ease-out, padding 200ms ease-out;
        }
        .om-combobox-input::placeholder {
          color: var(--ft-placeholder-color, var(--stone)) !important;
          -webkit-text-fill-color: var(--ft-placeholder-color, var(--stone)) !important;
          opacity: 0.7;
        }
        .om-combobox-input:focus {
          border-bottom: 2px solid var(--ft-accent, var(--clay));
          padding-bottom: 7.5px;
        }
        :global(.om-field.has-error) .om-combobox-input {
          border-bottom-color: var(--error, #ef4444) !important;
        }
        .om-combobox-actions {
          position: absolute;
          right: 0;
          top: 50%;
          transform: translateY(-50%);
          display: flex;
          align-items: center;
          gap: 2px;
        }
        .om-combobox-btn {
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          border: 0;
          color: var(--stone);
          cursor: pointer;
          font-size: 15px;
          line-height: 1;
          padding: 0;
          border-radius: 0;
          transition: color 150ms ease;
        }
        .om-combobox-btn:hover {
          color: var(--ft-input-text, var(--ink));
        }
        .om-combobox-arrow {
          font-size: 14px;
        }
        .om-combobox-dropdown {
          position: absolute;
          top: calc(100% + 6px);
          left: 0;
          right: 0;
          max-height: 240px;
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
          touch-action: pan-y;
          overscroll-behavior: contain;
          background: var(--ft-card-bg, #1E293B);
          border: 1px solid var(--rule);
          border-radius: 12px;
          box-shadow: 0 12px 30px rgba(0, 0, 0, 0.35);
          z-index: 50;
          padding: 4px;
        }
        .om-combobox-option {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 14px;
          font-family: inherit;
          font-size: 13px;
          font-weight: 500;
          color: var(--ft-input-text, var(--ink));
          cursor: pointer;
          border: 0;
          border-radius: 8px;
          background: transparent;
          text-align: left;
          touch-action: pan-y;
          user-select: none;
          -webkit-user-select: none;
          transition: all 120ms ease;
        }
        .om-combobox-option:hover,
        .om-combobox-option:focus {
          background: rgba(56, 189, 248, 0.15);
          color: var(--ft-accent, var(--clay));
          outline: none;
        }
        .om-combobox-option.is-selected {
          background: rgba(56, 189, 248, 0.18);
          font-weight: 600;
          color: var(--ft-accent, var(--clay));
        }
        .om-combobox-empty {
          padding: 12px 14px;
          font-family: var(--font-plex-mono), ui-monospace, monospace;
          font-size: 12px;
          color: var(--stone);
          text-align: center;
        }
      `}</style>
    </div>
  );
}

function TimeControl({
  id,
  value,
  onChange,
  onFocus,
  onBlur,
  placeholder,
  required,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  onFocus: () => void;
  onBlur: () => void;
  placeholder?: string;
  required?: boolean;
}) {
  const handleNow = () => {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    onChange(`${hh}:${mm}`);
  };

  return (
    <div>
      <TextInput
        id={id}
        type="time"
        value={value}
        onChange={onChange}
        onFocus={onFocus}
        onBlur={onBlur}
        placeholder={placeholder}
        required={required}
      />
      <div style={{ marginTop: 4 }}>
        <button
          type="button"
          onClick={handleNow}
          style={{
            fontFamily: "var(--font-plex-mono), monospace",
            fontSize: 10,
            color: "var(--clay)",
            background: "transparent",
            border: 0,
            padding: "2px 0",
            cursor: "pointer",
            textDecoration: "underline",
          }}
          title="Fill current time"
        >
          [Fill Current Time]
        </button>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────
   Checkbox — toggle switch for TRUE/FALSE values.
   ──────────────────────────────────────────────────────────────────── */

function CheckboxControl({
  id,
  value,
  onChange,
  onFocus,
  onBlur,
  label,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  onFocus: () => void;
  onBlur: () => void;
  label: string;
}) {
  const isChecked = value.trim().toUpperCase() === "TRUE";

  return (
    <>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={isChecked}
        aria-label={label}
        className={`om-checkbox ${isChecked ? "is-checked" : ""}`}
        onClick={() => onChange(isChecked ? "FALSE" : "TRUE")}
        onFocus={onFocus}
        onBlur={onBlur}
      >
        <span className="om-checkbox__track">
          <span className="om-checkbox__thumb" />
        </span>
        <span className="om-checkbox__label">{isChecked ? "TRUE" : "FALSE"}</span>
      </button>
      <style jsx>{`
        .om-checkbox {
          display: inline-flex;
          align-items: center;
          gap: 12px;
          padding: 8px 0;
          background: transparent;
          border: 0;
          cursor: pointer;
          outline: none;
          -webkit-tap-highlight-color: transparent;
        }
        .om-checkbox:focus-visible .om-checkbox__track {
          box-shadow: 0 0 0 2px var(--clay);
        }
        .om-checkbox__track {
          position: relative;
          width: 44px;
          height: 24px;
          border-radius: 12px;
          background: var(--rule);
          transition: background 200ms ease-out;
        }
        .om-checkbox.is-checked .om-checkbox__track {
          background: var(--clay, #c2703a);
        }
        .om-checkbox__thumb {
          position: absolute;
          top: 2px;
          left: 2px;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: white;
          box-shadow: 0 1px 3px rgba(0,0,0,0.15);
          transition: transform 200ms ease-out;
        }
        .om-checkbox.is-checked .om-checkbox__thumb {
          transform: translateX(20px);
        }
        .om-checkbox__label {
          font-family: var(--font-plex-mono), ui-monospace, monospace;
          font-weight: 500;
          font-size: 12px;
          letter-spacing: 0.08em;
          color: var(--stone);
          transition: color 200ms ease-out;
        }
        .om-checkbox.is-checked .om-checkbox__label {
          color: var(--ink);
        }
      `}</style>
    </>
  );
}

/* ────────────────────────────────────────────────────────────────────
   Textarea — 4px clay left border on focus.
   ──────────────────────────────────────────────────────────────────── */

function TextareaControl({
  id,
  value,
  onChange,
  onFocus,
  onBlur,
  placeholder,
  required,
  showError,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  onFocus: () => void;
  onBlur: () => void;
  placeholder?: string;
  required?: boolean;
  showError: boolean;
}) {
  return (
    <>
      <div className="om-textarea-wrap">
        <textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={onFocus}
          onBlur={onBlur}
          placeholder={placeholder}
          required={required}
          rows={3}
          className={`om-textarea ${showError ? "has-error" : ""}`}
        />
        {value && (
          <button
            type="button"
            tabIndex={-1}
            aria-label="Clear"
            className="om-textarea-clear"
            onMouseDown={(e) => {
              e.preventDefault();
              onChange("");
            }}
          >
            ×
          </button>
        )}
      </div>
      <style jsx>{`
        .om-textarea-wrap {
          position: relative;
          width: 100%;
        }
        .om-textarea {
          width: 100%;
          min-height: 80px;
          resize: vertical;
          font-family: inherit;
          font-weight: 500;
          font-size: 15px;
          line-height: 1.5;
          color: var(--ft-input-text, var(--ink)) !important;
          -webkit-text-fill-color: var(--ft-input-text, var(--ink)) !important;
          background: transparent;
          border: 0;
          border-left: 3px solid var(--rule);
          border-bottom: 1.5px solid var(--rule);
          border-radius: 0;
          padding: 8px 30px 8px 12px;
          outline: none;
          transition: border-color 200ms ease-out;
        }
        .om-textarea::placeholder {
          color: var(--ft-placeholder-color, var(--stone)) !important;
          -webkit-text-fill-color: var(--ft-placeholder-color, var(--stone)) !important;
          opacity: 0.7;
        }
        .om-textarea:focus {
          border-left-color: var(--ft-accent, var(--clay));
          border-bottom-color: var(--ft-accent, var(--clay));
        }
        .om-textarea.has-error {
          border-left-color: var(--error, #ef4444);
          border-bottom-color: var(--error, #ef4444);
        }
        .om-textarea-clear {
          position: absolute;
          top: 8px;
          right: 0;
          width: 22px;
          height: 22px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          border: 0;
          color: var(--stone);
          font-family: var(--font-plex-mono), ui-monospace, monospace;
          font-size: 16px;
          line-height: 1;
          cursor: pointer;
          padding: 0;
          transition: color 200ms ease-out;
        }
        .om-textarea-clear:hover,
        .om-textarea-clear:focus-visible {
          color: var(--ink);
          outline: none;
        }
      `}</style>
    </>
  );
}

/* ────────────────────────────────────────────────────────────────────
   Date triple — DD / MM / YYYY mono inputs with auto-advance.
   Composite value stored as "YYYY-MM-DD" so backend validation and
   Google Sheets storage remain unchanged.
   ──────────────────────────────────────────────────────────────────── */

function DateTriple({
  value,
  onChange,
  onFocus,
  onBlur,
}: {
  value: string;
  onChange: (v: string) => void;
  onFocus: () => void;
  onBlur: () => void;
}) {
  const parsedParts = useMemo(() => {
    if (!value) return { dd: "", mm: "", yyyy: "" };
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (iso) return { dd: iso[3], mm: iso[2], yyyy: iso[1] };
    const d = new Date(value);
    if (!isNaN(d.getTime())) {
      return {
        dd: String(d.getDate()).padStart(2, "0"),
        mm: String(d.getMonth() + 1).padStart(2, "0"),
        yyyy: String(d.getFullYear()),
      };
    }
    return { dd: "", mm: "", yyyy: "" };
  }, [value]);

  const [localParts, setLocalParts] = useState(parsedParts);

  useEffect(() => {
    setLocalParts(parsedParts);
  }, [parsedParts]);

  const ddRef = useRef<HTMLInputElement>(null);
  const mmRef = useRef<HTMLInputElement>(null);
  const yyRef = useRef<HTMLInputElement>(null);
  const hiddenDateRef = useRef<HTMLInputElement>(null);

  function updatePart(key: "dd" | "mm" | "yyyy", val: string) {
    const next = { ...localParts, [key]: val };
    setLocalParts(next);
    if (next.dd && next.mm && next.yyyy && next.yyyy.length === 4) {
      onChange(`${next.yyyy}-${next.mm.padStart(2, "0")}-${next.dd.padStart(2, "0")}`);
    } else if (!next.dd && !next.mm && !next.yyyy) {
      onChange("");
    } else {
      // Partial typing is kept in localParts, so typing isn't wiped out!
      onChange("");
    }
  }

  const today = (() => {
    const d = new Date();
    return `${String(d.getDate()).padStart(2, "0")} / ${String(d.getMonth() + 1).padStart(2, "0")} / ${d.getFullYear()}`;
  })();

  return (
    <div className="om-date" onFocus={onFocus} onBlur={onBlur}>
      <div className="om-date__row">
        <input
          ref={ddRef}
          className="om-date__input"
          placeholder="DD"
          inputMode="numeric"
          maxLength={2}
          value={localParts.dd}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "").slice(0, 2);
            updatePart("dd", v);
            if (v.length === 2) mmRef.current?.focus();
          }}
        />
        <span className="om-date__sep">/</span>
        <input
          ref={mmRef}
          className="om-date__input"
          placeholder="MM"
          inputMode="numeric"
          maxLength={2}
          value={localParts.mm}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "").slice(0, 2);
            updatePart("mm", v);
            if (v.length === 2) yyRef.current?.focus();
          }}
        />
        <span className="om-date__sep">/</span>
        <input
          ref={yyRef}
          className="om-date__input om-date__input--year"
          placeholder="YYYY"
          inputMode="numeric"
          maxLength={4}
          value={localParts.yyyy}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "").slice(0, 4);
            updatePart("yyyy", v);
          }}
        />
        <input
          ref={hiddenDateRef}
          type="date"
          tabIndex={-1}
          style={{ position: "absolute", opacity: 0, width: 0, height: 0, pointerEvents: "none" }}
          value={value}
          onChange={(e) => {
            if (e.target.value) {
              onChange(e.target.value);
            }
          }}
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => {
            if (hiddenDateRef.current) {
              if (typeof hiddenDateRef.current.showPicker === "function") {
                hiddenDateRef.current.showPicker();
              } else {
                hiddenDateRef.current.focus();
              }
            }
          }}
          className="om-date__cal-btn"
          title="Pick date from calendar"
        >
          📅
        </button>
      </div>
      <button
        type="button"
        className="om-date__hint"
        onClick={() => {
          const now = new Date();
          const dd = String(now.getDate()).padStart(2, "0");
          const mm = String(now.getMonth() + 1).padStart(2, "0");
          const yyyy = String(now.getFullYear());
          onChange(`${yyyy}-${mm}-${dd}`);
        }}
        title="Click to set today's date"
      >
        today is {today} <span style={{ textDecoration: "underline", color: "var(--clay)", marginLeft: 6 }}>[Fill Today]</span>
      </button>

      <style jsx>{`
        .om-date {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .om-date__row {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .om-date__input {
          width: 58px;
          text-align: center;
          font-family: inherit;
          font-weight: 500;
          font-size: 15px;
          color: var(--ft-input-text, var(--ink)) !important;
          -webkit-text-fill-color: var(--ft-input-text, var(--ink)) !important;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid var(--rule);
          border-radius: 8px;
          padding: 8px 4px;
          outline: none;
          transition: all 180ms ease-out;
        }
        .om-date__input:focus {
          border-color: var(--ft-accent, var(--clay));
          box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.2);
        }
        .om-date__input::placeholder {
          color: var(--ft-placeholder-color, var(--stone)) !important;
          -webkit-text-fill-color: var(--ft-placeholder-color, var(--stone)) !important;
          opacity: 0.65;
        }
        .om-date__input--year {
          width: 82px;
        }
        .om-date__sep {
          color: var(--stone);
          font-family: var(--font-plex-mono), ui-monospace, monospace;
          font-size: 14px;
          user-select: none;
        }
        .om-date__cal-btn {
          background: transparent;
          border: 0;
          cursor: pointer;
          font-size: 16px;
          padding: 4px;
          border-radius: 4px;
          opacity: 0.7;
          transition: opacity 150ms ease;
        }
        .om-date__cal-btn:hover {
          opacity: 1;
        }
        .om-date__hint {
          font-family: var(--font-plex-mono), ui-monospace, monospace;
          font-weight: 300;
          font-size: 10px;
          color: var(--stone);
          letter-spacing: 0.04em;
          background: transparent;
          border: 0;
          padding: 0;
          text-align: left;
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────
   File upload — editorial drop zone with form owner Google Drive integration
   and manual URL/link entry support.
   ──────────────────────────────────────────────────────────────────── */

function FileControl({
  id,
  value,
  onChange,
  onFocus,
  required,
  folderName,
  formId,
  onUploadingChange,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  onFocus: () => void;
  required?: boolean;
  folderName?: string;
  formId?: string;
  onUploadingChange?: (uploading: boolean) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadProgressText, setUploadProgressText] = useState("");
  const [uploadedFileName, setUploadedFileName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [manualMode, setManualMode] = useState(() => {
    return Boolean(value && !value.includes("drive.google.com"));
  });

  const resolvedFormId = useMemo(() => {
    if (formId) return formId;
    if (typeof window !== "undefined") {
      const match = window.location.pathname.match(/\/f\/([a-zA-Z0-9_-]+)/);
      if (match) return match[1];
    }
    return undefined;
  }, [formId]);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    onUploadingChange?.(true);
    setUploadProgressText(`Uploading ${file.name}...`);
    setErr(null);
    const formData = new FormData();
    formData.append("file", file);
    if (folderName) {
      formData.append("folder_name", folderName);
    }
    if (resolvedFormId) {
      formData.append("form_id", resolvedFormId);
    }
    try {
      const headers: Record<string, string> = {};
      const sessionKey = typeof window !== "undefined" ? window.localStorage.getItem("om_session") : null;
      if (sessionKey) headers["X-Session-Key"] = sessionKey;

      const res = await fetch(`${API_BASE}/api/upload`, {
        method: "POST",
        body: formData,
        credentials: "include",
        headers,
      });
      if (!res.ok) {
        let errMsg = "Upload failed";
        try {
          const errorData = await res.json();
          errMsg = errorData.detail || errMsg;
        } catch {}
        throw new Error(errMsg);
      }
      const data = await res.json();
      if (!data.url) throw new Error("No URL returned from upload");
      setUploadedFileName(data.file_name || file.name);
      onChange(data.url);
      setManualMode(false);
    } catch (e: any) {
      setErr(e.message || "Upload failed. You can paste a link or enter text manually.");
    } finally {
      setUploading(false);
      onUploadingChange?.(false);
    }
  }

  // Derive a friendly display name when value exists
  const displayName = useMemo(() => {
    if (uploadedFileName) return uploadedFileName;
    if (!value) return "";
    if (value.includes("drive.google.com")) {
      return "Attached Document (Google Drive)";
    }
    return value.length > 35 ? `${value.slice(0, 32)}…` : value;
  }, [uploadedFileName, value]);

  return (
    <div className="om-file">
      {value ? (
        <div className="om-file__success-card">
          <div className="om-file__success-header">
            <div className="om-file__success-icon">
              <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <p className="om-file__success-name" title={uploadedFileName || value}>
                {displayName}
              </p>
              <p className="om-file__success-sub">
                ✓ Saved to Google Drive folder &ldquo;{folderName || "Uploads"}&rdquo;
              </p>
            </div>
          </div>

          <div className="om-file__success-actions">
            {value.startsWith("http") && (
              <a
                href={value}
                target="_blank"
                rel="noopener noreferrer"
                className="om-file__action-btn om-file__action-btn--primary"
                onClick={(e) => e.stopPropagation()}
              >
                <span>View File</span>
                <span className="text-xs">↗</span>
              </a>
            )}
            <button
              type="button"
              onClick={() => {
                onChange("");
                setUploadedFileName("");
              }}
              className="om-file__action-btn om-file__action-btn--danger"
              title="Remove attached file"
            >
              Remove
            </button>
            <button
              type="button"
              onClick={() => setManualMode(!manualMode)}
              className="om-file__action-btn om-file__action-btn--ghost"
            >
              {manualMode ? "Hide edit" : "Edit link ✎"}
            </button>
          </div>
        </div>
      ) : manualMode ? (
        <div className="om-file__manual">
          <input
            id={id}
            type="text"
            required={required}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={onFocus}
            placeholder="Paste link (Google Drive, Doc, URL) or type manually..."
            className="om-input"
          />
          <div className="flex items-center justify-between mt-1.5">
            <span className="text-[11px] text-zinc-400 font-mono">
              Manual link entry mode
            </span>
            <button
              type="button"
              onClick={() => setManualMode(false)}
              className="om-file__mode-link"
            >
              switch to file upload ↑
            </button>
          </div>
        </div>
      ) : (
        <div>
          <label className={`om-file__drop ${uploading ? "is-uploading" : ""} ${err ? "has-error" : ""}`}>
            <input
              id={id}
              type="file"
              required={required}
              accept="image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
              capture="environment"
              onChange={handleFile}
              onFocus={onFocus}
              disabled={uploading}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, cursor: uploading ? "not-allowed" : "pointer" }}
            />
            {uploading ? (
              <div className="om-file__uploading-state">
                <span className="om-file__spinner" aria-hidden />
                <div className="text-center">
                  <div className="om-file__uploading-title">
                    {uploadProgressText || "Uploading to Google Drive..."}
                  </div>
                  <div className="om-file__uploading-sub">
                    Saving inside your Google Drive folder &ldquo;{folderName || "Uploads"}&rdquo;
                  </div>
                </div>
              </div>
            ) : (
              <div className="om-file__idle-state">
                <div className="om-file__cloud-icon">
                  ☁️
                </div>
                <div className="text-center">
                  <div className="om-file__cta-main">
                    Tap or drag to upload file
                  </div>
                  <div className="om-file__cta-sub">
                    PDF, DOC, Photo · Saves directly to Google Drive
                  </div>
                </div>
              </div>
            )}
          </label>
          <div className="flex items-center justify-between mt-1.5 px-0.5">
            <span className="text-[11px] text-zinc-400 font-mono">
              Original filename preserved in Drive
            </span>
            <button
              type="button"
              onClick={() => setManualMode(true)}
              className="om-file__mode-link"
            >
              or paste link manually ✎
            </button>
          </div>
        </div>
      )}

      {manualMode && value && (
        <div className="mt-2">
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={onFocus}
            placeholder="Edit link or text..."
            className="om-input text-xs"
          />
        </div>
      )}

      {err && (
        <div className="om-file__err-box">
          <p className="om-file__err">✕ {err}</p>
          <button
            type="button"
            onClick={() => setManualMode(true)}
            className="om-file__mode-link underline ml-2"
          >
            Enter link manually instead
          </button>
        </div>
      )}

      <style jsx>{`
        .om-file {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .om-file__success-card {
          padding: 14px 16px;
          border-radius: 12px;
          background: rgba(16, 185, 129, 0.08);
          border: 1px solid rgba(16, 185, 129, 0.28);
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .om-file__success-header {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .om-file__success-icon {
          width: 36px;
          height: 36px;
          border-radius: 10px;
          background: rgba(16, 185, 129, 0.15);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .om-file__success-name {
          font-weight: 600;
          font-size: 13px;
          color: var(--ft-input-text, var(--ink));
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          line-height: 1.4;
        }
        .om-file__success-sub {
          font-size: 11px;
          color: #10b981;
          font-weight: 500;
          margin-top: 2px;
        }
        .om-file__success-actions {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
          padding-top: 8px;
          border-top: 1px solid rgba(16, 185, 129, 0.12);
        }
        .om-file__action-btn {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 6px 12px;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 150ms ease;
          border: 1px solid transparent;
        }
        .om-file__action-btn--primary {
          background: var(--ft-accent, #38bdf8);
          color: #0F172A;
        }
        .om-file__action-btn--primary:hover {
          opacity: 0.9;
          transform: translateY(-1px);
        }
        .om-file__action-btn--danger {
          background: rgba(239, 68, 68, 0.12);
          color: #ef4444;
          border-color: rgba(239, 68, 68, 0.25);
        }
        .om-file__action-btn--danger:hover {
          background: rgba(239, 68, 68, 0.22);
        }
        .om-file__action-btn--ghost {
          background: transparent;
          color: var(--ft-placeholder-color, var(--stone));
          border-color: rgba(255, 255, 255, 0.1);
        }
        .om-file__action-btn--ghost:hover {
          color: var(--ft-input-text, var(--ink));
        }
        .om-file__drop {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          min-height: 96px;
          padding: 16px;
          border: 1.5px dashed var(--rule);
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.02);
          cursor: pointer;
          transition: all 200ms ease;
        }
        .om-file__drop:hover {
          border-color: var(--ft-accent, var(--clay));
          background: rgba(56, 189, 248, 0.04);
        }
        .om-file__drop.is-uploading {
          border-color: var(--ft-accent, #38bdf8);
          background: rgba(56, 189, 248, 0.06);
          cursor: wait;
        }
        .om-file__drop.has-error {
          border-color: var(--error, #ef4444);
          background: rgba(239, 68, 68, 0.05);
        }
        .om-file__uploading-state,
        .om-file__idle-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 6px;
        }
        .om-file__cloud-icon {
          font-size: 26px;
          line-height: 1;
        }
        .om-file__cta-main {
          font-size: 13px;
          font-weight: 600;
          color: var(--ft-input-text, var(--ink));
        }
        .om-file__cta-sub {
          font-size: 11px;
          color: var(--ft-placeholder-color, var(--stone));
          margin-top: 2px;
        }
        .om-file__uploading-title {
          font-size: 13px;
          font-weight: 600;
          color: var(--ft-accent, #38bdf8);
        }
        .om-file__uploading-sub {
          font-size: 11px;
          color: var(--ft-placeholder-color, var(--stone));
          margin-top: 2px;
        }
        .om-file__spinner {
          width: 24px;
          height: 24px;
          border: 2.5px solid rgba(56, 189, 248, 0.25);
          border-top-color: var(--ft-accent, #38bdf8);
          border-radius: 50%;
          animation: spin 700ms linear infinite;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .om-file__mode-link {
          background: transparent;
          border: 0;
          padding: 0;
          color: var(--ft-accent, var(--clay));
          font-family: var(--font-plex-mono), ui-monospace, monospace;
          font-size: 11px;
          letter-spacing: 0.02em;
          cursor: pointer;
          transition: opacity 150ms ease;
        }
        .om-file__mode-link:hover {
          text-decoration: underline;
        }
        .om-file__err-box {
          margin-top: 6px;
          padding: 8px 12px;
          border-radius: 8px;
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.25);
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 6px;
        }
        .om-file__err {
          margin: 0;
          font-size: 12px;
          font-weight: 500;
          color: #ef4444;
        }
      `}</style>
    </div>
  );
}
