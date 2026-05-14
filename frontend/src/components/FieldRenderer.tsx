"use client";

import React, { useId, useRef, useState } from "react";
import type { FieldSchema } from "@/types/field";

interface Props {
  field: FieldSchema;
  value: string;
  onChange: (key: string, value: string) => void;
  onBlur?: (key: string) => void;
  onFocus?: (key: string) => void;
  error?: string;
  touched?: boolean;
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
      <label htmlFor={id} className="om-field__label">
        {field.label}
        {field.required && <span aria-label="required"> *</span>}
      </label>

      <div className="om-field__control">
        <FieldControl
          id={id}
          field={field}
          value={value}
          onChange={onChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          showError={showError}
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
}: {
  id: string;
  field: FieldSchema;
  value: string;
  onChange: (key: string, value: string) => void;
  onFocus: () => void;
  onBlur: () => void;
  showError: boolean;
}) {
  const set = (v: string) => onChange(field.key, v);

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
        <TextInput
          id={id}
          type="time"
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
}) {
  return (
    <>
      <div className="om-input-wrap">
        <input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={onFocus}
          onBlur={onBlur}
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
      <style jsx>{`
        .om-input-wrap {
          position: relative;
          width: 100%;
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
      <span className="om-date__hint">today is {today}</span>

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
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  onFocus: () => void;
  required?: boolean;
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
    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
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
