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
  CreateSheetResponse,
  CustomKeywordRule,
  EditFormResponse,
  FieldSchema,
  FormLibraryResponse,
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

const SESSION_STORAGE_KEY = "om_session";

function sessionHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const sessionKey = window.localStorage.getItem(SESSION_STORAGE_KEY);
  if (!sessionKey) return {};
  return { "X-Session-Key": sessionKey };
}

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
      // Retry only on transient server errors (5xx) and rate limits (429).
      // Client errors (400, 401, 403, 404, 413, 422) are final.
      const shouldRetry = (res.status >= 500 || res.status === 429) && attempt < maxRetries;
      if (!shouldRetry) {
        return res;
      }
      lastError = new Error(`Server error: ${res.status}`);
      // For 429, respect Retry-After if present (seconds).
      if (res.status === 429) {
        const retryAfter = Number(res.headers.get("Retry-After") ?? "0");
        if (retryAfter > 0 && retryAfter < 30) {
          await new Promise((r) => setTimeout(r, retryAfter * 1000));
          continue;
        }
      }
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
    headers: { "Content-Type": "application/json", ...sessionHeaders() },
    body: JSON.stringify(body),
    credentials: "include",
  });
  return handleResponse<T>(res);
}

/** JSON GET helper (with optional query string). */
async function jsonGet<T>(path: string): Promise<T> {
  const res = await fetchWithRetry(url(path), {
    method: "GET",
    headers: { "Content-Type": "application/json", ...sessionHeaders() },
    credentials: "include",
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
 * GET /api/sheet/access?sheet_url=…
 * Check if the user has read/edit access to the sheet.
 */
export async function checkSheetAccess(
  sheetUrl: string,
): Promise<{ read: boolean; edit: boolean }> {
  return jsonGet<{ read: boolean; edit: boolean }>(
    `/sheet/access?sheet_url=${encodeURIComponent(sheetUrl)}`,
  );
}

/**
 * GET /api/sheet/protected-columns?sheet_url=…&worksheet_name=…
 * Get list of protected (restricted) columns that cannot be edited.
 */
export async function getProtectedColumns(
  sheetUrl: string,
  worksheetName: string | null,
): Promise<{ protected_indices: number[]; protected_headers: string[] }> {
  const wsParam = worksheetName
    ? `&worksheet_name=${encodeURIComponent(worksheetName)}`
    : "";
  return jsonGet<{ protected_indices: number[]; protected_headers: string[] }>(
    `/sheet/protected-columns?sheet_url=${encodeURIComponent(sheetUrl)}${wsParam}`,
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
  ui_config?: Record<string, any> | null;
}): Promise<CreateFormResponse> {
  return jsonRequest<CreateFormResponse>("POST", "/forms", payload);
}

/**
 * POST /api/sheet/create
 * Create a brand-new Google Sheet and seed row 1 with the supplied headers.
 */
export async function createSheet(payload: {
  form_title: string;
  worksheet_name?: string | null;
  fields: FieldSchema[];
}): Promise<CreateSheetResponse> {
  return jsonRequest<CreateSheetResponse>("POST", "/sheet/create", payload);
}

/**
 * GET /api/forms/library
 * Fetch the saved forms dashboard content.
 */
export async function listFormLibrary(limit = 50): Promise<FormLibraryResponse> {
  return jsonGet<FormLibraryResponse>(`/forms/library?limit=${limit}`);
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
    ui_config?: Record<string, any> | null;
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
 * GET /api/forms/:id/ai-suggestions
 * AI Auto-Fill: Get predicted field values based on submission history patterns.
 */
export interface AiSuggestionsResponse {
  predictions: Record<string, string>;
  confidence: Record<string, number>;
  pattern_type: Record<string, "day_of_week" | "recurring">;
  context: {
    current_day: string;
    total_submissions: number;
    day_submissions: number;
  };
}

export async function getAiSuggestions(
  id: string,
): Promise<AiSuggestionsResponse> {
  return jsonGet<AiSuggestionsResponse>(
    `/forms/${encodeURIComponent(id)}/ai-suggestions`,
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
    id: string | null;
    form_title: string;
    worksheet_name: string | null;
    fields: FieldSchema[];
    autofill_columns: string[];
    has_form: boolean;
  }>;
  spreadsheet_id?: string;
}> {
  return jsonGet(
    `/forms/lookup/by-sheet?sheet_url=${encodeURIComponent(sheetUrl)}`,
  );
}

/**
 * GET /api/sheet/history?sheet_url=…&worksheet_name=…
 * Read history directly from any worksheet tab (no form needed).
 */
export async function getSheetHistory(
  sheetUrl: string,
  worksheetName: string | null,
): Promise<{
  worksheet_name: string;
  fields: FieldSchema[];
  rows: Record<string, string>[];
}> {
  const wsParam = worksheetName
    ? `&worksheet_name=${encodeURIComponent(worksheetName)}`
    : "";
  return jsonGet(
    `/sheet/history?sheet_url=${encodeURIComponent(sheetUrl)}${wsParam}`,
  );
}

/**
 * GET /api/sheet/sections?sheet_url=…&worksheet_name=…
 * Read sheet data split into sections based on mid-sheet header rows.
 */
export async function getSheetSections(
  sheetUrl: string,
  worksheetName: string | null,
): Promise<{
  worksheet_name: string;
  fields: FieldSchema[];
  sections: Array<{
    title: string;
    rows: Record<string, string>[];
    start_row: number;
  }>;
}> {
  const wsParam = worksheetName
    ? `&worksheet_name=${encodeURIComponent(worksheetName)}`
    : "";
  return jsonGet(
    `/sheet/sections?sheet_url=${encodeURIComponent(sheetUrl)}${wsParam}`,
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

/**
 * POST /api/auth/logout
 */
export async function logout(): Promise<{ success: boolean }> {
  return jsonRequest<{ success: boolean }>("POST", "/auth/logout", {});
}

/**
 * PATCH /api/sheet/row
 * Update a specific row in a Google Sheet.
 */
export async function updateSheetRow(payload: {
  sheet_url: string;
  worksheet_name: string | null;
  row_index: number;
  values: Record<string, string>;
}): Promise<{ success: boolean; updated_range: string | null }> {
  return jsonRequest<{ success: boolean; updated_range: string | null }>(
    "PATCH",
    "/sheet/row",
    payload,
  );
}

/**
 * POST /api/sheet/batch-append
 * Append multiple rows to a Google Sheet in a single batch operation.
 */
export async function batchAppendRows(payload: {
  sheet_url: string;
  worksheet_name?: string | null;
  rows: Record<string, string>[];
}): Promise<{ success: boolean; appended_count: number; updated_range: string | null }> {
  return jsonRequest<{ success: boolean; appended_count: number; updated_range: string | null }>(
    "POST",
    "/sheet/batch-append",
    payload,
  );
}

/**
 * DELETE /api/forms/:id
 * Remove a form (requires edit token in body when applicable).
 */
export async function deleteForm(id: string, token?: string): Promise<{ success: boolean }> {
  return jsonRequest<{ success: boolean }>("DELETE", `/forms/${encodeURIComponent(id)}`, { token });
}

/**
 * DELETE /api/forms
 * Remove ALL saved forms and their submissions.
 */
export async function deleteAllForms(): Promise<{ success: boolean; deleted_count: number }> {
  return jsonRequest<{ success: boolean; deleted_count: number }>("DELETE", `/forms`, {});
}

/**
 * POST /api/forms/:id/unauthorize
 * Revoke authorization or unlink a form from the current session (server-side behavior may vary).
 */
export async function unauthorizeForm(id: string, token?: string): Promise<{ success: boolean }> {
  return jsonRequest<{ success: boolean }>("POST", `/forms/${encodeURIComponent(id)}/unauthorize`, { token });
}

// ---------------------------------------------------------------------------
// Dashboard stats
// ---------------------------------------------------------------------------

export interface DashboardStats {
  total_forms: number;
  total_submissions: number;
  today_submissions: number;
  daily: Array<{ date: string; count: number }>;
  top_forms: Array<{ id: string; form_title: string; submission_count: number }>;
  recent_submissions: Array<{
    id: string;
    form_id: string;
    form_title: string;
    submitted_at: string;
  }>;
}

/**
 * GET /api/dashboard/stats
 * Fetch aggregated stats for the dashboard widgets page.
 */
export async function getDashboardStats(): Promise<DashboardStats> {
  return jsonGet<DashboardStats>("/dashboard/stats");
}

// ---------------------------------------------------------------------------
// Saved Sheets (My Sheets)
// ---------------------------------------------------------------------------

export interface SavedSheetItem {
  id: string;
  title: string;
  sheet_url: string;
  spreadsheet_id: string;
  worksheet_name: string | null;
  saved_at: string;
}

/**
 * GET /api/saved-sheets
 * List all saved sheets for the current user.
 */
export async function listSavedSheets(): Promise<{ items: SavedSheetItem[] }> {
  return jsonGet<{ items: SavedSheetItem[] }>("/saved-sheets");
}

/**
 * POST /api/saved-sheets
 * Save a Google Sheet for quick access later.
 */
export async function saveSheet(payload: {
  sheet_url: string;
  spreadsheet_id: string;
  title: string;
  worksheet_name?: string | null;
}): Promise<SavedSheetItem> {
  return jsonRequest<SavedSheetItem>("POST", "/saved-sheets", payload);
}

/**
 * DELETE /api/saved-sheets/:id
 * Remove a saved sheet.
 */
export async function deleteSavedSheet(id: string): Promise<{ success: boolean }> {
  return jsonRequest<{ success: boolean }>("DELETE", `/saved-sheets/${encodeURIComponent(id)}`, {});
}

/**
 * PATCH /api/saved-sheets/:id
 * Rename a saved sheet.
 */
export async function renameSavedSheet(
  id: string,
  title: string,
): Promise<{ success: boolean; title: string }> {
  return jsonRequest<{ success: boolean; title: string }>(
    "PATCH",
    `/saved-sheets/${encodeURIComponent(id)}`,
    { title },
  );
}

export async function batchDeleteRows(sheetUrl: string, worksheetName: string | null, rowIndices: number[]) {
  return jsonRequest<{ success: boolean; deleted_count: number }>(
    "POST",
    "/sheet/batch-delete",
    {
      sheet_url: sheetUrl,
      worksheet_name: worksheetName,
      row_indices: rowIndices
    }
  );
}

export async function batchUpdateRows(sheetUrl: string, worksheetName: string | null, rowUpdates: {row_index: number, values: Record<string, any>}[]) {
  return jsonRequest<{ success: boolean; updated_count: number }>(
    "POST",
    "/sheet/batch-update",
    {
      sheet_url: sheetUrl,
      worksheet_name: worksheetName,
      row_updates: rowUpdates
    }
  );
}
