"use client";

import React, { useEffect, useState } from "react";
import { listFormLibrary, deleteForm, unauthorizeForm } from "@/lib/api";
import type { FormLibraryItem } from "@/types/field";

export default function SettingsPanel({ onClose }: { onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<FormLibraryItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      try {
        const data = await listFormLibrary(200);
        if (mounted) setItems(data.items || []);
      } catch (e: any) {
        if (mounted) setError(e.message ?? "Failed to load forms");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, []);

  async function handleDelete(id: string) {
    if (!confirm("Delete this form? This cannot be undone.")) return;
    try {
      await deleteForm(id);
      setItems((s) => s.filter((i) => i.id !== id));
    } catch (e: any) {
      alert(e.message ?? "Failed to delete form");
    }
  }

  async function handleUnauthorize(id: string) {
    if (!confirm("Unauthorize this form for this account/session?")) return;
    try {
      await unauthorizeForm(id);
      alert("Unauthorize request sent");
    } catch (e: any) {
      alert(e.message ?? "Failed to unauthorize form");
    }
  }

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">Settings</h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-800">Close</button>
        </div>

        <div className="mb-4">
          <h4 className="text-xs font-medium text-zinc-600 mb-2">Forms</h4>
          {loading && <div className="text-sm text-zinc-500">Loading...</div>}
          {error && <div className="text-sm text-red-600">{error}</div>}
          {!loading && items.length === 0 && <div className="text-sm text-zinc-500">No saved forms</div>}
          <ul className="space-y-2 max-h-64 overflow-auto">
            {items.map((it) => (
              <li key={it.id} className="flex items-center justify-between bg-zinc-50 dark:bg-zinc-800 border border-zinc-100 dark:border-zinc-800 rounded px-3 py-2">
                <div>
                  <div className="text-sm font-medium">{it.form_title}</div>
                  <div className="text-xs text-zinc-500">{it.sheet_url}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => (window.open(it.edit_url, "_blank"))} className="text-xs px-2 py-1 border rounded">Edit</button>
                  <button onClick={() => handleUnauthorize(it.id)} className="text-xs px-2 py-1 border rounded">Unauthorize</button>
                  <button onClick={() => handleDelete(it.id)} className="text-xs px-2 py-1 border rounded text-red-600">Delete</button>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="text-xs text-zinc-500">
          Use these settings to manage forms you created. Deleting removes the saved metadata; unauthorize will revoke access tokens or unlink Sheets (server behavior depends on backend implementation).
        </div>
      </div>
    </div>
  );
}
