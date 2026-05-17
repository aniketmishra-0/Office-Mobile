"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import SubmitButton from "@/components/SubmitButton";
import { getSheetHistory, previewSheet, batchDeleteRows, batchUpdateRows } from "@/lib/api";
import type { FieldSchema } from "@/types/field";

function DataCleanerInner() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [sheetUrl, setSheetUrl] = useState(searchParams.get("url") || "");
  const [worksheetName, setWorksheetName] = useState(searchParams.get("worksheet") || "");
  const [sheetReady, setSheetReady] = useState(false);
  const [sheetHeaders, setSheetHeaders] = useState<FieldSchema[]>([]);
  
  // Data
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Tools
  const [showFindReplace, setShowFindReplace] = useState(true);
  const [showDuplicates, setShowDuplicates] = useState(true);
  
  const [findText, setFindText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  
  const [duplicateCols, setDuplicateCols] = useState<string[]>([]);
  
  const [actionLoading, setActionLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Load Sheet Data
  const loadSheetData = useCallback(async (url: string, ws: string) => {
    if (!url) return;
    setLoading(true);
    setError(null);
    try {
      // 1. Get Headers
      const preview = await previewSheet(url, ws || null, []);
      setSheetHeaders(preview.fields);
      if (!ws && preview.worksheet_name) {
        setWorksheetName(preview.worksheet_name);
      }
      
      // 2. Get Data
      const data = await getSheetHistory(url, preview.worksheet_name);
      setRows(data.rows);
      setSheetReady(true);
    } catch (err: any) {
      setError(err.message || "Failed to load sheet data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (sheetUrl && !sheetReady) {
      loadSheetData(sheetUrl, worksheetName);
    }
  }, [sheetUrl, worksheetName, sheetReady, loadSheetData]);

  const duplicateIndices = useMemo(() => {
    if (duplicateCols.length === 0 || rows.length === 0) return [];
    const seen = new Set<string>();
    const dups = new Set<string>();
    
    rows.forEach((r) => {
      const key = duplicateCols.map((c) => r[c] || "").join("|");
      if (seen.has(key)) dups.add(key);
      seen.add(key);
    });
    
    return rows.map((r, i) => {
      const key = duplicateCols.map((c) => r[c] || "").join("|");
      return dups.has(key) ? i : -1;
    }).filter((i) => i !== -1);
  }, [rows, duplicateCols]);

  const handleDeleteDuplicates = async () => {
    if (duplicateIndices.length === 0) return;
    if (!confirm(`Are you sure you want to permanently delete ${duplicateIndices.length} duplicate rows from the Google Sheet?`)) return;
    
    setActionLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      // 1-based indices (row 1 = header, data starts at 2)
      const indicesToDelete = duplicateIndices.map(i => i + 2);
      await batchDeleteRows(sheetUrl, worksheetName, indicesToDelete);
      
      setSuccessMsg(`Successfully deleted ${duplicateIndices.length} rows.`);
      // Reload data
      await loadSheetData(sheetUrl, worksheetName);
    } catch (err: any) {
      setError(err.message || "Failed to delete rows");
    } finally {
      setActionLoading(false);
    }
  };

  const handleReplaceAll = async () => {
    if (!findText) return;
    
    const rowUpdates: {row_index: number, values: Record<string, string>}[] = [];
    
    rows.forEach((row, idx) => {
      let changed = false;
      const newRow = { ...row };
      Object.keys(newRow).forEach(key => {
        if (newRow[key] && typeof newRow[key] === 'string' && newRow[key].includes(findText)) {
          newRow[key] = newRow[key].replaceAll(findText, replaceText);
          changed = true;
        }
      });
      if (changed) {
        // 1-based index (data starts at 2)
        rowUpdates.push({ row_index: idx + 2, values: newRow });
      }
    });

    if (rowUpdates.length === 0) {
      setError("No matches found to replace.");
      return;
    }
    
    if (!confirm(`Are you sure you want to update ${rowUpdates.length} rows in the Google Sheet?`)) return;

    setActionLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      await batchUpdateRows(sheetUrl, worksheetName, rowUpdates);
      setSuccessMsg(`Successfully updated ${rowUpdates.length} rows.`);
      // Reload data
      await loadSheetData(sheetUrl, worksheetName);
    } catch (err: any) {
      setError(err.message || "Failed to update rows");
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-zinc-50">
      <AppHeader
        showLogo
        rightAction={
          <button
            onClick={() => router.push("/")}
            style={{
              background: "transparent",
              border: 0,
              fontSize: 24,
              cursor: "pointer",
              color: "var(--stone)",
            }}
          >
            ×
          </button>
        }
      />
      
      <div className="flex-1 w-full max-w-4xl mx-auto px-6 py-12">
        <h1 style={{ fontFamily: "var(--font-newsreader), serif", fontSize: 32, color: "var(--ink)", margin: "0 0 8px 0" }}>
          Data Cleaner
        </h1>
        <p style={{ fontFamily: "var(--font-plex-mono), monospace", fontSize: 12, color: "var(--stone)", margin: "0 0 32px 0", letterSpacing: "0.04em" }}>
          {"// live find & replace and duplicate remover"}
        </p>

        {error && (
          <div style={{ padding: 12, background: "#fef2f2", borderLeft: "4px solid #ef4444", color: "#991b1b", marginBottom: 24, fontSize: 12, fontFamily: "var(--font-plex-mono), monospace" }}>
            {error}
          </div>
        )}
        
        {successMsg && (
          <div style={{ padding: 12, background: "#f0fdf4", borderLeft: "4px solid #22c55e", color: "#166534", marginBottom: 24, fontSize: 12, fontFamily: "var(--font-plex-mono), monospace" }}>
            {successMsg}
          </div>
        )}

        {/* Load Sheet Section */}
        <section style={{ marginBottom: 32, padding: 24, background: "var(--paper)", border: "1px solid var(--rule)" }}>
          <label style={{ display: "block", fontSize: 10, color: "var(--stone)", textTransform: "uppercase", marginBottom: 8, fontFamily: "var(--font-plex-mono), monospace" }}>Google Sheet URL</label>
          <div style={{ display: "flex", gap: 12 }}>
            <input 
              type="text" 
              value={sheetUrl}
              onChange={e => setSheetUrl(e.target.value)}
              placeholder="Paste Sheet URL here..."
              style={{ flex: 1, padding: "8px 12px", border: "1px solid var(--rule)", outline: "none", fontSize: 14, background: "var(--cream)", fontFamily: "var(--font-plex-mono), monospace" }}
            />
            <SubmitButton 
              label="Load Data" 
              submitting={loading} 
              onClick={() => loadSheetData(sheetUrl, worksheetName)} 
              disabled={!sheetUrl}
            />
          </div>
        </section>

        {sheetReady && rows.length > 0 && (
          <>
            <div style={{ display: "flex", gap: 24, marginBottom: 24, flexWrap: "wrap" }}>
              {/* Find & Replace Tool */}
              <section style={{ flex: "1 1 400px", padding: 24, background: "var(--paper)", border: "1px solid var(--rule)" }}>
                <h2 style={{ fontSize: 14, fontFamily: "var(--font-plex-mono), monospace", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--charcoal)", margin: "0 0 16px 0" }}>Find & Replace</h2>
                <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: "block", fontSize: 10, color: "var(--stone)", textTransform: "uppercase", marginBottom: 4, fontFamily: "var(--font-plex-mono), monospace" }}>Find</label>
                    <input 
                      type="text" 
                      value={findText}
                      onChange={e => setFindText(e.target.value)}
                      style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--rule)", outline: "none", fontSize: 13, background: "var(--cream)", fontFamily: "var(--font-plex-mono), monospace" }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: "block", fontSize: 10, color: "var(--stone)", textTransform: "uppercase", marginBottom: 4, fontFamily: "var(--font-plex-mono), monospace" }}>Replace</label>
                    <input 
                      type="text" 
                      value={replaceText}
                      onChange={e => setReplaceText(e.target.value)}
                      style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--rule)", outline: "none", fontSize: 13, background: "var(--cream)", fontFamily: "var(--font-plex-mono), monospace" }}
                    />
                  </div>
                </div>
                <SubmitButton 
                  label="Update Sheet" 
                  submitting={actionLoading}
                  disabled={!findText || actionLoading}
                  onClick={handleReplaceAll}
                />
              </section>

              {/* Duplicate Finder Tool */}
              <section style={{ flex: "1 1 400px", padding: 24, background: "var(--paper)", border: "1px solid var(--rule)" }}>
                <h2 style={{ fontSize: 14, fontFamily: "var(--font-plex-mono), monospace", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--charcoal)", margin: "0 0 16px 0" }}>Duplicate Finder</h2>
                <p style={{ fontSize: 10, color: "var(--stone)", textTransform: "uppercase", marginBottom: 12, fontFamily: "var(--font-plex-mono), monospace" }}>Match duplicates by columns:</p>
                
                <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
                  {sheetHeaders.map(h => (
                    <label key={h.key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontFamily: "var(--font-plex-mono), monospace", cursor: "pointer" }}>
                      <input 
                        type="checkbox" 
                        checked={duplicateCols.includes(h.source_header)}
                        onChange={(e) => {
                          if (e.target.checked) setDuplicateCols([...duplicateCols, h.source_header]);
                          else setDuplicateCols(duplicateCols.filter(c => c !== h.source_header));
                        }}
                      />
                      {h.label}
                    </label>
                  ))}
                </div>

                {duplicateIndices.length > 0 ? (
                  <div style={{ marginTop: 16 }}>
                    <p style={{ fontSize: 11, color: "#d32f2f", fontFamily: "var(--font-plex-mono), monospace", marginBottom: 12 }}>
                      ⚠️ Found {duplicateIndices.length} duplicate rows.
                    </p>
                    <SubmitButton 
                      label={`Delete ${duplicateIndices.length} Duplicates`}
                      submitting={actionLoading}
                      onClick={handleDeleteDuplicates}
                      disabled={actionLoading}
                    />
                  </div>
                ) : (
                  duplicateCols.length > 0 && <p style={{ fontSize: 11, color: "var(--stone)", fontFamily: "var(--font-plex-mono), monospace" }}>No duplicates found.</p>
                )}
              </section>
            </div>

            {/* Preview Table */}
            <section>
              <h2 style={{ fontSize: 14, fontFamily: "var(--font-plex-mono), monospace", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--charcoal)", margin: "0 0 16px 0" }}>Live Sheet Data ({rows.length} rows)</h2>
              <div style={{ overflowX: "auto", border: "1px solid var(--rule)", background: "var(--paper)" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead style={{ background: "var(--cream)" }}>
                    <tr>
                      <th style={{ padding: "10px", borderBottom: "1px solid var(--rule)", textAlign: "center", fontSize: 10, fontFamily: "var(--font-plex-mono), monospace", color: "var(--stone)", width: 40 }}>#</th>
                      {sheetHeaders.map((h, i) => (
                        <th key={i} style={{ padding: "10px", borderBottom: "1px solid var(--rule)", textAlign: "left", fontSize: 10, fontFamily: "var(--font-plex-mono), monospace", color: "var(--stone)", whiteSpace: "nowrap" }}>
                          {h.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, rowIdx) => {
                      const isDuplicate = duplicateIndices.includes(rowIdx);
                      return (
                      <tr key={rowIdx} style={{ borderBottom: "1px solid var(--rule)", backgroundColor: isDuplicate ? "#fff4e5" : "transparent" }}>
                        <td style={{ padding: "10px", textAlign: "center", fontSize: 11, fontFamily: "var(--font-plex-mono), monospace", color: "var(--stone)" }}>
                          {rowIdx + 2} {/* 1-based index including header */}
                        </td>
                        {sheetHeaders.map((h, i) => (
                          <td key={i} style={{ padding: "10px", fontSize: 12, fontFamily: "var(--font-plex-mono), monospace", color: "var(--ink)", whiteSpace: "nowrap" }}>
                            {row[h.key] || row[h.source_header] || ""}
                          </td>
                        ))}
                      </tr>
                    )})}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

export default function DataCleaner() {
  return (
    <Suspense fallback={<div />}>
      <DataCleanerInner />
    </Suspense>
  );
}
