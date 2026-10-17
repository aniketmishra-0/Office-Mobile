"use client";

import React, { useEffect, useRef } from "react";

export interface HistorySettings {
  enablePreFillLastRow: boolean;    // Offer "Pre-fill from Last Entry" in Add Row Form
  enableSaveAndAddAnother: boolean; // Continuous row entry button "+ Save & Add Another"
  enableBottomRowNav: boolean;      // Floating bottom bar navigation (Prev / Next) in Row Form
  enableAutoWeekday: boolean;       // Auto-fill Day / Weekday when Date is selected
  enableColumnSorting: boolean;     // Interactive column sorting (▲/▼) in table
  tableViewMode: "table" | "cards"; // Dual view: Spreadsheet table or Mobile Cards
}

export const DEFAULT_HISTORY_SETTINGS: HistorySettings = {
  enablePreFillLastRow: true,
  enableSaveAndAddAnother: true,
  enableBottomRowNav: true,
  enableAutoWeekday: true,
  enableColumnSorting: true,
  tableViewMode: "table",
};

const STORAGE_KEY = "om_history_settings_v1";

export function loadSavedHistorySettings(): HistorySettings {
  if (typeof window === "undefined") return DEFAULT_HISTORY_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_HISTORY_SETTINGS, ...parsed };
    }
  } catch {}
  return DEFAULT_HISTORY_SETTINGS;
}

export function saveHistorySettings(settings: HistorySettings) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {}
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  settings: HistorySettings;
  onUpdateSetting: <K extends keyof HistorySettings>(key: K, value: HistorySettings[K]) => void;
  onResetDefaults: () => void;
}

export default function HistorySettingsModal({
  isOpen,
  onClose,
  settings,
  onUpdateSetting,
  onResetDefaults,
}: Props) {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(26, 24, 20, 0.65)",
        backdropFilter: "blur(4px)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
    >
      <div
        ref={modalRef}
        style={{
          width: "100%",
          maxWidth: 540,
          background: "var(--paper)",
          border: "2px solid var(--ink)",
          borderRadius: 0,
          boxShadow: "0 12px 36px rgba(0,0,0,0.22)",
          display: "flex",
          flexDirection: "column",
          maxHeight: "90vh",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--rule)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "var(--cream)",
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 16 }}>⚙</span>
              <h2
                id="settings-modal-title"
                style={{
                  fontFamily: "var(--font-newsreader), Georgia, serif",
                  fontWeight: 400,
                  fontSize: 20,
                  color: "var(--ink)",
                  margin: 0,
                }}
              >
                Preferences &amp; Settings
              </h2>
            </div>
            <p
              style={{
                fontFamily: "var(--font-plex-mono), monospace",
                fontSize: 10,
                color: "var(--stone)",
                margin: "4px 0 0 0",
                letterSpacing: "0.03em",
              }}
            >
              Saved individually on this device &bull; Apne hisab se customize karein
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            style={{
              background: "transparent",
              border: "1px solid var(--rule)",
              borderRadius: 0,
              width: 32,
              height: 32,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: "var(--ink)",
              fontSize: 14,
            }}
          >
            ✕
          </button>
        </div>

        {/* Settings Body */}
        <div
          style={{
            padding: "20px",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          {/* Section: Entry & Form helpers */}
          <div>
            <span
              style={{
                fontFamily: "var(--font-plex-mono), monospace",
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--clay)",
                display: "block",
                marginBottom: 10,
              }}
            >
              Entry &amp; Form Helpers
            </span>

            <div
              style={{
                border: "1px solid var(--rule)",
                background: "var(--paper)",
                display: "flex",
                flexDirection: "column",
              }}
            >
              {/* Toggle 1: Pre-fill from Last Row */}
              <ToggleItem
                title="⚡ Pre-fill from Last Entry"
                subtitle="Last added row se values copy karne ka button dikhayein (Add Row form me)."
                checked={settings.enablePreFillLastRow}
                onChange={(val) => onUpdateSetting("enablePreFillLastRow", val)}
              />

              <div style={{ height: 1, background: "var(--rule)" }} />

              {/* Toggle 2: Save & Add Another */}
              <ToggleItem
                title="+ Save &amp; Add Another"
                subtitle="Multiple entries ek ke baad ek tezi se enter karne ke liye continuous entry button."
                checked={settings.enableSaveAndAddAnother}
                onChange={(val) => onUpdateSetting("enableSaveAndAddAnother", val)}
              />

              <div style={{ height: 1, background: "var(--rule)" }} />

              {/* Toggle 3: Auto-Weekday Calculation */}
              <ToggleItem
                title="📅 Auto-Fill Day from Date"
                subtitle="Jab bhi Date select karein to Day/Weekday column (Monday, Tuesday...) automatically fill ho jaye."
                checked={settings.enableAutoWeekday}
                onChange={(val) => onUpdateSetting("enableAutoWeekday", val)}
              />

              <div style={{ height: 1, background: "var(--rule)" }} />

              {/* Toggle 4: Bottom Navigation in Row Form */}
              <ToggleItem
                title="↔ Bottom Bar Prev / Next"
                subtitle="Row form ke floating bottom bar me Previous aur Next buttons dikhayein."
                checked={settings.enableBottomRowNav}
                onChange={(val) => onUpdateSetting("enableBottomRowNav", val)}
              />
            </div>
          </div>

          {/* Section: Table & Display */}
          <div>
            <span
              style={{
                fontFamily: "var(--font-plex-mono), monospace",
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--clay)",
                display: "block",
                marginBottom: 10,
              }}
            >
              Spreadsheet View &amp; Display
            </span>

            <div
              style={{
                border: "1px solid var(--rule)",
                background: "var(--paper)",
                display: "flex",
                flexDirection: "column",
              }}
            >
              {/* Toggle 5: Column Sorting */}
              <ToggleItem
                title="▲▼ Interactive Column Sorting"
                subtitle="Column header par click karke ascending ya descending order me sort karein."
                checked={settings.enableColumnSorting}
                onChange={(val) => onUpdateSetting("enableColumnSorting", val)}
              />

              <div style={{ height: 1, background: "var(--rule)" }} />

              {/* Setting 6: Default View Mode */}
              <div
                style={{
                  padding: "14px 16px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: 12,
                }}
              >
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div
                    style={{
                      fontFamily: "var(--font-newsreader), Georgia, serif",
                      fontSize: 14,
                      color: "var(--ink)",
                      fontWeight: 500,
                    }}
                  >
                    View Mode (Table vs Cards)
                  </div>
                  <div
                    style={{
                      fontFamily: "var(--font-plex-mono), monospace",
                      fontSize: 11,
                      color: "var(--stone)",
                      marginTop: 2,
                      lineHeight: 1.4,
                    }}
                  >
                    Chuniye table spreadsheet pasand hai ya mobile cards view.
                  </div>
                </div>

                <div
                  style={{
                    display: "inline-flex",
                    border: "1px solid var(--rule)",
                    background: "var(--cream)",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => onUpdateSetting("tableViewMode", "table")}
                    style={{
                      padding: "6px 12px",
                      borderRadius: 0,
                      border: 0,
                      background: settings.tableViewMode === "table" ? "var(--ink)" : "transparent",
                      color: settings.tableViewMode === "table" ? "var(--on-ink)" : "var(--ink)",
                      fontFamily: "var(--font-plex-mono), monospace",
                      fontSize: 11,
                      fontWeight: 500,
                      cursor: "pointer",
                    }}
                  >
                    ▦ Table
                  </button>
                  <button
                    type="button"
                    onClick={() => onUpdateSetting("tableViewMode", "cards")}
                    style={{
                      padding: "6px 12px",
                      borderRadius: 0,
                      border: 0,
                      background: settings.tableViewMode === "cards" ? "var(--ink)" : "transparent",
                      color: settings.tableViewMode === "cards" ? "var(--on-ink)" : "var(--ink)",
                      fontFamily: "var(--font-plex-mono), monospace",
                      fontSize: 11,
                      fontWeight: 500,
                      cursor: "pointer",
                    }}
                  >
                    ▤ Cards
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div
          style={{
            padding: "14px 20px",
            borderTop: "1px solid var(--rule)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "var(--cream)",
            gap: 12,
          }}
        >
          <button
            type="button"
            onClick={onResetDefaults}
            style={{
              background: "transparent",
              border: 0,
              fontFamily: "var(--font-plex-mono), monospace",
              fontSize: 11,
              color: "var(--stone)",
              cursor: "pointer",
              textDecoration: "underline",
              padding: 0,
            }}
          >
            Reset to defaults
          </button>

          <button
            type="button"
            onClick={onClose}
            style={{
              fontFamily: "var(--font-plex-mono), monospace",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              padding: "8px 18px",
              borderRadius: 0,
              background: "var(--ink)",
              color: "var(--on-ink)",
              border: 0,
              cursor: "pointer",
            }}
          >
            Done ✓
          </button>
        </div>
      </div>
    </div>
  );
}

