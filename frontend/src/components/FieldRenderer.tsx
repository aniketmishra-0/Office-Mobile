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
  suggestions?: string[];
  calculatedFormula?: string;
}

/**
 * FieldRenderer — editorial row for a single form field.
 *
 * Layout: label above, input below. Bottom-border-only. On focus the
 * label and border shift to clay. On error the border turns to a muted
 * red and a small mono message appears.
 *
 * Textareas get a 4px clay left border on focus instead of a bottom
 * border (per the spec's newspaper-column metaphor).
 *
 * Dropdowns and date fields are rendered inline — see `renderControl`.
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
  suggestions,
  calculatedFormula,
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
          {field.required && <span aria-label="required"> *</span>}
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
          suggestions={suggestions}
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
          gap: 8px;
          padding-bottom: 32px;
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
          font-weight: 500;
          font-size: 10px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--stone);
          transition: color 200ms ease-out;
        }
        .om-field.is-focused .om-field__label {
          color: var(--clay);
        }
        .om-field.has-error .om-field__label {
          color: var(--error);
        }
        .om-field__error {
          font-family: var(--font-plex-mono), ui-monospace, monospace;
          font-weight: 400;
          font-size: 10px;
          letter-spacing: 0.04em;
          color: var(--error);
          animation: fadeIn 150ms ease-out;
        }
      `}</style>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────
   Switchboard for the individual control type.
   ──────────────────────────────────────────────────────────────────── */

