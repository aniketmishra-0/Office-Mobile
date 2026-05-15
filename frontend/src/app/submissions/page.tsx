"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import LoadingOverlay from "@/components/LoadingOverlay";
import ErrorToast from "@/components/ErrorToast";
import ClearButton from "@/components/ClearButton";
import SubmitButton from "@/components/SubmitButton";
import { listSubmissions } from "@/lib/api";
import { safeBack } from "@/lib/navigation";

export default function SubmissionsPage() {
  const router = useRouter();
  const [formId, setFormId] = useState("");
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<Array<any>>([]);
  const [loaded, setLoaded] = useState(false);

  async function handleLoad() {
    if (!formId.trim() || !token.trim()) {
      setError("Enter both form ID and edit token");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await listSubmissions(formId.trim(), token.trim());
      setItems(data.items);
      setLoaded(true);
    } catch (e: any) {
      setError(e.message ?? "Failed to load submissions");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col min-h-screen bg-zinc-100">
      <AppHeader title="Submissions" showBack onBack={() => safeBack(router)} />
      {loading && <LoadingOverlay message="Loading submissions..." />}

      <div className="flex-1 w-full max-w-[560px] mx-auto px-5 pt-8 pb-10 space-y-4">
        {/* Input card */}
        <div className="rounded-lg border border-zinc-200 bg-white p-4 space-y-3">
          <div>
            <label className="block text-[13px] font-semibold text-zinc-800 mb-1.5">Form ID</label>
            <div className="relative">
              <input
                value={formId}
                onChange={(e) => setFormId(e.target.value)}
                placeholder="e.g. ad600c2b2dfd"
                className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 pr-10 text-[15px] min-h-[48px] focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
              {formId && <ClearButton onClick={() => setFormId("")} right={10} />}
            </div>
          </div>
          <div>
            <label className="block text-[13px] font-semibold text-zinc-800 mb-1.5">Edit token</label>
            <div className="relative">
              <input
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Paste token from edit link"
                className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 pr-10 text-[15px] min-h-[48px] focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
              {token && <ClearButton onClick={() => setToken("")} right={10} />}
            </div>
          </div>
          <SubmitButton
            label="Load submissions"
            submitting={loading}
            onClick={handleLoad}
            disabled={!formId.trim()}
          />
        </div>

        {/* Results */}
        {loaded && items.length === 0 && (
          <div className="text-center py-8">
            <p className="text-[13px] text-zinc-500">No submissions yet.</p>
            <p className="text-[12px] text-zinc-400 mt-1">Share your form link to start collecting responses.</p>
          </div>
        )}

        {items.length > 0 && (
          <div className="space-y-2.5">
            <p className="text-[12px] font-medium text-zinc-500">{items.length} response{items.length !== 1 ? "s" : ""}</p>
            {items.map((it) => (
              <div key={it.id} className="rounded-lg border border-zinc-200 bg-white p-3.5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[12px] font-mono text-zinc-500">#{it.id.slice(0, 8)}</span>
                  <span className="text-[11px] text-zinc-500">{new Date(it.submitted_at).toLocaleString()}</span>
                </div>
                <pre className="text-[12px] bg-zinc-50 border border-zinc-100 rounded-lg p-3 overflow-auto text-zinc-600 font-mono">
                  {JSON.stringify(it.values, null, 2)}
                </pre>
              </div>
            ))}
          </div>
        )}
      </div>

      <ErrorToast message={error} onDismiss={() => setError(null)} />
    </div>
  );
}
