"use client";

import React, { useState, useRef, useEffect } from "react";

export interface DropdownOption {
  value: string;
  label: string;
  subtitle?: string;
}

interface SingleSelectProps {
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  multiple?: false;
  selectedValues?: never;
  onMultiChange?: never;
  maxSelect?: never;
  placeholder?: string;
  disabled?: boolean;
  size?: "default" | "sm";
}

interface MultiSelectProps {
  multiple: true;
  selectedValues: string[];
  options: DropdownOption[];
  onMultiChange: (values: string[]) => void;
  maxSelect?: number;
  value?: never;
  onChange?: never;
  placeholder?: string;
  disabled?: boolean;
  size?: "default" | "sm";
}

type MobileDropdownProps = SingleSelectProps | MultiSelectProps;

export default function MobileDropdown(props: MobileDropdownProps) {
  const {
    options,
    placeholder = "Select an option",
    disabled = false,
    size = "default",
  } = props;

  const isMulti = props.multiple === true;
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setIsOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isOpen]);

  const handleSelect = (val: string) => {
    if (isMulti) {
      const { selectedValues, onMultiChange, maxSelect } = props as MultiSelectProps;
      if (selectedValues.includes(val)) {
        onMultiChange(selectedValues.filter((v) => v !== val));
      } else {
        if (maxSelect && selectedValues.length >= maxSelect) {
          const next = [...selectedValues.slice(1), val];
          onMultiChange(next);
        } else {
          onMultiChange([...selectedValues, val]);
        }
      }
    } else {
      (props as SingleSelectProps).onChange(val);
      setIsOpen(false);
    }
  };

  // Display text for the button
  let displayText: string | null = null;
  if (isMulti) {
    const { selectedValues } = props as MultiSelectProps;
    if (selectedValues.length > 0) {
      const selectedLabels = selectedValues
        .map((v) => options.find((o) => o.value === v)?.label)
        .filter(Boolean);
      displayText = selectedLabels.join(", ");
    }
  } else {
    const { value } = props as SingleSelectProps;
    const selectedOption = options.find((o) => o.value === value);
    displayText = selectedOption ? selectedOption.label : null;
  }

  const selectedValue = isMulti ? "" : (props as SingleSelectProps).value;
  const selectedValues = isMulti ? (props as MultiSelectProps).selectedValues : [];

  return (
    <div ref={containerRef} style={{ position: "relative", width: "100%" }}>
      {/* Trigger button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        className={`w-full flex items-center justify-between bg-white border border-zinc-300 rounded-lg appearance-none transition-colors ${
          size === "sm" ? "px-2.5 py-2 text-xs min-h-[36px]" : "px-3 py-2.5 text-[15px] min-h-[48px]"
        } ${
          disabled
            ? "opacity-50 cursor-not-allowed bg-zinc-50"
            : "hover:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent"
        }`}
      >
        <span className={`truncate ${displayText ? "text-zinc-950" : "text-zinc-400"}`}>
          {displayText || placeholder}
        </span>
        <svg
          className={`w-4 h-4 text-zinc-500 flex-shrink-0 ml-2 transition-transform ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Inline dropdown list */}
      {isOpen && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            zIndex: 50,
            background: "var(--cream, #fff)",
            border: "1px solid var(--rule, #e4e4e7)",
            borderRadius: 8,
            boxShadow: "0 4px 16px rgba(0,0,0,0.10)",
            maxHeight: 220,
            overflowY: "auto",
            overscrollBehavior: "contain",
          }}
        >
          {options.length === 0 ? (
            <div
              style={{
                padding: "16px",
                textAlign: "center",
                fontSize: 13,
                color: "var(--stone, #71717a)",
              }}
            >
              No options available
            </div>
          ) : (
            options.map((option) => {
              const isSelected = isMulti
                ? selectedValues.includes(option.value)
                : option.value === selectedValue;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleSelect(option.value)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    width: "100%",
                    textAlign: "left",
                    padding: size === "sm" ? "8px 12px" : "10px 14px",
                    fontSize: size === "sm" ? 12 : 14,
                    fontFamily: "inherit",
                    color: isSelected ? "var(--ink, #18181b)" : "var(--charcoal, #3f3f46)",
                    fontWeight: isSelected ? 600 : 400,
                    background: isSelected ? "rgba(0,0,0,0.04)" : "transparent",
                    border: 0,
                    borderBottom: "1px solid var(--rule, #f4f4f5)",
                    cursor: "pointer",
                    transition: "background 120ms ease",
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) e.currentTarget.style.background = "rgba(0,0,0,0.03)";
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) e.currentTarget.style.background = "transparent";
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {option.label}
                    </span>
                    {option.subtitle && (
                      <span style={{ fontSize: 11, color: "var(--stone, #a1a1aa)", marginTop: 2 }}>
                        {option.subtitle}
                      </span>
                    )}
                  </div>
                  {isSelected && (
                    <svg
                      style={{ width: 16, height: 16, flexShrink: 0, marginLeft: 8 }}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2.5}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