function FieldControl({
  id,
  field,
  value,
  onChange,
  onFocus,
  onBlur,
  showError,
  folderName,
  suggestions,
}: {
  id: string;
  field: FieldSchema;
  value: string;
  onChange: (key: string, value: string) => void;
  onFocus: () => void;
  onBlur: () => void;
  showError: boolean;
  folderName?: string;
  suggestions?: string[];
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
        />
      );
    default:
      return (
        <TextInput
          id={id}
          type={textTypeFor(field.type)}
          value={value}
          onChange={set}
          onFocus={onFocus}
          onBlur={onBlur}
          placeholder={field.placeholder}
          required={field.required}
          inputMode={inputModeFor(field.type)}
          autoComplete={autoCompleteFor(field.type)}
          suggestions={suggestions}
        />
      );
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
  const datalistId = `dl-${id}`;

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
          list={cleanSuggestions.length > 0 ? datalistId : undefined}
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
          autoComplete={cleanSuggestions.length > 0 ? "off" : autoComplete}
          className="om-input"
        />

        {cleanSuggestions.length > 0 && (
          <datalist id={datalistId}>
            {cleanSuggestions.map((sug) => (
              <option key={sug} value={sug} />
            ))}
          </datalist>
        )}

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

      {/* Smart Auto-Complete quick suggestion chips */}
      {isFocused && filteredSuggestions.length > 0 && (
        <div className="om-suggestions-row">
          <span className="om-suggestions-label">Suggestions:</span>
          {filteredSuggestions.map((sug) => (
            <button
              key={sug}
              type="button"
              tabIndex={-1}
              className="om-suggestion-chip"
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
          padding: 3px 8px;
          font-family: var(--font-plex-mono), ui-monospace, monospace;
          font-size: 11px;
          color: var(--ink);
          background: rgba(0, 0, 0, 0.04);
          border: 1px solid var(--rule);
          border-radius: 9999px;
          cursor: pointer;
          transition: all 120ms ease;
        }
        :global(.dark) .om-suggestion-chip {
          background: rgba(255, 255, 255, 0.06);
          border-color: rgba(255, 255, 255, 0.12);
        }
        .om-suggestion-chip:hover {
          background: var(--ink);
          color: var(--paper, #fff);
          border-color: var(--ink);
        }
        .om-input {
          width: 100%;
          font-family: var(--font-plex-mono), ui-monospace, monospace;
          font-weight: 400;
          font-size: 14px;
          line-height: 1.5;
          color: var(--ink);
          background: transparent;
          border: 0;
          border-bottom: 1px solid var(--rule);
          border-radius: 0;
          padding: 6px 26px 6px 0;
          outline: none;
          transition: border-color 200ms ease-out, padding 200ms ease-out;
        }
        .om-input::placeholder {
          color: var(--stone);
          opacity: 1;
        }
        .om-input:focus {
          border-bottom: 2px solid var(--clay);
          padding-bottom: 5px;
        }
        :global(.om-field.has-error) .om-input {
          border-bottom-color: var(--error) !important;
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

  // Close dropdown on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isOpen]);

  const listId = `dl-${id}`;

  return (
    <div ref={containerRef} className="om-combobox-wrap">
      <div className="om-combobox-input-row">
        <input
          ref={inputRef}
          id={id}
          type="text"
          list={listId}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            if (!isOpen && cleanOptions.length > 0) setIsOpen(true);
          }}
          onFocus={() => {
            onFocus();
          }}
          onBlur={onBlur}
          placeholder={placeholder || (cleanOptions.length > 0 ? "Select or type…" : "Enter text…")}
          required={required}
          className="om-combobox-input"
          autoComplete="off"
        />

        {/* Native datalist fallback */}
        <datalist id={listId}>
          {cleanOptions.map((opt) => (
            <option key={opt} value={opt} />
          ))}
        </datalist>

        <div className="om-combobox-actions">
          {value && (
            <button
              type="button"
              tabIndex={-1}
              aria-label="Clear"
              className="om-combobox-btn"
              onMouseDown={(e) => {
                e.preventDefault();
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

      {/* Floating Options Dropdown Menu */}
      {isOpen && cleanOptions.length > 0 && (
        <div className="om-combobox-dropdown">
          {filteredOptions.map((opt) => {
            const isSelected = value.trim() === opt.trim();
            return (
              <div
                key={opt}
                className={`om-combobox-option ${isSelected ? "is-selected" : ""}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(opt);
                  setIsOpen(false);
                }}
              >
                <span>{opt}</span>
                {isSelected && <span style={{ color: "var(--clay)", fontSize: 12 }}>✓</span>}
              </div>
            );
          })}
        </div>
      )}

      {/* Quick chips below for up to 8 options */}
      {cleanOptions.length > 0 && cleanOptions.length <= 8 && (
        <div className="om-quick-chips">
          {cleanOptions.map((opt) => {
            const isSelected = value.trim() === opt.trim();
            return (
              <button
                key={opt}
                type="button"
                className={`om-quick-chip ${isSelected ? "is-selected" : ""}`}
                onClick={() => onChange(isSelected ? "" : opt)}
              >
                {opt}
              </button>
            );
          })}
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
          font-family: var(--font-plex-mono), ui-monospace, monospace;
          font-weight: 400;
          font-size: 14px;
          line-height: 1.5;
          color: var(--ink);
          background: transparent;
          border: 0;
          border-bottom: 1px solid var(--rule);
          border-radius: 0;
          padding: 6px 52px 6px 0;
          outline: none;
          transition: border-color 200ms ease-out, padding 200ms ease-out;
        }
        .om-combobox-input:focus {
          border-bottom: 2px solid var(--clay);
          padding-bottom: 5px;
        }
        :global(.om-field.has-error) .om-combobox-input {
          border-bottom-color: var(--error) !important;
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
          color: var(--ink);
        }
        .om-combobox-arrow {
          font-size: 14px;
        }
        .om-combobox-dropdown {
          position: absolute;
          top: calc(100% + 4px);
          left: 0;
          right: 0;
          max-height: 220px;
          overflow-y: auto;
          background: var(--paper, #ffffff);
          border: 1px solid var(--rule, #e4e4e7);
          border-radius: 0;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
          z-index: 50;
        }
        :global(.dark) .om-combobox-dropdown {
          background: #18181b;
          border-color: #27272a;
        }
        .om-combobox-option {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 12px;
          font-family: var(--font-plex-mono), ui-monospace, monospace;
          font-size: 12px;
          color: var(--ink);
          cursor: pointer;
          border-bottom: 1px solid var(--rule, #e4e4e7);
          transition: background 120ms ease;
        }
        .om-combobox-option:last-child {
          border-bottom: 0;
        }
        .om-combobox-option:hover {
          background: rgba(200, 98, 58, 0.08);
          color: var(--clay);
        }
        .om-combobox-option.is-selected {
          background: rgba(200, 98, 58, 0.12);
          font-weight: 600;
        }
        .om-quick-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-top: 8px;
        }
        .om-quick-chip {
          font-family: var(--font-plex-mono), ui-monospace, monospace;
          font-size: 11px;
          padding: 4px 10px;
          border-radius: 0;
          border: 1px solid var(--rule);
          background: transparent;
          color: var(--ink);
          cursor: pointer;
          transition: all 150ms ease;
        }
        .om-quick-chip:hover {
          border-color: var(--stone);
        }
        .om-quick-chip.is-selected {
          background: var(--ink);
          color: var(--paper, #fff);
          border-color: var(--ink);
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
          min-height: 72px;
          resize: none;
          font-family: var(--font-plex-mono), ui-monospace, monospace;
          font-weight: 400;
          font-size: 14px;
          line-height: 1.5;
          color: var(--ink);
          background: transparent;
          border: 0;
          border-left: 4px solid transparent;
          border-bottom: 1px solid var(--rule);
          border-radius: 0;
          padding: 6px 26px 6px 12px;
          outline: none;
          transition: border-color 200ms ease-out;
        }
        .om-textarea::placeholder {
          color: var(--stone);
          opacity: 1;
        }
        .om-textarea:focus {
          border-left-color: var(--clay);
        }
        .om-textarea.has-error {
          border-left-color: var(--error);
          border-bottom-color: var(--error);
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
  // Parse incoming value — accept "YYYY-MM-DD" or anything the Date
  // constructor can cope with, fall back to empty parts otherwise.
  const parts = (() => {
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
  })();

  const ddRef = useRef<HTMLInputElement>(null);
  const mmRef = useRef<HTMLInputElement>(null);
  const yyRef = useRef<HTMLInputElement>(null);

  function commit(next: { dd?: string; mm?: string; yyyy?: string }) {
    const dd = next.dd ?? parts.dd;
    const mm = next.mm ?? parts.mm;
    const yyyy = next.yyyy ?? parts.yyyy;
    if (dd && mm && yyyy && yyyy.length === 4) {
      onChange(`${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`);
    } else if (!dd && !mm && !yyyy) {
      onChange("");
    } else {
      // Partial — keep raw value as empty so validation still fires.
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
          value={parts.dd}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "").slice(0, 2);
            commit({ dd: v });
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
          value={parts.mm}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "").slice(0, 2);
            commit({ mm: v });
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
          value={parts.yyyy}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "").slice(0, 4);
            commit({ yyyy: v });
          }}
        />
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
          width: 56px;
          text-align: center;
          font-family: var(--font-plex-mono), ui-monospace, monospace;
          font-weight: 400;
          font-size: 14px;
          color: var(--ink);
          background: transparent;
          border: 0;
          border-bottom: 1px solid var(--rule);
          border-radius: 0;
          padding: 6px 4px;
          outline: none;
          transition: border-color 200ms ease-out;
        }
        .om-date__input:focus {
          border-bottom: 2px solid var(--clay);
          padding-bottom: 5px;
        }
        .om-date__input::placeholder {
          color: var(--stone);
        }
        .om-date__input--year {
          width: 78px;
        }
        .om-date__sep {
          color: var(--stone);
          font-family: var(--font-plex-mono), ui-monospace, monospace;
          font-size: 14px;
          user-select: none;
        }
        .om-date__hint {
          font-family: var(--font-plex-mono), ui-monospace, monospace;
          font-weight: 300;
          font-size: 10px;
          color: var(--stone);
          letter-spacing: 0.04em;
        }
      `}</style>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────
   File upload — editorial drop zone.
   ──────────────────────────────────────────────────────────────────── */

function FileControl({
  id,
  value,
  onChange,
  onFocus,
  required,
  folderName,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  onFocus: () => void;
  required?: boolean;
  folderName?: string;
}) {
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setErr(null);
    const formData = new FormData();
    formData.append("file", file);
    if (folderName) {
      formData.append("folder_name", folderName);
    }
    try {
      const headers: Record<string, string> = {};
      const sessionKey = typeof window !== "undefined" ? window.localStorage.getItem("om_session") : null;
      if (sessionKey) headers["X-Session-Key"] = sessionKey;

      const res = await fetch(`${API_BASE}/api/upload`, { method: "POST", body: formData, credentials: "include", headers });
      if (!res.ok) throw new Error("upload failed");
      const data = await res.json();
      if (!data.url) throw new Error("no url returned");
      onChange(data.url);
    } catch (e: any) {
      setErr(e.message || "upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="om-file">
      {value ? (
        <div className="om-file__attached">
          <span className="om-file__mark" aria-hidden>✓</span>
          <span className="om-file__label">file attached</span>
          <button type="button" onClick={() => onChange("")} className="om-file__remove">
            remove
          </button>
        </div>
      ) : (
        <label className={`om-file__drop ${uploading ? "is-uploading" : ""} ${err ? "has-error" : ""}`}>
          <input
            id={id}
            type="file"
            required={required}
            accept="image/*,application/pdf"
            capture="environment"
            onChange={handleFile}
            onFocus={onFocus}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer" }}
          />
          {uploading ? (
            <>
              <span className="login-spinner" aria-hidden style={{ borderColor: "var(--ink)", borderTopColor: "transparent" }} />
              <span className="om-file__cta">uploading</span>
            </>
          ) : (
            <>
              <span className="om-file__arrow" aria-hidden>↑</span>
              <span className="om-file__cta">tap to attach</span>
            </>
          )}
        </label>
      )}
      {err && <p className="om-file__err">✕ {err}</p>}

      <style jsx>{`
        .om-file {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .om-file__drop {
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          width: 100%;
          min-height: 56px;
          padding: 12px 16px;
          border: 1px dashed var(--rule);
          background: transparent;
          font-family: var(--font-plex-mono), ui-monospace, monospace;
          font-weight: 400;
          font-size: 12px;
          letter-spacing: 0.08em;
          text-transform: lowercase;
          color: var(--ink);
          cursor: pointer;
          transition: border-color 200ms ease-out, color 200ms ease-out;
        }
        .om-file__drop:hover {
          border-color: var(--clay);
          color: var(--clay);
        }
        .om-file__drop.has-error {
          border-color: var(--error);
          color: var(--error);
        }
        .om-file__arrow {
          font-size: 14px;
        }
        .om-file__attached {
          display: inline-flex;
          align-items: center;
          gap: 12px;
          padding: 12px 16px;
          border: 1px solid var(--clay);
          background: transparent;
          font-family: var(--font-plex-mono), ui-monospace, monospace;
          font-weight: 400;
          font-size: 12px;
          color: var(--ink);
        }
        .om-file__mark {
          color: var(--clay);
          font-family: var(--font-newsreader), Georgia, serif;
          font-size: 16px;
          line-height: 1;
        }
        .om-file__label {
          flex: 1;
          letter-spacing: 0.04em;
        }
        .om-file__remove {
          background: transparent;
          border: 0;
          padding: 0;
          color: var(--stone);
          font-family: inherit;
          font-size: 10px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          cursor: pointer;
          transition: color 200ms ease-out;
        }
        .om-file__remove:hover {
          color: var(--error);
        }
        .om-file__err {
          margin: 0;
          font-family: var(--font-plex-mono), ui-monospace, monospace;
          font-size: 10px;
          letter-spacing: 0.04em;
          color: var(--error);
        }
      `}</style>
    </div>
  );
}
