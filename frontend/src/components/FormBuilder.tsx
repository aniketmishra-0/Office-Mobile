"use client";

import { useMemo, useState } from "react";
import type { FieldSchema, FieldType } from "@/types/field";
import ClearButton from "@/components/ClearButton";
import SubmitButton from "@/components/SubmitButton";
import MobileDropdown from "@/components/MobileDropdown";
import FormDesignPicker from "@/components/FormDesignPicker";

type DraftField = {
  id: string;
  name: string;
  type: FieldType;
};

interface Props {
  submitting: boolean;
  onSubmit: (payload: {
    formTitle: string;
    worksheetName?: string;
    fields: FieldSchema[];
    uiConfig?: Record<string, any>;
  }) => Promise<void> | void;
}

const FIELD_TYPES: Array<{ value: FieldType; label: string }> = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "time", label: "Time" },
  { value: "tel", label: "Phone" },
  { value: "email", label: "Email" },
  { value: "textarea", label: "Long Text" },
  { value: "checkbox", label: "Checkbox" },
  { value: "url", label: "URL" },
  { value: "file", label: "File" },
];

const THEME_OPTIONS = [
  { value: "light", label: "Light Theme" },
  { value: "dark", label: "Dark Theme" },
  { value: "system", label: "System Default" },
];

const FONT_OPTIONS = [
  { value: "system", label: "System Default" },
  { value: "inter", label: "Inter (Modern)" },
  { value: "newsreader", label: "Newsreader (Editorial)" },
  { value: "plex-mono", label: "IBM Plex Mono" },
];

const LAYOUT_OPTIONS = [
  { value: "standard", label: "Standard List" },
  { value: "grid", label: "Grid Layout" },
];

