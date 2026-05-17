"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";

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
  allowCreate?: boolean;
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
  allowCreate?: boolean;
}

type MobileDropdownProps = SingleSelectProps | MultiSelectProps;

/* ─── Detect mobile via viewport width ─────────────────────────── */
function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    function check() {
      setIsMobile(window.innerWidth < breakpoint);
    }
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, [breakpoint]);
  return isMobile;
}

export default function MobileDropdown(props: MobileDropdownProps) {
  const {
    options,
    placeholder = "Select an option",
    disabled = false,
    size = "default",
    allowCreate = false,
  } = props;

  const isMulti = props.multiple === true;
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  // Close on outside click (desktop only)
  useEffect(() => {
    if (!isOpen || isMobile) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, isMobile]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setIsOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isOpen]);

  // Lock body scroll on mobile when bottom sheet is open
  useEffect(() => {
    if (!isOpen || !isMobile) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen, isMobile]);

  const handleSelect = useCallback(
    (val: string) => {
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
      // If we are creating an option, we also clear the search in the child component.
      // Child components can handle this.
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isMulti, props],
  );

  // Display text for the button
  let displayText: string | null = null;
  if (isMulti) {
    const { selectedValues } = props as MultiSelectProps;
    if (selectedValues.length > 0) {
      const selectedLabels = selectedValues
        .map((v) => options.find((o) => o.value === v)?.label || v)
        .filter(Boolean);
      displayText = selectedLabels.join(", ");
    }
  } else {
    const { value } = props as SingleSelectProps;
    const selectedOption = options.find((o) => o.value === value);
    displayText = selectedOption ? selectedOption.label : (value || null);
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

      {/* Desktop: inline dropdown | Mobile: bottom sheet via portal */}
      {isOpen && !isMobile && (
        <DesktopDropdown
          options={options}
          size={size}
          isMulti={isMulti}
          selectedValue={selectedValue}
          selectedValues={selectedValues}
          onSelect={handleSelect}
          allowCreate={allowCreate}
        />
      )}

      {isOpen && isMobile && (
        <BottomSheet
          options={options}
          size={size}
          isMulti={isMulti}
          selectedValue={selectedValue}
          selectedValues={selectedValues}
          onSelect={handleSelect}
          onClose={() => setIsOpen(false)}
          placeholder={placeholder}
          allowCreate={allowCreate}
        />
      )}
    </div>
  );
}

