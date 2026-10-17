"use client";

import { FORM_THEMES } from "@/lib/formThemes";

interface Props {
  value: string;
  onChange: (designId: string) => void;
}

export default function FormDesignPicker({ value, onChange }: Props) {
  return (
    <div className="space-y-3">
      <div>
        <h4 className="text-[13px] font-medium mb-1" style={{ color: "var(--ink)" }}>Form Design</h4>
        <p className="text-[12px]" style={{ color: "var(--stone)" }}>Choose a visual style for your public form</p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {FORM_THEMES.map((theme) => {
          const isSelected = value === theme.id;
          return (
            <button
              key={theme.id}
              type="button"
              onClick={() => onChange(theme.id)}
              className="relative flex flex-col items-stretch rounded-xl border-2 p-2 transition-all duration-200 cursor-pointer"
              style={
                isSelected
                  ? {
                      borderColor: "var(--clay)",
                      background: "rgba(224, 122, 80, 0.08)",
                      transform: "scale(1.02)",
                    }
                  : {
                      borderColor: "var(--rule)",
                      background: "var(--paper)",
                    }
              }
            >
              {/* Mini preview */}
              <div
                className="w-full h-[72px] rounded-lg mb-2 flex flex-col items-center justify-center gap-1 overflow-hidden"
                style={{ background: theme.preview.bg }}
              >
                {/* Mini card */}
                <div
                  className="w-[80%] rounded-md px-2 py-1.5"
                  style={{
                    background: theme.preview.card,
                    border: `1px solid ${theme.preview.accent}20`,
                  }}
                >
                  {/* Mini input lines */}
                  <div
                    className="h-[4px] rounded-full mb-1 w-[60%]"
                    style={{ background: `${theme.preview.text}30` }}
                  />
                  <div
                    className="h-[8px] rounded w-full"
                    style={{ background: `${theme.preview.accent}15`, border: `1px solid ${theme.preview.accent}30` }}
                  />
                  <div
                    className="h-[4px] rounded-full mt-1.5 w-[40%]"
                    style={{ background: `${theme.preview.text}30` }}
                  />
                  <div
                    className="h-[8px] rounded w-full mt-0.5"
                    style={{ background: `${theme.preview.accent}15`, border: `1px solid ${theme.preview.accent}30` }}
                  />
                </div>
                {/* Mini button */}
                <div
                  className="w-[80%] h-[6px] rounded-full"
                  style={{ background: theme.preview.accent }}
                />
              </div>

              {/* Label */}
              <div className="text-center">
                <p
                  className="text-[11px] font-medium leading-tight"
                  style={{ color: isSelected ? "var(--clay)" : "var(--ink)" }}
                >
                  {theme.name}
                </p>
                <p className="text-[10px] leading-tight mt-0.5 hidden sm:block" style={{ color: "var(--stone)" }}>
                  {theme.description}
                </p>
              </div>

              {/* Selected indicator */}
              {isSelected && (
                <div
                  className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center shadow-xs"
                  style={{ background: "var(--clay)", color: "var(--on-clay)" }}
                >
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
