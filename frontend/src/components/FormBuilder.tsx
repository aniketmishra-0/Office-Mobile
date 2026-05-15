"use client";

import { useMemo, useState } from "react";
import type { FieldSchema, FieldType } from "@/types/field";
import ClearButton from "@/components/ClearButton";
import SubmitButton from "@/components/SubmitButton";
import MobileDropdown from "@/components/MobileDropdown";

type DraftField = {
  id: string;
  name: string;
  type: FieldType;
};

interface Props {
  submitting: boolean;
  onSubmit: (payload: { formTitle: string; fields: FieldSchema[] }) => Promise<void> | void;
}

const FIELD_TYPES: Array<{ value: FieldType; label: string }> = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "time", label: "Time" },
  { value: "tel", label: "Phone" },
  { value: "email", label: "Email" },
  { value: "textarea", label: "Long Text" },
  { value: "url", label: "URL" },
  { value: "file", label: "File" },
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
  const [fields, setFields] = useState<DraftField[]>([createDraftField()]);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(
    () => fields.some((field) => field.name.trim().length > 0),
    [fields],
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

    setError(null);
    await onSubmit({ formTitle: trimmedTitle, fields: normalizedFields });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 mb-3">
          Create new form
        </p>
        <h2 className="text-[20px] font-bold text-zinc-950 leading-tight">
          Start with a blank Google Sheet
        </h2>
        <p className="text-[13px] text-zinc-600 mt-2 leading-relaxed">
          Add your columns, choose field types, and we will create the sheet and the shareable form for you.
        </p>
      </div>

      <div>
        <label className="block text-[13px] font-semibold text-zinc-800 mb-2">
          Form title
        </label>
        <div className="relative">
          <input
            type="text"
            value={formTitle}
            onChange={(e) => setFormTitle(e.target.value)}
            className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 pr-10 text-[16px] min-h-[48px] focus:outline-none focus:ring-2 focus:ring-zinc-900"
            placeholder="Untitled Form"
          />
          {formTitle && <ClearButton onClick={() => setFormTitle("")} right={10} ariaLabel="Clear title" />}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-zinc-950">Fields</h3>
            <p className="text-[12px] text-zinc-500">Add, remove, and reorder columns before creating the sheet.</p>
          </div>
          <button
            type="button"
            onClick={() => setFields((prev) => [...prev, createDraftField()])}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-[12px] font-medium text-zinc-700 hover:bg-zinc-50 min-h-[36px]"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add field
          </button>
        </div>

        <div className="space-y-3">
          {fields.map((field, index) => (
            <div key={field.id} className="rounded-xl border border-zinc-200 bg-white p-3.5 shadow-sm">
              <div className="flex items-start gap-2 mb-3">
                <div className="flex-1">
                  <label className="block text-[11px] font-semibold uppercase tracking-wide text-zinc-500 mb-1">
                    Field name
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={field.name}
                      onChange={(e) => updateField(field.id, { name: e.target.value })}
                      className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 pr-9 text-[14px] text-zinc-950 focus:outline-none focus:ring-2 focus:ring-zinc-900"
                      placeholder="e.g. Customer name"
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
                <button
                  type="button"
                  onClick={() => removeField(field.id)}
                  className="mt-6 inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 text-zinc-500 hover:bg-zinc-50 disabled:opacity-40"
                  disabled={fields.length === 1}
                  aria-label="Remove field"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
                  </svg>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 items-end">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wide text-zinc-500 mb-1">
                    Field type
                  </label>
                  <MobileDropdown
                    size="sm"
                    value={field.type}
                    options={FIELD_TYPES}
                    onChange={(val) => updateField(field.id, { type: val as FieldType })}
                    placeholder="Select field type"
                  />
                </div>

                <div className="flex items-center justify-end gap-1.5">
                  <button
                    type="button"
                    onClick={() => moveField(field.id, -1)}
                    disabled={index === 0}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 text-zinc-500 hover:bg-zinc-50 disabled:opacity-40"
                    aria-label="Move field up"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 15l6-6 6 6" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => moveField(field.id, 1)}
                    disabled={index === fields.length - 1}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 text-zinc-500 hover:bg-zinc-50 disabled:opacity-40"
                    aria-label="Move field down"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M18 9l-6 6-6-6" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {error && (
          <p className="text-[13px] text-red-600" role="alert">
            {error}
          </p>
        )}
      </div>

      <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
        <p className="text-[12px] font-medium text-zinc-700 mb-1">What happens next</p>
        <p className="text-[12px] text-zinc-500 leading-relaxed">
          We create a new spreadsheet in your Google Drive, write these headers into Sheet1, and then generate the public form and edit link.
        </p>
      </div>

      <SubmitButton
        label="Create Google Sheet"
        submitting={submitting}
        onClick={handleSubmit}
        disabled={!canSubmit}
      />
    </div>
  );
}