/* ─── Desktop inline dropdown ──────────────────────────────────── */
function DesktopDropdown({
  options,
  size,
  isMulti,
  selectedValue,
  selectedValues,
  onSelect,
}: {
  options: DropdownOption[];
  size: "default" | "sm";
  isMulti: boolean;
  selectedValue: string;
  selectedValues: string[];
  onSelect: (val: string) => void;
  allowCreate?: boolean;
}) {
  const [search, setSearch] = useState("");
  let filtered = search
    ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))
    : options;

  if (allowCreate && search.trim() && !options.find((o) => o.label.toLowerCase() === search.trim().toLowerCase())) {
    filtered = [{ value: search.trim(), label: `Create "${search.trim()}"`, subtitle: 'New option' }, ...filtered];
  }

  return (
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
        maxHeight: 280,
        display: "flex",
        flexDirection: "column",
        overscrollBehavior: "contain",
      }}
    >
      {/* Search input */}
      <div style={{ padding: "8px 10px", borderBottom: "1px solid var(--rule, #e4e4e7)", flexShrink: 0 }}>
        <input
          type="text"
          autoFocus
          placeholder="Search..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: "100%",
            padding: "7px 10px",
            fontSize: 13,
            fontFamily: "inherit",
            border: "1px solid var(--rule, #e4e4e7)",
            borderRadius: 6,
            background: "var(--paper, #f4f4f5)",
            color: "var(--ink, #18181b)",
            outline: "none",
          }}
        />
      </div>
      <div style={{ overflowY: "auto", flex: 1 }}>
        <OptionsList
          options={filtered}
          size={size}
          isMulti={isMulti}
          selectedValue={selectedValue}
          selectedValues={selectedValues}
          onSelect={(val) => { onSelect(val); setSearch(""); }}
        />
        {filtered.length === 0 && (
          <div style={{ padding: 16, textAlign: "center", fontSize: 13, color: "var(--stone, #71717a)" }}>
            No matches
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Mobile bottom sheet via portal ───────────────────────────── */
function BottomSheet({
  options,
  size,
  isMulti,
  selectedValue,
  selectedValues,
  onSelect,
  onClose,
  placeholder,
}: {
  options: DropdownOption[];
  size: "default" | "sm";
  isMulti: boolean;
  selectedValue: string;
  selectedValues: string[];
  onSelect: (val: string) => void;
  onClose: () => void;
  placeholder: string;
  allowCreate?: boolean;
}) {
  const [animating, setAnimating] = useState(true);
  const [search, setSearch] = useState("");
  const sheetRef = useRef<HTMLDivElement>(null);

  let filtered = search
    ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))
    : options;

  if (allowCreate && search.trim() && !options.find((o) => o.label.toLowerCase() === search.trim().toLowerCase())) {
    filtered = [{ value: search.trim(), label: `Create "${search.trim()}"`, subtitle: 'New option' }, ...filtered];
  }

  useEffect(() => {
    // Trigger enter animation
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setAnimating(false);
      });
    });
  }, []);

  const handleClose = useCallback(() => {
    setAnimating(true);
    setTimeout(onClose, 250);
  }, [onClose]);

  // Handle backdrop click
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) handleClose();
    },
    [handleClose],
  );

  const maxSheetHeight = Math.min(options.length * 52 + 140, window.innerHeight * 0.7);

  return createPortal(
    <div
      onClick={handleBackdropClick}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: animating ? "rgba(0,0,0,0)" : "rgba(0,0,0,0.4)",
        transition: "background 250ms ease",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
      }}
    >
      <div
        ref={sheetRef}
        style={{
          width: "100%",
          maxHeight: maxSheetHeight,
          background: "var(--cream, #fff)",
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          boxShadow: "0 -8px 32px rgba(0,0,0,0.15)",
          display: "flex",
          flexDirection: "column",
          transform: animating ? "translateY(100%)" : "translateY(0)",
          transition: "transform 250ms cubic-bezier(0.32, 0.72, 0, 1)",
          overflow: "hidden",
        }}
      >
        {/* Drag handle */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            padding: "10px 0 4px 0",
          }}
        >
          <div
            style={{
              width: 36,
              height: 4,
              borderRadius: 2,
              background: "var(--rule, #d4d4d8)",
            }}
          />
        </div>

        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "6px 16px 12px 16px",
            borderBottom: "1px solid var(--rule, #e4e4e7)",
          }}
        >
          <span
            style={{
              fontSize: 15,
              fontWeight: 600,
              color: "var(--ink, #18181b)",
            }}
          >
            {placeholder}
          </span>
          <button
            type="button"
            onClick={handleClose}
            style={{
              background: "transparent",
              border: 0,
              padding: "4px 8px",
              fontSize: 13,
              fontWeight: 500,
              color: "var(--stone, #71717a)",
              cursor: "pointer",
            }}
          >
            Done
          </button>
        </div>

        {/* Search input */}
        <div style={{ padding: "8px 16px", borderBottom: "1px solid var(--rule, #e4e4e7)", flexShrink: 0 }}>
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: "100%",
              padding: "10px 12px",
              fontSize: 15,
              fontFamily: "inherit",
              border: "1px solid var(--rule, #e4e4e7)",
              borderRadius: 8,
              background: "var(--paper, #f4f4f5)",
              color: "var(--ink, #18181b)",
              outline: "none",
            }}
          />
        </div>

        {/* Options */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            overscrollBehavior: "contain",
            WebkitOverflowScrolling: "touch",
          }}
        >
          <OptionsList
            options={filtered}
            size="default"
            isMulti={isMulti}
            selectedValue={selectedValue}
            selectedValues={selectedValues}
            onSelect={(val) => { onSelect(val); setSearch(""); }}
            isMobileSheet
          />
          {filtered.length === 0 && (
            <div style={{ padding: 20, textAlign: "center", fontSize: 14, color: "var(--stone, #71717a)" }}>
              No matches for &ldquo;{search}&rdquo;
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ─── Shared options list ──────────────────────────────────────── */
function OptionsList({
  options,
  size,
  isMulti,
  selectedValue,
  selectedValues,
  onSelect,
  isMobileSheet = false,
}: {
  options: DropdownOption[];
  size: "default" | "sm";
  isMulti: boolean;
  selectedValue: string;
  selectedValues: string[];
  onSelect: (val: string) => void;
  isMobileSheet?: boolean;
}) {
  if (options.length === 0) {
    return (
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
    );
  }

  return (
    <>
      {options.map((option) => {
        const isSelected = isMulti
          ? selectedValues.includes(option.value)
          : option.value === selectedValue;

        const padY = isMobileSheet ? 14 : size === "sm" ? 8 : 10;
        const padX = isMobileSheet ? 18 : size === "sm" ? 12 : 14;
        const fs = isMobileSheet ? 15 : size === "sm" ? 12 : 14;

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onSelect(option.value)}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              width: "100%",
              textAlign: "left",
              padding: `${padY}px ${padX}px`,
              fontSize: fs,
              fontFamily: "inherit",
              color: isSelected ? "var(--ink, #18181b)" : "var(--charcoal, #3f3f46)",
              fontWeight: isSelected ? 600 : 400,
              background: isSelected ? "rgba(0,0,0,0.04)" : "transparent",
              border: 0,
              borderBottom: "1px solid var(--rule, #f4f4f5)",
              cursor: "pointer",
              transition: "background 120ms ease",
              minHeight: isMobileSheet ? 48 : undefined,
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
                style={{ width: 18, height: 18, flexShrink: 0, marginLeft: 8, color: "var(--clay, #C8623A)" }}
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
      })}
    </>
  );
}