function createDraftField(): DraftField {
  return {
    id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2),
    name: "",
    type: "text",
  };
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function FormBuilder({ submitting, onSubmit }: Props) {
  const [formTitle, setFormTitle] = useState("Untitled Form");
  const [worksheetName, setWorksheetName] = useState("Sheet1");
  const [fields, setFields] = useState<DraftField[]>([createDraftField()]);
  const [error, setError] = useState<string | null>(null);

  // Form UI/UX Config
  const [formTheme, setFormTheme] = useState("system");
  const [formFont, setFormFont] = useState("system");
  const [formLayout, setFormLayout] = useState("standard");
  const [formDesign, setFormDesign] = useState("minimal");
  const [showConfig, setShowConfig] = useState(false);

  const canSubmit = useMemo(
    () => fields.some((field) => field.name.trim().length > 0) && formTitle.trim().length > 0,
    [fields, formTitle],
  );

  function updateField(id: string, next: Partial<DraftField>) {
    setFields((prev) => prev.map((field) => (field.id === id ? { ...field, ...next } : field)));
  }

  function removeField(id: string) {
    setFields((prev) => (prev.length > 1 ? prev.filter((field) => field.id !== id) : prev));
  }

  function moveField(id: string, direction: -1 | 1) {
    setFields((prev) => {
      const index = prev.findIndex((field) => field.id === id);
      if (index < 0) return prev;
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item);
      return next;
    });
  }

  async function handleSubmit() {
    const trimmedTitle = formTitle.trim();
    const trimmedWorksheet = worksheetName.trim() || "Sheet1";
    const usableFields = fields
      .map((field) => ({ ...field, name: field.name.trim() }))
      .filter((field) => field.name.length > 0);

    if (!trimmedTitle) {
      setError("Enter a form title.");
      return;
    }
    if (!usableFields.length) {
      setError("Add at least one field name.");
      return;
    }

    const normalizedFields: FieldSchema[] = usableFields.map((field, index) => {
      const header = field.name;
      const baseKey = slugify(header) || `field-${index + 1}`;
      return {
        key: `${baseKey}-${index + 1}`,
        source_header: header,
        label: header,
        type: field.type,
        required: false,
        order: index,
        column_index: index,
        placeholder: `Enter ${header.toLowerCase()}`,
      };
    });

    const uiConfig = {
      design: formDesign,
      theme: formTheme,
      font_family: formFont,
      layout: formLayout,
    };

    setError(null);
    await onSubmit({
      formTitle: trimmedTitle,
      worksheetName: trimmedWorksheet,
      fields: normalizedFields,
      uiConfig,
    });
  }

  return (
    <div className="space-y-8 animate-in pb-12">
      {/* Hero Section */}
      <div className="relative overflow-hidden rounded-2xl border border-zinc-200 bg-transparent p-6 shadow-sm">
        <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
          <svg className="w-32 h-32" fill="currentColor" viewBox="0 0 24 24">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 2v4h4v12H6V4h7zM8 12h8v2H8v-2zm0 4h8v2H8v-2z" />
          </svg>
        </div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 mb-3">
          Create new form
        </p>
        <h2 className="text-[24px] font-medium text-zinc-950 leading-tight tracking-tight">
          Start with a blank Google Sheet
        </h2>
        <p className="text-[14px] text-zinc-600 mt-2 leading-relaxed max-w-[90%]">
          Design your form, configure the aesthetics, and we&apos;ll instantly deploy a shareable PWA linked directly to a fresh Google Sheet.
        </p>
      </div>

      {/* Main Settings */}
      <div className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="group">
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-zinc-500 mb-1.5 transition-colors group-focus-within:text-zinc-900">
              Form title
            </label>
            <div className="relative">
              <input
                type="text"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3.5 pr-10 text-[16px] min-h-[52px] shadow-sm transition-shadow focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-950"
                placeholder="e.g. Feedback Survey"
              />
              {formTitle && <ClearButton onClick={() => setFormTitle("")} right={12} ariaLabel="Clear title" />}
            </div>
          </div>

          <div className="group">
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-zinc-500 mb-1.5 transition-colors group-focus-within:text-zinc-900">
              Subsheet (Tab) Name
            </label>
            <div className="relative">
              <input
                type="text"
                value={worksheetName}
                onChange={(e) => setWorksheetName(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3.5 pr-10 text-[16px] min-h-[52px] shadow-sm transition-shadow focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-950"
                placeholder="e.g. Sheet1"
              />
              {worksheetName !== "Sheet1" && worksheetName !== "" && (
                <ClearButton onClick={() => setWorksheetName("Sheet1")} right={12} ariaLabel="Reset subsheet name" />
              )}
            </div>
          </div>
        </div>

        {/* UI/UX Configuration Toggle */}
        <div className="rounded-xl border border-zinc-200 bg-transparent transition-all duration-300">
          <button
            type="button"
            onClick={() => setShowConfig(!showConfig)}
            className={`w-full flex items-center justify-between p-4 bg-zinc-50 transition-colors ${showConfig ? 'rounded-t-xl' : 'rounded-xl'}`}
          >
            <div className="flex items-center gap-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-200 text-zinc-700">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                </svg>
              </span>
              <span className="text-[14px] font-medium text-zinc-950">Form UI & UX Configuration</span>
            </div>
            <svg
              className={`w-5 h-5 text-zinc-500 transition-transform duration-300 ${showConfig ? "rotate-180" : ""}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          
          {showConfig && (
            <div className="p-4 pt-4 border-t border-zinc-200 bg-transparent animate-in slide-in-from-top-2">
              {/* Design Picker */}
              <div className="mb-5">
                <FormDesignPicker value={formDesign} onChange={setFormDesign} />
              </div>

              <hr className="border-zinc-200 mb-4" />

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wide text-zinc-500 mb-1.5">
                    Form Theme
                  </label>
                  <MobileDropdown
                    size="sm"
                    value={formTheme}
                    options={THEME_OPTIONS}
                    onChange={(val) => setFormTheme(val)}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wide text-zinc-500 mb-1.5">
                    Typography
                  </label>
                  <MobileDropdown
                    size="sm"
                    value={formFont}
                    options={FONT_OPTIONS}
                    onChange={(val) => setFormFont(val)}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wide text-zinc-500 mb-1.5">
                    Form Layout
                  </label>
                  <MobileDropdown
                    size="sm"
                    value={formLayout}
                    options={LAYOUT_OPTIONS}
                    onChange={(val) => setFormLayout(val)}
                  />
                </div>
              </div>
              <p className="text-[12px] text-zinc-500 mt-3 flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                These settings will apply to the public form URL.
              </p>
            </div>
          )}
        </div>
      </div>

      <hr className="om-rule" />

      {/* Fields Builder */}
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 px-1">
          <div>
            <h3 className="text-[15px] font-medium text-zinc-950">Form Fields</h3>
            <p className="text-[13px] text-zinc-500 mt-0.5">Define the columns for your spreadsheet.</p>
          </div>
          <button
            type="button"
            onClick={() => setFields((prev) => [...prev, createDraftField()])}
            className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-transparent px-4 py-2.5 text-[13px] font-medium text-zinc-800 hover:bg-zinc-50 hover:shadow-sm transition-all min-h-[40px]"
          >
            <svg className="w-4 h-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add Field
          </button>
        </div>

        <div className="space-y-3">
          {fields.map((field, index) => (
            <div 
              key={field.id} 
              className="group relative rounded-xl border border-zinc-200 bg-transparent p-4 shadow-sm transition-all hover:border-zinc-300 hover:shadow-md"
            >
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_200px_auto] gap-4 items-end">
                <div className="flex-1">
                  <label className="block text-[11px] font-semibold uppercase tracking-wide text-zinc-500 mb-1.5 transition-colors group-focus-within:text-zinc-900">
                    Field name
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={field.name}
                      onChange={(e) => updateField(field.id, { name: e.target.value })}
                      className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 pr-9 text-[14px] text-zinc-950 focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-950 transition-all"
                      placeholder={`e.g. ${index === 0 ? 'Full Name' : index === 1 ? 'Email Address' : 'Comments'}`}
                    />
                    {field.name && (
                      <ClearButton
                        onClick={() => updateField(field.id, { name: "" })}
                        right={8}
                        ariaLabel="Clear field name"
                      />
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wide text-zinc-500 mb-1.5">
                    Type
                  </label>
                  <MobileDropdown
                    size="sm"
                    value={field.type}
                    options={FIELD_TYPES}
                    onChange={(val) => updateField(field.id, { type: val as FieldType })}
                    placeholder="Select type"
                  />
                </div>

                <div className="flex items-center gap-1.5 pb-[2px] sm:pb-0">
                  <button
                    type="button"
                    onClick={() => moveField(field.id, -1)}
                    disabled={index === 0}
                    className="inline-flex h-[42px] w-10 items-center justify-center rounded-lg border border-zinc-200 bg-transparent text-zinc-500 hover:bg-zinc-50 hover:text-zinc-700 disabled:opacity-30 transition-colors"
                    aria-label="Move up"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => moveField(field.id, 1)}
                    disabled={index === fields.length - 1}
                    className="inline-flex h-[42px] w-10 items-center justify-center rounded-lg border border-zinc-200 bg-transparent text-zinc-500 hover:bg-zinc-50 hover:text-zinc-700 disabled:opacity-30 transition-colors"
                    aria-label="Move down"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => removeField(field.id)}
                    className="ml-2 inline-flex h-[42px] w-10 items-center justify-center rounded-lg border border-red-100 bg-red-50 text-red-500 hover:bg-red-100 disabled:opacity-30 transition-colors"
                    disabled={fields.length === 1}
                    aria-label="Remove field"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 p-3 flex items-start gap-2 border border-red-100 animate-in">
            <svg className="w-4 h-4 text-red-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <p className="text-[13px] text-red-700 font-medium" role="alert">
              {error}
            </p>
          </div>
        )}
      </div>

      <div className="pt-4">
        <SubmitButton
          label="Create Sheet & Form"
          submitting={submitting}
          onClick={handleSubmit}
          disabled={!canSubmit}
        />
        <p className="text-center text-[11px] text-zinc-400 mt-4 uppercase tracking-widest font-medium">
          A new spreadsheet will be added to your Drive
        </p>
      </div>
    </div>
  );
}