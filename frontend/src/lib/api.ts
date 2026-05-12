/* ------------------------------------------------------------------ *
 * api.ts — Typed API client for Office Mobile                       *
 *                                                                    *
 * All functions:                                                      *
 *   • use native fetch (no axios)                                    *
 *   • throw Error(detail) on any non-2xx response                    *
 *   • are fully typed against the backend Pydantic models            *
 *   • include retry logic for transient failures                     *
 * ------------------------------------------------------------------ */

import type {
  CreateFormResponse,
  CustomKeywordRule,
  EditFormResponse,
  FieldSchema,
  PreviewResponse,
  PublicFormResponse,
  SubmitFormResponse,
} from "@/types/field";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"
).replace(/\/$/, "");

/** Build a full API URL from a path (always prefixed with /api). */
function url(path: string): string {
  return `${BASE_URL}/api${path}`;
}

/** Retry a fetch call up to `maxRetries` times on network errors or 5xx. */
async function fetchWithRetry(
  input: RequestInfo,
  init?: RequestInit,
  maxRetries = 2,
): Promise<Response> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(input, init);
      // Don't retry on client errors (4xx), only on server errors (5xx)
      if (res.status < 500 || attempt === maxRetries) {
        return res;
      }
      lastError = new Error(`Server error: ${res.status}`);
    } catch (err: any) {
      lastError = err;
      if (attempt === maxRetries) break;
    }
    // Exponential backoff: 500ms, 1000ms
    await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
  }
  throw lastError ?? new Error("Request failed after retries");
}

/** JSON POST/PATCH/PUT helper. */
async function jsonRequest<T>(
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body: unknown,
): Promise<T> {
  const res = await fetchWithRetry(url(path), {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return handleResponse<T>(res);
}

/** JSON GET helper (with optional query string). */
async function jsonGet<T>(path: string): Promise<T> {
  const res = await fetchWithRetry(url(path), {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });
  return handleResponse<T>(res);
}

/**
 * Parse the response. On non-2xx status, extract `detail` from the JSON body
 * and throw a plain Error so callers can display `error.message` directly.
 */
async function handleResponse<T>(res: Response): Promise<T> {
  if (res.ok) {
    return res.json() as Promise<T>;
  }

  let detail = `Request failed with status ${res.status}`;
  try {
    const errorBody = (await res.json()) as { detail?: string };
    if (errorBody.detail) detail = errorBody.detail;
  } catch {
    // Body was not valid JSON — keep the default message
  }
  throw new Error(detail);
}

// ---------------------------------------------------------------------------
// Public API functions
// ---------------------------------------------------------------------------

/**
 * GET /api/sheet/worksheets?sheet_url=…
 * List available worksheet tabs in a spreadsheet.
 */
export async function listWorksheets(
  sheetUrl: string,
): Promise<{ items: string[] }> {
  return jsonGet<{ items: string[] }>(
    `/sheet/worksheets?sheet_url=${encodeURIComponent(sheetUrl)}`,
  );
}

/**
 * POST /api/sheet/preview
 * Fetch column headers from the sheet and infer field types.
 */
export async function previewSheet(
  sheetUrl: string,
  worksheetName: string | null,
  customKeywords: CustomKeywordRule[],
): Promise<PreviewResponse> {
  return jsonRequest<PreviewResponse>("POST", "/sheet/preview", {
    sheet_url: sheetUrl,
    worksheet_name: worksheetName,
    custom_keywords: customKeywords,
  });
}

/**
 * POST /api/forms
 * Persist a new form definition and receive an edit token + shareable URL.
 */
export async function createForm(payload: {
  sheet_url: string;
  spreadsheet_id: string;
  worksheet_name: string | null;
  form_title: string;
  fields: FieldSchema[];
  custom_keywords: CustomKeywordRule[];
  autofill_columns?: string[];
}): Promise<CreateFormResponse> {
  return jsonRequest<CreateFormResponse>("POST", "/forms", payload);
}

/**
 * GET /api/forms/:id
 * Load the public (read-only) version of a form for rendering the entry UI.
 */
export async function getPublicForm(id: string): Promise<PublicFormResponse> {
  return jsonGet<PublicFormResponse>(`/forms/${encodeURIComponent(id)}`);
}

/**
 * GET /api/forms/:id/submissions?token=…
 * List all submissions for a form (requires edit token).
 */
export async function listSubmissions(
  id: string,
  token: string,
): Promise<{
  items: Array<{
    id: string;
    submitted_at: string;
    sheets_range: string | null;
    values: Record<string, unknown>;
  }>;
}> {
  const path = `/forms/${encodeURIComponent(id)}/submissions?token=${encodeURIComponent(token)}`;
  return jsonGet(path);
}

/**
 * GET /api/forms/:id/edit?token=…
 * Load the full editable form definition (requires the edit token).
 */
export async function getEditForm(
  id: string,
  token: string,
): Promise<EditFormResponse> {
  const path = `/forms/${encodeURIComponent(id)}/edit?token=${encodeURIComponent(token)}`;
  return jsonGet<EditFormResponse>(path);
}

/**
 * PATCH /api/forms/:id
 * Persist changes to an existing form (requires the edit token in the body).
 */
export async function updateForm(
  id: string,
  payload: {
    edit_token: string;
    form_title: string;
    fields: FieldSchema[];
    custom_keywords: CustomKeywordRule[];
    autofill_columns?: string[];
  },
): Promise<{ success: boolean; id: string }> {
  return jsonRequest<{ success: boolean; id: string }>(
    "PATCH",
    `/forms/${encodeURIComponent(id)}`,
    payload,
  );
}

/**
 * POST /api/forms/:id/submit
 * Append one row of user-submitted values to the backing Google Sheet.
 * Sends ALL field values (including empty strings) to ensure correct column alignment.
 */
export async function submitForm(
  id: string,
  values: Record<string, string | number | boolean | null>,
): Promise<SubmitFormResponse> {
  return jsonRequest<SubmitFormResponse>(
    "POST",
    `/forms/${encodeURIComponent(id)}/submit`,
    { values },
  );
}

/**
 * GET /api/forms/:id/suggestions
 * Fetch existing rows from the backing Google Sheet for autofill suggestions.
 */
export async function getFormSuggestions(
  id: string,
): Promise<{ rows: Record<string, string>[] }> {
  return jsonGet<{ rows: Record<string, string>[] }>(
    `/forms/${encodeURIComponent(id)}/suggestions`,
  );
}

/**
 * GET /api/forms/lookup/by-sheet?sheet_url=…
 * Find forms linked to a Google Sheet URL.
 */
export async function lookupFormsBySheet(
  sheetUrl: string,
): Promise<{
  items: Array<{
    id: string;
    form_title: string;
    worksheet_name: string | null;
    fields: FieldSchema[];
    autofill_columns: string[];
  }>;
}> {
  return jsonGet(
    `/forms/lookup/by-sheet?sheet_url=${encodeURIComponent(sheetUrl)}`,
  );
}

/**
 * GET /api/config/public
 * Retrieve public configuration (e.g. the service account e-mail that needs
 * Sheet-sharing access) without authentication.
 */
export async function getPublicConfig(): Promise<{
  service_account_email: string | null;
}> {
  return jsonGet<{ service_account_email: string | null }>("/config/public");
}
