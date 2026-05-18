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
        <h4 className="text-[13px] font-medium text-zinc-900 mb-1">Form Design</h4>
        <p className="text-[12px] text-zinc-500">Choose a visual style for your public form</p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {FORM_THEMES.map((theme) => {
          const isSelected = value === theme.id;
          return (
            <button
              key={theme.id}
              type="button"
              onClick={() => onChange(theme.id)}
              className={`
                relative flex flex-col items-stretch rounded-xl border-2 p-2 transition-all duration-200
                ${isSelected
                  ? "border-zinc-900 shadow-md scale-[1.02]"
                  : "border-zinc-200 hover:border-zinc-400 hover:shadow-sm"
                }
              `}
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
                <p className={`text-[11px] font-medium leading-tight ${isSelected ? "text-zinc-900" : "text-zinc-700"}`}>
                  {theme.name}
                </p>
                <p className="text-[10px] text-zinc-400 leading-tight mt-0.5 hidden sm:block">
                  {theme.description}
                </p>
              </div>

              {/* Selected indicator */}
              {isSelected && (
                <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-zinc-900 flex items-center justify-center">
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
