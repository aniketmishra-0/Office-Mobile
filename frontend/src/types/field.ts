/* ------------------------------------------------------------------ *
 * field.ts — TypeScript types mirroring the backend Pydantic models  *
 * Keep in sync with: backend/app/models/*.py                         *
 * ------------------------------------------------------------------ */

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export type FieldType =
  | "text"
  | "tel"
  | "email"
  | "date"
  | "time"
  | "number"
  | "textarea"
  | "url"
  | "file";

// ---------------------------------------------------------------------------
// Configuration types
// ---------------------------------------------------------------------------

export interface CustomKeywordRule {
  keyword: string;
  type: FieldType;
}

export interface FieldSchema {
  key: string;
  source_header: string;
  label: string;
  type: FieldType;
  required: boolean;
  order: number;
  column_index: number;
  placeholder?: string;
}

// ---------------------------------------------------------------------------
// API response types
// ---------------------------------------------------------------------------

/** Returned by POST /api/preview */
export interface PreviewResponse {
  spreadsheet_id: string;
  sheet_url: string;
  spreadsheet_title: string;
  worksheet_name: string;
  form_title: string;
  fields: FieldSchema[];
  custom_keywords: CustomKeywordRule[];
  warnings: string[];
}

/** Returned by POST /api/forms */
export interface CreateFormResponse {
  id: string;
  edit_token: string;
  form_url: string;
  edit_url: string;
}

/** Returned by GET /api/forms/:id */
export interface PublicFormResponse {
  id: string;
  form_title: string;
  worksheet_name?: string | null;
  fields: FieldSchema[];
  autofill_columns: string[];
}

/** Returned by GET /api/forms/:id/edit?token=… */
export interface EditFormResponse {
  id: string;
  sheet_url: string;
  spreadsheet_id: string;
  worksheet_name: string | null;
  form_title: string;
  fields: FieldSchema[];
  custom_keywords: CustomKeywordRule[];
  autofill_columns: string[];
}

/** Returned by POST /api/forms/:id/submit */
export interface SubmitFormResponse {
  success: boolean;
  updated_range: string | null;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

/** Shape of a non-2xx JSON body from the backend */
export interface ApiError {
  detail: string;
}