function ToggleItem({
  title,
  subtitle,
  checked,
  onChange,
}: {
  title: string;
  subtitle: string;
  checked: boolean;
  onChange: (val: boolean) => void;
}) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 16,
        padding: "14px 16px",
        cursor: "pointer",
        userSelect: "none",
        background: checked ? "rgba(200, 98, 58, 0.03)" : "transparent",
        transition: "background 0.15s ease",
      }}
    >
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontFamily: "var(--font-newsreader), Georgia, serif",
            fontSize: 14,
            color: "var(--ink)",
            fontWeight: 500,
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontFamily: "var(--font-plex-mono), monospace",
            fontSize: 11,
            color: "var(--stone)",
            marginTop: 3,
            lineHeight: 1.4,
          }}
        >
          {subtitle}
        </div>
      </div>

      {/* Boxy Brutalist Switch */}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={(e) => {
          e.preventDefault();
          onChange(!checked);
        }}
        style={{
          width: 44,
          height: 24,
          background: checked ? "var(--ink)" : "var(--rule)",
          border: "1px solid var(--rule)",
          borderRadius: 0,
          position: "relative",
          cursor: "pointer",
          padding: 2,
          flexShrink: 0,
          transition: "background 0.15s ease",
        }}
      >
        <span
          style={{
            display: "block",
            width: 18,
            height: 18,
            background: checked ? "var(--on-ink)" : "var(--paper)",
            border: "1px solid var(--rule)",
            borderRadius: 0,
            transform: checked ? "translateX(20px)" : "translateX(0)",
            transition: "transform 0.15s ease",
          }}
        />
      </button>
    </label>
  );
}
