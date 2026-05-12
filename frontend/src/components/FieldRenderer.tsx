"use client";

import React, { useId } from "react";
import type { FieldSchema } from "@/types/field";

interface Props {
  field: FieldSchema;
  value: string;
  onChange: (key: string, value: string) => void;
  onBlur?: (key: string) => void;
  error?: string;
  touched?: boolean;
}

const BASE =
  "w-full rounded-xl border px-4 py-3.5 text-[16px] focus:outline-none focus:ring-2 focus:border-transparent min-h-[52px] transition-all duration-150 placeholder:text-gray-300";
const NORMAL = "border-gray-200 bg-white focus:ring-accent-500";
const FILLED = "border-gray-300 bg-white focus:ring-accent-500";
const ERROR = "border-red-300 bg-red-50/30 focus:ring-red-500";

export default function FieldRenderer({
  field,
  value,
  onChange,
  onBlur,
  error,
  touched,
}: Props) {
  const id = useId();
  const hasValue = value.trim().length > 0;
  const showError = error && touched;
  const cls = `${BASE} ${showError ? ERROR : hasValue ? FILLED : NORMAL}`;

  const handle = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => onChange(field.key, e.target.value);

  const handleBlur = () => onBlur?.(field.key);

  const [uploading, setUploading] = React.useState(false);
  const [uploadError, setUploadError] = React.useState<string | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadError(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        throw new Error("Failed to upload file");
      }

      const data = await res.json();
      if (data.url) {
        onChange(field.key, data.url);
      } else {
        throw new Error("No URL returned from server");
      }
    } catch (err: any) {
      setUploadError(err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const renderControl = () => {
    const commonProps = {
      id,
      className: cls,
      placeholder: field.placeholder,
      value,
      onChange: handle,
      onBlur: handleBlur,
      "aria-invalid": showError ? (true as const) : undefined,
      "aria-describedby": showError ? `${id}-error` : undefined,
      required: field.required,
    };

    switch (field.type) {
      case "textarea":
        return <textarea {...commonProps} rows={3} className={`${cls} resize-none`} />;
      case "tel":
        return <input {...commonProps} type="tel" inputMode="tel" autoComplete="tel" />;
      case "email":
        return <input {...commonProps} type="email" inputMode="email" autoComplete="email" />;
      case "number":
        return <input {...commonProps} type="number" inputMode="numeric" />;
      case "url":
        return <input {...commonProps} type="url" inputMode="url" autoComplete="url" />;
      case "date":
        return <input {...commonProps} type="date" />;
      case "time":
        return <input {...commonProps} type="time" />;
      case "file":
        return (
          <div className="relative">
            {value ? (
              <div className="flex items-center gap-3 w-full rounded-xl border border-emerald-300 bg-emerald-50/30 px-4 py-3 min-h-[52px]">
                <svg className="w-5 h-5 text-emerald-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-[14px] text-emerald-800 font-medium truncate flex-1">
                  File attached successfully
                </span>
                <button
                  type="button"
                  onClick={() => onChange(field.key, "")}
                  className="text-emerald-600 hover:bg-emerald-100 p-1.5 rounded-md transition-colors"
                  aria-label="Remove file"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ) : (
              <div className={`relative flex items-center justify-center w-full rounded-xl border-2 border-dashed px-4 py-6 transition-colors ${
                uploadError ? "border-red-300 bg-red-50" : "border-gray-200 hover:border-accent-400 bg-gray-50/50 hover:bg-accent-50/30"
              }`}>
                {uploading ? (
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-6 h-6 border-2 border-accent-200 border-t-accent-600 rounded-full animate-spin" />
                    <span className="text-[13px] text-gray-500 font-medium">Uploading...</span>
                  </div>
                ) : (
                  <>
                    <input
                      type="file"
                      id={id}
                      required={field.required}
                      accept="image/*,application/pdf"
                      capture="environment"
                      onChange={handleFileUpload}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    <div className="flex flex-col items-center gap-2 pointer-events-none">
                      <div className="w-10 h-10 rounded-full bg-white shadow-sm border border-gray-100 flex items-center justify-center">
                        <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                        </svg>
                      </div>
                      <span className="text-[14px] font-medium text-gray-700">
                        Tap to upload or take a photo
                      </span>
                    </div>
                  </>
                )}
              </div>
            )}
            {uploadError && (
              <p className="text-red-500 text-[12px] mt-1.5 flex items-center gap-1" role="alert">
                <svg className="w-3 h-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                {uploadError}
              </p>
            )}
          </div>
        );
      default:
        return <input {...commonProps} type="text" autoComplete="off" />;
    }
  };

  return (
    <div className="mb-5">
      <label
        htmlFor={id}
        className="block text-[13px] font-medium text-gray-700 mb-1.5"
      >
        {field.label}
        {field.required && (
          <span className="text-red-400 ml-0.5" aria-label="required">*</span>
        )}
      </label>
      {renderControl()}
      {showError && (
        <p
          id={`${id}-error`}
          className="text-red-500 text-[12px] mt-1.5 flex items-center gap-1"
          role="alert"
        >
          <svg className="w-3 h-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
          {error}
        </p>
      )}
    </div>
  );
}
